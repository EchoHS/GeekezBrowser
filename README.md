# GeekEZ Browser

<div align="center">

<img src="icon.png" width="100" height="100" alt="GeekEZ Logo">

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)
![Version](https://img.shields.io/badge/version-1.2.1-green)

**A Stealthy Anti-Detect Browser for E-Commerce & Multi-Account Management.**

[🇨🇳 中文说明 (Chinese)](README_zh.md) | [📥 Download](https://github.com/EchoHS/GeekezBrowser/releases)

</div>

---

## 📖 Introduction

**GeekEZ Browser** is a professional anti-detect browser built on **Electron** and **Puppeteer**, integrated with the powerful **Xray-core**. 

It is designed to help e-commerce operators (Amazon, TikTok, Facebook, Shopee, etc.) manage multiple accounts safely by strictly isolating browser fingerprints, network environments, and local storage. Unlike other tools, GeekEZ focuses on **"Native Consistency"** to bypass advanced detectors like Cloudflare and BrowserScan.

## ✨ Key Features (v1.2.1)

### 🛡️ Advanced Fingerprint Isolation
*   **Native Injection Strategy**: Abandoned traditional JS hooking. Uses **Chromium Native Arguments** (`--user-agent`, `--lang`) combined with a **Local Extension** for noise injection. This passes **Cloudflare Turnstile** and **BrowserScan** perfectly.
*   **Hardware Consistency**: Strictly matches OS (Windows/Mac) and WebGL parameters to prevent "OS Mismatch" detection.
*   **Media Noise**: Adds non-intrusive noise to **Canvas** and **AudioContext** to create unique hardware hashes for every profile.
*   **Timezone & Geo**: 120+ searchable timezones. Automatically matches browser timezone with proxy location via internal simulation.
*   **WebRTC Protection**: Forces `disable_non_proxied_udp` policy to prevent real IP leaks.

### 🔗 Powerful Network Engine (Xray-core)
*   **Full Protocol Support**: VMess, VLESS, Trojan, Shadowsocks (including **2022**), Socks5, HTTP.
*   **Advanced Transports**: Support for **REALITY**, **XHTTP**, **gRPC**, **mKCP**, WebSocket, H2.
*   **Proxy Chain (Pre-Proxy)**: `[Local] -> [Pre-Proxy] -> [Target Node] -> [Web]`. Hides your real IP from the proxy provider.
*   **Smart Routing**: Automatic IPv4/IPv6 dual-stack handling.

### 🧩 Workflow & Management
*   **Extension Support**: Import unpacked Chrome extensions (e.g., MetaMask, AdBlock) into isolated environments.
*   **Tag System**: Organize profiles with custom color tags (e.g., "TikTok", "USA", "Main Account").
*   **Safe Identification**: Uses **Bookmarks Bar** to display profile names (e.g., `🔍 Profile-1`), avoiding dangerous `document.title` injection.
*   **Multi-Opening**: Running multiple profiles simultaneously with independent ports and processes.

## 🚀 Quick Start

### Option 1: Download Release (Recommended)
Go to the [**Releases**](https://github.com/EchoHS/GeekezBrowser/releases) page and download the installer:
*   **Windows**: `GeekEZ.Browser.Setup.1.2.1.exe`

### Option 2: Run from Source

**Prerequisites**: Node.js (v16+) and Git.

1.  **Clone the repository**
    ```bash
    git clone https://github.com/EchoHS/GeekezBrowser.git
    cd GeekezBrowser
    ```

2.  **Install Dependencies**
    ```bash
    npm install
    ```
    *Note: The `postinstall` script (`setup.js`) will automatically detect your region and download the correct `Xray-core` and `Chrome` binaries (using mirrors if in China).*

3.  **Run the App**
    ```bash
    npm start
    ```

## 🛠 Compatibility Guide

| Platform | Rating | Notes |
| :--- | :--- | :--- |
| **TikTok** | ✅ Safe | Canvas noise effectively prevents device association. |
| **Facebook** | ✅ Safe | Automation flags (WebDriver) stripped. |
| **Shopee** | ✅ Safe | Stable fingerprint for seller center. |
| **Amazon (Buyer)** | ✅ Safe | Sufficient isolation for buyer/reviewer accounts. |
| **Amazon (Seller)** | ⚠️ Caution | For main accounts with high assets, VPS/Physical isolation is still recommended due to TLS fingerprinting risks inherent to Electron. |
| **Cloudflare** | ✅ Pass | Successfully bypasses Turnstile via native injection strategy. |

## 📦 Build

To create an executable for your platform:

```bash
# Windows
npm run build:win

# macOS
npm run build:mac

# Linux
npm run build:linux