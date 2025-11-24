const i18n = {
    en: {
        enablePreProxy: "Enable Chain Proxy",
        manageChain: "Proxy Chain",
        importYaml: "Import Data",
        newProfile: "New Profile",
        generateBtn: "Generate & Save",
        editFingerprint: "Edit Profile",
        profileName: "Profile Name",
        proxyLink: "Proxy Link",
        preProxySetting: "Pre-Proxy",
        optDefault: "Global",
        optOn: "Force ON",
        optOff: "Force OFF",
        screenRes: "Resolution",
        cancel: "Cancel",
        save: "Save",
        add: "Add",
        launch: "Launch",
        edit: "Edit",
        delete: "Delete",
        notify: "Notify",
        modeSingle: "Single Node",
        modeBalance: "Load Balance",
        modeFailover: "Failover",
        qsDefault: "Pre: Global",
        qsOn: "Pre: ON",
        qsOff: "Pre: OFF",
        confirmDel: "Delete this profile?",
        inputReq: "Name & Proxy Link required!",
        runningStatus: "RUNNING",
        done: "Done",
        remark: "Remark",
        latency: "Latency",
        testWait: "...",
        themeGeek: "Geek (Blue)", themeLight: "Light (Red)", themeDark: "Dark (Green)",
        btnImportSub: "+ New Sub",
        btnTestGroup: "⚡ Test Group & Auto-Switch",
        btnTest: "Test",
        btnEdit: "Edit",
        btnEditSub: "✎ Edit Sub",
        btnDelSub: "Delete Sub",
        btnSaveUpdate: "Save & Update",
        btnExport: "Export",
        exportTitle: "Export Configuration",
        expAll: "Full Backup (All)",
        expAllDesc: "Profiles, Proxies and Subscriptions",
        expProxies: "Proxies Only",
        expProxiesDesc: "Chain Proxies & Subscriptions Settings",
        expProfiles: "Profiles Only",
        expProfilesDesc: "Browser Environments & Fingerprints",
        msgExportSuccess: "Export Successful!",
        msgImportSuccess: "Import Successful!",
        msgNoData: "No data found to export.",
        importSubTitle: "Enter Subscription URL",
        subErr: "Failed to parse subscription.",
        subTitle: "Subscription Settings",
        subName: "Name",
        subUrl: "URL",
        subInterval: "Auto Update",
        optDisabled: "Disabled",
        opt24h: "Every 24 Hours",
        opt72h: "Every 72 Hours",
        optCustom: "Custom (Hours)",
        groupManual: "Manual Added",
        helpTitle: "GeekEZ Manual",
        tabManual: "User Manual",
        tabAbout: "About & Safety",
        autoFingerprint: "* Fingerprints generated automatically",
        checkingUpdate: "Checking for updates...",
        appUpdateFound: "New App version found!",
        xrayUpdateFound: "New Xray core found! Downloading...",
        noUpdate: "You are up to date.",
        updateError: "Update check failed.",
        updateDownloaded: "Update downloaded. Please restart.",
        emptyStateMsg: "Click '+ New Profile' to start",
        // --- 新增汉化 ---
        confirmDelSub: "Are you sure to delete this subscription?",
        msgSubUpdated: "Updated:",
        msgImported: "Imported",
        msgNodes: "nodes.",
        msgUpdateFailed: "Update Failed:"
    },
    cn: {
        enablePreProxy: "开启前置代理",
        manageChain: "管理代理链",
        importYaml: "导入数据",
        newProfile: "新建环境",
        generateBtn: "生成并保存",
        editFingerprint: "编辑指纹环境",
        profileName: "环境名称",
        proxyLink: "代理链接",
        preProxySetting: "前置代理",
        optDefault: "跟随全局",
        optOn: "强制开启",
        optOff: "强制关闭",
        screenRes: "屏幕分辨率",
        cancel: "取消",
        save: "保存",
        add: "添加",
        launch: "启动",
        edit: "编辑",
        delete: "删除",
        notify: "通知",
        modeSingle: "单节点模式",
        modeBalance: "负载均衡",
        modeFailover: "故障转移",
        qsDefault: "前置: 全局",
        qsOn: "前置: 开启",
        qsOff: "前置: 关闭",
        confirmDel: "确定要删除该环境吗？",
        inputReq: "请填写环境名称和代理链接！",
        runningStatus: "运行中",
        done: "完成",
        remark: "备注",
        latency: "延迟",
        testWait: "测速中...",
        themeGeek: "极客 (蓝)", themeLight: "明亮 (红)", themeDark: "暗夜 (绿)",
        btnImportSub: "+ 新建订阅",
        btnTestGroup: "一键测速 & 自动优选",
        btnTest: "测试",
        btnEdit: "编辑",
        btnEditSub: "✎ 编辑订阅",
        btnDelSub: "删除订阅",
        btnSaveUpdate: "保存并更新",
        btnExport: "导出配置",
        exportTitle: "导出配置",
        expAll: "完整备份 (全部)",
        expAllDesc: "包含指纹环境、前置代理及订阅",
        expProxies: "仅导出前置代理",
        expProxiesDesc: "前置节点列表及订阅设置",
        expProfiles: "仅导出指纹环境",
        expProfilesDesc: "浏览器指纹环境配置",
        msgExportSuccess: "导出成功！",
        msgImportSuccess: "导入成功！",
        msgNoData: "没有数据可导出。",
        importSubTitle: "请输入订阅链接 (URL)",
        subErr: "订阅解析失败或网络错误。",
        subTitle: "订阅设置",
        subName: "名称",
        subUrl: "订阅链接",
        subInterval: "定时更新",
        optDisabled: "关闭",
        opt24h: "每 24 小时",
        opt72h: "每 72 小时",
        optCustom: "自定义 (小时)",
        groupManual: "手动添加",
        helpTitle: "使用帮助",
        tabManual: "操作说明",
        tabAbout: "关于 & 适用性",
        autoFingerprint: "* 指纹参数将自动随机生成",
        checkingUpdate: "正在检查更新...",
        appUpdateFound: "发现软件新版本！正在打开下载页...",
        xrayUpdateFound: "发现 Xray 内核更新！正在后台下载...",
        noUpdate: "当前已是最新版本。",
        updateError: "检查更新失败。",
        updateDownloaded: "内核更新完成，重启软件生效。",
        emptyStateMsg: "点击 '+ 新建环境' 开始使用",
        // --- 新增汉化 ---
        confirmDelSub: "确定要删除该订阅及其所有节点吗？",
        msgSubUpdated: "订阅更新成功：",
        msgImported: "成功导入",
        msgNodes: "个节点。",
        msgUpdateFailed: "更新失败："
    }
};

