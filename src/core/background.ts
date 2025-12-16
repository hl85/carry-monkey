import { getScripts } from './storage';
import type { UserScript } from './types';
import { parseUserScript } from '../services/parser';
import { matches } from '../services/matcher';
import { UnifiedInjectionEngine } from '../services/injection/engine';
import { GMAPIManager, type GMAPIPayload } from '../services/gm-api-manager';
import { ScriptResourceManager } from '../services/script-resource-manager';
import { createComponentLogger } from '../services/logger';

// 创建后台服务专用日志器
const backgroundLogger = createComponentLogger('Background');

// 资源管理器实例
const resourceManager = ScriptResourceManager.getInstance();
// API 管理器实例
const apiManager = GMAPIManager.getInstance();

// A global declaration to satisfy TypeScript for the Trusted Types API and our custom properties.
declare global {
  interface Window {
    [key: string]: unknown; // Allow custom properties on window
  }
}

interface MessageRequest {
  action: string;
  script?: UserScript;
  tabId?: number;
  scriptId?: string;
  payload?: GMAPIPayload;
}

interface MessageResponse {
  status: string;
  data?: unknown;
  error?: string;
}

/**
 * Unified message listener for popup commands and content script API calls.
 */
chrome.runtime.onMessage.addListener(
  (
    message: MessageRequest,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response?: MessageResponse) => void
  ) => {
    // 将整个监听器逻辑包装在一个IIFE async函数中，以便使用await
    (async () => {
      if (message.action === 'executeScript') {
        try {
          const script = message.script;
          const tabId = message.tabId;
          
          if (!script || !tabId) {
            sendResponse({ status: 'error', error: 'Missing script or tabId' });
            return;
          }
          
          const dependencies = await resourceManager.cacheDependencies(script.meta.require || []);
          script.content = dependencies + '\n\n' + script.content;
          await UnifiedInjectionEngine.injectScript(script, tabId);
          sendResponse({ status: 'done' });
        } catch (error) {
          sendResponse({ status: 'error', error: (error as Error).message });
        }
        return;
      }

      if (message.action === 'getUserScript') {
        const scriptId = message.scriptId;
        
        if (!scriptId) {
          sendResponse({ status: 'error', error: 'Missing scriptId' });
          return;
        }
        
        const script = resourceManager.getScript(scriptId);
        if (script) {
          sendResponse({ status: 'success', data: script.content });
        } else {
          sendResponse({ status: 'error', error: 'Script not found' });
        }
        return;
      }

      if (message.action?.startsWith('GM_')) {
        const payload = message.payload;
        
        if (!payload) {
          sendResponse({ status: 'error', error: 'Missing payload' });
          return;
        }
        
        const response = await apiManager.handleAPICall(message.action, payload);
        sendResponse(response);
        return;
      }

    })();

    // 始终返回 true，因为我们的处理是异步的
    return true;
  }
);

/**
 * Main listener for automatic script injection on page load.
 */
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'loading' && tab.url && (tab.url.startsWith('http:') || tab.url.startsWith('https://'))) {
    const scriptsFromStorage = await getScripts();
    const enabledScripts = scriptsFromStorage.filter(script => script.enabled);

    // 缓存并解析脚本
    const parsedScripts: UserScript[] = [];
    enabledScripts.forEach(script => {
      const parsed = parseUserScript(script.content);
      const fullScript = { ...script, meta: { ...script.meta, ...parsed.meta } };
      parsedScripts.push(fullScript);
      resourceManager.cacheScript(fullScript);
    });

    // 预加载资源和依赖
    await resourceManager.preloadScriptResources(parsedScripts);

    // 注入匹配的脚本
    for (const script of parsedScripts) {
      if (script.enabled && matches(tab.url, script.meta.match)) {
        backgroundLogger.info('Script matched for auto-injection', {
          scriptName: script.meta.name,
          scriptId: script.id,
          url: tab.url,
          action: 'auto-inject'
        });
        await UnifiedInjectionEngine.injectScript(script, tabId);
      }
    }
  }
});