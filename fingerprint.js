const os = require('os');
const CHROME_VERSION_FULL = '129.0.6668.58'; 
const CHROME_MAJOR = '129';

const RESOLUTIONS = [{w:1920,h:1080}, {w:2560,h:1440}, {w:1366,h:768}, {w:1536,h:864}, {w:1440,h:900}];

function getRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function generateFingerprint() {
    // 1. 强制匹配宿主机系统
    const platform = os.platform(); 
    
    let osData = {};
    
    if (platform === 'win32') {
        osData = {
            userAgentStr: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_VERSION_FULL} Safari/537.36`,
            platform: 'Win32',
            uaPlatform: 'Windows',
            platformVersion: '15.0.0'
        };
    } else if (platform === 'darwin') {
        osData = {
            userAgentStr: `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_VERSION_FULL} Safari/537.36`,
            platform: 'MacIntel',
            uaPlatform: 'macOS',
            platformVersion: '14.0.0'
        };
    } else {
        osData = {
            userAgentStr: `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_VERSION_FULL} Safari/537.36`,
            platform: 'Linux x86_64',
            uaPlatform: 'Linux',
            platformVersion: '6.5.0'
        };
    }

    const res = getRandom(RESOLUTIONS);
    const languages = ['en-US', 'en']; 

    // 显卡透传
    const gpu = { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA)' }; 

    const canvasNoise = {
        r: Math.floor(Math.random() * 10) - 5,
        g: Math.floor(Math.random() * 10) - 5,
        b: Math.floor(Math.random() * 10) - 5,
        a: Math.floor(Math.random() * 10) - 5
    };

    const userAgentMetadata = {
        brands: [
            { brand: "Google Chrome", version: CHROME_MAJOR },
            { brand: "Chromium", version: CHROME_MAJOR },
            { brand: "Not=A?Brand", version: "24" }
        ],
        fullVersionList: [
            { brand: "Google Chrome", version: CHROME_VERSION_FULL },
            { brand: "Chromium", version: CHROME_VERSION_FULL },
            { brand: "Not=A?Brand", version: "24.0.0.0" }
        ],
        mobile: false,
        model: "",
        platform: osData.uaPlatform,
        platformVersion: osData.platformVersion,
        architecture: "x86",
        bitness: "64",
        wow64: false
    };

    return {
        userAgent: osData.userAgentStr,
        userAgentMetadata: userAgentMetadata,
        platform: osData.platform,
        screen: { width: res.w, height: res.h },
        window: { width: res.w, height: res.h },
        webgl: gpu,
        languages: languages,
        hardwareConcurrency: 8,
        deviceMemory: 8,
        canvasNoise: canvasNoise,
        audioNoise: Math.random() * 0.000001,
        noiseSeed: Math.floor(Math.random() * 9999999),
        timezone: "America/Los_Angeles" // 默认值
    };
}

// 注入脚本：包含复杂的时区伪装逻辑
function getInjectScript(fp) {
    const fpJson = JSON.stringify(fp);
    return `
    (function() {
        try {
            const fp = ${fpJson};
            const targetTimezone = fp.timezone || "America/Los_Angeles";

            // --- 1. 移除 WebDriver ---
            if (navigator.webdriver) {
                Object.defineProperty(navigator, 'webdriver', { get: () => false });
            }

            // --- 2. 时区伪装 (高级 Hook) ---
            try {
                // 2.1 Hook Intl.DateTimeFormat
                const OriginalDateTimeFormat = Intl.DateTimeFormat;
                
                // 代理构造函数
                Intl.DateTimeFormat = function(locales, options) {
                    if (!options) options = {};
                    // 强制修改时区
                    if (!options.timeZone) {
                        options.timeZone = targetTimezone;
                    }
                    return new OriginalDateTimeFormat(locales, options);
                };
                // 修复原型链，防止被检测
                Intl.DateTimeFormat.prototype = OriginalDateTimeFormat.prototype;
                Intl.DateTimeFormat.supportedLocalesOf = OriginalDateTimeFormat.supportedLocalesOf;
                
                // 2.2 Hook Date.prototype.getTimezoneOffset
                // 利用 Intl 计算目标时区的 offset
                const originalGetTimezoneOffset = Date.prototype.getTimezoneOffset;
                Date.prototype.getTimezoneOffset = function() {
                    // 使用目标时区格式化当前时间，算出与 UTC 的差值
                    const dateString = this.toLocaleString('en-US', { timeZone: targetTimezone, timeZoneName: 'longOffset' });
                    const match = dateString.match(/GMT([+-]\\d{2}):(\d{2})/);
                    if (match) {
                        const hours = parseInt(match[1], 10);
                        const minutes = parseInt(match[2], 10);
                        // offset 是反的：UTC+8 返回 -480
                        return -(hours * 60 + (hours > 0 ? minutes : -minutes));
                    }
                    // 兜底：如果正则失败，返回默认 offset (例如 LA 是 420 或 480)
                    return 420; 
                };
                
                // 2.3 Hook Date.prototype.toString 等方法
                // 解决 "Time From Javascript" 显示中国时间的问题
                // 将 Date.toString 代理到 Intl 的格式化结果上
                const originalToString = Date.prototype.toString;
                
                // 自定义格式化函数，模拟原生 toString 格式: "Wed Nov 26 2025 01:00:11 GMT-0800 (Pacific Standard Time)"
                function getSpoofedString(dateObj) {
                    try {
                        const str = dateObj.toLocaleString('en-US', {
                            timeZone: targetTimezone,
                            weekday: 'short',
                            month: 'short',
                            day: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                            hour12: false,
                            timeZoneName: 'longOffset' // GMT-0800
                        });
                        // Intl 出来的格式和 toString 不太一样，需要微调。
                        // 简单方案：直接返回 toLocaleString 的结果，虽然格式略有不同，但时间是对的。
                        // 完美方案太复杂，容易出错。这里采用 "语义正确" 优先。
                        return str + " (" + targetTimezone + ")"; 
                    } catch(e) {
                        return originalToString.call(dateObj);
                    }
                }
                
                // 覆盖 toString
                // 注意：某些严格检测可能会检查 toString.toString()，这里不做过度防御以免被识别为 Bot
                // 仅覆盖最常用的显示方法
                Object.defineProperty(Date.prototype, 'toString', {
                    value: function() {
                        return new Intl.DateTimeFormat('en-US', {
                            dateStyle: 'full',
                            timeStyle: 'long',
                            timeZone: targetTimezone
                        }).format(this);
                    }
                });

            } catch(e) { console.error("TZ Error", e); }

            // --- 3. Canvas Noise ---
            const originalGetImageData = CanvasRenderingContext2D.prototype.getImageData;
            CanvasRenderingContext2D.prototype.getImageData = function(x, y, w, h) {
                const imageData = originalGetImageData.apply(this, arguments);
                if (fp.noiseSeed) {
                    for (let i = 0; i < imageData.data.length; i += 4) {
                        if ((i + fp.noiseSeed) % 53 === 0) {
                            const noise = fp.canvasNoise ? (fp.canvasNoise.a || 0) : 0;
                            imageData.data[i+3] = Math.max(0, Math.min(255, imageData.data[i+3] + noise));
                        }
                    }
                }
                return imageData;
            };

            // --- 4. Audio Noise ---
            const originalGetChannelData = AudioBuffer.prototype.getChannelData;
            AudioBuffer.prototype.getChannelData = function(channel) {
                const results = originalGetChannelData.apply(this, arguments);
                const noise = fp.audioNoise || 0.0000001;
                for (let i = 0; i < 100 && i < results.length; i++) {
                    results[i] = results[i] + noise;
                }
                return results;
            };

            // --- 5. WebRTC Protection ---
            const originalPC = window.RTCPeerConnection;
            window.RTCPeerConnection = function(config) {
                if(!config) config = {};
                config.iceTransportPolicy = 'relay'; 
                return new originalPC(config);
            };
            window.RTCPeerConnection.prototype = originalPC.prototype;

        } catch(e) { console.error("FP Error", e); }
    })();
    `;
}

module.exports = { generateFingerprint, getInjectScript };