let curLang = localStorage.getItem('geekez_lang') || 'cn';
let globalSettings = { preProxies: [], subscriptions: [], mode: 'single', enablePreProxy: false };
let currentEditId = null;
let confirmCallback = null;
let currentProxyGroup = 'manual';
let inputCallback = null;
let searchText = '';
let viewMode = localStorage.getItem('geekez_view') || 'list';

function decodeBase64Content(str) {
    try {
        str = str.replace(/-/g, '+').replace(/_/g, '/');
        return decodeURIComponent(atob(str).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
    } catch (e) { return atob(str); }
}

function getProxyRemark(link) {
    if (!link) return '';
    link = link.trim();
    try {
        if (link.startsWith('vmess://')) {
            const base64Str = link.replace('vmess://', '');
            const configStr = decodeBase64Content(base64Str);
            try { return JSON.parse(configStr).ps || ''; } catch(e) { return ''; }
        } else if (link.includes('#')) {
            return decodeURIComponent(link.split('#')[1]).trim();
        }
    } catch (e) {}
    return '';
}

function t(key) { return i18n[curLang][key] || key; }

function renderHelpContent() {
    const manualHTML = curLang === 'en' ? 
        `<div style="margin-bottom:25px;"><h4 style="color:var(--accent);margin-bottom:8px;">1. Create Environment</h4><p style="font-size:14px;">Enter a name and proxy link. The system creates a unique fingerprint.</p></div>
         <div style="margin-bottom:25px;"><h4 style="color:var(--accent);margin-bottom:8px;">2. Launch</h4><p style="font-size:14px;">Click Launch. A green badge indicates active status.</p></div>
         <div style="margin-bottom:25px;"><h4 style="color:var(--accent);margin-bottom:8px;">3. Pre-Proxy</h4><p style="font-size:14px;">Optional chain proxy for IP hiding. Use TCP protocols for stability.</p></div>` :
        `<div style="margin-bottom:25px;"><h4 style="color:var(--accent);margin-bottom:8px;">1. 新建环境</h4><p style="font-size:14px;">填写名称与代理链接。系统自动生成唯一指纹。</p></div>
         <div style="margin-bottom:25px;"><h4 style="color:var(--accent);margin-bottom:8px;">2. 启动</h4><p style="font-size:14px;">点击启动，列表中显示绿色运行标签。</p></div>
         <div style="margin-bottom:25px;"><h4 style="color:var(--accent);margin-bottom:8px;">3. 前置代理</h4><p style="font-size:14px;">可选功能。用于隐藏本机IP或链路加速。</p></div>`;

    const aboutHTML = curLang === 'en' ?
        `<div style="text-align:center;margin-bottom:20px;"><div style="font-size:24px;font-weight:bold;color:var(--text-primary);">Geek<span style="color:var(--accent);">EZ</span></div><div style="font-size:12px;opacity:0.6;">v1.0.0</div></div>
         <h4 style="border-bottom:1px solid var(--border);padding-bottom:5px;color:var(--text-primary);">Technology</h4><p style="font-size:13px;margin-bottom:20px;">Electron + Puppeteer. Native Code Spoofing & Noise Injection.</p>
         <h4 style="border-bottom:1px solid var(--border);padding-bottom:5px;color:var(--text-primary);">Platform Analysis</h4>
         <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-top:10px;">
            <div style="background:rgba(0,0,0,0.15);padding:10px;border-radius:6px;"><div style="color:#f39c12;font-weight:bold;">Amazon</div><div style="font-size:11px;margin-top:5px;">Buyer: Safe. Seller: Caution (TLS).</div></div>
            <div style="background:rgba(0,0,0,0.15);padding:10px;border-radius:6px;"><div style="color:#27ae60;font-weight:bold;">TikTok</div><div style="font-size:11px;margin-top:5px;">Safe. Needs Resi IP.</div></div>
            <div style="background:rgba(0,0,0,0.15);padding:10px;border-radius:6px;"><div style="color:#2980b9;font-weight:bold;">Facebook</div><div style="font-size:11px;margin-top:5px;">Safe. Avoid Botting.</div></div>
            <div style="background:rgba(0,0,0,0.15);padding:10px;border-radius:6px;"><div style="color:#e67e22;font-weight:bold;">Shopee</div><div style="font-size:11px;margin-top:5px;">Safe. Stable device ID.</div></div>
            <div style="background:rgba(0,0,0,0.15);padding:10px;border-radius:6px;"><div style="color:#bf0000;font-weight:bold;">Rakuten</div><div style="font-size:11px;margin-top:5px;">Strict IP check.</div></div>
            <div style="background:rgba(0,0,0,0.15);padding:10px;border-radius:6px;"><div style="color:#f1c40f;font-weight:bold;">Mercado</div><div style="font-size:11px;margin-top:5px;">Safe. Similar to Amazon.</div></div>
         </div>` :
        `<div style="text-align:center;margin-bottom:20px;"><div style="font-size:24px;font-weight:bold;color:var(--text-primary);">Geek<span style="color:var(--accent);">EZ</span></div><div style="font-size:12px;opacity:0.6;">v1.0.0</div></div>
         <h4 style="border-bottom:1px solid var(--border);padding-bottom:5px;color:var(--text-primary);">技术内核</h4><p style="font-size:13px;margin-bottom:20px;">Native Code 伪装 + 多媒体噪音注入，有效对抗指纹。</p>
         <h4 style="border-bottom:1px solid var(--border);padding-bottom:5px;color:var(--text-primary);">平台适用性</h4>
         <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-top:10px;">
            <div style="background:rgba(0,0,0,0.15);padding:10px;border-radius:6px;"><div style="color:#f39c12;font-weight:bold;">Amazon</div><div style="font-size:11px;margin-top:5px;">买家: 安全。卖家主号: 建议 VPS。</div></div>
            <div style="background:rgba(0,0,0,0.15);padding:10px;border-radius:6px;"><div style="color:#27ae60;font-weight:bold;">TikTok</div><div style="font-size:11px;margin-top:5px;">安全。依赖纯净IP。</div></div>
            <div style="background:rgba(0,0,0,0.15);padding:10px;border-radius:6px;"><div style="color:#2980b9;font-weight:bold;">Facebook</div><div style="font-size:11px;margin-top:5px;">安全。避免高频脚本。</div></div>
            <div style="background:rgba(0,0,0,0.15);padding:10px;border-radius:6px;"><div style="color:#e67e22;font-weight:bold;">虾皮</div><div style="font-size:11px;margin-top:5px;">安全。固定环境即可。</div></div>
            <div style="background:rgba(0,0,0,0.15);padding:10px;border-radius:6px;"><div style="color:#bf0000;font-weight:bold;">乐天</div><div style="font-size:11px;margin-top:5px;">安全。依赖本土纯净IP。</div></div>
            <div style="background:rgba(0,0,0,0.15);padding:10px;border-radius:6px;"><div style="color:#f1c40f;font-weight:bold;">美客多</div><div style="font-size:11px;margin-top:5px;">安全。同亚马逊逻辑。</div></div>
         </div>`;

    const manualEl = document.getElementById('help-manual');
    const aboutEl = document.getElementById('help-about');
    if(manualEl) manualEl.innerHTML = manualHTML;
    if(aboutEl) aboutEl.innerHTML = aboutHTML;
}

function applyLang() {
    document.querySelectorAll('[data-i18n]').forEach(el => { el.innerText = t(el.getAttribute('data-i18n')); });
    document.querySelectorAll('.running-badge').forEach(el => { el.innerText = t('runningStatus'); });
    const themeSel = document.getElementById('themeSelect');
    if(themeSel) { themeSel.options[0].text = t('themeGeek'); themeSel.options[1].text = t('themeLight'); themeSel.options[2].text = t('themeDark'); }
    renderHelpContent();
    updateToolbar(); loadProfiles(); renderGroupTabs();
}

function toggleLang() { 
    curLang = curLang === 'cn' ? 'en' : 'cn'; 
    localStorage.setItem('geekez_lang', curLang);
    applyLang(); 
}

function setTheme(themeName) {
    document.body.setAttribute('data-theme', themeName);
    localStorage.setItem('geekez_theme', themeName);
    const themeColors = {
        'geek':  { bg: '#1e1e2d', symbol: '#ffffff' },
        'light': { bg: '#f0f2f5', symbol: '#000000' },
        'dark':  { bg: '#121212', symbol: '#ffffff' }
    };
    const colors = themeColors[themeName] || themeColors['geek'];
    window.electronAPI.invoke('set-title-bar-color', colors);
}

function showAlert(msg) { document.getElementById('alertMsg').innerText = msg; document.getElementById('alertModal').style.display = 'flex'; }
function showConfirm(msg, callback) { document.getElementById('confirmMsg').innerText = msg; document.getElementById('confirmModal').style.display = 'flex'; confirmCallback = callback; }
function closeConfirm(result) {
    document.getElementById('confirmModal').style.display = 'none';
    if (result && confirmCallback) confirmCallback();
    confirmCallback = null;
}

function showInput(title, callback) {
    document.getElementById('inputModalTitle').innerText = title;
    document.getElementById('inputModalValue').value = '';
    document.getElementById('inputModal').style.display = 'flex';
    document.getElementById('inputModalValue').focus();
    inputCallback = callback;
}
function closeInputModal() { document.getElementById('inputModal').style.display = 'none'; inputCallback = null; }
function submitInputModal() {
    const val = document.getElementById('inputModalValue').value.trim();
    if(val && inputCallback) inputCallback(val);
    closeInputModal();
}

async function init() {
    const savedTheme = localStorage.getItem('geekez_theme') || 'geek';
    setTheme(savedTheme);
    document.getElementById('themeSelect').value = savedTheme;
    setTimeout(() => { const s = document.getElementById('splash'); if(s) { s.style.opacity='0'; setTimeout(()=>s.remove(),500); } }, 1500); 

    globalSettings = await window.electronAPI.getSettings();
    if(!globalSettings.preProxies) globalSettings.preProxies = [];
    if(!globalSettings.subscriptions) globalSettings.subscriptions = [];

    document.getElementById('enablePreProxy').checked = globalSettings.enablePreProxy || false;
    document.getElementById('enablePreProxy').addEventListener('change', updateToolbar);
    window.electronAPI.onProfileStatus(({ id, status }) => {
        const badge = document.getElementById(`status-${id}`);
        if (badge) status === 'running' ? badge.classList.add('active') : badge.classList.remove('active');
    });
    
    checkSubscriptionUpdates();
    applyLang();
}

async function checkSubscriptionUpdates() {
    const now = Date.now();
    let updated = false;
    for(const sub of globalSettings.subscriptions) {
        if(!sub.interval || sub.interval == '0') continue;
        const intervalMs = parseInt(sub.interval) * 3600 * 1000;
        if(now - (sub.lastUpdated || 0) > intervalMs) {
            await updateSubscriptionNodes(sub);
            updated = true;
        }
    }
    if(updated) await window.electronAPI.saveSettings(globalSettings);
}

async function checkUpdates() {
    const btn = document.getElementById('btnUpdate');
    btn.style.transition = 'transform 1s';
    btn.style.transform = 'rotate(360deg)';
    showAlert(t('checkingUpdate'));
    try {
        const appRes = await window.electronAPI.invoke('check-app-update');
        if (appRes.update) { showAlert(`${t('appUpdateFound')} (v${appRes.remote})`); return; }
        const xrayRes = await window.electronAPI.invoke('check-xray-update');
        if (xrayRes.update) {
            showAlert(`${t('xrayUpdateFound')} (v${xrayRes.remote})`);
            const success = await window.electronAPI.invoke('download-xray-update', xrayRes.downloadUrl);
            if(success) showAlert(t('updateDownloaded'));
            else showAlert(t('updateError'));
            return;
        }
        showAlert(t('noUpdate'));
    } catch (e) { showAlert(t('updateError') + " " + e.message); } 
    finally { setTimeout(() => { btn.style.transform = 'none'; }, 1000); }
}

function openGithub() { window.electronAPI.invoke('open-url', 'https://github.com/EchoHS/GeekezBrowser'); } 

function filterProfiles(text) {
    searchText = text.toLowerCase();
    loadProfiles();
}

function toggleViewMode() {
    viewMode = viewMode === 'list' ? 'grid' : 'list';
    localStorage.setItem('geekez_view', viewMode);
    loadProfiles();
}

async function loadProfiles() {
    try {
        const profiles = await window.electronAPI.getProfiles();
        const runningIds = await window.electronAPI.getRunningIds(); 
        const listEl = document.getElementById('profileList');
        
        if (viewMode === 'grid') {
            listEl.classList.add('grid-view');
            document.getElementById('viewIcon').innerHTML = '<path d="M3 10h18M3 14h18M3 18h18M3 6h18" stroke-width="2"/>';
        } else {
            listEl.classList.remove('grid-view');
            document.getElementById('viewIcon').innerHTML = '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>';
        }

        listEl.innerHTML = '';
        const filtered = profiles.filter(p => p.name.toLowerCase().includes(searchText) || p.proxyStr.toLowerCase().includes(searchText));

        if (filtered.length === 0) {
            const isSearch = searchText.length > 0;
            const msg = isSearch ? "No Search Results" : t('emptyStateMsg');
            listEl.innerHTML = `<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg><div class="empty-state-text">${msg}</div></div>`;
            return;
        }

        filtered.forEach(p => {
            const fp = p.fingerprint || {};
            const screen = fp.screen || { width:0, height:0 };
            const override = p.preProxyOverride || 'default';
            const isRunning = runningIds.includes(p.id);
            const el = document.createElement('div');
            el.className = 'profile-item no-drag';
            el.innerHTML = `
                <div class="profile-info">
                    <div style="display:flex; align-items:center;"><h4>${p.name}</h4><span id="status-${p.id}" class="running-badge ${isRunning ? 'active' : ''}">${t('runningStatus')}</span></div>
                    <div class="profile-meta">
                        <span class="tag">${p.proxyStr.split('://')[0].toUpperCase() || 'N/A'}</span><span class="tag">${screen.width}x${screen.height}</span>
                        <span class="tag" style="border:1px solid var(--accent);">
                            <select class="quick-switch-select no-drag" onchange="quickUpdatePreProxy('${p.id}', this.value)">
                                <option value="default" ${override==='default'?'selected':''}>${t('qsDefault')}</option>
                                <option value="on" ${override==='on'?'selected':''}>${t('qsOn')}</option>
                                <option value="off" ${override==='off'?'selected':''}>${t('qsOff')}</option>
                            </select>
                        </span>
                    </div>
                </div>
                <div class="actions"><button onclick="launch('${p.id}')" class="no-drag">${t('launch')}</button><button class="outline no-drag" onclick="openEditModal('${p.id}')">${t('edit')}</button><button class="danger no-drag" onclick="remove('${p.id}')">${t('delete')}</button></div>
            `;
            listEl.appendChild(el);
        });
    } catch (e) { console.error(e); }
}

async function quickUpdatePreProxy(id, val) {
    const profiles = await window.electronAPI.getProfiles();
    const p = profiles.find(x => x.id === id);
    if(p) { p.preProxyOverride = val; await window.electronAPI.updateProfile(p); }
}

function openAddModal() {
    document.getElementById('addName').value = '';
    document.getElementById('addProxy').value = '';
    document.getElementById('addModal').style.display = 'flex';
}
function closeAddModal() { document.getElementById('addModal').style.display = 'none'; }

async function saveNewProfile() {
    let name = document.getElementById('addName').value;
    const proxyStr = document.getElementById('addProxy').value.trim();
    if (!name && proxyStr) { const autoName = getProxyRemark(proxyStr); if (autoName) name = autoName; }
    if(!name || !proxyStr) return showAlert(t('inputReq'));
    await window.electronAPI.saveProfile({ name, proxyStr });
    closeAddModal(); await loadProfiles();
}

async function launch(id) {
    try {
        const msg = await window.electronAPI.launchProfile(id);
        if(msg && msg.includes(':')) showAlert(msg);
    } catch(e) { showAlert('Error: ' + e.message); }
}

function remove(id) {
    showConfirm(t('confirmDel'), async () => { await window.electronAPI.deleteProfile(id); await loadProfiles(); });
}

async function openEditModal(id) {
    const profiles = await window.electronAPI.getProfiles();
    const p = profiles.find(x => x.id === id);
    if (!p) return;
    currentEditId = id;
    const fp = p.fingerprint || {};
    document.getElementById('editName').value = p.name;
    document.getElementById('editProxy').value = p.proxyStr;
    const sel = document.getElementById('editPreProxyOverride');
    sel.options[0].text = t('optDefault'); sel.options[1].text = t('optOn'); sel.options[2].text = t('optOff');
    sel.value = p.preProxyOverride || 'default';
    document.getElementById('editResW').value = fp.screen?.width || 1920;
    document.getElementById('editResH').value = fp.screen?.height || 1080;
    document.getElementById('editUA').value = fp.userAgent || '';
    document.getElementById('editGpuVendor').value = fp.webgl?.vendor || '';
    document.getElementById('editGpuRenderer').value = fp.webgl?.renderer || '';
    document.getElementById('editSeed').value = fp.noiseSeed || 0;
    document.getElementById('editModal').style.display = 'flex';
}
function closeEditModal() { document.getElementById('editModal').style.display = 'none'; currentEditId = null; }
async function saveEditProfile() {
    if (!currentEditId) return;
    const profiles = await window.electronAPI.getProfiles();
    let p = profiles.find(x => x.id === currentEditId);
    if (p) {
        p.name = document.getElementById('editName').value;
        p.proxyStr = document.getElementById('editProxy').value;
        p.preProxyOverride = document.getElementById('editPreProxyOverride').value;
        if (!p.fingerprint) p.fingerprint = {};
        p.fingerprint.screen = { width: parseInt(document.getElementById('editResW').value), height: parseInt(document.getElementById('editResH').value) };
        p.fingerprint.window = p.fingerprint.screen;
        p.fingerprint.userAgent = document.getElementById('editUA').value;
        p.fingerprint.webgl = { vendor: document.getElementById('editGpuVendor').value, renderer: document.getElementById('editGpuRenderer').value };
        p.fingerprint.noiseSeed = parseInt(document.getElementById('editSeed').value);
        await window.electronAPI.updateProfile(p);
        closeEditModal(); loadProfiles();
    }
}

async function openProxyManager() {
    globalSettings = await window.electronAPI.getSettings();
    if(!globalSettings.subscriptions) globalSettings.subscriptions = [];
    renderGroupTabs();
    document.getElementById('proxyModal').style.display = 'flex';
}
function closeProxyManager() { document.getElementById('proxyModal').style.display = 'none'; }

function renderGroupTabs() {
    const container = document.getElementById('proxyGroupTabs');
    if(!container) return;
    container.innerHTML = '';
    const manualBtn = document.createElement('div');
    manualBtn.className = `tab-btn no-drag ${currentProxyGroup === 'manual' ? 'active' : ''}`;
    manualBtn.innerText = t('groupManual');
    manualBtn.onclick = () => switchProxyGroup('manual');
    container.appendChild(manualBtn);
    globalSettings.subscriptions.forEach(sub => {
        const btn = document.createElement('div');
        btn.className = `tab-btn no-drag ${currentProxyGroup === sub.id ? 'active' : ''}`;
        btn.innerText = sub.name || 'Sub';
        btn.onclick = () => switchProxyGroup(sub.id);
        container.appendChild(btn);
    });
    renderProxyNodes();
}

function switchProxyGroup(gid) { currentProxyGroup = gid; renderGroupTabs(); }

function renderProxyNodes() {
    const modeSel = document.getElementById('proxyMode');
    if(modeSel.options.length === 0) modeSel.innerHTML = `<option value="single">${t('modeSingle')}</option><option value="balance">${t('modeBalance')}</option><option value="failover">${t('modeFailover')}</option>`;
    modeSel.value = globalSettings.mode || 'single';
    document.getElementById('notifySwitch').checked = globalSettings.notify || false;

    const list = (globalSettings.preProxies || []).filter(p => {
        if(currentProxyGroup === 'manual') return !p.groupId || p.groupId === 'manual';
        return p.groupId === currentProxyGroup;
    });

    const listEl = document.getElementById('preProxyList');
    listEl.innerHTML = '';

    const groupName = currentProxyGroup === 'manual' ? t('groupManual') : (globalSettings.subscriptions.find(s => s.id === currentProxyGroup)?.name || 'Sub');
    document.getElementById('currentGroupTitle').innerText = `${groupName} (${list.length})`;
    
    const btnTest = document.querySelector('button[onclick="testCurrentGroup()"]');
    if(btnTest) btnTest.innerText = t('btnTestGroup');
    const btnNewSub = document.querySelector('button[onclick="openSubEditModal(true)"]');
    if(btnNewSub) btnNewSub.innerText = t('btnImportSub');
    const btnEditSub = document.getElementById('btnEditSub');
    if(btnEditSub) btnEditSub.innerText = t('btnEditSub');

    const isManual = currentProxyGroup === 'manual';
    document.getElementById('manualAddArea').style.display = isManual ? 'block' : 'none';
    document.getElementById('btnEditSub').style.display = isManual ? 'none' : 'inline-block';

    list.forEach(p => {
        const div = document.createElement('div');
        div.className = 'proxy-row no-drag';
        const isSel = globalSettings.mode === 'single' && globalSettings.selectedId === p.id;
        if(isSel) div.style.background = "rgba(0,224,255,0.08)";

        const inputType = globalSettings.mode === 'single' ? 'radio' : 'checkbox';
        const checked = globalSettings.mode === 'single' ? isSel : (p.enable !== false);
        const onchange = globalSettings.mode === 'single' ? `selP('${p.id}')` : `togP('${p.id}')`;
        const inputHtml = `<input type="${inputType}" name="ps" ${checked?'checked':''} onchange="${onchange}" style="cursor:pointer; margin:0;" class="no-drag">`;
        
        let latHtml = '';
        if(p.latency !== undefined) {
            if(p.latency === -1 || p.latency === 9999) latHtml = `<span class="proxy-latency" style="border:1px solid #e74c3c; color:#e74c3c;">Fail</span>`;
            else {
                const color = p.latency < 500 ? '#27ae60' : (p.latency < 1000 ? '#f39c12' : '#e74c3c');
                latHtml = `<span class="proxy-latency" style="border:1px solid ${color}; color:${color};">${p.latency}ms</span>`;
            }
        } else {
            latHtml = `<span class="proxy-latency" style="border:1px solid var(--text-secondary); opacity:0.3;">-</span>`;
        }

        const proto = (p.url.split('://')[0] || 'UNK').toUpperCase();
        let displayRemark = p.remark;
        if (!displayRemark || displayRemark.trim() === '') displayRemark = 'Node';

        div.innerHTML = `
            <div class="proxy-left">${inputHtml}</div>
            <div class="proxy-mid">
                <div class="proxy-header"><span class="proxy-proto">${proto}</span><span class="proxy-remark" title="${displayRemark}">${displayRemark}</span>${latHtml}</div>
            </div>
            <div class="proxy-right">
                <button class="outline no-drag" onclick="testSingleProxy('${p.id}')">${t('btnTest')}</button>
                ${isManual ? `<button class="outline no-drag" onclick="editPreProxy('${p.id}')">${t('btnEdit')}</button>` : ''}
                <button class="danger no-drag" onclick="delP('${p.id}')">✕</button>
            </div>
        `;
        listEl.appendChild(div);
    });
    
    const btnDone = document.querySelector('#proxyModal button[data-i18n="done"]');
    if(btnDone) btnDone.innerText = t('done');
}

function resetProxyInput() {
    document.getElementById('editProxyId').value = '';
    document.getElementById('newProxyRemark').value = '';
    document.getElementById('newProxyUrl').value = '';
    const btn = document.getElementById('btnSaveProxy');
    btn.innerText = t('add'); btn.className = ''; 
}

function editPreProxy(id) {
    const p = globalSettings.preProxies.find(x => x.id === id);
    if (!p) return;
    document.getElementById('editProxyId').value = p.id;
    document.getElementById('newProxyRemark').value = p.remark;
    document.getElementById('newProxyUrl').value = p.url;
    const btn = document.getElementById('btnSaveProxy');
    btn.innerText = t('save'); btn.className = 'outline';
    document.getElementById('newProxyUrl').focus();
}

async function savePreProxy() {
    const id = document.getElementById('editProxyId').value;
    let remark = document.getElementById('newProxyRemark').value;
    const url = document.getElementById('newProxyUrl').value.trim();
    if(!url) return;
    if(!remark) remark = getProxyRemark(url) || 'Manual Node';
    if (!globalSettings.preProxies) globalSettings.preProxies = [];
    if (id) {
        const idx = globalSettings.preProxies.findIndex(x => x.id === id);
        if (idx > -1) { globalSettings.preProxies[idx].remark = remark; globalSettings.preProxies[idx].url = url; }
    } else {
        globalSettings.preProxies.push({ id: Date.now().toString(), remark, url, enable: true, groupId: 'manual' });
    }
    resetProxyInput(); renderProxyNodes(); await window.electronAPI.saveSettings(globalSettings);
}

// --- Subscription Management ---
function openSubEditModal(isNew) {
    const modal = document.getElementById('subEditModal');
    const headerTitle = modal.querySelector('.modal-header span'); if(headerTitle) headerTitle.innerText = t('subTitle');
    const labels = modal.querySelectorAll('label'); if(labels[0]) labels[0].innerText = t('subName'); if(labels[1]) labels[1].innerText = t('subUrl'); if(labels[2]) labels[2].innerText = t('subInterval');
    const options = document.getElementById('subInterval').options; options[0].text = t('optDisabled'); options[1].text = t('opt24h'); options[2].text = t('opt72h'); options[3].text = t('optCustom');
    const btnDel = document.getElementById('btnDelSub'); btnDel.innerText = t('btnDelSub'); btnDel.style.display = isNew ? 'none' : 'inline-block';
    const btnSave = modal.querySelector('button[onclick="saveSubscription()"]'); if(btnSave) btnSave.innerText = t('btnSaveUpdate');

    if(isNew) {
        document.getElementById('subId').value = '';
        document.getElementById('subName').value = '';
        document.getElementById('subUrl').value = '';
        document.getElementById('subInterval').value = '24';
        document.getElementById('subCustomInterval').style.display = 'none';
    }
    modal.style.display = 'flex';
    document.getElementById('subInterval').onchange = function() { document.getElementById('subCustomInterval').style.display = this.value === 'custom' ? 'block' : 'none'; }
}

function closeSubEditModal() { document.getElementById('subEditModal').style.display = 'none'; }

function editCurrentSubscription() {
    const sub = globalSettings.subscriptions.find(s => s.id === currentProxyGroup);
    if(!sub) return;
    openSubEditModal(false);
    document.getElementById('subId').value = sub.id;
    document.getElementById('subName').value = sub.name;
    document.getElementById('subUrl').value = sub.url;
    const sel = document.getElementById('subInterval');
    const cust = document.getElementById('subCustomInterval');
    if(['0','24','72'].includes(sub.interval)) { sel.value = sub.interval; cust.style.display = 'none'; }
    else { sel.value = 'custom'; cust.style.display = 'block'; cust.value = sub.interval; }
}

async function saveSubscription() {
    const id = document.getElementById('subId').value;
    const name = document.getElementById('subName').value || 'Subscription';
    const url = document.getElementById('subUrl').value.trim();
    let interval = document.getElementById('subInterval').value;
    if(interval === 'custom') interval = document.getElementById('subCustomInterval').value;
    if(!url) return;

    let sub;
    if(id) {
        sub = globalSettings.subscriptions.find(s => s.id === id);
        if(sub) { sub.name = name; sub.url = url; sub.interval = interval; }
    } else {
        function uuidv4() { return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {const r=Math.random()*16|0,v=c=='x'?r:(r&0x3|0x8);return v.toString(16);}); }
        sub = { id: `sub-${Date.now()}`, name, url, interval, lastUpdated: 0 };
        globalSettings.subscriptions.push(sub);
    }
    closeSubEditModal();
    await updateSubscriptionNodes(sub);
    currentProxyGroup = sub.id;
    renderGroupTabs();
    await window.electronAPI.saveSettings(globalSettings);
}

