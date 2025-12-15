import type { UserScript, InjectionStrategy } from '../core/types';
import { createComponentLogger } from './logger';

// 创建 UserScripts API 管理器专用日志器
const userScriptsLogger = createComponentLogger('UserScriptsAPI');

/**
 * UserScripts API 管理器
 * 封装 Chrome UserScripts API 的使用
 */
export class UserScriptsAPIManager {
  private static registeredScripts = new Map<string, chrome.userScripts.RegisteredUserScript>();

  /**
   * 检查 UserScripts API 是否可用
   */
  static isAvailable(): boolean {
    return typeof chrome !== 'undefined' && 
           chrome.userScripts !== undefined &&
           typeof chrome.userScripts.register === 'function';
  }

  /**
   * 注册脚本到 UserScripts API（兼容模式，使用包装器）
   */
  static async registerScript(script: UserScript, strategy: InjectionStrategy): Promise<void> {
    if (!this.isAvailable()) {
      throw new Error('UserScripts API is not available');
    }

    // 先注销已存在的脚本
    await this.unregisterScript(script.id);

    const userScript: chrome.userScripts.RegisteredUserScript = {
      id: script.id,
      matches: script.meta.match || [],
      js: strategy.method === 'userscripts-dynamic' 
        ? [{ code: script.content }]
        : [{ code: this.generateWrapper(script) }],
      runAt: strategy.timing,
      world: strategy.world,
      allFrames: true
    };

    try {
      await chrome.userScripts.register([userScript]);
      this.registeredScripts.set(script.id, userScript);
      userScriptsLogger.info('Script registered successfully', {
        scriptId: script.id,
        scriptName: script.meta.name,
        method: strategy.method
      });
    } catch (error) {
      userScriptsLogger.error('Failed to register script', {
        scriptId: script.id,
        scriptName: script.meta.name,
        error: (error as Error).message
      });
      throw error;
    }
  }

  /**
   * 注册脚本到 UserScripts API（合规模式，不使用包装器）
   */
  static async registerScriptCompliant(script: UserScript, strategy: InjectionStrategy): Promise<void> {
    if (!this.isAvailable()) {
      throw new Error('UserScripts API is not available');
    }

    // 先注销已存在的脚本
    await this.unregisterScript(script.id);

    // 合规模式：直接注册脚本内容，不使用动态包装器
    const userScript: chrome.userScripts.RegisteredUserScript = {
      id: script.id,
      matches: script.meta.match || [],
      js: [{ code: script.content }], // 直接使用脚本内容，不包装
      runAt: strategy.timing,
      world: strategy.world,
      allFrames: true
    };

    try {
      await chrome.userScripts.register([userScript]);
      this.registeredScripts.set(script.id, userScript);
      userScriptsLogger.info('Script registered successfully (compliant mode)', {
        scriptId: script.id,
        scriptName: script.meta.name,
        mode: 'compliant'
      });
    } catch (error) {
      userScriptsLogger.error('Failed to register script (compliant mode)', {
        scriptId: script.id,
        scriptName: script.meta.name,
        mode: 'compliant',
        error: (error as Error).message
      });
      throw error;
    }
  }

  /**
   * 注销脚本
   */
  static async unregisterScript(scriptId: string): Promise<void> {
    if (!this.isAvailable()) {
      return;
    }

    if (this.registeredScripts.has(scriptId)) {
      try {
        await chrome.userScripts.unregister({ ids: [scriptId] });
        this.registeredScripts.delete(scriptId);
        userScriptsLogger.info('Script unregistered successfully', {
            scriptId
          });
        } catch (error) {
          userScriptsLogger.error('Failed to unregister script', {
            scriptId,
            error: (error as Error).message
          });
      }
    }
  }

  /**
   * 注销所有脚本
   */
  static async unregisterAll(): Promise<void> {
    if (!this.isAvailable()) {
      return;
    }

    try {
      await chrome.userScripts.unregister();
      this.registeredScripts.clear();
      userScriptsLogger.info('All scripts unregistered successfully', {
        count: this.registeredScripts.size
      });
    } catch (error) {
      userScriptsLogger.error('Failed to unregister all scripts', {
        error: (error as Error).message
      });
    }
  }

