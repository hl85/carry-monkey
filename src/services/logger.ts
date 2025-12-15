/**
 * CarryMonkey 统一日志管理器
 * 符合 MV3 规范的结构化日志实现
 */

import { Logger, type ILogObj } from 'tslog';
import { isFeatureEnabled } from '../config/feature-flags';

// 扩展日志对象接口
interface CarryMonkeyLogObj extends ILogObj {
  component?: string;
  scriptId?: string;
  action?: string;
  userId?: string;
  sessionId?: string;
  duration?: number;
  url?: string;
  version?: string;
  buildMode?: string;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

// 日志级别常量
export const LogLevel = {
  SILLY: 0,
  TRACE: 1,
  DEBUG: 2,
  INFO: 3,
  WARN: 4,
  ERROR: 5,
  FATAL: 6
} as const;

export type LogLevelType = typeof LogLevel[keyof typeof LogLevel];

// 日志传输器类型
export type LogTransport = (logObj: CarryMonkeyLogObj) => void;

/**
 * CarryMonkey 日志管理器
 * 提供统一的、合规的日志记录功能
 */
export class CarryMonkeyLogger {
  private static instance: CarryMonkeyLogger;
  private logger: Logger<CarryMonkeyLogObj>;
  private transports: LogTransport[] = [];
  private sessionId: string;

  private constructor() {
    this.sessionId = this.generateSessionId();
    
    // 根据构建模式配置日志器
    const isProduction = isFeatureEnabled('storeCompliant');
    const isDevelopment = !isProduction;

    this.logger = new Logger<CarryMonkeyLogObj>({
      name: 'CarryMonkey',
      type: isDevelopment ? 'pretty' : 'json',
      minLevel: isProduction ? LogLevel.INFO : LogLevel.DEBUG,
      
      // MV3 合规配置
      hideLogPositionForProduction: isProduction,
      
      // 生产环境优化
      prettyLogTimeZone: 'UTC',
      
      // 秘密信息遮蔽
      maskValuesOfKeys: [
        'password', 'token', 'apiKey', 'secret', 'auth',
        'authorization', 'cookie', 'session', 'key'
      ],
      maskValuesOfKeysCaseInsensitive: true,
      
      // 自定义模板（仅开发环境）
      prettyLogTemplate: isDevelopment 
        ? '{{yyyy}}-{{mm}}-{{dd}} {{hh}}:{{MM}}:{{ss}}.{{ms}} {{logLevelName}} 🐒[{{name}}:{{fileNameWithLine}}] '
        : undefined,
        
      // 性能优化设置
      stylePrettyLogs: isDevelopment,
      prettyLogStyles: {
        logLevelName: {
          '*': ['bold', 'black', 'bgWhiteBright', 'dim'],
          SILLY: ['bold', 'white'],
          TRACE: ['bold', 'whiteBright'],
          DEBUG: ['bold', 'green'],
          INFO: ['bold', 'blue'],
          WARN: ['bold', 'yellow'],
          ERROR: ['bold', 'red'],
          FATAL: ['bold', 'redBright', 'bgRed'],
        },
        dateIsoStr: 'white',
        filePathWithLine: 'white',
        name: ['white', 'bold'],
        nameWithDelimiterPrefix: ['white', 'bold'],
        nameWithDelimiterSuffix: ['white', 'bold'],
        errorName: ['bold', 'bgRedBright', 'whiteBright'],
        fileName: ['yellow'],
      }
      
    }, {
      // 默认日志对象
      component: 'unknown',
      sessionId: this.sessionId,
      timestamp: () => new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      buildMode: isProduction ? 'store' : 'compat'
    });

    // 添加默认传输器
    this.setupDefaultTransports();
    
    // 启动日志
    this.logger.info('🐒 CarryMonkey Logger initialized', {
      component: 'Logger',
      sessionId: this.sessionId,
      buildMode: isProduction ? 'store' : 'compat',
      logLevel: isProduction ? 'INFO' : 'DEBUG'
    });
  }

