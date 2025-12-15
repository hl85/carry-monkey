/**
 * 用户指导事件总线
 * 解决循环依赖问题，提供解耦的事件通信机制
 */

import { createComponentLogger } from './logger';

// 创建事件总线专用日志器
const eventLogger = createComponentLogger('GuidanceEvents');

export interface GuidanceEvent {
  type: 'userscripts_permission_denied' | 'userscripts_unavailable' | 'browser_compatibility';
  data?: any;
  timestamp: number;
}

export class GuidanceEventBus {
  private static listeners: Map<string, Array<(event: GuidanceEvent) => void>> = new Map();

  /**
   * 注册事件监听器
   */
  static on(eventType: string, listener: (event: GuidanceEvent) => void): void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, []);
    }
    this.listeners.get(eventType)!.push(listener);
    
    eventLogger.debug('Event listener registered', {
      eventType,
      totalListeners: this.listeners.get(eventType)!.length
    });
  }

  /**
   * 移除事件监听器
   */
  static off(eventType: string, listener: (event: GuidanceEvent) => void): void {
    const listeners = this.listeners.get(eventType);
    if (listeners) {
      const index = listeners.indexOf(listener);
      if (index > -1) {
        listeners.splice(index, 1);
        eventLogger.debug('Event listener removed', {
          eventType,
          remainingListeners: listeners.length
        });
      }
    }
  }

  /**
   * 触发事件
   */
  static emit(eventType: string, data?: any): void {
    const event: GuidanceEvent = {
      type: eventType as any,
      data,
      timestamp: Date.now()
    };

    const listeners = this.listeners.get(eventType);
    if (listeners && listeners.length > 0) {
      eventLogger.debug('Emitting guidance event', {
        eventType,
        listenerCount: listeners.length,
        hasData: !!data
      });

      listeners.forEach(listener => {
        try {
          listener(event);
        } catch (error) {
          eventLogger.error('Event listener error', {
            eventType,
            error: (error as Error).message
          });
        }
      });
    } else {
      eventLogger.debug('No listeners for event', {
        eventType
      });
    }
  }

  /**
   * 获取所有注册的事件类型
   */
  static getRegisteredEvents(): string[] {
    return Array.from(this.listeners.keys());
  }

  /**
   * 清除所有监听器
   */
  static clear(): void {
    this.listeners.clear();
    eventLogger.debug('All event listeners cleared');
  }
}