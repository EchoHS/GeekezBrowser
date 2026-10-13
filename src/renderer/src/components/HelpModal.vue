<template>
    <div id="helpModal" class="modal-overlay" :class="{ active: uiStore.helpModalVisible }">
        <div class="modal-content">
            <div class="modal-header" style="border:none;">
                <span>{{ $t('helpTitle') }}</span>
                <span style="cursor:pointer" @click="uiStore.helpModalVisible = false">✕</span>
            </div>
            <div class="tab-header">
                <div class="tab-btn" :class="{ active: activeTab === 'manual' }" @click="activeTab = 'manual'">{{ $t('tabManual') }}</div>
                <div class="tab-btn" :class="{ active: activeTab === 'about' }" @click="activeTab = 'about'">{{ $t('tabAbout') }}</div>
            </div>
            <div style="flex:1; overflow-y:auto; padding-right:10px; color: var(--text-secondary);" id="helpContent">
                <!-- Manual Section -->
                <div v-if="activeTab === 'manual'" class="help-section active">
                    <template v-if="curLang === 'en'">
                        <div style="margin-bottom:25px;"><h4 style="color:var(--accent);margin-bottom:8px;">1. Create Environment</h4><p style="font-size:14px;">Enter a name and proxy link. The system auto-generates a unique fingerprint with randomized Hardware.</p></div>
                        <div style="margin-bottom:25px;"><h4 style="color:var(--accent);margin-bottom:8px;">2. Launch</h4><p style="font-size:14px;">Click Launch. A green badge indicates active status. Each environment is fully isolated.</p></div>
                        <div style="margin-bottom:25px;"><h4 style="color:var(--accent);margin-bottom:8px;">3. Pre-Proxy (Optional)</h4><p style="font-size:14px;">Chain proxy for IP hiding. Use TCP protocols for stability.<br><span style="color:#ffb366;">Warning: if your local machine is already using a TUN proxy, do not enable pre-proxy, or the proxy chain may fail.</span></p></div>
                        <div style="margin-bottom:25px;"><h4 style="color:var(--accent);margin-bottom:8px;">4. Best Practices</h4><p style="font-size:14px;">• Use high-quality residential IPs<br>• Keep one account per environment<br>• Avoid frequent switching<br>• Simulate real user behavior</p></div>
                    </template>
                    <template v-else>
                        <div style="margin-bottom:25px;"><h4 style="color:var(--accent);margin-bottom:8px;">1. 新建环境</h4><p style="font-size:14px;">填写名称与代理链接。系统自动生成唯一指纹（硬件随机化）。</p></div>
                        <div style="margin-bottom:25px;"><h4 style="color:var(--accent);margin-bottom:8px;">2. 启动环境</h4><p style="font-size:14px;">点击启动，列表中显示绿色运行标签。每个环境完全隔离。</p></div>
                        <div style="margin-bottom:25px;"><h4 style="color:var(--accent);margin-bottom:8px;">3. 前置代理（可选）</h4><p style="font-size:14px;">用于隐藏本机IP或链路加速。建议使用TCP协议。<br><span style="color:#ffb366;">警告：若本机已在使用 TUN 代理，请勿开启前置代理，否则可能导致代理链失败。</span></p></div>
                        <div style="margin-bottom:25px;"><h4 style="color:var(--accent);margin-bottom:8px;">4. 最佳实践</h4><p style="font-size:14px;">• 使用高质量住宅IP<br>• 一个账号固定一个环境<br>• 避免频繁切换<br>• 模拟真实用户行为</p></div>
                    </template>

                    <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">
                        <div style="width:4px;height:18px;background:linear-gradient(180deg, #00BCD4, #3F51B5);border-radius:2px;"></div>
                        <h4 style="margin:0;color:var(--text-primary);font-size:14px;font-weight:600;">{{ curLang === 'en' ? 'DOCUMENTATION' : '使用文档' }}</h4>
                    </div>
                    <button class="help-highlight-card help-doc-card" @click="openExternal('https://browser.geekez.net/doc#doc-usage')">
                        <div class="help-card-icon">📘</div>
                        <div class="help-highlight-link">{{ curLang === 'en' ? 'Click to view Detailed User Guide' : '点击查看详细使用说明' }}</div>
                        <div class="help-card-meta">https://browser.geekez.net/doc#doc-usage</div>
                    </button>
                </div>

                <!-- About Section -->
                <div v-if="activeTab === 'about'" class="help-section active">
                    <div style="text-align:center;margin-bottom:24px;padding:20px 0;">
                        <div style="font-size:28px;font-weight:700;color:var(--text-primary);letter-spacing:1px;">Geek<span style="color:var(--accent);">EZ</span></div>
                        <div style="font-size:12px;opacity:0.5;margin-top:4px;">{{ appVersion }} · {{ curLang === 'en' ? 'Anti-detect Browser' : '指纹浏览器' }}</div>
                    </div>
                    
                    <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">
                        <div style="width:4px;height:18px;background:linear-gradient(180deg, var(--accent), #7c3aed);border-radius:2px;"></div>
                        <h4 style="margin:0;color:var(--text-primary);font-size:14px;font-weight:600;">{{ curLang === 'en' ? 'CORE TECHNOLOGY' : '核心技术' }}</h4>
                    </div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:24px;">
                        <div style="background:var(--input-bg);padding:12px;border-radius:8px;border:1px solid var(--border);">
                            <div style="font-size:11px;color:var(--accent);font-weight:600;margin-bottom:4px;">🧬 {{ curLang === 'en' ? 'Real Chrome Kernel' : '真实 Chrome 内核' }}</div>
                            <div style="font-size:11px;opacity:0.7;">{{ curLang === 'en' ? 'Native Chrome + JS Injection' : '原生内核 + JS 注入' }}</div>
                        </div>
                        <div style="background:var(--input-bg);padding:12px;border-radius:8px;border:1px solid var(--border);">
                            <div style="font-size:11px;color:var(--accent);font-weight:600;margin-bottom:4px;">🔐 {{ curLang === 'en' ? 'Hardware Fingerprint' : '硬件指纹随机化' }}</div>
                            <div style="font-size:11px;opacity:0.7;">{{ curLang === 'en' ? 'CPU/Memory Randomization' : 'CPU/内存完全随机' }}</div>
                        </div>
                        <div style="background:var(--input-bg);padding:12px;border-radius:8px;border:1px solid var(--border);">
                            <div style="font-size:11px;color:var(--accent);font-weight:600;margin-bottom:4px;">🌍 {{ curLang === 'en' ? '60+ Languages' : '60+ 语言适配' }}</div>
                            <div style="font-size:11px;opacity:0.7;">{{ curLang === 'en' ? 'Timezone & Locale Spoofing' : '时区与语言完美伪装' }}</div>
                        </div>
                        <div style="background:var(--input-bg);padding:12px;border-radius:8px;border:1px solid var(--border);">
                            <div style="font-size:11px;color:var(--accent);font-weight:600;margin-bottom:4px;">⚡ {{ curLang === 'en' ? 'GPU Acceleration' : 'GPU 硬件加速' }}</div>
                            <div style="font-size:11px;opacity:0.7;">{{ curLang === 'en' ? 'Smooth UI Performance' : '流畅 UI 渲染体验' }}</div>
                        </div>
                    </div>

                    <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">
                        <div style="width:4px;height:18px;background:linear-gradient(180deg, #4CAF50, #2196F3);border-radius:2px;"></div>
                        <h4 style="margin:0;color:var(--text-primary);font-size:14px;font-weight:600;">{{ curLang === 'en' ? 'DETECTION STATUS' : '检测状态' }}</h4>
                    </div>
                    <div style="background:var(--input-bg);padding:14px;border-radius:8px;border:1px solid var(--border);margin-bottom:24px;">
                        <div style="display:flex;flex-wrap:wrap;gap:16px;">
                            <div style="font-size:12px;"><span style="color:#4CAF50;">✓</span> {{ curLang === 'en' ? 'Browserscan Passed' : 'Browserscan 全绿' }}</div>
                            <div style="font-size:12px;"><span style="color:#4CAF50;">✓</span> {{ curLang === 'en' ? 'Pixelscan Clean' : 'Pixelscan 无检测' }}</div>
                            <div style="font-size:12px;"><span style="color:#4CAF50;">✓</span> {{ curLang === 'en' ? 'Real TLS Fingerprint' : 'TLS 指纹真实' }}</div>
                            <div style="font-size:12px;"><span style="color:#4CAF50;">✓</span> {{ curLang === 'en' ? 'Minimal API Hook' : '最小化 API Hook' }}</div>
                        </div>
                    </div>

                    <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">
                        <div style="width:4px;height:18px;background:linear-gradient(180deg, #FF9800, #F44336);border-radius:2px;"></div>
                        <h4 style="margin:0;color:var(--text-primary);font-size:14px;font-weight:600;">{{ curLang === 'en' ? 'PLATFORM COMPATIBILITY' : '平台适配' }}</h4>
                    </div>
                    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:24px;">
                        <span style="background:linear-gradient(135deg, rgba(243,156,18,0.2), rgba(243,156,18,0.1));color:#f39c12;padding:6px 12px;border-radius:20px;font-size:11px;font-weight:500;">Amazon</span>
                        <span style="background:linear-gradient(135deg, rgba(39,174,96,0.2), rgba(39,174,96,0.1));color:#27ae60;padding:6px 12px;border-radius:20px;font-size:11px;font-weight:500;">TikTok</span>
                        <span style="background:linear-gradient(135deg, rgba(41,128,185,0.2), rgba(41,128,185,0.1));color:#2980b9;padding:6px 12px;border-radius:20px;font-size:11px;font-weight:500;">Facebook</span>
                        <span v-if="curLang === 'en'" style="background:linear-gradient(135deg, rgba(230,126,34,0.2), rgba(230,126,34,0.1));color:#e67e22;padding:6px 12px;border-radius:20px;font-size:11px;font-weight:500;">Shopee</span>
                        <span v-else style="background:linear-gradient(135deg, rgba(230,126,34,0.2), rgba(230,126,34,0.1));color:#e67e22;padding:6px 12px;border-radius:20px;font-size:11px;font-weight:500;">虾皮</span>
                    </div>

                    <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">
                        <div style="width:4px;height:18px;background:linear-gradient(180deg, #00BCD4, #3F51B5);border-radius:2px;"></div>
                        <h4 style="margin:0;color:var(--text-primary);font-size:14px;font-weight:600;">{{ curLang === 'en' ? 'Office Website' : '官网' }}</h4>
                    </div>
                    <button class="help-highlight-card" @click="openExternal('https://browser.geekez.net')">
                        <div style="font-size:11px;color:var(--accent);font-weight:600;margin-bottom:4px;">🌍 {{ curLang === 'en' ? 'Official Website' : '点击打开官网'  }}</div>
                    </button>

                    <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">
                        <div style="width:4px;height:18px;background:linear-gradient(180deg, #9C27B0, #E91E63);border-radius:2px;"></div>
                        <h4 style="margin:0;color:var(--text-primary);font-size:14px;font-weight:600;">{{ curLang === 'en' ? 'COMMUNITY' : '交流社群' }}</h4>
                    </div>
                    <div class="help-highlight-card">
                        <div style="font-size:18px;margin-bottom:6px;">💬</div>
                        <div style="font-size:12px;opacity:0.8;margin-bottom:8px;">{{ curLang === 'en' ? 'Join our QQ Group for support' : '加入 QQ 群获取支持与交流' }}</div>
                        <a href="tencent://groupwpa/?subcmd=all&uin=1079216892" :title="curLang === 'en' ? 'Click to join QQ Group' : '点击加入QQ群'" class="help-highlight-link">{{ curLang === 'en' ? 'Click to join: 1079216892' : '点击加入：1079216892' }}</a>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue';