  /**
   * 获取已注册的脚本列表
   */
  static getRegisteredScripts(): string[] {
    return Array.from(this.registeredScripts.keys());
  }

  /**
   * 生成包装器代码（用于兼容模式的 userscripts-api）
   * 警告：此方法使用 Function 构造器，不符合严格的 MV3 合规性
   */
  private static generateWrapper(script: UserScript): string {
    userScriptsLogger.warn('Using non-compliant wrapper', {
      scriptId: script.id,
      scriptName: script.meta.name,
      reason: 'legacy-compatibility'
    });
    
    return `
      (function() {
        'use strict';
        
        // Note: This warning is embedded in the injected script
        console.warn('[CarryMonkey] Using legacy wrapper mode - not MV3 compliant');
        
        // 请求脚本内容
        chrome.runtime.sendMessage({
          action: 'getUserScript',
          scriptId: '${script.id}'
        }, (response) => {
          if (response && response.status === 'success' && response.data) {
            try {
              // 警告：使用 Function 构造器违反 MV3 合规性
              const scriptFunction = new Function(
                'GM_setValue', 'GM_getValue', 'GM_getResourceText', 
                'GM_getResourceURL', 'GM_xmlhttpRequest', 'GM_info',
                response.data
              );
              
              // 绑定 GM API
              scriptFunction.call(window, 
                window.GM_setValue,
                window.GM_getValue, 
                window.GM_getResourceText,
                window.GM_getResourceURL,
                window.GM_xmlhttpRequest,
                {
                  script: {
                    name: '${script.meta.name}',
                    namespace: '${script.meta.namespace}',
                    version: '${script.meta.version}',
                    description: '${script.meta.description}',
                    author: '${script.meta.author}'
                  },
                  scriptMetaStr: \`${JSON.stringify(script.meta).replace(/`/g, '\\`')}\`,
                  version: '1.0.0',
                  scriptHandler: 'CarryMonkey'
                }
              );
            } catch (error) {
                // Note: This error handling is embedded in the injected script
                console.error('[CarryMonkey] Script execution error:', error);
              }
          }
        });
      })();
    `;
  }

  

  /**
   * 更新脚本
   */
  static async updateScript(script: UserScript, strategy: InjectionStrategy): Promise<void> {
    await this.registerScript(script, strategy);
  }

  /**
   * 获取脚本状态
   */
  static getScriptStatus(scriptId: string): 'registered' | 'not-registered' {
    return this.registeredScripts.has(scriptId) ? 'registered' : 'not-registered';
  }

  /**
   * 批量注册脚本
   */
  static async registerMultipleScripts(
    scripts: Array<{ script: UserScript; strategy: InjectionStrategy }>
  ): Promise<void> {
    if (!this.isAvailable()) {
      throw new Error('UserScripts API is not available');
    }

    const userScripts: chrome.userScripts.RegisteredUserScript[] = [];
    
    for (const { script, strategy } of scripts) {
      const userScript: chrome.userScripts.RegisteredUserScript = {
        id: script.id,
        matches: script.meta.match || [],
        js: strategy.method === 'userscripts-dynamic' 
          ? [{ code: script.content }]
          : [{ code: this.generateWrapper(script) }],
        runAt: strategy.timing,
        world: strategy.world,
        allFrames: true
      };
      
      userScripts.push(userScript);
      this.registeredScripts.set(script.id, userScript);
    }

    try {
      await chrome.userScripts.register(userScripts);
      userScriptsLogger.info('Batch registration completed', {
        count: userScripts.length,
        scriptIds: userScripts.map(s => s.id)
      });
    } catch (error) {
      userScriptsLogger.error('Failed to batch register scripts', {
        count: userScripts.length,
        error: (error as Error).message
      });
      throw error;
    }
  }
}