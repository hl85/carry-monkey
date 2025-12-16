/**
 * 兼容版 Manifest 配置
 * 包含所有功能特性，不用于 Chrome Web Store 提交
 */

import { baseManifest } from "./base";
import type { ManifestV3Export } from "@crxjs/vite-plugin";

export const compatManifest: ManifestV3Export = {
  ...baseManifest,

  name: "搬运猴（CarryMonkey Enhanced)",
  description: "增强版用户脚本管理器，包含最大兼容性功能",

  permissions: ["activeTab", "storage", "scripting", "tabs", "userScripts"],

  minimum_chrome_version: "88",

  // 兼容版特定配置
  content_security_policy: {
    extension_pages: "script-src 'self' 'unsafe-eval'; object-src 'self';",
  },
};