  /**
   * 生成会话ID
   */
  private generateSessionId(): string {
    return `cm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 获取日志管理器实例
   */
  static getInstance(): CarryMonkeyLogger {
    if (!CarryMonkeyLogger.instance) {
      CarryMonkeyLogger.instance = new CarryMonkeyLogger();
    }
    return CarryMonkeyLogger.instance;
  }

  /**
   * 设置默认传输器
   */
  private setupDefaultTransports(): void {
    // 开发环境：控制台输出增强
    if (!isFeatureEnabled('storeCompliant')) {
      this.addTransport((logObj) => {
        // 开发环境下的额外处理
        const meta = logObj._meta as Record<string, unknown>;
        if (typeof meta?.logLevelId === 'number' && (meta.logLevelId as number) >= LogLevel.ERROR) {
          // 错误日志特殊处理
          console.group(`🚨 ${meta.logLevelName} - ${logObj.component || 'Unknown'}`);
          console.error('Error Details:', logObj);
          if (logObj.error?.stack) {
            console.error('Stack Trace:', logObj.error.stack);
          }
          console.groupEnd();
        }
      });
    }

    // 生产环境：结构化存储
    if (isFeatureEnabled('storeCompliant')) {
      this.addTransport((logObj) => {
        // 存储到 Chrome Storage（异步，不阻塞）
        this.storeLogToStorage(logObj).catch((error) => {
          // 使用原生 console.error 避免循环依赖
          console.error('[Logger] Failed to store log:', error);
        });
      });
    }
  }

  /**
   * 存储日志到 Chrome Storage
   */
  private async storeLogToStorage(logObj: CarryMonkeyLogObj): Promise<void> {
    try {
      const logKey = `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await chrome.storage.local.set({
        [logKey]: {
          ...logObj,
          stored: new Date().toISOString()
        }
      });

      // 定期清理旧日志（保留最近 1000 条）
      this.cleanupOldLogs();
    } catch (error) {
      // 使用原生 console.error 避免循环依赖
      console.error('[Logger] Failed to store log:', error);
    }
  }

  /**
   * 清理旧日志
   */
  private async cleanupOldLogs(): Promise<void> {
    try {
      const storage = await chrome.storage.local.get();
      const logKeys = Object.keys(storage).filter(key => key.startsWith('log_'));
      
      if (logKeys.length > 1000) {
        // 删除最旧的日志
        const keysToRemove = logKeys
          .sort()
          .slice(0, logKeys.length - 1000);
        
        await chrome.storage.local.remove(keysToRemove);
      }
    } catch (error) {
      // 使用原生 console.error 避免循环依赖
      console.error('[Logger] Failed to cleanup logs:', error);
    }
  }

  /**
   * 添加自定义传输器
   */
  addTransport(transport: LogTransport): void {
    this.transports.push(transport);
    this.logger.attachTransport(transport);
  }

  /**
   * 创建组件专用的子日志器
   */
  createComponentLogger(component: string, additionalContext?: Partial<CarryMonkeyLogObj>): Logger<CarryMonkeyLogObj> {
    return this.logger.getSubLogger({
      name: `CarryMonkey:${component}`,
      prettyLogTemplate: !isFeatureEnabled('storeCompliant') 
        ? `{{yyyy}}-{{mm}}-{{dd}} {{hh}}:{{MM}}:{{ss}}.{{ms}} {{logLevelName}} 🐒[${component}] `
        : undefined,
    }, {
      component,
      sessionId: this.sessionId,
      ...additionalContext
    });
  }

  /**
   * 记录脚本执行日志
   */
  logScriptExecution(scriptId: string, action: string, details?: Record<string, unknown>): void {
    this.logger.info(`📜 Script ${action}`, {
      scriptId,
      action,
      details,
      component: 'ScriptEngine'
    });
  }

  /**
   * 记录 API 调用日志
   */
  logAPICall(api: string, payload?: unknown, result?: unknown, duration?: number): void {
    this.logger.debug(`📡 API call: ${api}`, {
      api,
      payload,
      result,
      duration,
      component: 'APIManager'
    });
  }

