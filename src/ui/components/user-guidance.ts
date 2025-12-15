/**
 * 用户指导 UI 组件
 * 在 popup 和 dashboard 中显示用户指导消息
 */

import type { GuidanceMessage, GuidanceAction } from '../../services/user-guidance';

export class UserGuidanceUI {
  private static guidanceContainer: HTMLElement | null = null;

  /**
   * 初始化用户指导 UI
   */
  static init(): void {
    this.createGuidanceContainer();
    this.listenForGuidanceMessages();
  }

  /**
   * 创建指导消息容器
   */
  private static createGuidanceContainer(): void {
    // 检查是否已存在
    if (document.getElementById('carrymonkey-guidance')) {
      return;
    }

    const container = document.createElement('div');
    container.id = 'carrymonkey-guidance';
    container.className = 'carrymonkey-guidance-container';
    container.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      max-width: 400px;
      z-index: 10000;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    document.body.appendChild(container);
    this.guidanceContainer = container;
  }

  /**
   * 监听来自 background 的指导消息
   */
  private static listenForGuidanceMessages(): void {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message.action === 'show_user_guidance') {
        this.showGuidance(message.payload);
        sendResponse({ success: true });
      }
      return true;
    });
  }

  /**
   * 显示用户指导
   */
  static showGuidance(guidance: GuidanceMessage): void {
    if (!this.guidanceContainer) {
      this.createGuidanceContainer();
    }

    

    const guidanceElement = this.createGuidanceElement(guidance);
    this.guidanceContainer!.appendChild(guidanceElement);

    // 自动显示动画
    setTimeout(() => {
      guidanceElement.style.transform = 'translateX(0)';
      guidanceElement.style.opacity = '1';
    }, 100);

    // 如果是信息类型，5秒后自动隐藏
    if (guidance.severity === 'info') {
      setTimeout(() => {
        this.hideGuidance(guidanceElement);
      }, 5000);
    }
  }

  /**
   * 创建指导元素
   */
  private static createGuidanceElement(guidance: GuidanceMessage): HTMLElement {
    const element = document.createElement('div');
    element.className = `carrymonkey-guidance carrymonkey-guidance-${guidance.severity}`;
    
    // 根据严重程度设置样式
    const severityColors = {
      info: { bg: '#e3f2fd', border: '#2196f3', text: '#1565c0' },
      warning: { bg: '#fff3e0', border: '#ff9800', text: '#ef6c00' },
      error: { bg: '#ffebee', border: '#f44336', text: '#c62828' }
    };
    
    const colors = severityColors[guidance.severity];
    
    element.style.cssText = `
      background: ${colors.bg};
      border: 1px solid ${colors.border};
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 12px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      transform: translateX(100%);
      opacity: 0;
      transition: all 0.3s ease;
      position: relative;
    `;

    // 创建内容
    element.innerHTML = `
      <div style="display: flex; align-items: flex-start; gap: 12px;">
        <div style="flex: 1;">
          <div style="font-weight: 600; color: ${colors.text}; margin-bottom: 8px; font-size: 14px;">
            ${this.getIcon(guidance.type)} ${guidance.title}
          </div>
          <div style="color: ${colors.text}; font-size: 13px; line-height: 1.4; margin-bottom: 12px;">
            ${guidance.message}
          </div>
          ${this.createActionsHTML(guidance.actions || [])}
        </div>
        <button class="carrymonkey-guidance-close" style="
          background: none;
          border: none;
          color: ${colors.text};
          cursor: pointer;
          font-size: 18px;
          padding: 0;
          width: 20px;
          height: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
        ">×</button>
      </div>
    `;

    // 绑定事件
    this.bindGuidanceEvents(element, guidance);

    return element;
  }

  /**
   * 创建操作按钮 HTML
   */
  private static createActionsHTML(actions: GuidanceAction[]): string {
    if (actions.length === 0) return '';

    return `
      <div style="display: flex; gap: 8px; flex-wrap: wrap;">
        ${actions.map(action => {
          const isPrimary = action.primary;
          const baseStyle = `
            padding: 6px 12px;
            border-radius: 4px;
            font-size: 12px;
            text-decoration: none;
            cursor: pointer;
            border: 1px solid;
            display: inline-block;
            transition: all 0.2s ease;
          `;
          
          const primaryStyle = `
            background: #2196f3;
            color: white;
            border-color: #2196f3;
          `;
          
          const secondaryStyle = `
            background: transparent;
            color: #2196f3;
            border-color: #2196f3;
          `;
          
          const style = isPrimary ? primaryStyle : secondaryStyle;
          
          return `
            <${action.type === 'link' ? 'a href="' + action.action + '" target="_blank"' : 'button'} 
              class="carrymonkey-guidance-action" 
              data-action="${action.action}"
              style="${baseStyle} ${style}">
              ${action.label}
            </${action.type === 'link' ? 'a' : 'button'}>
          `;
        }).join('')}
      </div>
    `;
  }

  /**
   * 绑定指导事件
   */
  private static bindGuidanceEvents(element: HTMLElement, _guidance: GuidanceMessage): void {
    // 关闭按钮
    const closeBtn = element.querySelector('.carrymonkey-guidance-close');
    closeBtn?.addEventListener('click', () => {
      this.hideGuidance(element);
    });

    // 操作按钮
    const actionBtns = element.querySelectorAll('.carrymonkey-guidance-action');
    actionBtns.forEach(btn => {
      if (btn.tagName === 'BUTTON') {
        btn.addEventListener('click', async () => {
          const action = btn.getAttribute('data-action');
          if (action) {
            await this.handleAction(action);
            this.hideGuidance(element);
          }
        });
      }
    });
  }

  /**
   * 处理用户操作
   */
  private static async handleAction(action: string): Promise<void> {
    try {
      await chrome.runtime.sendMessage({
        action: 'handle_guidance_action',
        payload: { action }
      });
    } catch (error) {
      console.error('Failed to handle guidance action:', error);
    }
  }

  /**
   * 隐藏指导
   */
  private static hideGuidance(element: HTMLElement): void {
    element.style.transform = 'translateX(100%)';
    element.style.opacity = '0';
    
    setTimeout(() => {
      element.remove();
    }, 300);
  }

  /**
   * 获取类型图标
   */
  private static getIcon(type: string): string {
    const icons = {
      permission: '🔐',
      configuration: '⚙️',
      browser: '🌐',
      feature: '✨'
    };
    return icons[type as keyof typeof icons] || '💡';
  }
}

// 自动初始化
if (typeof window !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    UserGuidanceUI.init();
  });
}