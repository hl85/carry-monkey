import type { UserScript, InjectionStrategy } from '../core/types';
import { InjectionUtils } from './injection/utils';
import { createComponentLogger } from './logger';

// 创建策略选择器专用日志器
const strategyLogger = createComponentLogger('InjectionStrategy');

/**
 * 智能注入策略选择器
 * 根据脚本特性选择最优的注入方式
 */
export class InjectionStrategySelector {
  /**
   * 选择最优注入策略
   */
  static selectStrategy(script: UserScript): InjectionStrategy {
    const startTime = performance.now();
    
    strategyLogger.info('Starting strategy selection', {
      scriptId: script.id,
      scriptName: script.meta.name,
      action: 'strategy-selection'
    });
    // 1. 评估 @grant 权限
    const grants = script.meta.grant || [];
    const hasGMAPIs = grants.length > 0 && !grants.every(g => g === 'none');
    const hasSpecialAPIs = grants.some(g => 
      ['GM_setValue', 'GM_getValue', 'GM_xmlhttpRequest', 'GM_getResourceText', 'GM_getResourceURL'].includes(g)
    );

    strategyLogger.debug('Grant permissions analysis', {
      scriptId: script.id,
      grants,
      hasGMAPIs,
      hasSpecialAPIs,
      grantCount: grants.length
    });

    // 2. 评估 @run-at 时机
    const runAt = script.meta['run-at'] || 'document-end';
    const needsEarlyExecution = runAt === 'document-start';

    strategyLogger.debug('Execution timing analysis', {
      scriptId: script.id,
      runAt,
      needsEarlyExecution
    });

    // 3. 评估 @sandbox 模式
    const sandboxMode = script.meta.sandbox || 'raw';
    const needsIsolation = sandboxMode !== 'raw' || hasGMAPIs;

    strategyLogger.debug('Sandbox mode analysis', {
      scriptId: script.id,
      sandboxMode,
      needsIsolation,
      isolationReason: sandboxMode !== 'raw' ? 'explicit-sandbox' : hasGMAPIs ? 'gm-apis' : 'none'
    });

    // 4. 检查是否支持 UserScripts API
    const supportsUserScriptsAPI = this.checkUserScriptsAPISupport();

    strategyLogger.info('UserScripts API availability', {
      scriptId: script.id,
      supportsUserScriptsAPI
    });

    // 5. 策略选择逻辑
    let selectedStrategy: InjectionStrategy;
    
    if (needsEarlyExecution && hasSpecialAPIs && supportsUserScriptsAPI) {
      selectedStrategy = {
        method: 'userscripts-dynamic',
        world: 'USER_SCRIPT',
        timing: 'document_start',
        reason: 'Early execution with GM APIs requires dynamic UserScripts API'
      };
      
      strategyLogger.info('Strategy selected: UserScripts Dynamic', {
        scriptId: script.id,
        strategy: 'userscripts-dynamic',
        factors: ['early-execution', 'special-apis', 'userscripts-support'],
        priority: 'highest'
      });
    } else if (hasSpecialAPIs && supportsUserScriptsAPI) {
      selectedStrategy = {
        method: 'userscripts-api',
        world: 'USER_SCRIPT',
        timing: this.convertRunAtTiming(runAt),
        reason: 'GM APIs require UserScripts API with message passing'
      };
      
      strategyLogger.info('Strategy selected: UserScripts API', {
        scriptId: script.id,
        strategy: 'userscripts-api',
        factors: ['special-apis', 'userscripts-support'],
        priority: 'high'
      });
    } else if (needsIsolation) {
      selectedStrategy = {
        method: 'content-script',
        world: 'USER_SCRIPT',
        timing: this.convertRunAtTiming(runAt),
        reason: 'Isolation required but UserScripts API not available, using content script'
      };
      
      strategyLogger.info('Strategy selected: Content Script (Isolated)', {
        scriptId: script.id,
        strategy: 'content-script-isolated',
        factors: ['isolation-required', 'no-userscripts-support'],
        priority: 'medium'
      });
    } else {
      selectedStrategy = {
        method: 'content-script',
        world: 'MAIN',
        timing: this.convertRunAtTiming(runAt),
        reason: 'Simple script without special requirements, using direct injection'
      };
      
      strategyLogger.info('Strategy selected: Content Script (Direct)', {
        scriptId: script.id,
        strategy: 'content-script-direct',
        factors: ['simple-script', 'no-special-requirements'],
        priority: 'low'
      });
    }

    // 计算策略分数并记录
    const strategyScore = this.getStrategyScore(selectedStrategy, script);
    const complexity = this.evaluateScriptComplexity(script);
    const duration = performance.now() - startTime;

    strategyLogger.info('Strategy selection completed', {
      scriptId: script.id,
      scriptName: script.meta.name,
      selectedMethod: selectedStrategy.method,
      selectedWorld: selectedStrategy.world,
      selectedTiming: selectedStrategy.timing,
      reason: selectedStrategy.reason,
      strategyScore,
      scriptComplexity: complexity,
      duration: Math.round(duration * 100) / 100,
      action: 'strategy-selected'
    });

    return selectedStrategy;
  }

