# **Manifest V3 标准下 Chrome 浏览器 UserScript 策略深度研究报告**

## **1\. 执行摘要**

随着 Chrome 扩展平台从 Manifest V2 (MV2) 向 Manifest V3 (MV3) 的全面迁移，浏览器扩展的开发范式经历了根本性的重构。在 MV3 的安全模型中，最核心的变革之一是严厉禁止扩展程序执行“远程托管代码”（Remotely Hosted Code, RHC）。这一政策旨在消除扩展程序动态加载未经过 Chrome 应用商店（CWS）审查代码的安全隐患。然而，这一限制直接冲击了“用户脚本管理器”（User Script Managers, 如 Tampermonkey、Violentmonkey）的核心功能，因为这类扩展的本质即是执行用户提供的、动态的 JavaScript 代码。

为了在保障安全的前提下维持这一生态的活力，Chrome 团队引入了专用的 chrome.userScripts API。本报告基于 Chrome 官方文档及 2024-2025 年间的最新技术实践，对 MV3 标准下使用 UserScript 的策略进行了详尽的分析。研究表明，最稳定且合规的策略是构建一个基于 USER\_SCRIPT 执行环境（Execution World）的混合架构：利用 chrome.userScripts API 进行代码注入，通过 configureWorld 配置放宽的内容安全策略（CSP）以支持 eval，并建立基于 runtime.onUserScriptMessage 的专用通信桥梁，以在隔离的脚本环境与拥有特权的 Service Worker 之间安全地代理高级 API 调用（如 GM\_xmlHttpRequest）。

此外，随着 Chrome 133、135 及 138 版本的迭代，开发者必须适配从“开发者模式”开关向“允许用户脚本”独立开关的 UI 变迁，并利用新增的 execute() 方法实现即时脚本执行。本报告将详细阐述这些架构细节、合规性要求及代码实现。

## **2\. Manifest V3 的监管背景与 UserScript 的挑战**

要理解 MV3 下 UserScript 的最佳实践，首先必须深入剖析 Chrome 团队引入 MV3 的监管动机，以及这些监管政策如何具体约束了脚本的执行方式。这不仅仅是 API 的替换，更是安全哲学的根本转变。

### **2.1 远程托管代码（RHC）的终结**

在 Manifest V2 时代，扩展程序的安全模型相对宽松。开发者可以利用 eval() 函数，或者通过向 DOM 中注入指向外部服务器的 \<script\> 标签，轻松执行远程加载的代码。这种能力虽然赋予了扩展极大的灵活性，但也成为了恶意软件的温床。攻击者可以通过修改远程服务器上的脚本，绕过 Chrome 应用商店的初始审查，向用户端下发恶意载荷。

Manifest V3 的核心宗旨之一是“默认安全”。为此，Google 实施了严格的“禁止远程托管代码”政策 1。该政策规定，扩展程序执行的所有逻辑必须包含在扩展程序的安装包内。这意味着，通用的 chrome.scripting.executeScript API 虽然允许注入代码，但在 CWS 的审查标准下，它通常被限制用于执行扩展包内的静态文件或函数，严禁用于执行从网络下载或用户输入的任意字符串形式的代码 2。

这一政策对用户脚本管理器构成了生存威胁。用户脚本（UserScripts）的定义即是“用户提供的、无法作为扩展包一部分发布的代码” 4。如果严格按照 RHC 政策执行，Tampermonkey 等工具将无法存在。

### **2.2 合规的豁免：chrome.userScripts API**

为了解决上述矛盾，Chrome 团队与 WebExtensions 社区小组（WECG）合作，专门设计了 chrome.userScripts API。这个 API 是 MV3 架构中一个经过特殊设计的“特区” 5。它允许扩展程序注册和执行任意代码字符串，但前提是这些代码必须运行在一个严格隔离的环境中，即“用户脚本世界”（User Script World）。

这个设计巧妙地平衡了安全性与功能性：

1. **代码隔离**：用户脚本不再像 MV2 的 Content Script 那样运行在拥有部分扩展特权的“隔离世界”（Isolated World）中，而是运行在一个剥离了绝大多数扩展 API 访问权限的新环境中。  
2. **明确意图**：通过使用 userScripts 权限，开发者向审查人员和用户明确声明了该扩展的用途是管理用户脚本，从而获得 RHC 政策的特定豁免 2。

