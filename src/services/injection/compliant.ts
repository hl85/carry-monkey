/**
 * 合规注入策略
 * 完全符合 Chrome Manifest V3 规范
 * 仅使用官方 API，不包含任何动态代码执行
 */

import type { UserScript, InjectionStrategy } from '../../core/types';
import { UserScriptsAPIManager } from '../userscripts-api';
import { InjectionUtils } from './utils';
import { CompliantScriptExecutor } from './compliant-executor';
import { isFeatureEnabled } from '../../config/feature-flags';
import { createComponentLogger } from '../logger';

// 创建合规注入策略专用日志器
const compliantLogger = createComponentLogger('CompliantInjection');

export class CompliantInjectionStrategy {
  /**
   * 注入脚本 - 合规版本
   */
  static async inject(script: UserScript, tabId: number): Promise<void> {
    const startTime = performance.now();
    
    compliantLogger.info('Starting compliant script injection', {
      scriptId: script.id,
      scriptName: script.meta.name,
      tabId,
      action: 'compliant-injection-start'
    });
    
    // 验证脚本是否符合合规要求
    const validation = CompliantScriptExecutor.validateScriptContent(script);
    if (!validation.safe) {
      compliantLogger.warn('Script validation failed', {
        scriptId: script.id,
        scriptName: script.meta.name,
        issues: validation.issues,
        action: 'validation-failed'
      });
      
      // 在严格合规模式下，拒绝执行不安全的脚本
      if (isFeatureEnabled('storeCompliant')) {
        compliantLogger.error('Rejecting non-compliant script in strict mode', {
          scriptId: script.id,
          scriptName: script.meta.name,
          issues: validation.issues
        });
        throw new Error(`Script ${script.meta.name} contains non-compliant code: ${validation.issues.join(', ')}`);
      }
    } else {
      compliantLogger.debug('Script validation passed', {
        scriptId: script.id,
        action: 'validation-passed'
      });
    }
    
    // 优先使用 UserScripts API（合规方式）
    if (await this.canUseUserScriptsAPI()) {
      compliantLogger.debug('Using UserScripts API for injection', {
        scriptId: script.id,
        method: 'userscripts-api'
      });
      await this.injectViaUserScripts(script);
      
      const duration = performance.now() - startTime;
      compliantLogger.info('Compliant injection completed via UserScripts API', {
        scriptId: script.id,
        scriptName: script.meta.name,
        method: 'userscripts-api',
        duration: Math.round(duration * 100) / 100,
        action: 'injection-success'
      });
      return;
    }
    
    // 降级到 chrome.scripting API（合规方式）
    compliantLogger.debug('Falling back to chrome.scripting API', {
      scriptId: script.id,
      method: 'chrome-scripting'
    });
    await this.injectViaScripting(script, tabId);
    
    const duration = performance.now() - startTime;
    compliantLogger.info('Compliant injection completed via chrome.scripting API', {
      scriptId: script.id,
      scriptName: script.meta.name,
      method: 'chrome-scripting',
      duration: Math.round(duration * 100) / 100,
      action: 'injection-success'
    });
  }

  /**
   * 通过 UserScripts API 注入（完全合规）
   */
  private static async injectViaUserScripts(script: UserScript): Promise<void> {
    const strategy: InjectionStrategy = {
      method: 'userscripts-dynamic',
      world: 'USER_SCRIPT',
      timing: InjectionUtils.convertRunAtTiming(script.meta['run-at']),
      reason: 'Using UserScripts API for compliant execution'
    };

    compliantLogger.debug('Registering script with UserScripts API', {
      scriptId: script.id,
      strategy: strategy.method,
      world: strategy.world,
      timing: strategy.timing
    });

    // 使用合规的 UserScripts API 注册（不使用包装器）
    await UserScriptsAPIManager.registerScriptCompliant(script, strategy);
    
    compliantLogger.debug('Script registered successfully with UserScripts API', {
      scriptId: script.id
    });
  }

  /**
   * 通过 chrome.scripting API 注入（合规方式）
   */
  private static async injectViaScripting(script: UserScript, tabId: number): Promise<void> {
    const needsIsolation = InjectionUtils.needsIsolation(script);
    const world = InjectionUtils.getWorldString(needsIsolation);

    compliantLogger.debug('Analyzing script isolation requirements', {
      scriptId: script.id,
      needsIsolation,
      world,
      grants: script.meta.grant || []
    });

    // 注入 API Bridge（如果需要隔离）
    if (needsIsolation) {
      compliantLogger.debug('Injecting API bridge for isolated execution', {
        scriptId: script.id,
        tabId
      });
      await InjectionUtils.injectAPIBridge(tabId, script.id);
    }

    compliantLogger.debug('Executing script via chrome.scripting API', {
      scriptId: script.id,
      tabId,
      world,
      executor: 'compliant'
    });

    // 使用合规的脚本执行器
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: CompliantScriptExecutor.createCompliantExecutor(),
      args: [script.content, script.meta.name],
      world: world as chrome.scripting.ExecutionWorld,
    });
    
    compliantLogger.debug('Script execution completed via chrome.scripting API', {
      scriptId: script.id,
      tabId
    });
  }

  /**
   * 检查是否可以使用 UserScripts API
   */
  private static async canUseUserScriptsAPI(): Promise<boolean> {
    return UserScriptsAPIManager.isAvailable();
  }

  /**
   * 获取策略信息
   */
  static getStrategyInfo(): { name: string; compliant: boolean; features: string[] } {
    return {
      name: 'Fully Compliant Injection Strategy',
      compliant: true,
      features: [
        'UserScripts API support (no wrappers)',
        'chrome.scripting API fallback',
        'Script content validation',
        'No eval() usage',
        'No Function constructor',
        'Trusted Types support',
        'CSP nonce support',
        'MV3 fully compliant'
      ]
    };
  }

  /**
   * 获取合规模式的限制信息
   */
  static getComplianceInfo() {
    return {
      restrictions: [
        'No dynamic code execution (eval, Function constructor)',
        'No string-based setTimeout/setInterval',
        'Limited innerHTML usage',
        'No dynamic script loading'
      ],
      alternatives: [
        'Use UserScripts API for script execution',
        'Use chrome.scripting API with static functions',
        'Use Trusted Types for safe content handling',
        'Use CSP nonces for script validation'
      ]
    };
  }
}