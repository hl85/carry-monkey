/**
 * 脚本资源管理器
 * 统一管理脚本资源的缓存和加载
 */

import type { UserScript } from '../core/types';
import { createComponentLogger } from './logger';

// 创建资源管理器专用日志器
const resourceLogger = createComponentLogger('ScriptResourceManager');

export class ScriptResourceManager {
  private static instance: ScriptResourceManager;
  private scriptCache: Record<string, UserScript> = {};

  private constructor() {}

  static getInstance(): ScriptResourceManager {
    if (!ScriptResourceManager.instance) {
      ScriptResourceManager.instance = new ScriptResourceManager();
    }
    return ScriptResourceManager.instance;
  }

  /**
   * 缓存脚本
   */
  cacheScript(script: UserScript): void {
    this.scriptCache[script.id] = script;
  }

  /**
   * 批量缓存脚本
   */
  cacheScripts(scripts: UserScript[]): void {
    scripts.forEach(script => {
      this.scriptCache[script.id] = script;
    });
  }

  /**
   * 获取脚本
   */
  getScript(scriptId: string): UserScript | undefined {
    return this.scriptCache[scriptId];
  }

  /**
   * 清除脚本缓存
   */
  clearCache(scriptId?: string): void {
    if (scriptId) {
      delete this.scriptCache[scriptId];
    } else {
      this.scriptCache = {};
    }
  }

  /**
   * 缓存资源文件
   */
  async cacheResources(script: UserScript): Promise<void> {
    if (!script.meta.resource) return;

    const cachePromises = Object.entries(script.meta.resource).map(async ([key, url]) => {
      const cacheKey = `resource_${script.id}_${key}`;
      const cached = await chrome.storage.local.get(cacheKey);
      
      if (cached[cacheKey]) return; // 已缓存

      try {
        const response = await fetch(url);
        if (response.ok) {
          const content = await response.text();
          await chrome.storage.local.set({ [cacheKey]: content });
        }
      } catch (error) {
          resourceLogger.error('Failed to cache resource', {
            key,
            url,
            error: (error as Error).message
          });
        }
    });

    await Promise.all(cachePromises);
  }

  /**
   * 缓存依赖脚本
   */
  async cacheDependencies(urls: string[]): Promise<string> {
    if (!urls || urls.length === 0) return '';

    const cachePromises = urls.map(async (url) => {
      const cacheKey = `required_script_${url}`;
      const cached = await chrome.storage.local.get(cacheKey);
      
      if (cached[cacheKey]) {
        return cached[cacheKey];
      }

      try {
        const response = await fetch(url);
        if (response.ok) {
          const scriptContent = await response.text();
          await chrome.storage.local.set({ [cacheKey]: scriptContent });
          return scriptContent;
        }
      } catch (error) {
          resourceLogger.error('Failed to fetch or cache required script', {
            url,
            error: (error as Error).message
          });
        }
      
      return '';
    });

    const contents = await Promise.all(cachePromises);
    return contents.join('\n');
  }

  /**
   * 获取资源内容
   */
  async getResourceContent(scriptId: string, resourceName: string): Promise<string | null> {
    const cacheKey = `resource_${scriptId}_${resourceName}`;
    const result = await chrome.storage.local.get(cacheKey);
    const value = result[cacheKey];
    return typeof value === 'string' ? value : null;
  }

  /**
   * 获取资源 URL
   */
  async getResourceURL(scriptId: string, resourceName: string): Promise<string | null> {
    const content = await this.getResourceContent(scriptId, resourceName);
    if (!content) return null;

    const blob = new Blob([content]);
    return URL.createObjectURL(blob);
  }

  /**
   * 预加载所有脚本资源
   */
  async preloadScriptResources(scripts: UserScript[]): Promise<void> {
    const preloadPromises = scripts.map(async (script) => {
      await this.cacheResources(script);
      const dependencies = await this.cacheDependencies(script.meta.require || []);
      // 将依赖内容缓存到脚本中
      script.content = dependencies + '\n\n' + script.content;
    });

    await Promise.all(preloadPromises);
  }
}