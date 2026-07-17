# GeekEZ Browser

<div align="center">

<img src="src/renderer/icon.png" width="100" height="100" alt="GeekEZ Logo">

[![Code License: PolyForm Noncommercial 1.0.0](https://img.shields.io/badge/Code%20License-PolyForm%20Noncommercial%201.0.0-blue.svg)](LICENSE)
[![Brand Assets: CC BY-NC-SA 4.0](https://img.shields.io/badge/Brand%20Assets-CC%20BY--NC--SA%204.0-lightgrey.svg)](ASSET-LICENSE.md)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)

**A fingerprint stealth browser built for e-commerce operations and multi-account management**

[🇨🇳 中文说明 (Chinese)](docs/README_zh.md) | [📥 Download Releases](https://github.com/EchoHS/GeekezBrowser/releases)

</div>

---

## 📖 Introduction

**GeekEZ Browser** is a fingerprint browser with integrated Xray proxy support.

It is designed to solve multi-account association issues in cross-border e-commerce (TikTok, Amazon, Facebook, Shopee, etc.). Through deep spoofing, it can pass high-intensity checks from Cloudflare, Pixelscan, and BrowserScan.

## 📸 Screenshots

<div align="center">

<img src="docs/Main Interface1.png" alt="Main Interface 1" width="800">
<img src="docs/Main Interface2.png" alt="Main Interface 2" width="800">

</div>

## ✨ Core Features

### 🛡️ Deep Fingerprint Isolation
*   **Hardware Randomization**: Randomly generates **CPU core count** (4/8/12/16) and **device memory** (4/8/16 GB), significantly increasing fingerprint uniqueness so every environment is unique.
*   **Timezone & Geolocation Spoofing**:
    - **Auto** mode: Automatically matches timezone and coordinates to the proxy IP location.
    - Supports manual selection from 50+ global cities for precise positioning.
*   **Language Spoofing**:
    - Supports **60+ languages** covering major regions worldwide.
    - Fully modifies browser language, HTTP headers, and Internationalization API behavior.
*   **WebRTC Physical Blocking**: Enforces `disable_non_proxied_udp` policy to physically block local IP leak paths.
*   **UA & WebGL Modification**: Supports browser version and WebGL modification. *(Note: bypassing detection is not guaranteed yet.)*

### 🔗 Full-Power Network Engine (Xray-core)
*   **Full Protocol Support**: VMess, VLESS, Trojan, Shadowsocks (including **SS-2022**), Socks5, HTTP.
*   **Advanced Transports**: Supports complex transport configurations including **REALITY**, **XHTTP**, **gRPC**, **mKCP**, WebSocket, and H2.
*   **Pre-Proxy (Proxy Chain)**: Supports `[Local] -> [Pre-Proxy] -> [Profile Proxy] -> [Target Website]` architecture to hide real IP.
*   **Dual-Stack Support**: Smart routing strategy with full IPv4/IPv6 dual-stack support.

### 🧩 Workflow & Management
*   **Extension Support**: Supports installing Chrome extensions (e.g., MetaMask, AdBlock) and customizing which environments they apply to.
*   **Tag System**: Add custom tags (e.g., "TikTok", "US", "Main") for grouped management.
*   **Safe Labeling**: Uses **dynamic watermark** to display environment names at the top of pages (e.g., `Profile-1`).
*   **Stable Multi-Instance**: Supports running multiple environments simultaneously with fully isolated ports and processes.
*   **Remote Debugging Port (Advanced)**: Optional external Puppeteer/DevTools connection for automation (disabled by default for lower risk).

## 🚀 Quick Start

### Method 1: Download Installer (Recommended)
Go to the [**Releases**](https://github.com/EchoHS/GeekezBrowser/releases) page and download the package for your platform:
*   **Windows**: `GeekEZ Browser-{version}-win-x64.exe`
*   **macOS (ARM64)**: `GeekEZ Browser-{version}-mac-arm64.dmg`
*   **macOS (Intel)**: `GeekEZ Browser-{version}-mac-x64.dmg`
*   **Linux**: `GeekEZ Browser-{version}-linux-x64.AppImage`

### Method 2: Run from Source

**Prerequisites**: Node.js (v16+) and Git.

1.  **Clone the repository**
    ```bash
    git clone https://github.com/EchoHS/GeekezBrowser.git
    cd GeekezBrowser
    ```

2.  **Install dependencies**
    ```bash
    npm install
    ```

3.  **Start the app**
    ```bash
    npm run dev
    ```

## 🛠 Platform Compatibility Guide

| Platform | Safety Rating | Notes |
| :--- | :--- | :--- |
| **TikTok** | ✅ Safe | Canvas noise effectively prevents device association. The key is using a **dedicated IP**. |
| **Facebook** | ✅ Safe | WebDriver and automation signatures are removed. Avoid high-frequency automation behavior. |
| **Shopee** | ✅ Safe | Stable fingerprint behavior, suitable for seller backend operations. Recommended one account per environment. |
| **Amazon (Buyer)** | ✅ Safe | Isolation level is sufficient for buyer/reviewer risk control scenarios. |
| **Amazon (Seller)** | ✅ Safe | **TLS fingerprint is safe**. Usable for seller main accounts when using a **dedicated IP** and fixed environment. |

## 📦 Build & Package

If you want to build installers yourself:

```bash
# Windows
npm run build:win

# macOS
npm run build:mac

# Linux
npm run build:linux
```

## 🔍 Detection Status

- ✅ **Browserscan**: All checks passed
- ✅ **Pixelscan**: All checks passed
- ✅ **Cloudflare**: Bot checks passed

## ❓ FAQ

### macOS shows "App is damaged" or "Cannot be opened"

**Solution**:
1. Drag `GeekEZ Browser` into **Applications**.
2. Open Terminal and run the following command (password may be required):
   ```bash
   sudo xattr -rd com.apple.quarantine /Applications/GeekEZ\ Browser.app
   ```
3. Re-open the app.

### <u>[***Click for detailed documentation***](https://browser.geekez.net/doc.html#doc-usage)</u>

## ⚠️ Disclaimer

This software is for technical research and educational purposes only. The developers are not responsible for account bans, legal risks, or economic losses caused by using this software. Please strictly comply with platform rules and local laws/regulations.

## 📝 License

GeekEZ Browser is **source-available**, not OSI-approved open-source software.

- **Source code:** Licensed under the [PolyForm Noncommercial License 1.0.0](LICENSE). Personal and qualifying noncommercial use is permitted; **any commercial use requires a separate written commercial license**.
- **Logos, icons, and brand artwork:** Licensed under [CC BY-NC-SA 4.0](ASSET-LICENSE.md) for noncommercial copyright use.
- **Trademarks:** The GeekEZ name and brand identifiers remain protected and are not licensed by Creative Commons. See [TRADEMARKS.md](TRADEMARKS.md).
- **Commercial licensing:** See [COMMERCIAL-LICENSE.md](COMMERCIAL-LICENSE.md) to request authorization.

Third-party components remain subject to their respective licenses.

## 💬 Community
[*QQ Group: 1079216892*](tencent://groupwpa/?subcmd=all&uin=1079216892)

## Star History

<a href="https://www.star-history.com/?repos=EchoHS%2FGeekezBrowser&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=EchoHS/GeekezBrowser&type=date&theme=dark&legend=top-left&sealed_token=6pGlxeLVF-CkUfvKDldMx_8SwJovSNjgK59gCn2pXVZv_m7qeB93fjWSZYy188A8t-P0pwNdGkW4d8cJSq6t2DFZF5NMhbmTNICZM4QAwHpM98Q-g6JmYtoe2Z4p4TILseeW-YEaZr-2EkyPEWWWQNj-9sRCgQenQpQ8Gyn5zBvzwWNz2t81gdjsy5HX" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=EchoHS/GeekezBrowser&type=date&legend=top-left&sealed_token=6pGlxeLVF-CkUfvKDldMx_8SwJovSNjgK59gCn2pXVZv_m7qeB93fjWSZYy188A8t-P0pwNdGkW4d8cJSq6t2DFZF5NMhbmTNICZM4QAwHpM98Q-g6JmYtoe2Z4p4TILseeW-YEaZr-2EkyPEWWWQNj-9sRCgQenQpQ8Gyn5zBvzwWNz2t81gdjsy5HX" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=EchoHS/GeekezBrowser&type=date&legend=top-left&sealed_token=6pGlxeLVF-CkUfvKDldMx_8SwJovSNjgK59gCn2pXVZv_m7qeB93fjWSZYy188A8t-P0pwNdGkW4d8cJSq6t2DFZF5NMhbmTNICZM4QAwHpM98Q-g6JmYtoe2Z4p4TILseeW-YEaZr-2EkyPEWWWQNj-9sRCgQenQpQ8Gyn5zBvzwWNz2t81gdjsy5HX" />
 </picture>
</a>