async function deleteSubscription() {
    const id = document.getElementById('subId').value;
    if(!id) return;
    // 修复：添加汉化
    showConfirm(t('confirmDelSub'), async () => {
        globalSettings.subscriptions = globalSettings.subscriptions.filter(s => s.id !== id);
        globalSettings.preProxies = globalSettings.preProxies.filter(p => p.groupId !== id);
        currentProxyGroup = 'manual';
        closeSubEditModal(); renderGroupTabs(); await window.electronAPI.saveSettings(globalSettings);
    });
}

async function updateSubscriptionNodes(sub) {
    try {
        const content = await window.electronAPI.invoke('fetch-url', sub.url);
        let decoded = content;
        try { if (!content.includes('://')) decoded = decodeBase64Content(content); } catch(e){}
        const lines = decoded.split(/[\r\n]+/);
        globalSettings.preProxies = globalSettings.preProxies.filter(p => p.groupId !== sub.id);
        let count = 0;
        lines.forEach(line => {
            line = line.trim();
            if (line && line.includes('://')) {
                const remark = getProxyRemark(line) || `Node ${count+1}`;
                function uuidv4() { return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {const r=Math.random()*16|0,v=c=='x'?r:(r&0x3|0x8);return v.toString(16);}); }
                globalSettings.preProxies.push({ id: uuidv4(), remark, url: line, enable: true, groupId: sub.id });
                count++;
            }
        });
        sub.lastUpdated = Date.now();
        // 修复：添加汉化
        showAlert(`${t('msgSubUpdated')} ${sub.name} (${count} ${t('msgNodes')})`);
    } catch(e) { 
        // 修复：添加汉化
        showAlert(`${t('msgUpdateFailed')} ${e.message}`); 
    }
}

