/**
 * 统一注入引擎
 * 根据构建模式和功能标志选择合适的注入策略
 */

import type { UserScript } from '../../core/types';
import { isFeatureEnabled } from '../../config/feature-flags';
import { CompliantInjectionStrategy } from './compliant';
import { CompatibilityInjectionStrategy } from './legacy';
import { InjectionStrategySelector } from '../injection-strategy';
import { CompliantScriptExecutor } from './compliant-executor';
import { createComponentLogger } from '../logger';

// 创建注入引擎专用日志器
const engineLogger = createComponentLogger('InjectionEngine');

export class UnifiedInjectionEngine {
  /**
   * 智能注入脚本
   * 根据构建模式和功能标志自动选择策略
   */
  static async injectScript(script: UserScript, tabId: number): Promise<void> {
    const startTime = performance.now();
    
    engineLogger.info('Starting script injection', {
      scriptId: script.id,
      scriptName: script.meta.name,
      tabId,
      action: 'injection-start'
    });
    
    // 获取策略选择结果
    const strategy = InjectionStrategySelector.selectStrategy(script);
    script.meta._injectionStrategy = strategy;
    
    engineLogger.info('Injection strategy determined', {
      scriptId: script.id,
      strategy: strategy.method,
      world: strategy.world,
      timing: strategy.timing,
      reason: strategy.reason
    });
    
    // 在严格合规模式下，验证脚本内容
    if (isFeatureEnabled('storeCompliant')) {
      engineLogger.debug('Validating script compliance', {
        scriptId: script.id,
        mode: 'store-compliant'
      });
      
      const validation = CompliantScriptExecutor.validateScriptContent(script);
      if (!validation.safe) {
        engineLogger.error('Script validation failed', {
          scriptId: script.id,
          scriptName: script.meta.name,
          issues: validation.issues,
          action: 'validation-failed'
        });
        throw new Error(`Script contains non-compliant code: ${validation.issues.join(', ')}`);
      }
      
      engineLogger.debug('Script validation passed', {
        scriptId: script.id,
        action: 'validation-passed'
      });
    }
    
    try {
      // 根据构建模式选择注入实现
      if (isFeatureEnabled('storeCompliant')) {
        // 严格合规模式：仅使用合规策略
        engineLogger.debug('Using strict compliant injection', {
          scriptId: script.id,
          mode: 'store-compliant'
        });
        await CompliantInjectionStrategy.inject(script, tabId);
        
      } else if (isFeatureEnabled('legacyInjection')) {
        // 兼容模式：使用兼容策略
        engineLogger.debug('Using legacy injection', {
          scriptId: script.id,
          mode: 'legacy-injection'
        });
        await CompatibilityInjectionStrategy.inject(script, tabId);
        
      } else {
        // 默认模式：优先合规，失败时降级
        engineLogger.debug('Using hybrid injection (compliant first)', {
          scriptId: script.id,
          mode: 'hybrid'
        });
        
        try {
          await CompliantInjectionStrategy.inject(script, tabId);
          engineLogger.debug('Compliant injection successful', {
            scriptId: script.id,
            fallback: false
          });
        } catch (compliantError) {
          engineLogger.warn('Compliant injection failed, trying compatibility fallback', {
            scriptId: script.id,
            error: (compliantError as Error).message,
            fallback: true
          });
          await CompatibilityInjectionStrategy.inject(script, tabId);
          engineLogger.info('Compatibility fallback successful', {
            scriptId: script.id,
            fallback: true
          });
        }
      }
      
      const duration = performance.now() - startTime;
      engineLogger.info('Script injection completed successfully', {
        scriptId: script.id,
        scriptName: script.meta.name,
        duration: Math.round(duration * 100) / 100,
        action: 'injection-success'
      });
      
    } catch (error) {
      const duration = performance.now() - startTime;
      engineLogger.error('Script injection failed', {
        scriptId: script.id,
        scriptName: script.meta.name,
        error: (error as Error).message,
        duration: Math.round(duration * 100) / 100,
        action: 'injection-failed'
      });
      
      // 在非严格模式下，如果支持降级，尝试兼容策略
      if (!isFeatureEnabled('storeCompliant') && !isFeatureEnabled('legacyInjection') && isFeatureEnabled('evalFallback')) {
        engineLogger.warn('Attempting emergency fallback injection', {
          scriptId: script.id,
          fallbackType: 'emergency'
        });
        
        try {
          await CompatibilityInjectionStrategy.inject(script, tabId);
          const fallbackDuration = performance.now() - startTime;
          engineLogger.info('Emergency fallback injection successful', {
            scriptId: script.id,
            scriptName: script.meta.name,
            duration: Math.round(fallbackDuration * 100) / 100,
            fallbackType: 'emergency',
            action: 'fallback-success'
          });
        } catch (fallbackError) {
          const fallbackDuration = performance.now() - startTime;
          engineLogger.error('Emergency fallback injection also failed', {
            scriptId: script.id,
            scriptName: script.meta.name,
            error: (fallbackError as Error).message,
            duration: Math.round(fallbackDuration * 100) / 100,
            fallbackType: 'emergency',
            action: 'fallback-failed'
          });
          throw fallbackError;
        }
      } else {
        throw error;
      }
    }
  }