### **2.3 权限模型的演进：从开发者模式到用户开关**

在使用策略上，最大的变数在于用户授权机制的演进。这直接影响到用户引导流程的设计。

* **当前阶段（Chrome 138 之前）**：为了启用 userScripts API，Chrome 强制要求用户必须在浏览器设置中开启全局的“开发者模式”（Developer Mode） 4。这是一个临时的、高摩擦的解决方案。因为开发者模式不仅开启了脚本权限，还暴露了许多高级调试功能，这对普通用户来说既不友好也不安全，且常被企业策略（Enterprise Policy）禁用 6。  
* **未来阶段（Chrome 138 及以后）**：从 Chrome 138 开始（预计 2025 年中期），Chrome 将引入一个精细化的“允许用户脚本”（Allow User Scripts）开关，位于每个扩展的详情页面中 6。这意味着用户不再需要开启全局开发者模式，只需针对特定扩展授权即可。

因此，最稳定的策略必须包含一套能够动态检测当前浏览器版本并给出正确用户引导的逻辑。

## **3\. chrome.userScripts API 的技术架构**

在 MV3 中，UserScript 的执行不再依赖于通用的 tabs 或 scripting API，而是拥有一套独立的架构。这套架构的核心概念是“执行世界”（Execution World）。

### **3.1 执行世界的隔离机制：USER\_SCRIPT World**

在浏览器中，JavaScript 的执行环境被划分为不同的“世界”（Worlds），每个世界拥有独立的全局变量（window 对象）和原型链，但共享同一个 DOM（文档对象模型）。

| 特性 | 主世界 (MAIN World) | 隔离世界 (ISOLATED World) | 用户脚本世界 (USER\_SCRIPT World) |
| :---- | :---- | :---- | :---- |
| **主要使用者** | 网页本身的 JS | 扩展的 Content Scripts | **UserScripts (MV3)** |
| **DOM 访问权限** | 完全访问 | 完全访问 | 完全访问 |
| **JS 变量可见性** | 对网页可见 | 与网页隔离 | **与网页及扩展均隔离** |
| **扩展 API 能力** | 无 | 可访问 runtime, storage 等 | **无 (需通过消息桥接)** |
| **CSP 限制** | 受网页 CSP 限制 | 受扩展 CSP 限制 | **可自定义 (通过 configureWorld)** |
| **任意代码执行** | 允许 (受 CSP 限制) | 禁止 (受扩展 CSP 限制) | **允许 (受自定义 CSP 限制)** |

数据综合自 4

关键洞察：  
最稳定的策略是显式指定脚本运行在 USER\_SCRIPT 世界中。虽然 API 允许脚本运行在 MAIN 世界 4，但这会使脚本受到宿主网页内容安全策略（CSP）的限制。例如，如果网页的 CSP 禁止 unsafe-eval（大多数现代网站如 GitHub, Twitter 都是如此），那么运行在 MAIN 世界的用户脚本将无法使用 eval() 或 new Function()，导致大量现有脚本失效 8。  
相比之下，USER\_SCRIPT 世界是 MV3 专门为用户脚本开辟的“法外之地”。它允许扩展程序通过 chrome.userScripts.configureWorld() 方法，为这个特定的世界定义一套独立的 CSP 4。这意味着，即使宿主网页严格禁止 eval，扩展程序依然可以配置 USER\_SCRIPT 世界允许 unsafe-eval，从而保证 Tampermonkey 等工具的兼容性。

### **3.2 动态注册与持久化**

chrome.userScripts API 的运作模式与 MV2 的即时注入不同，它采用了“注册-持久化”模式。

1. **注册（Register）**：扩展程序通过 chrome.userScripts.register() 方法将脚本代码及其匹配规则（Match Patterns）提交给浏览器。  
2. **持久化（Persistence）**：一旦注册成功，这些脚本信息由浏览器内核持久化存储。即使扩展程序的 Service Worker 休眠，或者浏览器重启，这些脚本依然会在符合条件的页面加载时自动注入 10。  
3. **生命周期管理**：唯一的例外是扩展程序本身的更新（Update）。当扩展程序更新版本时，浏览器可能会清除已注册的脚本（视具体实现而定，但在 MV3 早期版本中常见）。因此，最佳实践是在 chrome.runtime.onInstalled 事件中加入重新注册所有脚本的逻辑 4。

