/**
 * 构建模式配置
 * 定义不同构建模式的功能特性和权限
 */

export interface BuildMode {
  name: string;
  description: string;
  features: {
    userScriptsAPI: boolean;
    legacyInjection: boolean;
    dynamicCodeExecution: boolean;
    strictCSP: boolean;
    evalFallback: boolean;
  };
  permissions: string[];
  storeCompliant: boolean;
  minimumChromeVersion?: string;
}

/**
 * 构建模式定义
 */
export const BUILD_MODES: Record<string, BuildMode> = {
  store: {
    name: 'Store Compliant',
    description: '完全符合 Chrome Web Store 规范的版本',
    features: {
      userScriptsAPI: true,
      legacyInjection: false,
      dynamicCodeExecution: false,
      strictCSP: true,
      evalFallback: false
    },
    permissions: [
      'activeTab',
      'storage', 
      'scripting',
      'tabs',
      'userScripts'
    ],
    storeCompliant: true,
    minimumChromeVersion: '120'
  },
  
  compat: {
    name: 'Maximum Compatibility',
    description: '最大兼容性版本，包含所有功能特性',
    features: {
      userScriptsAPI: true,
      legacyInjection: true,
      dynamicCodeExecution: true,
      strictCSP: true,
      evalFallback: true
    },
    permissions: [
      'activeTab',
      'storage',
      'scripting', 
      'tabs',
      'userScripts'
    ],
    storeCompliant: false
  }
};

/**
 * 获取当前构建模式
 */
export function getCurrentBuildMode(): BuildMode {
  const mode = process.env.BUILD_MODE || 'store';
  const buildMode = BUILD_MODES[mode];
  
  if (!buildMode) {
    throw new Error(`Unknown build mode: ${mode}`);
  }
  
  return buildMode;
}

/**
 * 检查功能是否启用
 */
export function isFeatureEnabled(feature: keyof BuildMode['features']): boolean {
  const mode = getCurrentBuildMode();
  return mode.features[feature];
}

/**
 * 获取运行时功能标志
 */
export function getFeatureFlags() {
  const mode = getCurrentBuildMode();
  return {
    buildMode: mode.name,
    storeCompliant: mode.storeCompliant,
    ...mode.features
  };
}