  /**
   * 批量注入脚本
   */
  static async injectMultipleScripts(scripts: UserScript[], tabId: number): Promise<void> {
    const startTime = performance.now();
    
    engineLogger.info('Starting batch script injection', {
      scriptCount: scripts.length,
      tabId,
      scriptIds: scripts.map(s => s.id),
      action: 'batch-injection-start'
    });
    
    const results = await Promise.allSettled(
      scripts.map(script => this.injectScript(script, tabId))
    );
    
    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;
    const duration = performance.now() - startTime;
    
    engineLogger.info('Batch injection completed', {
      scriptCount: scripts.length,
      successful,
      failed,
      successRate: Math.round((successful / scripts.length) * 100),
      duration: Math.round(duration * 100) / 100,
      action: 'batch-injection-complete'
    });
    
    // 记录失败的脚本详情
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        engineLogger.error('Script injection failed in batch', {
          scriptId: scripts[index].id,
          scriptName: scripts[index].meta.name,
          error: result.reason,
          batchIndex: index,
          action: 'batch-item-failed'
        });
      }
    });
  }

  /**
   * 获取引擎状态信息
   */
  static getEngineInfo() {
    const storeCompliant = isFeatureEnabled('storeCompliant');
    const legacyEnabled = isFeatureEnabled('legacyInjection');
    const evalFallback = isFeatureEnabled('evalFallback');
    
    let mode = 'hybrid';
    if (storeCompliant) {
      mode = 'strict-compliant';
    } else if (legacyEnabled) {
      mode = 'compatibility';
    }
    
    return {
      engine: 'UnifiedInjectionEngine',
      version: '3.0.0',
      mode,
      compliance: {
        storeCompliant: storeCompliant,
        mv3Compliant: storeCompliant || !legacyEnabled,
        webStoreReady: storeCompliant
      },
      features: {
        storeCompliant: storeCompliant,
        legacyInjection: legacyEnabled,
        evalFallback: evalFallback,
        userScriptsAPI: isFeatureEnabled('userScriptsAPI'),
        dynamicCodeExecution: isFeatureEnabled('dynamicCodeExecution'),
        strictCSP: isFeatureEnabled('strictCSP'),
        scriptValidation: storeCompliant
      },
      strategies: {
        compliant: CompliantInjectionStrategy.getStrategyInfo(),
        compatibility: CompatibilityInjectionStrategy.getStrategyInfo()
      },
      executor: CompliantScriptExecutor.getExecutorInfo()
    };
  }

  /**
   * 健康检查
   */
  static async healthCheck(): Promise<{ status: 'healthy' | 'degraded' | 'unhealthy'; issues: string[] }> {
    const issues: string[] = [];
    
    // 检查 UserScripts API 可用性
    if (isFeatureEnabled('userScriptsAPI') && !chrome.userScripts) {
      issues.push('UserScripts API not available but feature is enabled');
    }
    
    // 检查权限
    try {
      const permissions = await chrome.permissions.getAll();
      const requiredPermissions = ['scripting', 'tabs', 'activeTab'] as const;
      
      for (const permission of requiredPermissions) {
        if (!permissions.permissions?.includes(permission as chrome.runtime.ManifestPermission)) {
          issues.push(`Missing required permission: ${permission}`);
        }
      }
      
      if (isFeatureEnabled('userScriptsAPI') && !permissions.permissions?.includes('userScripts')) {
        issues.push('Missing userScripts permission but feature is enabled');
      }
    } catch (error) {
      issues.push(`Permission check failed: ${error}`);
    }
    
    // 确定状态
    let status: 'healthy' | 'degraded' | 'unhealthy';
    if (issues.length === 0) {
      status = 'healthy';
    } else if (issues.some(issue => issue.includes('required permission'))) {
      status = 'unhealthy';
    } else {
      status = 'degraded';
    }
    
    return { status, issues };
  }
}