### **3.3 即时执行能力的补全（Chrome 135+）**

早期的 userScripts API（Chrome 120-134）存在一个重大缺陷：它只支持预注册，不支持在特定标签页立即执行脚本。这使得“点击扩展图标立即运行脚本”这类功能难以实现 8。

随着 Chrome 135 的发布，chrome.userScripts.execute() 方法被引入 4。这个方法填补了最后的功能拼图，允许扩展程序向指定的目标（Target）即时注入用户脚本代码，且无需预先注册。这使得 MV3 的用户脚本能力在灵活性上终于追平了 MV2 的 tabs.executeScript。

## **4\. 核心策略一：配置宽容的执行环境**

为了确保用户脚本（通常包含大量遗留代码、依赖 eval 进行元编程或沙箱化）能够稳定运行，首要任务是配置一个宽容的 USER\_SCRIPT 环境。

### **4.1 启用 unsafe-eval**

在 MV3 中，默认的扩展 CSP 极其严格，禁止一切形式的代码动态生成。但在 USER\_SCRIPT 世界中，我们可以通过配置绕过这一限制。这是合规策略中最微妙但也最关键的一步：CWS 允许在 configureWorld 中开启 unsafe-eval，因为这些代码运行在低权限的沙箱中，不会危及扩展本身的安全。

### **4.2 开启消息通信（Messaging）**

由于 USER\_SCRIPT 世界无法直接访问 chrome.runtime 或 chrome.storage 等 API，脚本必须通过消息传递与扩展的后台（Service Worker）进行通信，以请求数据存储或跨域请求（XHR）。默认情况下，USER\_SCRIPT 世界的消息通信是关闭的，必须显式开启 4。

### **4.3 代码实现样例：环境配置**

以下代码展示了如何在 Service Worker 初始化阶段配置环境。

JavaScript

// background.js (Service Worker)

/\*\*  
 \* 配置默认的用户脚本执行世界 (USER\_SCRIPT world)  
 \* 策略要点：  
 \* 1\. csp: 显式声明允许 'unsafe-eval'，这对许多 UserScripts 至关重要。  
 \*    同时包含 'wasm-unsafe-eval' 以支持 WebAssembly。  
 \* 2\. messaging: 设置为 true，打通脚本与 Service Worker 的通信管道。  
 \*/  
async function setupUserScriptWorld() {  
  // 检查 API 是否可用 (兼容 Chrome 120+)  
  if (chrome.userScripts && chrome.userScripts.configureWorld) {  
    try {  
      await chrome.userScripts.configureWorld({  
        csp: "script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'",  
        messaging: true  
      });  
      console.log("USER\_SCRIPT world configured successfully.");  
    } catch (error) {  
      console.error("Failed to configure USER\_SCRIPT world:", error);  
    }  
  }  
}

// 在扩展安装或更新时立即执行配置  
chrome.runtime.onInstalled.addListener(() \=\> {  
  setupUserScriptWorld();  
});

深度解析：  
此处配置的 csp 仅作用于注入的用户脚本，不会降低扩展程序本身的安全性。wasm-unsafe-eval 的加入是为了面向未来，因为越来越多的复杂脚本开始利用 WebAssembly 进行高性能计算（如视频处理或加密） 7。

## **5\. 核心策略二：构建双向通信桥梁（The Bridge）**

在 MV2 中，Tampermonkey 等工具通过复杂的技巧将 GM\_xmlHttpRequest 等特权函数暴露给页面。在 MV3 中，这种直接暴露被严格禁止。最稳定的策略是构建一个“客户端-服务器”架构的通信桥梁。

* **客户端（Client）**：注入到页面的用户脚本环境。通过 chrome.runtime.sendMessage 发送请求。  
* **服务端（Server）**：扩展的 Service Worker。监听 chrome.runtime.onUserScriptMessage，执行实际的特权操作（如 fetch、storage 操作），并将结果返回。