async function testSingleProxy(id) {
    const p = globalSettings.preProxies.find(x => x.id === id);
    if (!p) return;
    const btn = Array.from(document.querySelectorAll('#preProxyList button.outline')).find(el => el.onclick.toString().includes(id));
    if(btn) btn.innerText = "...";
    try {
        const res = await window.electronAPI.invoke('test-proxy-latency', p.url);
        p.latency = res.success ? res.latency : -1;
        renderProxyNodes();
    } catch (e) { console.error(e); }
}

async function testCurrentGroup() {
    const list = (globalSettings.preProxies || []).filter(p => {
        if(currentProxyGroup === 'manual') return !p.groupId || p.groupId === 'manual';
        return p.groupId === currentProxyGroup;
    });
    if(list.length === 0) return;
    const promises = list.map(async (p) => {
        const res = await window.electronAPI.invoke('test-proxy-latency', p.url);
        p.latency = res.success ? res.latency : -1;
        return p;
    });
    await Promise.all(promises);
    if(globalSettings.mode === 'single') {
        let best = null, min = 99999;
        list.forEach(p => { if(p.latency > 0 && p.latency < min) { min = p.latency; best = p; } });
        if(best) { 
            globalSettings.selectedId = best.id; 
            if(document.getElementById('notifySwitch').checked) new Notification('GeekEZ', { body: `Auto-Switched: ${best.remark}` });
        }
    }
    renderProxyNodes();
}

