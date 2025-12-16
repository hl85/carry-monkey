/**
 * 用户提示服务
 * 提供一个简单的、基于存储的通知机制
 */
import { createComponentLogger } from './logger';

const notifierLogger = createComponentLogger('UserNotifier');

export interface UserTip {
  message: string;
  timestamp: number;
}

export const USER_TIP_KEY = 'user_tip';
export const TIP_EXPIRATION_MS = 20000; // 20秒

export class UserNotifier {
  /**
   * 显示一个用户提示。
   * 提示信息将被写入 chrome.storage.local，由 UI 组件监听并显示。
   * @param message - 要显示的提示信息 (建议10个汉字以内)
   */
  static async showTip(message: string): Promise<void> {
    const tip: UserTip = {
      message,
      timestamp: Date.now(),
    };

    try {
      await chrome.storage.local.set({ [USER_TIP_KEY]: tip });
      notifierLogger.info('User tip has been set in storage', { message });
    } catch (error) {
      notifierLogger.error('Failed to set user tip in storage', {
        error: (error as Error).message,
      });
    }
  }
}
