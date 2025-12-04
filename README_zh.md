# GeekEZ Browser

<div align="center">

<img src="icon.png" width="100" height="100" alt="GeekEZ Logo">

[![License: CC BY-NC-SA 4.0](https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc-sa/4.0/)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)
![Version](https://img.shields.io/badge/version-1.2.3-green)

**专为电商运营和多账号管理打造的指纹隐匿浏览器**

[🇺🇸 English](README.md) | [📥 下载安装包](https://github.com/EchoHS/GeekezBrowser/releases)

</div>

---

## 📖 简介

**GeekEZ Browser** 是一款基于 **Electron** 和 **Puppeteer** 构建的指纹浏览器，底层深度集成 **Xray-core**。

它致力于解决跨境电商（TikTok, Amazon, Facebook, Shopee 等）的多账号防关联问题。与市面上的普通工具不同，GeekEZ 采用了 **“原生一致性”** 策略，摒弃了容易被检测的 JS 注入 Hook，从而完美通过 Cloudflare 和 BrowserScan 的高强度检测。

## ✨ 核心特性 (v1.2.3)

### 🛡️ 深度指纹隔离
*   **硬件随机化**: 随机生成 **CPU 核心数** (4/8/12/16) 和 **设备内存** (4/8/16 GB)，显著增加指纹唯一性，每个环境都独一无二。
*   **原生注入策略**: 使用 **Chromium 原生参数** 结合 **Puppeteer** 进行噪音注入，彻底消除 JS 篡改痕迹，完美通过 **Cloudflare Turnstile** 和 **BrowserScan**。
*   **多媒体噪音**: 对 **Canvas**、**WebGL** 和 **AudioContext** 施加非侵入式噪音，生成唯一的硬件哈希。
*   **TLS 指纹安全**: 使用 **真实 Chrome** 浏览器内核，确保 TLS 指纹 (JA3) 与标准 Chrome 完全一致，无法被检测为异常，与商业工具技术同源。
*   **时区智能伪装**: 自动将浏览器时区与代理 IP 所在地完美同步。
*   **WebRTC 物理阻断**: 强制使用 `disable_non_proxied_udp` 策略，物理切断本地 IP 泄露路径。

### ⚡ 性能大幅优化
*   **极速启动**: 优化 Xray 集成逻辑，启动速度提升 **40%**。
*   **内存优化**: 智能缓存管理和内存限制，RAM 占用减少 **30%**。
*   **自动清理**: 浏览器关闭时自动清理缓存和临时文件，长期使用不占磁盘。

### 🔗 全能网络引擎 (Xray-core)
*   **全协议支持**: 完美支持 VMess, VLESS, Trojan, Shadowsocks (含 **SS-2022**), Socks5, HTTP。
*   **高级传输层**: 支持 **REALITY**, **XHTTP**, **gRPC**, **mKCP**, WebSocket, H2 等复杂传输配置。
*   **前置代理 (链式代理)**: 支持 `[本机] -> [前置代理] -> [环境代理] -> [目标网站]` 架构。
*   **双栈支持**: 智能路由策略，完美支持 IPv4/IPv6 双栈节点。

### 🧩 工作流与管理
*   **插件支持**: 支持导入解压后的 Chrome 扩展（如 MetaMask, AdBlock），并自动应用到所有环境。
*   **标签系统**: 为环境添加彩色标签（如 "TikTok", "美国", "主号"），便于分组管理。
*   **安全备注**: 创新性地使用 **书签栏** 显示环境名称（如 `🔍 Profile-1`），替代了易被风控检测的标题栏注入。
*   **稳定多开**: 修复了端口冲突问题，支持同时运行多个环境互不干扰。

## 🚀 快速开始

### 方法 1: 下载安装包 (推荐)
前往 [**Releases**](https://github.com/EchoHS/GeekezBrowser/releases) 页面下载适配您系统的安装包：
*   **Windows**: `GeekEZ Browser Setup 1.2.3.exe`

### 方法 2: 源码运行

**前置要求**: 安装 Node.js (v16+) 和 Git。

1.  **克隆仓库**
    ```bash
    git clone https://github.com/EchoHS/GeekezBrowser.git
    cd GeekezBrowser
    ```

2.  **安装依赖**
    *推荐使用国内镜像源*
    ```bash
    npm install
    ```
    *注意：安装过程中会自动触发 `setup.js` 脚本，智能检测您的网络环境（中国/海外），自动下载 Xray 内核和 Chrome 浏览器（国内自动使用加速镜像）。*

3.  **启动软件**
    ```bash
    npm start
    ```

## 🛠 平台适用性指南

| 平台 | 安全评级 | 备注建议 |
| :--- | :--- | :--- |
| **TikTok** | ✅ 安全 | Canvas 噪音有效防止设备关联。核心在于使用高质量的纯净住宅 IP。 |
| **Facebook** | ✅ 安全 | 已彻底去除 WebDriver 和 Automation 特征。避免高频自动化操作。 |
| **Shopee** | ✅ 安全 | 指纹稳定，适合卖家后台运营。建议一号一环境。 |
| **Amazon (买家)** | ✅ 安全 | 隔离级别足以应对买家号、测评号的风控。 |
| **Amazon (卖家)** | ✅ 安全 | **TLS 指纹安全**。可用于卖家主号，前提是必须使用**高质量住宅 IP** 并固定环境。 |
| **Cloudflare** | ✅ 通过 | 采用原生注入策略，无 JS Hook 痕迹，轻松绕过人机验证。 |

## 📦 打包发布

如果您需要自己生成安装包：

```bash
# Windows
npm run build:win
```

```bash
# macOS
npm run build:mac
```
```bash
# Linux
npm run build:linux
```

## ⚠️ 免责声明
本软件仅供技术研究与教育使用。开发者不对因使用本软件导致的账号封禁、法律风险或经济损失承担任何责任。请用户严格遵守各平台的使用规则和当地法律法规。
