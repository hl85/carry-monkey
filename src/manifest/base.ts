/**
 * 基础 Manifest 配置
 * 包含所有构建模式共享的配置
 */
import packageJson from "../../package.json";
export const baseManifest = {
  manifest_version: 3,
  version: packageJson.version, // 从 package.json 读取

  icons: {
    "16": "assets/icon.png",
    "48": "assets/icon.png",
    "128": "assets/icon.png",
  },

  action: {
    default_popup: "src/ui/popup/index.html",
    default_title: "CarryMonkey",
  },

  options_page: "src/ui/dashboard/index.html",

  background: {
    service_worker: "src/core/background.ts",
    type: "module",
  },

  content_scripts: [
    {
      matches: ["<all_urls>"],
      js: ["src/content-scripts/api-bridge.ts"],
      run_at: "document_start",
      all_frames: true,
    },
  ],

  web_accessible_resources: [
    {
      resources: ["src/content-scripts/*"],
      matches: ["<all_urls>"],
    },
  ],

  host_permissions: ["<all_urls>"],

  permissions: [
    "activeTab",
    "storage",
    "unlimitedStorage",
    "scripting",
    "tabs",
    "userScripts",
    "notifications", // 添加通知权限
  ],
};
