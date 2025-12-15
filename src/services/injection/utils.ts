/**
 * 注入辅助工具类
 * 提取公共的注入辅助方法，避免代码重复
 */

import type { UserScript } from '../../core/types';
import { isFeatureEnabled } from '../../config/feature-flags';
import { CompliantScriptExecutor } from './compliant-executor';
import { createComponentLogger } from '../logger';
import { GuidanceEventBus } from '../guidance-events';

// 创建注入工具专用日志器
const utilsLogger = createComponentLogger('InjectionUtils');

export class InjectionUtils {
  /**
   * 判断脚本是否需要隔离环境
   * 基于 @grant 权限判断
   */
  static needsIsolation(script: UserScript): boolean {
    const grants = script.meta.grant || [];
    return grants.length > 0 && !grants.every(g => g === 'none');
  }

  /**
   * 转换 @run-at 时机到 Chrome API 格式
   */
  static convertRunAtTiming(runAt: string): 'document_start' | 'document_end' | 'document_idle' {
    switch (runAt) {
      case 'document-start':
        return 'document_start';
      case 'document-end':
        return 'document_end';
      case 'document-idle':
        return 'document_idle';
      default:
        return 'document_end';
    }
  }

  /**
   * 注入 API Bridge 到指定标签页
   */
  static async injectAPIBridge(tabId: number, scriptId: string): Promise<void> {
    // 设置当前脚本 ID
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: (id: string) => { window.currentScriptId = id; },
      args: [scriptId],
      world: 'ISOLATED',
    });

    // 注入 API Bridge
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: ['src/content-scripts/api-bridge.js'],
      world: 'ISOLATED',
    });
  }

  /**
   * 获取适当的脚本执行器
   * 根据构建模式和功能标志选择合规或兼容执行器
   */
  static getScriptExecutor() {
    // 检查是否为严格合规模式
    if (isFeatureEnabled('storeCompliant') && !isFeatureEnabled('dynamicCodeExecution')) {
      return CompliantScriptExecutor.createCompliantExecutor();
    }
    
    // 检查是否启用动态代码执行
    if (isFeatureEnabled('dynamicCodeExecution')) {
      return this.createEnhancedScriptExecutor();
    }
    
    // 默认使用基础执行器（仍包含 Function 构造器，用于兼容模式）
    return this.createBaseScriptExecutor();
  }

  /**
   * 创建基础的脚本执行器（兼容模式）
   * 使用 Function 构造器，仅在兼容模式下使用
   */
  static createBaseScriptExecutor() {
    // 记录执行器创建
    utilsLogger.debug('Creating base script executor', {
      type: 'base',
      compliance: 'legacy',
      features: ['function-constructor']
    });
    
    return function(scriptContent: string, scriptName: string) {
      // Note: This warning is embedded in the injected script
      console.warn(`🐒[CarryMonkey] Using legacy Function constructor for: ${scriptName}`);
      try {
        // 警告：这违反了严格的 MV3 合规性，仅用于兼容模式
        const scriptFunction = new Function('window', 'document', 'console', `
          'use strict';
          ${scriptContent}
        `);
        
        scriptFunction.call(window, window, document, console);
        // Note: This log is embedded in the injected script
        console.log(`🐒[CarryMonkey] Script executed: ${scriptName}`);
      } catch (error) {
        // Note: This error is embedded in the injected script
        console.error(`🐒[CarryMonkey] Script execution failed: ${scriptName}`, error);
      }
    };
  }

  /**
   * 创建增强的脚本执行器（完全兼容模式）
   * 包含多种注入方法的降级策略，包括 eval
   */
  static createEnhancedScriptExecutor() {
    // 记录执行器创建
    utilsLogger.debug('Creating enhanced script executor', {
      type: 'enhanced',
      compliance: 'legacy',
      features: ['script-tag', 'function-constructor', 'eval-fallback']
    });
    
    return function(scriptContent: string, scriptName: string) {
      // Note: This log is embedded in the injected script
      console.log(`🐒[CarryMonkey Enhanced] Executing script: ${scriptName}`);

      // 方法1: 尝试 script 标签注入
      if (tryScriptTagInjection(scriptContent)) {
        // Note: This log is embedded in the injected script
        console.log(`🐒[CarryMonkey Enhanced] Script tag injection successful: ${scriptName}`);
        return;
      }

      // 方法2: 尝试 Function 构造器
      if (tryFunctionConstructor(scriptContent)) {
        // Note: This log is embedded in the injected script
        console.log(`🐒[CarryMonkey Enhanced] Function constructor successful: ${scriptName}`);
        return;
      }

      // 方法3: eval 降级（最后手段）
      if (tryEvalFallback(scriptContent)) {
        // Note: This log is embedded in the injected script
        console.log(`🐒[CarryMonkey Enhanced] Eval fallback successful: ${scriptName}`);
        return;
      }

      // Note: This error is embedded in the injected script
      console.error(`🐒[CarryMonkey Enhanced] All injection methods failed: ${scriptName}`);

      // 内部函数：script 标签注入
      function tryScriptTagInjection(code: string): boolean {
        try {
          const script = document.createElement('script');
          script.textContent = code;
          
          // 支持 CSP nonce
          const nonce = document.querySelector('script[nonce]')?.getAttribute('nonce');
          if (nonce) {
            script.setAttribute('nonce', nonce);
          }

          // 支持 Trusted Types
          if (window.trustedTypes && window.trustedTypes.createPolicy) {
            const policy = window.trustedTypes.createPolicy('carrymonkey-injection', {
              createScript: (input: string) => input
            });
            script.textContent = policy.createScript(code) as string;
          }

          (document.head || document.documentElement).appendChild(script);
          script.remove();
          return true;
        } catch (error) {
            // Note: This warning is embedded in the injected script
            console.warn('🐒[CarryMonkey Enhanced] Script tag injection failed:', error);
          return false;
        }
      }

      // 内部函数：Function 构造器
      function tryFunctionConstructor(code: string): boolean {
        try {
          const scriptFunction = new Function('window', 'document', 'console', `
            'use strict';
            ${code}
          `);
          scriptFunction.call(window, window, document, console);
          return true;
        } catch (error) {
            // Note: This warning is embedded in the injected script
            console.warn('🐒[CarryMonkey Enhanced] Function constructor failed:', error);
          return false;
        }
      }

      // 内部函数：eval 降级
      function tryEvalFallback(code: string): boolean {
        try {
          // 警告：这违反了 MV3 规范，仅用于完全兼容模式
          eval(code);
          return true;
        } catch (error) {
            // Note: This error is embedded in the injected script
            console.error('🐒[CarryMonkey Enhanced] Eval fallback failed:', error);
          return false;
        }
      }
    };
  }

  // 缓存 API 可用性结果，避免重复检查
  private static userScriptsAPICache: { available: boolean; timestamp: number } | null = null;
  private static readonly CACHE_DURATION = 30000; // 30秒缓存

  /**
   * 异步检查是否可以使用 UserScripts API
   * 采用多层次检测策略，包含延迟重试机制和结果缓存
   */
  static async canUseUserScriptsAPI(): Promise<boolean> {
    const startTime = performance.now();
    
    // 阶段0: 检查缓存
    const now = Date.now();
    if (this.userScriptsAPICache && (now - this.userScriptsAPICache.timestamp) < this.CACHE_DURATION) {
      utilsLogger.debug('UserScripts API cache hit', {
        available: this.userScriptsAPICache.available,
        cacheAge: now - this.userScriptsAPICache.timestamp,
        phase: 'cached'
      });
      return this.userScriptsAPICache.available;
    }
    
    // 阶段1: 立即检查
    let available = await this.checkUserScriptsAPIInternal();
    
    utilsLogger.debug('UserScripts API immediate check', {
      available,
      phase: 'immediate'
    });

    // 阶段2: 如果立即检查失败，进行延迟重试
    if (!available) {
      utilsLogger.debug('UserScripts API delayed check starting', {
        reason: 'immediate_check_failed',
        delay: 150
      });
      
      await new Promise(resolve => setTimeout(resolve, 150));
      
      available = await this.checkUserScriptsAPIInternal();
      
      const duration = performance.now() - startTime;
      utilsLogger.info('UserScripts API delayed check completed', {
        available,
        phase: 'delayed',
        duration: Math.round(duration * 100) / 100,
        success: available,
        reason: available ? 'api_available_after_delay' : 'api_still_unavailable'
      });
    } else {
      const duration = performance.now() - startTime;
      utilsLogger.debug('UserScripts API immediate check successful', {
        available: true,
        phase: 'immediate',
        duration: Math.round(duration * 100) / 100
      });
    }
    
    // 缓存结果
    this.userScriptsAPICache = {
      available,
      timestamp: now
    };
    
    utilsLogger.debug('UserScripts API result cached', {
      available,
      cacheTimestamp: now
    });
    
    return available;
  }

  /**
   * 清除 UserScripts API 缓存（用于调试或强制重新检测）
   */
  static clearUserScriptsAPICache(): void {
    this.userScriptsAPICache = null;
    utilsLogger.debug('UserScripts API cache cleared');
  }

  /**
   * 获取 UserScripts API 统计信息
   */
  static getUserScriptsAPIStats(): {
    cached: boolean;
    cacheAge?: number;
    available?: boolean;
  } {
    if (!this.userScriptsAPICache) {
      return { cached: false };
    }
    
    return {
      cached: true,
      cacheAge: Date.now() - this.userScriptsAPICache.timestamp,
      available: this.userScriptsAPICache.available
    };
  }

  /**
   * 内部多层次检测方法
   */
  private static async checkUserScriptsAPIInternal(): Promise<boolean> {
    try {
      // 层次1: 基础对象检测 (类似篡改猴的检测方式)
      const hasUserScriptsObject = !!chrome?.userScripts;
      
      if (!hasUserScriptsObject) {
        utilsLogger.warn('UserScripts object missing', {
          reason: 'userScripts_object_missing',
          suggestion: 'Browser may not support UserScripts API'
        });
        
        // 通过事件总线触发用户指导，避免循环依赖
        GuidanceEventBus.emit('userscripts_unavailable', { reason: 'userScripts_object_missing' });
        
        return false;
      }
      
      // 层次2: 权限检测
      let hasPermission = false;
      try {
        hasPermission = await chrome.permissions.contains({
          permissions: ['userScripts']
        });
        
        if (!hasPermission) {
          utilsLogger.warn('UserScripts permission denied', {
            reason: 'permission_denied',
            suggestion: 'User guidance will be shown'
          });
          
          // 通过事件总线触发用户指导，避免循环依赖
          GuidanceEventBus.emit('userscripts_permission_denied');
          
          return false;
        }
      } catch (permissionError) {
        // 继续检查，可能是旧版本 Chrome 不支持 permissions.contains
        utilsLogger.debug('Permission check failed, continuing', {
          error: (permissionError as Error).message
        });
      }
      
      // 层次3: 方法可用性检测
      const hasRegisterMethod = typeof chrome.userScripts.register === 'function';
      
      if (!hasRegisterMethod) {
        utilsLogger.warn('UserScripts register method missing', {
          reason: 'register_method_missing',
          suggestion: 'API object exists but methods are missing'
        });
        
        // 通过事件总线触发用户指导，避免循环依赖
        GuidanceEventBus.emit('userscripts_unavailable', { reason: 'register_method_missing' });
        
        return false;
      }
      
      // 层次4: 实际功能测试 (轻量级)
      try {
        await chrome.userScripts.getScripts();
        
        utilsLogger.debug('UserScripts API functional test passed', {
          checks: {
            objectExists: true,
            hasPermission: hasPermission || 'unknown',
            hasRegisterMethod: true,
            functionalTest: true
          }
        });
        
        return true;
      } catch (functionalError) {
        utilsLogger.warn('UserScripts functional test failed', {
          error: (functionalError as Error).message,
          reason: 'functional_test_failed',
          suggestion: 'API exists but cannot be used'
        });
        
        // 通过事件总线触发用户指导，避免循环依赖
        GuidanceEventBus.emit('userscripts_unavailable', { reason: 'functional_test_failed' });
        
        return false;
      }
      
    } catch (error) {
      utilsLogger.debug('UserScripts API check exception', {
        error: (error as Error).message,
        reason: 'check_exception'
      });
      
      return false;
    }
  }

  /**
   * 获取世界类型字符串
   */
  static getWorldString(isolated: boolean): chrome.scripting.ExecutionWorld {
    const world = isolated ? 'ISOLATED' as chrome.scripting.ExecutionWorld : 'MAIN' as chrome.scripting.ExecutionWorld;
    
    utilsLogger.debug('Execution world determined', {
      isolated,
      world,
      reason: isolated ? 'script-requires-isolation' : 'simple-script'
    });
    
    return world;
  }

  /**
   * 安全地执行脚本内容
   * 根据构建模式选择合适的执行方式
   */
  static async executeScriptContent(
    scriptContent: string, 
    scriptName: string, 
    tabId: number,
    world: chrome.scripting.ExecutionWorld = 'MAIN' as chrome.scripting.ExecutionWorld
  ): Promise<boolean> {
    const startTime = performance.now();
    
    utilsLogger.debug('Executing script content', {
      scriptName,
      tabId,
      world,
      contentLength: scriptContent.length
    });
    
    try {
      await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        func: this.getScriptExecutor(),
        args: [scriptContent, scriptName],
        world,
      });
      
      const duration = performance.now() - startTime;
      utilsLogger.info('Script execution successful', {
        scriptName,
        tabId,
        world,
        duration: Math.round(duration * 100) / 100
      });
      
      return true;
    } catch (error) {
      const duration = performance.now() - startTime;
      utilsLogger.error('Script execution failed', {
        scriptName,
        tabId,
        world,
        error: (error as Error).message,
        duration: Math.round(duration * 100) / 100
      });
      return false;
    }
  }

  /**
   * 验证脚本是否适合当前构建模式
   */
  static validateScriptForCurrentMode(script: UserScript): { valid: boolean; issues: string[] } {
    utilsLogger.debug('Validating script for current mode', {
      scriptId: script.id,
      scriptName: script.meta.name,
      storeCompliant: isFeatureEnabled('storeCompliant')
    });
    
    if (isFeatureEnabled('storeCompliant')) {
      const validation = CompliantScriptExecutor.validateScriptContent(script);
      
      utilsLogger.debug('Script validation result', {
        scriptId: script.id,
        scriptName: script.meta.name,
        valid: validation.safe,
        issues: validation.issues,
        mode: 'store-compliant'
      });
      
      return { valid: validation.safe, issues: validation.issues };
    }
    
    // 兼容模式下允许所有脚本
    utilsLogger.debug('Script validation skipped', {
      scriptId: script.id,
      scriptName: script.meta.name,
      mode: 'compatibility',
      reason: 'all-scripts-allowed'
    });
    
    return { valid: true, issues: [] };
  }
}