function delP(id) { globalSettings.preProxies = globalSettings.preProxies.filter(p=>p.id!==id); renderProxyNodes(); }
function selP(id) { globalSettings.selectedId = id; renderProxyNodes(); }
function togP(id) { const p = globalSettings.preProxies.find(x=>x.id===id); if(p) p.enable = !p.enable; }

async function saveProxySettings() {
    globalSettings.mode = document.getElementById('proxyMode').value;
    globalSettings.notify = document.getElementById('notifySwitch').checked;
    await window.electronAPI.saveSettings(globalSettings);
    closeProxyManager(); updateToolbar();
}

function updateToolbar() {
    const enable = document.getElementById('enablePreProxy').checked;
    globalSettings.enablePreProxy = enable;
    window.electronAPI.saveSettings(globalSettings);
    const d = document.getElementById('currentProxyDisplay');
    if(!enable) { d.innerText = "OFF"; d.style.color = "var(--text-secondary)"; d.style.border = "1px solid var(--border)"; return; }
    d.style.color = "var(--accent)"; d.style.border = "1px solid var(--accent)";
    let count = 0;
    if(globalSettings.mode === 'single') count = globalSettings.selectedId ? 1 : 0;
    else count = (globalSettings.preProxies||[]).filter(p=>p.enable!==false).length;
    let modeText = "";
    if (globalSettings.mode === 'single') modeText = t('modeSingle');
    else if (globalSettings.mode === 'balance') modeText = t('modeBalance');
    else modeText = t('modeFailover');
    d.innerText = `${modeText} [${count}]`;
}