### **5.1 专用消息通道 onUserScriptMessage**

MV3 引入了 chrome.runtime.onUserScriptMessage 事件，专门用于接收来自 USER\_SCRIPT 世界的消息 4。使用这个专用通道而不是通用的 onMessage 至关重要，因为它允许浏览器和开发者区分消息来源，从而在处理来自不可信代码（用户脚本）的请求时实施更严格的安全检查。

### **5.2 模拟 GM\_xmlHttpRequest 的挑战与解决方案**

用户脚本最常用的功能之一是跨域请求（GM\_xmlHttpRequest）。在 MV3 Service Worker 中，XMLHttpRequest 对象已不复存在，必须使用 fetch API 进行替代 16。

**技术难点**：

1. **流式数据**：fetch 返回的流（Stream）难以直接通过消息传递回传给脚本。  
2. **二进制数据**：Blob 和 ArrayBuffer 在消息传递中的序列化需要特别处理。  
3. **Cookie 管理**：Service Worker 的 fetch 默认遵循浏览器的 Cookie 策略，但用户脚本可能期望特定的 Cookie 行为。

最佳实践：  
在 Service Worker 端，将 fetch 的响应（文本或 Base64 编码的二进制）封装为 JSON 对象返回。对于大文件，建议使用 chrome.storage.session 作为中转，或者分块传输。

### **5.3 代码实现样例：通信桥梁**

**服务端（Service Worker）实现**：

JavaScript

// background.js

