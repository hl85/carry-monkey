/**
 * GM API 管理器
 * 统一管理所有 GM_* API 的实现和调用
 * 名词解释：GM 是 "GreaseMonkey" 的缩写，这是用户脚本生态系统中的一个重要概念。GreaseMonkey 是最早的用户脚本管理器之一，最初为 Firefox 浏览器开发.
 * 它定义了一套标准的 API 接口，用于用户脚本与浏览器环境的交互，这些 API 都以 GM_ 前缀命名，成为了用户脚本的事实标准
 * 这里采用GM风格是为兼容性考虑
 */

import type { UserScript } from '../core/types';
import { createComponentLogger } from './logger';

// 创建 GM API 专用日志器
const apiLogger = createComponentLogger('GMAPIManager');

export interface GMAPIPayload {
  key?: string;
  value?: unknown;
  defaultValue?: unknown;
  scriptId?: string;
  resourceName?: string;
  details?: {
    url: string;
    method?: string;
    headers?: Record<string, string>;
    data?: string;
  };
}

export interface GMAPIResponse {
  status: 'success' | 'error';
  data?: unknown;
  error?: string;
}

/**
 * GM API 管理器
 */
export class GMAPIManager {
  private static instance: GMAPIManager;
  private scriptCache: Record<string, UserScript> = {};

  private constructor() {}

  static getInstance(): GMAPIManager {
    if (!GMAPIManager.instance) {
      GMAPIManager.instance = new GMAPIManager();
    }
    return GMAPIManager.instance;
  }

  /**
   * 处理 GM API 调用
   */
  async handleAPICall(action: string, payload: GMAPIPayload): Promise<GMAPIResponse> {
    const startTime = performance.now();
    
    try {
      apiLogger.debug(`API call received: ${action}`, { action, payload });
      
      let result: GMAPIResponse;
      
      switch (action) {
        case 'GM_setValue':
          result = await this.handleGMSetValue(payload);
          break;
        case 'GM_getValue':
          result = await this.handleGMGetValue(payload);
          break;
        case 'GM_getResourceText':
          result = await this.handleGMGetResourceText(payload);
          break;
        case 'GM_getResourceURL':
          result = await this.handleGMGetResourceURL(payload);
          break;
        case 'GM_xmlhttpRequest':
          result = await this.handleGMXMLHttpRequest(payload);
          break;
        default:
          result = { status: 'error', error: `Unknown GM API: ${action}` };
          apiLogger.warn(`Unknown GM API called: ${action}`, { action, payload });
      }
      
      const duration = performance.now() - startTime;
      apiLogger.debug(`API call completed: ${action}`, { 
        action, 
        status: result.status, 
        duration: Math.round(duration * 100) / 100 
      });
      
      return result;
    } catch (error) {
      const duration = performance.now() - startTime;
      const errorMessage = (error as Error).message;
      
      apiLogger.error(`API call failed: ${action}`, { 
        action, 
        error: errorMessage, 
        duration: Math.round(duration * 100) / 100 
      });
      
      return { status: 'error', error: errorMessage };
    }
  }

  /**
   * GM_setValue 实现
   */
  private async handleGMSetValue(payload: GMAPIPayload): Promise<GMAPIResponse> {
    const { key, value } = payload;
    if (!key) {
      apiLogger.warn('GM_setValue called without key parameter', { payload });
      return { status: 'error', error: 'Missing key parameter' };
    }

    try {
      await chrome.storage.local.set({ [key]: value });
      apiLogger.debug('GM_setValue successful', { key, valueType: typeof value });
      return { status: 'success' };
    } catch (error) {
      apiLogger.error('GM_setValue failed', { key, error: (error as Error).message });
      throw error;
    }
  }

  /**
   * GM_getValue 实现
   */
  private async handleGMGetValue(payload: GMAPIPayload): Promise<GMAPIResponse> {
    const { key, defaultValue } = payload;
    if (!key) {
      apiLogger.warn('GM_getValue called without key parameter', { payload });
      return { status: 'error', error: 'Missing key parameter' };
    }

    try {
      const result = await chrome.storage.local.get([key]);
      const value = result[key] === undefined ? defaultValue : result[key];
      
      apiLogger.debug('GM_getValue successful', { 
        key, 
        hasValue: result[key] !== undefined,
        usedDefault: result[key] === undefined
      });
      
      return { status: 'success', data: value };
    } catch (error) {
      apiLogger.error('GM_getValue failed', { key, error: (error as Error).message });
      throw error;
    }
  }

