// src/content-scripts/api-bridge.ts

/**
 * @fileoverview This content script acts as a bridge between the isolated world of a userscript
 * and the background script. It exposes GM_* APIs to the userscript's window object.
 */

// Define response types for GM_xmlhttpRequest
interface GMXMLHttpRequestResponse {
  responseText: string;
  status: number;
  statusText: string;
  responseHeaders: string;
  finalUrl: string;
}

interface GMXMLHttpRequestErrorResponse {
  error: string;
}

// Define a type for the details object of GM_xmlhttpRequest for clarity.
type GMXMLHttpRequestDetails = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'HEAD';
  url: string;
  headers?: Record<string, string>;
  data?: string | FormData;
  responseType?: 'text' | 'json' | 'blob' | 'arraybuffer';
  onload?: (response: GMXMLHttpRequestResponse) => void;
  onerror?: (response: GMXMLHttpRequestErrorResponse) => void;
  ontimeout?: (response: GMXMLHttpRequestErrorResponse) => void;
};

interface CarryMonkeyWindow extends Window {
  GM_setValue: (key: string, value: unknown) => Promise<void>;
  GM_getValue: (key: string, defaultValue?: unknown) => Promise<unknown>;
  GM_getResourceText: (resourceName: string) => Promise<string>;
  GM_getResourceURL: (resourceName: string) => Promise<string>;
  GM_addStyle: (css: string) => HTMLStyleElement;
  GM_xmlhttpRequest: (details: GMXMLHttpRequestDetails) => void;
  currentScriptId?: string;
}

declare let window: CarryMonkeyWindow;

// 创建 API Bridge 专用日志器
const bridgeLogger = {
  info: (message: string, data?: unknown) => {
    console.log(`🌉[API-Bridge] ${message}`, data ? data : '');
  },
  warn: (message: string, data?: unknown) => {
    console.warn(`🌉[API-Bridge] ${message}`, data ? data : '');
  },
  error: (message: string, data?: unknown) => {
    console.error(`🌉[API-Bridge] ${message}`, data ? data : '');
  }
};

bridgeLogger.info('API Bridge initializing...');

function sendMessage(action: string, payload: Record<string, unknown>): Promise<unknown> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ action, payload }, (response) => {
      if (chrome.runtime.lastError) {
        return reject(chrome.runtime.lastError);
      }
      if (response.status === 'success') {
        resolve(response.data);
      } else {
        reject(new Error(response.error || 'Unknown error'));
      }
    });
  });
}

// Type-safe wrapper functions
window.GM_setValue = async (key: string, value: unknown): Promise<void> => {
  await sendMessage('GM_setValue', { key, value });
};

window.GM_getValue = async (key: string, defaultValue?: unknown): Promise<unknown> => {
  return await sendMessage('GM_getValue', { key, defaultValue });
};

window.GM_getResourceText = async (resourceName: string): Promise<string> => {
  const result = await sendMessage('GM_getResourceText', { scriptId: window.currentScriptId, resourceName });
  return result as string;
};

window.GM_getResourceURL = async (resourceName: string): Promise<string> => {
  const result = await sendMessage('GM_getResourceURL', { scriptId: window.currentScriptId, resourceName });
  return result as string;
};

window.GM_addStyle = (css: string): HTMLStyleElement => {
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
  return style;
};

window.GM_xmlhttpRequest = (details: GMXMLHttpRequestDetails): void => {
  sendMessage('GM_xmlhttpRequest', { scriptId: window.currentScriptId, details })
    .then(response => {
      if (details.onload) {
        details.onload(response as GMXMLHttpRequestResponse);
      }
    })
    .catch(error => {
      if (details.onerror) {
        details.onerror({ error: (error as Error).message });
      }
    });
};
bridgeLogger.info('API Bridge loaded with full API set');