  /**
   * 检查 UserScripts API 是否可用
   */
  private static checkUserScriptsAPISupport(): boolean {
    return InjectionUtils.canUseUserScriptsAPI();
  }

  /**
   * 转换 run-at 时机到 Chrome API 格式
   */
  private static convertRunAtTiming(runAt: string): 'document_start' | 'document_end' | 'document_idle' {
    return InjectionUtils.convertRunAtTiming(runAt);
  }

  /**
   * 评估脚本复杂度
   */
  static evaluateScriptComplexity(script: UserScript): 'simple' | 'moderate' | 'complex' {
    const grants = script.meta.grant || [];
    const hasRequires = (script.meta.require || []).length > 0;
    const hasResources = Object.keys(script.meta.resource || {}).length > 0;
    const hasConnect = (script.meta.connect || []).length > 0;

    let complexity: 'simple' | 'moderate' | 'complex';

    if (grants.length > 3 || hasRequires || hasResources || hasConnect) {
      complexity = 'complex';
    } else if (grants.length > 1 || grants.some(g => g !== 'none')) {
      complexity = 'moderate';
    } else {
      complexity = 'simple';
    }

    strategyLogger.debug('Script complexity evaluated', {
      scriptId: script.id,
      complexity,
      factors: {
        grants: grants.length,
        hasRequires,
        hasResources,
        hasConnect,
        contentLength: script.content.length
      }
    });

    return complexity;
  }

  /**
   * 获取策略优先级分数（用于调试和优化）
   */
  static getStrategyScore(strategy: InjectionStrategy, script: UserScript): number {
    let score = 0;

    // 基础分数
    if (strategy.method === 'userscripts-dynamic') score += 100;
    else if (strategy.method === 'userscripts-api') score += 80;
    else score += 60;

    // 时机匹配分数
    const requestedTiming = script.meta['run-at'] || 'document-end';
    if (this.convertRunAtTiming(requestedTiming) === strategy.timing) {
      score += 20;
    }

    // 功能需求匹配分数
    const grants = script.meta.grant || [];
    const hasGMAPIs = grants.some(g => g !== 'none');
    if (hasGMAPIs && strategy.world === 'USER_SCRIPT') {
      score += 15;
    }

    strategyLogger.debug('Strategy score calculated', {
      scriptId: script.id,
      method: strategy.method,
      world: strategy.world,
      timing: strategy.timing,
      score,
      factors: {
        baseScore: strategy.method === 'userscripts-dynamic' ? 100 : strategy.method === 'userscripts-api' ? 80 : 60,
        timingMatch: this.convertRunAtTiming(requestedTiming) === strategy.timing,
        gmApiMatch: hasGMAPIs && strategy.world === 'USER_SCRIPT'
      }
    });

    return score;
  }
}