// Export Logic
function openExportModal() { document.getElementById('exportModal').style.display = 'flex'; } // flex
function closeExportModal() { document.getElementById('exportModal').style.display = 'none'; }
async function exportData(type) {
    closeExportModal();
    try {
        const result = await window.electronAPI.invoke('export-data', type);
        if(result) showAlert(t('msgExportSuccess')); else showAlert(t('msgNoData'));
    } catch(e) { showAlert("Export Failed: " + e.message); }
}

// Import Logic
async function importData() {
    try {
        const result = await window.electronAPI.invoke('import-data');
        if(result) {
            globalSettings = await window.electronAPI.getSettings();
            if(!globalSettings.preProxies) globalSettings.preProxies = [];
            if(!globalSettings.subscriptions) globalSettings.subscriptions = [];
            loadProfiles(); renderGroupTabs(); updateToolbar();
            showAlert(t('msgImportSuccess'));
        }
    } catch(e) { showAlert("Import Failed: " + e.message); }
}

function openImportSub() { showInput(t('importSubTitle'), importSubscription); }
async function importSubscription(url) {
    if(!url) return;
    try {
        const content = await window.electronAPI.invoke('fetch-url', url);
        if(!content) return showAlert(t('subErr'));
        let decoded = content;
        try { if (!content.includes('://')) decoded = decodeBase64Content(content); } catch(e){}
        const lines = decoded.split(/[\r\n]+/);
        let count = 0;
        if (!globalSettings.preProxies) globalSettings.preProxies = [];
        const groupId = `group-${Date.now()}`;
        const groupName = `Sub ${new Date().toLocaleTimeString()}`;
        lines.forEach(line => {
            line = line.trim();
            if (line && line.includes('://')) {
                const remark = getProxyRemark(line) || `Node ${count + 1}`;
                function uuidv4() { return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {const r=Math.random()*16|0,v=c=='x'?r:(r&0x3|0x8);return v.toString(16);}); }
                globalSettings.preProxies.push({ 
                    id: uuidv4(), remark, url: line, enable: true, groupId, groupName
                });
                count++;
            }
        });
        renderProxyNodes(); await window.electronAPI.saveSettings(globalSettings);
        // 修复：添加汉化
        showAlert(`${t('msgImported')} ${count} ${t('msgNodes')}`);
    } catch (e) { showAlert(t('subErr') + " " + e); }
}

function switchHelpTab(tabName) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    const idx = tabName === 'manual' ? 0 : 1;
    const tabs = document.querySelectorAll('#helpModal .tab-btn');
    if(tabs[idx]) tabs[idx].classList.add('active');
    document.querySelectorAll('.help-section').forEach(el => el.classList.remove('active'));
    document.getElementById(`help-${tabName}`).classList.add('active');
}
function openHelp() { switchHelpTab('manual'); document.getElementById('helpModal').style.display = 'flex'; } // flex
function closeHelp() { document.getElementById('helpModal').style.display = 'none'; }

init();