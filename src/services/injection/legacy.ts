/**
 * 兼容注入策略
 * 包含传统功能的增强版本，支持动态代码执行和 CSP 绕过
 * 注意：此模块不符合 Chrome Web Store 规范，仅用于兼容性版本
 */

import type { UserScript } from '../../core/types';
import { CompliantInjectionStrategy } from './compliant';
import { InjectionUtils } from './utils';
import { createComponentLogger } from '../logger';

// 创建兼容性注入策略专用日志器
const legacyLogger = createComponentLogger('CompatibilityInjection');

export class CompatibilityInjectionStrategy {
  /**
   * 注入脚本 - 兼容版本
   */
  static async inject(script: UserScript, tabId: number): Promise<void> {
    const startTime = performance.now();
    
    legacyLogger.info('Starting compatibility injection', {
      scriptId: script.id,
      scriptName: script.meta.name,
      tabId,
      action: 'compatibility-injection-start'
    });
    
    try {
      // 首先尝试合规策略
      await CompliantInjectionStrategy.inject(script, tabId);
      
      const duration = performance.now() - startTime;
      legacyLogger.info('Compliant injection succeeded', {
        scriptId: script.id,
        scriptName: script.meta.name,
        duration: Math.round(duration * 100) / 100,
        fallback: false
      });
    } catch (error) {
      legacyLogger.warn('Compliant injection failed, using legacy fallback', {
        scriptId: script.id,
        scriptName: script.meta.name,
        error: (error as Error).message,
        fallback: true
      });
      
      // 降级到传统注入方法
      await this.injectWithLegacyMethods(script, tabId);
      
      const duration = performance.now() - startTime;
      legacyLogger.info('Legacy fallback injection completed', {
        scriptId: script.id,
        scriptName: script.meta.name,
        duration: Math.round(duration * 100) / 100,
        fallback: true
      });
    }
  }

  /**
   * 传统注入方法（包含 eval 等非合规功能）
   */
  private static async injectWithLegacyMethods(script: UserScript, tabId: number): Promise<void> {
    legacyLogger.warn('Using legacy injection methods', {
      scriptId: script.id,
      scriptName: script.meta.name,
      reason: 'compliant-injection-failed'
    });
    
    const needsIsolation = InjectionUtils.needsIsolation(script);
    const world = InjectionUtils.getWorldString(needsIsolation);

    // 注入 API Bridge（如果需要隔离）
    if (needsIsolation) {
      await InjectionUtils.injectAPIBridge(tabId, script.id);
    }

    // 使用增强的注入引擎（包含 eval 降级）
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: InjectionUtils.createEnhancedScriptExecutor(),
      args: [script.content, script.meta.name],
      world: world as chrome.scripting.ExecutionWorld,
    });
  }

  /**
   * 获取策略信息
   */
  static getStrategyInfo(): { name: string; compliant: boolean; features: string[]; warnings?: string[] } {
    return {
      name: 'Compatibility Injection Strategy',
      compliant: false,
      features: [
        'UserScripts API support (with wrappers)',
        'chrome.scripting API fallback',
        'Script tag injection with CSP bypass',
        'Function constructor fallback',
        'eval() emergency fallback',
        'Trusted Types support',
        'CSP nonce support'
      ],
      warnings: [
        'Uses Function constructor (violates MV3 compliance)',
        'Uses eval() as last resort (violates MV3 compliance)',
        'Not suitable for Chrome Web Store distribution'
      ]
    };
  }
}