// 监听来自 USER\_SCRIPT 世界的消息  
if (chrome.runtime.onUserScriptMessage) {  
  chrome.runtime.onUserScriptMessage.addListener((message, sender, sendResponse) \=\> {  
    // 安全检查：确认消息确实来自用户脚本世界  
    if (\!sender.userScriptWorldId && sender.id\!== chrome.runtime.id) {  
        // 在某些版本中，sender 对象的属性可能有所不同，需做防御性编程  
        // 但 onUserScriptMessage 保证了来源是 User Scripts  
    }

    // 路由处理  
    (async () \=\> {  
      try {  
        let result;  
        switch (message.type) {  
          case 'GM\_fetch':  
            result \= await handleGMFetch(message.details);  
            break;  
          case 'GM\_setValue':  
            await chrome.storage.local.set({ \[message.key\]: message.value });  
            result \= { success: true };  
            break;  
          case 'GM\_getValue':  
            const data \= await chrome.storage.local.get(message.key);  
            result \= { value: data\[message.key\] };  
            break;  
          default:  
            throw new Error(\`Unknown message type: ${message.type}\`);  
        }  
        sendResponse({ success: true, data: result });  
      } catch (error) {  
        sendResponse({ success: false, error: error.toString() });  
      }  
    })();

    return true; // 保持消息通道开放以进行异步响应  
  });  
}

/\*\*  
 \* 在 Service Worker 中模拟 GM\_xmlHttpRequest  
 \* 注意：MV3 中必须使用 fetch  
 \*/  
async function handleGMFetch(details) {  
  const options \= {  
    method: details.method |

| 'GET',  
    headers: details.headers,  
    // body 处理需要根据 content-type 进行适当转换  
    body: details.data   
  };

  try {  
    const response \= await fetch(details.url, options);  
      
    // 读取响应内容。为了通过消息传递，通常转换为文本。  
    // 对于二进制数据，建议转换为 Base64 字符串。  
    const text \= await response.text();  
      
    return {  
      status: response.status,  
      statusText: response.statusText,  
      headers: Object.fromEntries(response.headers.entries()),  
      responseText: text  
    };  
  } catch (err) {  
    throw new Error("Network Error: " \+ err.message);  
  }  
}

**客户端（注入的 API 包装器）实现**：

这段代码需要作为“库”注入到用户脚本之前，为用户脚本提供 GM\_ 函数的实现。

JavaScript

// injected-bridge.js (运行在 USER\_SCRIPT world)

const GM \= {  
  xmlHttpRequest: function(details) {  
    return new Promise((resolve, reject) \=\> {  
      chrome.runtime.sendMessage({  
        type: 'GM\_fetch',  
        details: details  
      }, response \=\> {  
        if (chrome.runtime.lastError) {  
          reject(chrome.runtime.lastError);  
        } else if (response && response.success) {  
          // 触发回调  
          if (details.onload) {  
            details.onload({  
              status: response.data.status,  
              statusText: response.data.statusText,  
              responseText: response.data.responseText,  
              responseHeaders: response.data.headers  
            });  
          }  
          resolve(response.data);  
        } else {  
          reject(new Error(response?.error |

| "Unknown Error"));  
        }  
      });  
    });  
  },

  setValue: function(key, value) {  
    return chrome.runtime.sendMessage({ type: 'GM\_setValue', key, value });  
  },  
    
  getValue: function(key) {  
    return new Promise(resolve \=\> {  
        chrome.runtime.sendMessage({ type: 'GM\_getValue', key }, response \=\> {  
            resolve(response?.data?.value);  
        });  
    });  
  }  
};

// 将 API 挂载到全局  
window.GM\_xmlHttpRequest \= GM.xmlHttpRequest;  
window.GM\_setValue \= GM.setValue;  
window.GM\_getValue \= GM.getValue;

## **6\. 核心策略三：动态适配的生命周期管理**

由于 MV3 API 仍在快速演进，不同版本的 Chrome 具有不同的能力。为了保证策略的“最稳定性”，必须实现基于特性的动态适配。

### **6.1 注册策略：持久化脚本**

对于需要在页面加载时自动运行的脚本（如去广告、样式修改），应使用 chrome.userScripts.register。

数据结构设计：  
建议在 chrome.storage.local 中维护一份“脚本清单”，包含每个脚本的代码、匹配规则和启用状态。

JavaScript

// background.js

async function syncScripts() {  
  const stored \= await chrome.storage.local.get("userScripts");  
  const scripts \= stored.userScripts ||;  
    
  // 转换为 API 所需的格式  
  const scriptsToRegister \= scripts  
   .filter(s \=\> s.enabled)  
   .map(s \=\> ({  
      id: s.id,  
      js: \[{ code: s.code }\], // 注入用户代码  
      matches: s.matches,  
      runAt: s.runAt |

| 'document\_idle',  
      world: 'USER\_SCRIPT' // 显式指定世界   
    }));

  // 增量更新或全量覆盖  
  // 最佳实践：先通过 getScripts 获取当前注册的脚本 ID，对比差异后进行 update 或 unregister/register  
  // 简单策略：全量注销后重新注册（脚本数量少时可行）  
  const existingIds \= (await chrome.userScripts.getScripts()).map(s \=\> s.id);  
  await chrome.userScripts.unregister(existingIds);  
  if (scriptsToRegister.length \> 0) {  
    await chrome.userScripts.register(scriptsToRegister);  
  }  
}

### **6.2 执行策略：即时注入 (Chrome 135+)**

对于一次性任务，利用 execute() 方法。在 Chrome 135 之前，这需要通过注册一个匹配当前 Tab URL 的脚本然后重载页面来实现，用户体验极差。Chrome 135+ 的 execute() 彻底解决了这个问题 4。

**版本兼容代码**：

JavaScript

async function executeUserScript(tabId, code) {  
  // 特性检测  
  if (chrome.userScripts.execute) {  
    // Chrome 135+ 路径  
    await chrome.userScripts.execute({  
        target: { tabId: tabId },  
        js: \[{ code: code }\],  
        injectImmediately: true, // 关键参数：无需等待页面加载状态   
        world: 'USER\_SCRIPT'  
    });  
  } else {  
    // 旧版本降级路径：提示用户或尝试注册+刷新  
    console.warn("当前浏览器版本不支持即时执行用户脚本，请升级至 Chrome 135+");  
  }  
}

## **7\. 用户体验与权限引导策略 (UX Strategy)**

在技术实现之外，MV3 用户脚本策略中最大的挑战是如何引导用户开启权限。如前所述，从“开发者模式”到“独立开关”的变迁需要在代码中进行逻辑判断。

### **7.1 权限检测逻辑**

开发者不能假设 API 总是可用的。必须在 UI 层面（如 Popup 页面或设置页面）进行检测并引导。

JavaScript

// ui-helper.js

async function checkApiAvailability() {  
  // 1\. 检查 API 对象是否存在  
  if (typeof chrome.userScripts \=== 'undefined') {  
    return { available: false, reason: 'API\_MISSING' }; // 可能是 Manifest 未声明权限  
  }

  // 2\. 尝试调用一个读操作来验证权限  
  try {  
    await chrome.userScripts.getScripts({ ids: });  
    return { available: true };  
  } catch (error) {  
    // 捕获错误，通常是因为开关未开启  
    return { available: false, reason: 'PERMISSION\_DENIED' };  
  }  
}

async function showUserInstruction() {  
  const status \= await checkApiAvailability();  
  if (status.available) return;

  // 获取浏览器主版本号  
  const version \= parseInt(navigator.userAgent.match(/Chrome\\/(\\d+)/)?. |

| "0");

  if (version \>= 138) {  
    // Chrome 138+：引导用户去扩展管理页开启 "Allow User Scripts"  
    const extensionId \= chrome.runtime.id;  
    alert(\`请在扩展设置页中开启“允许用户脚本”权限。\\n地址: chrome://extensions/?id=${extensionId}\`);  
    chrome.tabs.create({ url: \`chrome://extensions/?id=${extensionId}\` });  
  } else {  
    // Chrome \< 138：引导用户开启“开发者模式”  
    alert("请在 chrome://extensions 页面右上角开启“开发者模式”以使用脚本功能。");  
    chrome.tabs.create({ url: "chrome://extensions" });  
  }  
}

策略意义：  
这段代码能够平滑地处理 Chrome 版本的过渡。对于企业用户，如果管理员通过策略禁用了开发者模式，新版的独立开关（Chrome 138+）可能仍允许经过管理员批准的扩展运行脚本，这大大增加了扩展在企业环境中的生存空间 6。

## **8\. 跨浏览器兼容性与生态展望**

在制定策略时，不能忽视 Firefox 和 Safari 等其他浏览器的实现差异，尽管本报告聚焦于 Chrome。

* **Firefox**：Mozilla 的 MV3 实现较为激进地保留了对用户脚本的更好支持，且其 userScripts API 语法略有不同（例如事件监听器可能需要 scripting 权限配合）。但核心的 register 和 onUserScriptMessage 机制正在趋同。  
* **Safari**：Safari 的 Web Extension 实现通常滞后，但在标准化组织（WECG）的推动下，userScripts API 最终有望成为跨浏览器的标准 5。

### **8.1 展望：Chrome 145 与未来**

根据发布计划，Chrome 145 将进一步稳定 API 并可能调整发布时间表 17。对于开发者而言，当前的策略应当是：

1. **全面拥抱 USER\_SCRIPT world**：停止使用 ISOLATED world 来运行用户代码。  
2. **消息通信为王**：所有特权操作必须通过消息桥接。  
3. **关注 worldId**：在 Chrome 133 中引入的 worldId 参数允许扩展创建多个独立的用户脚本世界（例如 worldId: 'UserScripts\_A' 和 worldId: 'UserScripts\_B'），这为脚本之间的隔离提供了更细粒度的控制，是未来构建复杂脚本管理器（如支持不同脚本集运行在不同沙箱）的关键 13。

## **9\. 结论**

在 Manifest V3 标准下，Chrome 浏览器插件使用 UserScript 的最稳定且合规策略不再是简单的 API 替换，而是一种系统工程。它要求开发者放弃 MV2 时代粗放的权限使用方式，转而构建一个基于 **“隔离执行环境 \+ 消息驱动通信 \+ 动态权限适配”** 的现代架构。

通过采用 chrome.userScripts API 配合 unsafe-eval 的 CSP 配置，开发者可以在完全遵守 Chrome 应用商店“禁止远程托管代码”这一红线政策的前提下，保留用户脚本的核心动态执行能力。虽然通信桥梁的构建增加了开发的复杂度，但它显著提升了扩展的安全性和稳定性，使得用户脚本生态能够长期在 Chrome 平台上健康发展。

#### **引用的著作**

1. Extensions / Manifest V3 \- Chrome for Developers, 访问时间为 十二月 15, 2025， [https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3)  
2. Deal with remote hosted code violations | Chrome Extensions, 访问时间为 十二月 15, 2025， [https://developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code](https://developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code)  
3. The Complete Guide to Migrating Chrome Extensions from Manifest V2 to Manifest V3, 访问时间为 十二月 15, 2025， [https://hackernoon.com/the-complete-guide-to-migrating-chrome-extensions-from-manifest-v2-to-manifest-v3](https://hackernoon.com/the-complete-guide-to-migrating-chrome-extensions-from-manifest-v2-to-manifest-v3)  
4. chrome.userScripts | API \- Chrome for Developers, 访问时间为 十二月 15, 2025， [https://developer.chrome.com/docs/extensions/reference/api/userScripts](https://developer.chrome.com/docs/extensions/reference/api/userScripts)  
5. User scripts in Manifest V3 \#279 \- w3c/webextensions \- GitHub, 访问时间为 十二月 15, 2025， [https://github.com/w3c/webextensions/issues/279](https://github.com/w3c/webextensions/issues/279)  
6. Enabling chrome.userScripts in Chrome Extensions is changing | Blog, 访问时间为 十二月 15, 2025， [https://developer.chrome.com/blog/chrome-userscript](https://developer.chrome.com/blog/chrome-userscript)  
7. content\_security\_policy \- Mozilla \- MDN Web Docs, 访问时间为 十二月 15, 2025， [https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/content\_security\_policy](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/content_security_policy)  
8. User Scripts vs injected scripts with eval() \- Google Groups, 访问时间为 十二月 15, 2025， [https://groups.google.com/a/chromium.org/g/chromium-extensions/c/W2J8\_81NzkM/m/ujyICaiTAQAJ](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/W2J8_81NzkM/m/ujyICaiTAQAJ)  
9. Workaround for unsafe-eval not being in CSP Chrome? · Issue \#1984 \- GitHub, 访问时间为 十二月 15, 2025， [https://github.com/Tampermonkey/tampermonkey/issues/1984](https://github.com/Tampermonkey/tampermonkey/issues/1984)  
10. userScripts \- Mozilla \- MDN Web Docs, 访问时间为 十二月 15, 2025， [https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/userScripts](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/userScripts)  
11. Where and how long are values stored by user scripts persisted? \- Stack Overflow, 访问时间为 十二月 15, 2025， [https://stackoverflow.com/questions/75970960/where-and-how-long-are-values-stored-by-user-scripts-persisted](https://stackoverflow.com/questions/75970960/where-and-how-long-are-values-stored-by-user-scripts-persisted)  
12. Allow string script in chrome.scripting.executeScript() \- Google Groups, 访问时间为 十二月 15, 2025， [https://groups.google.com/a/chromium.org/g/chromium-extensions/c/GjGJNbY-RtE](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/GjGJNbY-RtE)  
13. PSA: userScripts.execute() and multiple world support in User Scripts API \- Google Groups, 访问时间为 十二月 15, 2025， [https://groups.google.com/a/chromium.org/g/chromium-extensions/c/oEo-Jm0EqsY](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/oEo-Jm0EqsY)  
14. Content-Security-Policy: script-src directive \- HTTP \- MDN Web Docs \- Mozilla, 访问时间为 十二月 15, 2025， [https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/script-src](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/script-src)  
15. runtime.onUserScriptMessage \- Mozilla \- MDN Web Docs, 访问时间为 十二月 15, 2025， [https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/runtime/onUserScriptMessage](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/runtime/onUserScriptMessage)  
16. \[Feature\] Manifest V3 for Chrome · Issue \#1934 \- GitHub, 访问时间为 十二月 15, 2025， [https://github.com/violentmonkey/violentmonkey/issues/1934?timeline\_page=1](https://github.com/violentmonkey/violentmonkey/issues/1934?timeline_page=1)  
17. Previous release notes \- Chrome Enterprise and Education Help, 访问时间为 十二月 15, 2025， [https://support.google.com/chrome/a/answer/10314655?hl=en](https://support.google.com/chrome/a/answer/10314655?hl=en)  
18. userScripts.execute() \- Mozilla \- MDN Web Docs, 访问时间为 十二月 15, 2025， [https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/userScripts/execute](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/userScripts/execute)