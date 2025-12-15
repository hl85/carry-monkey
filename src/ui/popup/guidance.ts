/**
 * Popup 用户指导组件
 * 在扩展 popup 中显示待处理的用户指导消息
 */

import type { GuidanceMessage } from '../../services/user-guidance';

interface StoredGuidance extends GuidanceMessage {
  id: string;
  timestamp: number;
}

export class PopupGuidanceManager {
  private static container: HTMLElement | null = null;

  /**
   * 初始化 popup 指导管理器
   */
  static async init(): Promise<void> {
    this.createContainer();
    await this.loadAndDisplayGuidance();
    this.setupStorageListener();
  }

  /**
   * 创建指导容器
   */
  private static createContainer(): void {
    const existingContainer = document.getElementById('guidance-container');
    if (existingContainer) {
      this.container = existingContainer;
      return;
    }

    const container = document.createElement('div');
    container.id = 'guidance-container';
    container.className = 'guidance-container';
    container.style.cssText = `
      margin-bottom: 16px;
      max-height: 300px;
      overflow-y: auto;
    `;

    // 插入到 popup 顶部
    const popupBody = document.body;
    popupBody.insertBefore(container, popupBody.firstChild);
    
    this.container = container;
  }

  /**
   * 加载并显示待处理的指导
   */
  private static async loadAndDisplayGuidance(): Promise<void> {
    try {
      const stored = await chrome.storage.local.get('pendingGuidance');
      const pendingGuidance = Array.isArray(stored.pendingGuidance) ? stored.pendingGuidance as StoredGuidance[] : [];

      if (pendingGuidance.length === 0) {
        return;
      }

      // 显示最新的指导消息
      const latestGuidance = pendingGuidance[pendingGuidance.length - 1];
      this.displayGuidance(latestGuidance);

    } catch (error) {
      console.error('Failed to load guidance:', error);
    }
  }

  /**
   * 显示指导消息
   */
  private static displayGuidance(guidance: StoredGuidance): void {
    if (!this.container) return;

    const guidanceElement = this.createGuidanceElement(guidance);
    this.container.appendChild(guidanceElement);
  }

  /**
   * 创建指导元素
   */
  private static createGuidanceElement(guidance: StoredGuidance): HTMLElement {
    const element = document.createElement('div');
    element.className = `guidance-item guidance-${guidance.severity}`;
    
    // 根据严重程度设置样式
    const severityStyles = {
      info: { bg: '#e3f2fd', border: '#2196f3', text: '#1565c0' },
      warning: { bg: '#fff3e0', border: '#ff9800', text: '#ef6c00' },
      error: { bg: '#ffebee', border: '#f44336', text: '#c62828' }
    };
    
    const colors = severityStyles[guidance.severity];
    
    element.style.cssText = `
      background: ${colors.bg};
      border: 1px solid ${colors.border};
      border-radius: 6px;
      padding: 12px;
      margin-bottom: 8px;
      font-size: 13px;
      line-height: 1.4;
    `;

    element.innerHTML = `
      <div style="display: flex; align-items: flex-start; gap: 8px;">
        <div style="flex: 1;">
          <div style="font-weight: 600; color: ${colors.text}; margin-bottom: 6px;">
            ${this.getIcon(guidance.type)} ${guidance.title}
          </div>
          <div style="color: ${colors.text}; margin-bottom: 8px;">
            ${guidance.message}
          </div>
          ${this.createActionsHTML(guidance.actions || [], colors.text)}
        </div>
        <button class="guidance-close" data-id="${guidance.id}" style="
          background: none;
          border: none;
          color: ${colors.text};
          cursor: pointer;
          font-size: 16px;
          padding: 0;
          width: 18px;
          height: 18px;
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 0.7;
        ">×</button>
      </div>
    `;

    // 绑定事件
    this.bindEvents(element, guidance);

    return element;
  }

  /**
   * 创建操作按钮 HTML
   */
  private static createActionsHTML(actions: Array<{label: string; action: string; type: string; primary?: boolean}>, textColor: string): string {
    if (actions.length === 0) return '';

    return `
      <div style="display: flex; gap: 6px; flex-wrap: wrap;">
        ${actions.map(action => {
          const isPrimary = action.primary;
          const baseStyle = `
            padding: 4px 8px;
            border-radius: 3px;
            font-size: 11px;
            text-decoration: none;
            cursor: pointer;
            border: 1px solid;
            display: inline-block;
            transition: all 0.2s ease;
          `;
          
          const primaryStyle = `
            background: ${textColor};
            color: white;
            border-color: ${textColor};
          `;
          
          const secondaryStyle = `
            background: transparent;
            color: ${textColor};
            border-color: ${textColor};
          `;
          
          const style = isPrimary ? primaryStyle : secondaryStyle;
          
          return `
            <${action.type === 'link' ? 'a href="' + action.action + '" target="_blank"' : 'button'} 
              class="guidance-action" 
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
   * 绑定事件
   */
  private static bindEvents(element: HTMLElement, guidance: StoredGuidance): void {
    // 关闭按钮
    const closeBtn = element.querySelector('.guidance-close');
    closeBtn?.addEventListener('click', () => {
      this.dismissGuidance(guidance.id);
      element.remove();
    });

    // 操作按钮
    const actionBtns = element.querySelectorAll('.guidance-action');
    actionBtns.forEach(btn => {
      if (btn.tagName === 'BUTTON') {
        btn.addEventListener('click', async () => {
          const action = btn.getAttribute('data-action');
          if (action) {
            await this.handleAction(action);
            this.dismissGuidance(guidance.id);
            element.remove();
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
   * 移除指导消息
   */
  private static async dismissGuidance(guidanceId: string): Promise<void> {
    try {
      const stored = await chrome.storage.local.get('pendingGuidance');
      const pendingGuidance = Array.isArray(stored.pendingGuidance) ? stored.pendingGuidance as StoredGuidance[] : [];
      
      const filtered = pendingGuidance.filter(g => g.id !== guidanceId);
      await chrome.storage.local.set({ pendingGuidance: filtered });

    } catch (error) {
      console.error('Failed to dismiss guidance:', error);
    }
  }

  /**
   * 监听存储变化
   */
  private static setupStorageListener(): void {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'local' && changes.pendingGuidance) {
        // 重新加载指导
        this.container!.innerHTML = '';
        this.loadAndDisplayGuidance();
      }
    });
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
    PopupGuidanceManager.init();
  });
}