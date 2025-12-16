# CarryMonkey

现代化的用户脚本管理器 Chrome 扩展，支持完全的 Manifest V3 合规性，同时保持向后兼容性。

## ✨ 核心特性

### 双模式架构
- **商店版** (`pnpm builds`): 完全符合 Chrome Web Store 规范
- **兼容版** (`pnpm buildc`): 包含最大兼容性功能

### MV3 合规适配
- ✅ 无 `eval()` 使用（商店模式）
- ✅ 无 `Function` 构造器（商店模式）
- ✅ 支持 CSP nonce 和 Trusted Types
- ✅ 完全静态的代码执行
- ✅ UserScripts API 原生支持

### 注入系统
- **自动脚本验证**: 检测并阻止非合规代码
- **多策略降级**: 合规 → 兼容 → 传统注入
- **资源预加载**: 脚本依赖和资源缓存优化
- **统一 API 管理**: 集中处理所有 GM_* API 调用

### 用户体验
- **快捷键支持**: 支持新建、保存等常用操作 (兼容 Mac/Win)
- **轻量级提示**: 自动消失的、无干扰的用户提示系统


### 技术栈
- **TypeScript**: 完整的类型安全
- **React 18**: 成熟的用户界面框架
- **Vite**: 现代化构建工具
- **Ant Design**: 专业的 UI 组件库
- **ESLint + Prettier**: 代码质量保证

## 📦 快速开始

### 环境要求
- [Node.js](https://nodejs.org/) v18+
- [pnpm](https://pnpm.io/) (推荐包管理器)

### 安装步骤

1. **克隆仓库**
   ```bash
   git clone https://github.com/hl85/carrymonkey.git
   cd carrymonkey
   ```

2. **安装依赖**
   ```bash
   pnpm install
   ```

3. **构建扩展**
   ```bash
   # 商店版（推荐）
   pnpm builds
   
   # 兼容版
   pnpm buildc
   
   # 同时构建两个版本
   pnpm build:both
   ```

### 加载到浏览器

1. 打开 Chrome，访问 `chrome://extensions`
2. 启用右上角的 **开发者模式**
3. 点击 **加载已解压的扩展程序**
4. 选择 `dist/`（商店版）或 `dist-compat/`（兼容版）文件夹

## 🛠️ 开发指南

### 开发模式
```bash
# 商店版开发
pnpm dev

# 兼容版开发  
pnpm dev:compat
```

### 构建命令
```bash
# 商店版构建
pnpm builds

# 兼容版构建
pnpm buildc

# 代码检查
pnpm check

# 代码格式化
pnpm format
```

## � 版本对比

| 特性 | 商店版 | 兼容版 |
|------|--------|--------|
| **合规性** | ✅ Chrome Web Store 合规 | ❌ 不适合商店提交 |
| **API 支持** | ✅ UserScripts API 原生 | ✅ 完整 GM API 支持 |
| **代码执行** | ❌ 无动态代码执行 | ✅ 支持 eval/Function |
| **CSP 兼容** | ⚠️ 有限支持 | ✅ 完整绕过能力 |
| **浏览器兼容** | Chrome 120+ | Chrome 88+ |
| **安全性** | 🛡️ 最高 | ⚠️ 中等 |
| **推荐用途** | 商店发布、企业环境 | 开发测试、高级用户 |

## 🏗️ 项目架构

### 核心目录结构
```
src/
├── core/                      # 核心功能模块
│   ├── background.ts         # Service Worker 后台脚本
│   ├── storage.ts            # 数据存储管理
│   ├── types.ts              # TypeScript 类型定义
│   └── globals.d.ts          # 全局类型声明
│
├── ui/                       # 用户界面模块
│   ├── popup/                # 扩展弹出窗口
│   ├── dashboard/            # 管理面板
│   └── components/           # 可复用 UI 组件
│       └── user-tip.ts       # 用户提示组件
│
├── services/                 # 业务逻辑服务
│   ├── injection/            # 脚本注入策略
│   │   ├── engine.ts        # 统一注入引擎
│   │   ├── compliant.ts     # 合规注入策略
│   │   ├── legacy.ts        # 兼容注入策略
│   │   └── utils.ts         # 注入工具函数
│   ├── gm-api-manager.ts     # GM API 管理器
│   ├── script-resource-manager.ts # 脚本资源管理
│   ├── userscripts-api.ts    # UserScripts API 包装
│   └── user-notifier.ts      # 轻量级用户通知服务
│
├── config/                   # 配置文件
│   ├── feature-flags.ts      # 功能开关配置
│   └── build-modes.ts        # 构建模式配置
│
├── manifest/                 # 扩展清单配置
│   ├── base.ts              # 基础配置
│   ├── store.ts             # 商店版配置
│   ├── compat.ts            # 兼容版配置
│   └── index.ts             # 动态配置选择
│
└── utils/                    # 工具函数
    └── matcher.ts            # URL 匹配工具
```

### 架构设计原则

1. **分层架构**: Core → Services → UI → Config
2. **模块化设计**: 每个模块职责明确，低耦合高内聚
3. **配置驱动**: 通过功能标志控制不同构建模式的行为
4. **类型安全**: 完整的 TypeScript 类型定义

## 🎯 使用场景

### 🏪 商店版适用场景
- Chrome Web Store 发布
- 企业环境部署
- 安全要求较高的场景
- 需要长期维护的项目

### 🔧 兼容版适用场景
- 开发和测试环境
- 需要最大兼容性的场景
- 高级用户自定义需求
- 传统用户脚本迁移

## 📚 相关文档

- [源代码架构说明](./src/README.md) - 详细的代码结构文档
- [注入策略详解](./docs/injection-strategy.md) - 脚本注入机制说明
- [构建模式配置](./docs/build-modes.md) - 构建配置详解
- [开发指南](./docs/development.md) - 开发环境搭建

## 🤝 贡献指南

欢迎贡献代码！请遵循以下步骤：

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 创建 Pull Request

## 📄 开源协议

本项目基于 [MIT License](./LICENSE) 开源协议。

---

**CarryMonkey** - 让用户脚本管理更加现代化、安全和高效 🐒✨