  /**
   * 记录错误日志
   */
  logError(error: Error, context?: Record<string, unknown>): void {
    this.logger.error(`🚨 Error occurred: ${error.message}`, {
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack
      },
      context,
      component: 'ErrorHandler'
    });
  }

  /**
   * 记录性能指标
   */
  logPerformance(metric: string, value: number, unit: string = 'ms'): void {
    this.logger.info(`⚡ Performance: ${metric}`, {
      metric,
      value,
      unit,
      component: 'Performance'
    });
  }

  /**
   * 记录用户行为
   */
  logUserAction(action: string, details?: Record<string, unknown>): void {
    // 仅在开发环境记录用户行为
    if (!isFeatureEnabled('storeCompliant')) {
      this.logger.debug(`👤 User action: ${action}`, {
        action,
        details,
        component: 'UserInterface'
      });
    }
  }

  /**
   * 记录注入策略选择
   */
  logInjectionStrategy(strategy: string, scriptId: string, reason?: string): void {
    this.logger.info(`🎯 Injection strategy: ${strategy}`, {
      strategy,
      scriptId,
      reason,
      component: 'InjectionEngine'
    });
  }

  /**
   * 记录存储操作
   */
  logStorageOperation(operation: string, key?: string, success?: boolean): void {
    this.logger.debug(`💾 Storage ${operation}`, {
      operation,
      key,
      success,
      component: 'Storage'
    });
  }

  /**
   * 获取日志统计信息
   */
  async getLogStats(): Promise<{ totalLogs: number; errorLogs: number; lastLogTime?: string }> {
    try {
      const storage = await chrome.storage.local.get();
      const logs = Object.values(storage).filter((item: unknown) => 
        item && typeof item === 'object' && (item as Record<string, unknown>)._meta
      );

      const errorLogs = logs.filter((log: unknown) => {
        const logObj = log as Record<string, unknown>;
        const meta = logObj._meta as Record<string, unknown>;
        return typeof meta?.logLevelId === 'number' && (meta.logLevelId as number) >= LogLevel.ERROR;
      }).length;

      const lastLog = logs
        .sort((a: unknown, b: unknown) => {
          const aObj = a as Record<string, unknown>;
          const bObj = b as Record<string, unknown>;
          return new Date((bObj.stored as string) || 0).getTime() - new Date((aObj.stored as string) || 0).getTime();
        })[0] as Record<string, unknown>;

      return {
        totalLogs: logs.length,
        errorLogs,
        lastLogTime: lastLog?.stored as string
      };
    } catch (error) {
      // 使用原生 console.error 避免循环依赖
      console.error('[Logger] Failed to get log stats:', error);
      return { totalLogs: 0, errorLogs: 0 };
    }
  }

  /**
   * 导出日志（用于调试）
   */
  async exportLogs(): Promise<CarryMonkeyLogObj[]> {
    try {
      const storage = await chrome.storage.local.get();
      return Object.values(storage)
        .filter((item: unknown) => item && typeof item === 'object' && (item as Record<string, unknown>)._meta)
        .sort((a: unknown, b: unknown) => {
          const aObj = a as Record<string, unknown>;
          const bObj = b as Record<string, unknown>;
          return new Date((bObj.stored as string) || 0).getTime() - new Date((aObj.stored as string) || 0).getTime();
        }) as CarryMonkeyLogObj[];
    } catch (error) {
      // 使用原生 console.error 避免循环依赖
      console.error('[Logger] Failed to export logs:', error);
      return [];
    }
  }

  // 便捷方法
  silly = (message: string, context?: Record<string, unknown>) => 
    this.logger.silly(`🔍 ${message}`, context);
  
  trace = (message: string, context?: Record<string, unknown>) => 
    this.logger.trace(`🔎 ${message}`, context);
  
  debug = (message: string, context?: Record<string, unknown>) => 
    this.logger.debug(`🐛 ${message}`, context);
  
  info = (message: string, context?: Record<string, unknown>) => 
    this.logger.info(`ℹ️ ${message}`, context);
  
  warn = (message: string, context?: Record<string, unknown>) => 
    this.logger.warn(`⚠️ ${message}`, context);
  
  error = (message: string, context?: Record<string, unknown>) => 
    this.logger.error(`❌ ${message}`, context);
  
  fatal = (message: string, context?: Record<string, unknown>) => 
    this.logger.fatal(`💀 ${message}`, context);
}

// 导出单例实例
export const logger = CarryMonkeyLogger.getInstance();

// 导出组件专用日志器创建函数
export const createComponentLogger = (component: string, context?: Partial<CarryMonkeyLogObj>) =>
  logger.createComponentLogger(component, context);