  /**
   * GM_getResourceText 实现
   */
  private async handleGMGetResourceText(payload: GMAPIPayload): Promise<GMAPIResponse> {
    const { scriptId, resourceName } = payload;
    if (!scriptId || !resourceName) {
      return { status: 'error', error: 'Missing scriptId or resourceName parameter' };
    }

    const script = this.getScriptFromCache(scriptId);
    if (!script) {
      return { status: 'error', error: 'Script not found' };
    }

    const cacheKey = `resource_${script.id}_${resourceName}`;
    const result = await chrome.storage.local.get(cacheKey);
    
    if (result[cacheKey]) {
      return { status: 'success', data: result[cacheKey] };
    } else {
      return { status: 'error', error: `Resource not found: ${resourceName}` };
    }
  }

  /**
   * GM_getResourceURL 实现
   */
  private async handleGMGetResourceURL(payload: GMAPIPayload): Promise<GMAPIResponse> {
    const { scriptId, resourceName } = payload;
    if (!scriptId || !resourceName) {
      return { status: 'error', error: 'Missing scriptId or resourceName parameter' };
    }

    const script = this.getScriptFromCache(scriptId);
    if (!script) {
      return { status: 'error', error: 'Script not found' };
    }

    const cacheKey = `resource_${script.id}_${resourceName}`;
    const result = await chrome.storage.local.get(cacheKey);
    
    if (result[cacheKey]) {
      const blob = new Blob([result[cacheKey] as string]);
      const url = URL.createObjectURL(blob);
      return { status: 'success', data: url };
    } else {
      return { status: 'error', error: `Resource not found: ${resourceName}` };
    }
  }

  /**
   * GM_xmlhttpRequest 实现
   */
  private async handleGMXMLHttpRequest(payload: GMAPIPayload): Promise<GMAPIResponse> {
    const { scriptId, details } = payload;
    if (!scriptId || !details) {
      return { status: 'error', error: 'Missing scriptId or details parameter' };
    }

    const script = this.getScriptFromCache(scriptId);
    if (!script) {
      return { status: 'error', error: 'Script not found' };
    }

    const requestUrl = new URL(details.url);
    const isAllowed = script.meta.connect.some((domain) => 
      domain === '*' || requestUrl.hostname === domain || requestUrl.hostname.endsWith('.' + domain)
    );

    if (!isAllowed) {
      return { 
        status: 'error', 
        error: `Domain not whitelisted in @connect: ${requestUrl.hostname}` 
      };
    }

    try {
      const response = await fetch(details.url, {
        method: details.method || 'GET',
        headers: details.headers,
        body: details.data,
      });
      
      const responseText = await response.text();
      const responseHeaders = Array.from(response.headers.entries())
        .map(([key, value]) => `${key}: ${value}`)
        .join('\n');
      
      return {
        status: 'success',
        data: { 
          responseText, 
          status: response.status, 
          statusText: response.statusText, 
          responseHeaders, 
          finalUrl: response.url 
        }
      };
    } catch (error) {
      return { status: 'error', error: (error as Error).message };
    }
  }

  /**
   * 从缓存获取脚本
   */
  private getScriptFromCache(scriptId: string): UserScript | undefined {
    return this.scriptCache[scriptId];
  }

  /**
   * 缓存脚本
   */
  cacheScript(script: UserScript): void {
    this.scriptCache[script.id] = script;
  }

  /**
   * 清除脚本缓存
   */
  clearScriptCache(scriptId?: string): void {
    if (scriptId) {
      delete this.scriptCache[scriptId];
    } else {
      this.scriptCache = {};
    }
  }

  /**
   * 批量缓存脚本
   */
  cacheScripts(scripts: UserScript[]): void {
    scripts.forEach(script => {
      this.scriptCache[script.id] = script;
    });
  }
}

// The createAPIHandler function has been removed from this file.
// The async logic is now handled directly in the background.ts message listener.