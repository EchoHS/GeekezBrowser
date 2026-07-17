# GeekEZ Browser

<div align="center">

<img src="../src/renderer/icon.png" width="100" height="100" alt="GeekEZ Logo">

[![代码许可：PolyForm Noncommercial 1.0.0](https://img.shields.io/badge/Code%20License-PolyForm%20Noncommercial%201.0.0-blue.svg)](../LICENSE)
[![品牌资产：CC BY-NC-SA 4.0](https://img.shields.io/badge/Brand%20Assets-CC%20BY--NC--SA%204.0-lightgrey.svg)](../ASSET-LICENSE.md)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)

**专为电商运营和多账号管理打造的指纹隐匿浏览器**

[🇺🇸 English](../README.md) | [📥 下载安装包](https://github.com/EchoHS/GeekezBrowser/releases)

</div>

---

## 📖 简介

**GeekEZ Browser** 是一款集成支持Xray代理的指纹浏览器。

致力于解决跨境电商（TikTok, Amazon, Facebook, Shopee, etc.）多账号关联的问题。通过深度伪装，完美通过 Cloudflare，Pixelscan 和 BrowserScan 的高强度检测。

## 📸 软件截图

<div align="center">

<img src="Main Interface1.png" alt="主界面1" width="800">
<img src="Main Interface2.png" alt="主界面2" width="800">

</div>

## ✨ 核心特性

### 🛡️ 深度指纹隔离
*   **硬件随机化**: 随机生成 **CPU 核心数** (4/8/12/16) 和 **设备内存** (4/8/16 GB)，显著增加指纹唯一性，每个环境都独一无二。
*   **时区与地理位置伪装**:
    - **自动 (Auto)** 模式：自动匹配代理 IP 所在地的时区和经纬度。
    - 支持手动选择全球 50+ 城市进行精准定位。
*   **语言伪装**:
    - 支持 **60+ 种语言**，覆盖全球主要地区。
    - 全面修改浏览器语言、HTTP 请求头和国际化 API。
*   **WebRTC 物理阻断**: 强制使用 `disable_non_proxied_udp` 策略，物理切断本地 IP 泄露路径。
*   **UA与WebGL修改**: 支持修改浏览器版本以及WebGL。*（注：暂无法绕过检测）*

### 🔗 全能网络引擎 (Xray-core)
*   **全协议支持**: 完美支持 VMess, VLESS, Trojan, Shadowsocks (含 **SS-2022**), Socks5, HTTP。
*   **高级传输层**: 支持 **REALITY**, **XHTTP**, **gRPC**, **mKCP**, WebSocket, H2 等复杂传输配置。
*   **前置代理 (链式代理)**: 支持 `[本机] -> [前置代理] -> [环境代理] -> [目标网站]` 架构，隐藏真实 IP。
*   **双栈支持**: 智能路由策略，完美支持 IPv4/IPv6 双栈节点。

### 🧩 工作流与管理
*   **插件支持**: 支持安装 Chrome 扩展（如 MetaMask, AdBlock），并自定义配置使用环境。
*   **标签系统**: 为环境添加彩色标签（如 "TikTok", "美国", "主号"），便于分组管理。
*   **安全备注**: 使用 **动态水印** 在页面上方显示环境名称（如 `Profile-1`）。
*   **稳定多开**: 支持同时运行多个环境，端口和进程完全独立互不干扰。
*   **远程调试端口 (高级)**: 可选开启外部 Puppeteer/DevTools 连接，支持自动化控制（默认关闭以降低风险）。

## 🚀 快速开始

### 方法 1: 下载安装包 (推荐)
前往 [**Releases**](https://github.com/EchoHS/GeekezBrowser/releases) 页面下载适配您系统的安装包：
*   **Windows**: `GeekEZ Browser-{version}-win-x64.exe`
*   **macOS (ARM64)**: `GeekEZ Browser-{version}-mac-arm64.dmg`
*   **macOS (Intel)**: `GeekEZ Browser-{version}-mac-x64.dmg`
*   **Linux**: `GeekEZ Browser-{version}-linux-x64.AppImage`

### 方法 2: 源码运行

**前置要求**: 安装 Node.js (v16+) 和 Git。

1.  **克隆仓库**
    ```bash
    git clone https://github.com/EchoHS/GeekezBrowser.git
    cd GeekezBrowser
    ```

2.  **安装依赖**
    ```bash
    npm install
    ```

3.  **启动软件**
    ```bash
    npm run dev
    ```

## 🛠 平台适用性指南

| 平台 | 安全评级 | 备注建议 |
| :--- | :--- | :--- |
| **TikTok** | ✅ 安全 | Canvas 噪音有效防止设备关联。核心在于使用**独享IP**。 |
| **Facebook** | ✅ 安全 | 已彻底去除 WebDriver 和 Automation 特征。避免高频自动化操作。 |
| **Shopee** | ✅ 安全 | 指纹稳定，适合卖家后台运营。建议一号一环境。 |
| **Amazon (买家)** | ✅ 安全 | 隔离级别足以应对买家号、测评号的风控。 |
| **Amazon (卖家)** | ✅ 安全 | **TLS 指纹安全**。可用于卖家主号，前提是必须使用**独享IP** 并固定环境。 |

## 📦 打包发布

如果您需要自己生成安装包：

```bash
# Windows
npm run build:win

# macOS
npm run build:mac

# Linux
npm run build:linux
```

## 🔍 检测状态

- ✅ **Browserscan**: 全部通过
- ✅ **Pixelscan**: 全部通过
- ✅ **Cloudflare**: 通过机器人检测

## ❓ 常见问题 (FAQ)  

### macOS 提示 "安装包已损坏" 或 "无法打开"

**解决方案**:
1. 将 `GeekEZ Browser` 拖入 **应用程序 (Applications)** 文件夹。
2. 打开终端 (Terminal)，输入以下命令并回车（可能需要输入密码）：
   ```bash
   sudo xattr -rd com.apple.quarantine /Applications/GeekEZ\ Browser.app
   ```
3. 重新打开软件即可正常运行。

### <u>[***点击查看更多详细说明***](https://browser.geekez.net/doc.html#doc-usage)</u>

## ⚠️ 免责声明

本软件仅供技术研究与教育使用。开发者不对因使用本软件导致的账号封禁、法律风险或经济损失承担任何责任。请用户严格遵守各平台的使用规则和当地法律法规。

## 📝 许可协议

GeekEZ Browser 是**源码可见软件**，不属于 OSI 认可的开源软件。

- **源代码：**采用 [PolyForm Noncommercial 1.0.0](../LICENSE) 许可。个人及符合协议定义的非商业用途可以免费使用；**任何商业用途均须另行取得书面商业授权**。
- **Logo、图标及品牌美术资产：**其著作权按照 [CC BY-NC-SA 4.0](../ASSET-LICENSE.md) 许可，仅限符合协议的非商业使用。
- **商标：**GeekEZ 名称和品牌标识的商标权不由 Creative Commons 协议授予，详见 [TRADEMARKS.md](../TRADEMARKS.md)。
- **商业授权：**申请方式及适用范围详见 [COMMERCIAL-LICENSE.md](../COMMERCIAL-LICENSE.md)。

第三方组件继续适用其各自的许可证。

## 💬 交流群
[*QQ群：1079216892*](tencent://groupwpa/?subcmd=all&uin=1079216892)


## Star History

<a href="https://www.star-history.com/?repos=EchoHS%2FGeekezBrowser&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=EchoHS/GeekezBrowser&type=date&theme=dark&legend=top-left&sealed_token=6pGlxeLVF-CkUfvKDldMx_8SwJovSNjgK59gCn2pXVZv_m7qeB93fjWSZYy188A8t-P0pwNdGkW4d8cJSq6t2DFZF5NMhbmTNICZM4QAwHpM98Q-g6JmYtoe2Z4p4TILseeW-YEaZr-2EkyPEWWWQNj-9sRCgQenQpQ8Gyn5zBvzwWNz2t81gdjsy5HX" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=EchoHS/GeekezBrowser&type=date&legend=top-left&sealed_token=6pGlxeLVF-CkUfvKDldMx_8SwJovSNjgK59gCn2pXVZv_m7qeB93fjWSZYy188A8t-P0pwNdGkW4d8cJSq6t2DFZF5NMhbmTNICZM4QAwHpM98Q-g6JmYtoe2Z4p4TILseeW-YEaZr-2EkyPEWWWQNj-9sRCgQenQpQ8Gyn5zBvzwWNz2t81gdjsy5HX" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=EchoHS/GeekezBrowser&type=date&legend=top-left&sealed_token=6pGlxeLVF-CkUfvKDldMx_8SwJovSNjgK59gCn2pXVZv_m7qeB93fjWSZYy188A8t-P0pwNdGkW4d8cJSq6t2DFZF5NMhbmTNICZM4QAwHpM98Q-g6JmYtoe2Z4p4TILseeW-YEaZr-2EkyPEWWWQNj-9sRCgQenQpQ8Gyn5zBvzwWNz2t81gdjsy5HX" />
 </picture>
</a>