import { useUIStore } from '../store/useUIStore';
import { ipcService } from '../services/ipc.service';

const uiStore = useUIStore();
const activeTab = ref('manual');
const curLang = computed(() => uiStore.lang);
const appVersion = ref('v...');

function openExternal(url) {
    ipcService.openUrl(url);
}

async function loadAppVersion() {
    try {
        const info = await ipcService.getAppInfo();
        if (info && info.version) {
            appVersion.value = `v${info.version}`;
        }
    } catch {
        // Keep fallback placeholder when app version is temporarily unavailable.
    }
}

// 监听 Tab 切换指令 (兼容旧版代码调用)
window.switchHelpTab = (tabName) => {
    activeTab.value = tabName;
};

onMounted(() => {
    loadAppVersion();
});
</script>

<style scoped>
.help-inline-link {
    margin-top: 12px;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--accent);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
}

.help-inline-link:hover {
    text-decoration: underline;
}

.help-highlight-card {
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    width: 100%;
    max-width: 100%;
    margin-bottom: 24px;
    padding: 16px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: linear-gradient(135deg, var(--input-bg), var(--card-bg));
    text-align: center;
    overflow: hidden;
}

.help-doc-card {
    align-items: flex-start;
    text-align: left;
    padding: 18px;
    border-color: rgba(63, 81, 181, 0.28);
    background:
        radial-gradient(circle at top right, rgba(63, 81, 181, 0.14), transparent 34%),
        linear-gradient(135deg, rgba(0, 188, 212, 0.08), rgba(63, 81, 181, 0.12)),
        linear-gradient(135deg, var(--input-bg), var(--card-bg));
    cursor: pointer;
    transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
}

.help-doc-card:hover {
    transform: translateY(-1px);
    border-color: rgba(63, 81, 181, 0.5);
    box-shadow: 0 10px 24px rgba(0, 0, 0, 0.12);
}

.help-card-icon {
    font-size: 22px;
    line-height: 1;
}



.help-card-meta {
    display: inline-flex;
    max-width: 100%;
    padding: 4px 10px;
    border-radius: 999px;
    background: rgba(63, 81, 181, 0.12);
    color: var(--accent);
    font-size: 11px;
    font-weight: 600;
    word-break: break-all;
}

.help-highlight-link {
    display: inline-block;
    max-width: 100%;
    color: var(--accent);
    font-size: 16px;
    font-weight: 600;
    letter-spacing: 1px;
    line-height: 1.45;
    text-decoration: none;
    word-break: break-word;
}

@media (max-width: 640px) {
    .help-highlight-card {
        padding: 14px;
        margin-bottom: 18px;
    }

    .help-card-title {
        font-size: 13px;
    }

    .help-card-desc {
        font-size: 11px;
    }

    .help-highlight-link {
        font-size: 14px;
        letter-spacing: 0.4px;
    }
}
</style>
