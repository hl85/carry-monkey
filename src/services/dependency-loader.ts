import type { UserScript } from '../core/types';
import { ScriptResourceManager } from './script-resource-manager';

/**
 * 加载脚本依赖（已废弃）
 * 请使用 ScriptResourceManager.cacheDependencies() 代替
 * @deprecated 使用 ScriptResourceManager.cacheDependencies() 代替
 */
import { createComponentLogger } from './logger';

// 创建依赖加载器专用日志器
const depLogger = createComponentLogger('DependencyLoader');

export async function loadDependencies(script: UserScript): Promise<void> {
  depLogger.warn('Function is deprecated', {
    function: 'loadDependencies',
    replacement: 'ScriptResourceManager.cacheDependencies()',
    scriptId: script.id
  });
  
  if (!script.meta.require || script.meta.require.length === 0) {
    return;
  }

  const resourceManager = ScriptResourceManager.getInstance();
  await resourceManager.cacheDependencies(script.meta.require);
}
