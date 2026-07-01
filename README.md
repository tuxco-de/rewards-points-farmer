# Rewards Points Farmer

[![GitHub Release](https://img.shields.io/github/v/release/tuxco-de/rewards-points-farmer?style=flat-square)](https://github.com/tuxco-de/rewards-points-farmer/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](https://opensource.org/licenses/MIT)

**Rewards Points Farmer** 是一款稳定、智能、安全的 Microsoft Rewards 全自动搜索挂机脚本。它可以帮助你一键全自动完成 PC 端与移动端的搜索任务，自动识别进度并领取积分。

---

## 🌐 项目主页与详细使用说明
查看完整的使用说明、安装指南和酷炫的功能展示，请访问我们的项目主页：

👉 **[Rewards Points Farmer 官方使用指南](https://tuxco-de.github.io/rewards-points-farmer/)**

*(注：如果上述链接为404，请确保您已经在仓库 Settings 中启用了 GitHub Pages 并指向了 `master` 分支的 `/docs` 目录)*

## ✨ 核心特性

- **一键自动化**：开启后全自动完成各类卡片任务及主页/侧边栏的日常搜索任务。
- **真实人工模拟**：采用最底层的真实键盘按键事件（Event Simulation）、包含随机延迟的打字机输入模型，极大降低了被微软系统识别为脚本的概率。
- **页面状态防卡死**：采用严格的容错机制、网络断连检测与静默恢复，防止在刷分过程中因页面重载或卡顿导致的死循环。
- **内嵌 UI 与多语言**：脚本直接在必应主页右下方注入现代化的控制面板，同时适配中文与英文界面下的积分文字识别。

## 📦 安装说明

1. 在您的浏览器安装 [Tampermonkey](https://www.tampermonkey.net/) 插件。
2. 点击下方链接一键安装该脚本：
   - **[⬇️ 安装最新版 Rewards Points Farmer](https://github.com/tuxco-de/rewards-points-farmer/releases/latest/download/rewards-points-farmer.user.js)**

## ⚠️ 风险告知与免责声明

**请务必注意**：使用任何脚本、机器人或自动化手段获取 Microsoft Rewards 积分均**违反微软服务条款 (Microsoft Services Agreement)**。

尽管本脚本通过大量的混淆和拟人化逻辑尽可能降低了检测风险，但仍有可能导致您的 **Microsoft Rewards 账户被封禁 (Ban) 或积分清零**。本脚本及源代码仅供前端安全技术学习与交流参考，按“原样”提供，且不提供任何形式的保证。

**作者不对因使用本脚本而导致的任何账户问题或连带损失承担任何责任。** 下载并使用即代表您自愿承担一切风险。

## 🛠 开发与构建

本项目使用 TypeScript 编写并利用 Webpack 构建和 Jest 单元测试。
如果您希望二次开发：

```bash
# 1. 安装依赖
npm install

# 2. 执行单元测试
npm run test

# 3. 编译构建脚本（产物在 dist/ 目录下）
npm run build
```

## 📄 许可证

本项目采用 [MIT License](LICENSE) 开源。
