/**
 * 用户提示 UI 组件
 * 在 popup 和 dashboard 中显示来自 storage 的、会自动消失的提示
 */
import { USER_TIP_KEY, TIP_EXPIRATION_MS, type UserTip } from '../../services/user-notifier';

export class UserTipUI {
  private static tipContainer: HTMLElement | null = null;
  private static currentTipId: string | null = null;

  /**
   * 初始化用户提示 UI
   */
  static init(): void {
    // 确保在 document available 时才创建 DOM
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.setup());
    } else {
      this.setup();
    }
  }

  private static setup(): void {
    this.createTipContainer();
    this.listenForTips();
    this.checkForInitialTip();
  }

  /**
   * 创建提示消息容器
   */
  private static createTipContainer(): void {
    if (document.getElementById('carrymonkey-tip-container')) {
      this.tipContainer = document.getElementById('carrymonkey-tip-container');
      return;
    };

    const container = document.createElement('div');
    container.id = 'carrymonkey-tip-container';
    container.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: 10001;
      display: flex;
      flex-direction: column;
    `;
    document.body.appendChild(container);
    this.tipContainer = container;
  }

  /**
   * 监听来自 storage 的提示消息
   */
  private static listenForTips(): void {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'local' && changes[USER_TIP_KEY]) {
        const newTip = changes[USER_TIP_KEY].newValue as UserTip | undefined;
        if (newTip) {
          this.showTip(newTip);
        }
      }
    });
  }

  /**
   * 检查初始提示
   */
  private static async checkForInitialTip(): Promise<void> {
    try {
      const result = await chrome.storage.local.get(USER_TIP_KEY);
      const initialTip = result[USER_TIP_KEY] as UserTip | undefined;
      if (initialTip) {
        this.showTip(initialTip);
      }
    } catch {
      // 忽略在某些上下文中可能发生的 storage 访问错误
    }
  }

  /**
   * 显示用户提示
   */
  private static showTip(tip: UserTip): void {
    if (!this.tipContainer) this.createTipContainer();

    const tipId = `tip-${tip.timestamp}`;
    if (this.currentTipId === tipId) return;
    this.currentTipId = tipId;

    // 清理可能存在的旧提示
    if (this.tipContainer!.firstChild) {
      this.tipContainer!.innerHTML = '';
    }

    const tipElement = document.createElement('div');
    tipElement.className = 'carrymonkey-tip';
    tipElement.textContent = tip.message;
    tipElement.style.cssText = `
      background-color: rgba(232, 226, 196, 0.2);
      color:rgb(96, 104, 179);
      padding: 3px 2px;
      border-radius: 8px;
      font-size: 10px;
      line-height: 1;
      text-align: center;
      width: 90%;
      box-sizing: border-box;
      opacity: 0.5;
      transform: translateY(-100%);
      transition: all 0.3s ease;
      backdrop-filter: blur(4px);
    `;

    this.tipContainer!.appendChild(tipElement);

    setTimeout(() => {
      tipElement.style.opacity = '1';
      tipElement.style.transform = 'translateY(0)';
    }, 50);

    const timeSinceCreation = Date.now() - tip.timestamp;
    const remainingTime = TIP_EXPIRATION_MS - timeSinceCreation;

    if (remainingTime > 0) {
      setTimeout(() => {
        if (this.currentTipId === tipId) {
          this.hideTip(tipElement);
        }
      }, remainingTime);
    } else {
      this.hideTip(tipElement, true);
    }
  }

  /**
   * 隐藏并移除提示
   */
  private static hideTip(element: HTMLElement, immediate = false): void {
    const cleanup = () => {
      if (element.parentNode) {
        element.remove();
      }
      chrome.storage.local.remove(USER_TIP_KEY);
      this.currentTipId = null;
    };

    if (immediate) {
      cleanup();
    } else {
      element.style.opacity = '0';
      element.style.transform = 'translateY(-100%)';
      setTimeout(cleanup, 300);
    }
  }
}

// 自动初始化
UserTipUI.init();
