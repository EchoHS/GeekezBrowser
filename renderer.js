// i18n structure moved to i18n.js and locales/

let globalSettings = { preProxies: [], subscriptions: [], mode: 'single', enablePreProxy: false };
let currentEditId = null;
let confirmCallback = null;
let currentProxyGroup = 'manual';
let inputCallback = null;
let searchText = '';
let viewMode = localStorage.getItem('geekez_view') || 'list';

// Custom City Dropdown Initialization (Matches Timezone Logic)
function initCustomCityDropdown(inputId, dropdownId) {
    const input = document.getElementById(inputId);
    const dropdown = document.getElementById(dropdownId);

    if (!input || !dropdown) return;

    // Build cached list
    let allOptions = [];
    // 1. Add English "Auto" option
    allOptions.push({ name: "Auto (IP Based)", isAuto: true });
    // 2. Add cities
    if (window.CITY_DATA) {
        allOptions = allOptions.concat(window.CITY_DATA);
    }

    let selectedIndex = -1;

    function populateDropdown(filter = '') {
        const lowerFilter = filter.toLowerCase();
        // 如果是 "Auto" 则显示全部，否则按关键词过滤
        const shouldShowAll = filter === 'Auto (IP Based)' || filter === '';

        const filtered = shouldShowAll ? allOptions : allOptions.filter(item =>
            item.name.toLowerCase().includes(lowerFilter)
        );

        dropdown.innerHTML = filtered.map((item, index) =>
            `<div class="timezone-item" data-name="${item.name}" data-index="${index}">${item.name}</div>`
        ).join('');

        selectedIndex = -1;
    }

    function showDropdown() {
        populateDropdown(''); // Always show full list on click
        dropdown.classList.add('active');
    }

    function hideDropdown() {
        dropdown.classList.remove('active');
        selectedIndex = -1;
    }

    function selectItem(name) {
        input.value = name;
        hideDropdown();
    }

    input.addEventListener('focus', showDropdown);

    // Prevent blur from closing immediately so click can register
    // Relaxed for click-outside logic instead

    input.addEventListener('input', () => {
        populateDropdown(input.value);
        if (!dropdown.classList.contains('active')) dropdown.classList.add('active');
    });

    // Keyboard nav
    input.addEventListener('keydown', (e) => {
        const items = dropdown.querySelectorAll('.timezone-item');
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
            updateSelection(items);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            selectedIndex = Math.max(selectedIndex - 1, 0);
            updateSelection(items);
        } else if (e.key === 'Enter' && selectedIndex >= 0) {
            e.preventDefault();
            selectItem(items[selectedIndex].dataset.name);
        } else if (e.key === 'Escape') {
            hideDropdown();
        }
    });

    function updateSelection(items) {
        items.forEach((item, index) => item.classList.toggle('selected', index === selectedIndex));
        if (items[selectedIndex]) items[selectedIndex].scrollIntoView({ block: 'nearest' });
    }

    dropdown.addEventListener('click', (e) => {
        const item = e.target.closest('.timezone-item');
        if (item) selectItem(item.dataset.name);
    });

    document.addEventListener('click', (e) => {
        if (!input.contains(e.target) && !dropdown.contains(e.target)) {
            hideDropdown();
        }
    });
}

// --- Language Dropdown Helpers ---
function getLanguageName(code) {
    if (!code || code === 'auto') return "Auto (System Default)";
    if (!window.LANGUAGE_DATA) return code;
    const entry = window.LANGUAGE_DATA.find(x => x.code === code);
    return entry ? entry.name : "Auto (System Default)";
}

function getLanguageCode(name) {
    if (!name || name === "Auto (System Default)") return 'auto';
    if (!window.LANGUAGE_DATA) return 'auto';
    const entry = window.LANGUAGE_DATA.find(x => x.name === name);
    return entry ? entry.code : 'auto';
}

function initCustomLanguageDropdown(inputId, dropdownId) {
    const input = document.getElementById(inputId);
    const dropdown = document.getElementById(dropdownId);
    if (!input || !dropdown) return;

    // Use window.LANGUAGE_DATA from languages.js
    const allOptions = window.LANGUAGE_DATA || [];
    let selectedIndex = -1;

    function populateDropdown(filter = '') {
        const lowerFilter = filter.toLowerCase();
        const shouldShowAll = filter === '' || filter === 'Auto (System Default)';
        const filtered = shouldShowAll ? allOptions : allOptions.filter(item =>
            item.name.toLowerCase().includes(lowerFilter)
        );

        dropdown.innerHTML = filtered.map((item, index) =>
            `<div class="timezone-item" data-code="${item.code}" data-index="${index}">${item.name}</div>`
        ).join('');
        selectedIndex = -1;
    }

    function showDropdown() {
        populateDropdown('');
        dropdown.classList.add('active');
    }

    function hideDropdown() {
        dropdown.classList.remove('active');
        selectedIndex = -1;
    }

    function selectItem(name) {
        input.value = name;
        hideDropdown();
    }

    input.addEventListener('focus', showDropdown);
    input.addEventListener('input', () => {
        populateDropdown(input.value);
        if (!dropdown.classList.contains('active')) dropdown.classList.add('active');
    });

    input.addEventListener('keydown', (e) => {
        const items = dropdown.querySelectorAll('.timezone-item');
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
            updateSelection(items);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            selectedIndex = Math.max(selectedIndex - 1, 0);
            updateSelection(items);
        } else if (e.key === 'Enter' && selectedIndex >= 0) {
            e.preventDefault();
            selectItem(items[selectedIndex].innerText);
        } else if (e.key === 'Escape') {
            hideDropdown();
        }
    });

    function updateSelection(items) {
        items.forEach((item, index) => item.classList.toggle('selected', index === selectedIndex));
        if (items[selectedIndex]) items[selectedIndex].scrollIntoView({ block: 'nearest' });
    }

    dropdown.addEventListener('click', (e) => {
        const item = e.target.closest('.timezone-item');
        if (item) selectItem(item.innerText);
    });

    document.addEventListener('click', (e) => {
        if (!input.contains(e.target) && !dropdown.contains(e.target)) {
            hideDropdown();
        }
    });
}


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
            try { return JSON.parse(configStr).ps || ''; } catch (e) { return ''; }
        } else if (link.includes('#')) {
            return decodeURIComponent(link.split('#')[1]).trim();
        }
    } catch (e) { }
    return '';
}

function renderHelpContent() {
    let manualHTML = '';
    let aboutHTML = '';

    if (window.curLang === 'en') {
        manualHTML = `<div style="margin-bottom:25px;"><h4 style="color:var(--accent);margin-bottom:8px;">1. Create Environment</h4><p style="font-size:14px;">Enter a name and proxy link. The system auto-generates a unique fingerprint with randomized Hardware.</p></div>
         <div style="margin-bottom:25px;"><h4 style="color:var(--accent);margin-bottom:8px;">2. Launch</h4><p style="font-size:14px;">Click Launch. A green badge indicates active status. Each environment is fully isolated.</p></div>
         <div style="margin-bottom:25px;"><h4 style="color:var(--accent);margin-bottom:8px;">3. Pre-Proxy (Optional)</h4><p style="font-size:14px;">Chain proxy for IP hiding. Use TCP protocols for stability.</p></div>
         <div style="margin-bottom:25px;"><h4 style="color:var(--accent);margin-bottom:8px;">4. Best Practices</h4><p style="font-size:14px;">• Use high-quality residential IPs<br>• Keep one account per environment<br>• Avoid frequent switching<br>• Simulate real user behavior</p></div>`;
        aboutHTML = `<div style="text-align:center;margin-bottom:24px;padding:20px 0;">
            <div style="font-size:28px;font-weight:700;color:var(--text-primary);letter-spacing:1px;">Geek<span style="color:var(--accent);">EZ</span></div>
            <div style="font-size:12px;opacity:0.5;margin-top:4px;">v1.4.0 · Anti-detect Browser</div>
         </div>
         
         <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">
            <div style="width:4px;height:18px;background:linear-gradient(180deg, var(--accent), #7c3aed);border-radius:2px;"></div>
            <h4 style="margin:0;color:var(--text-primary);font-size:14px;font-weight:600;">CORE TECHNOLOGY</h4>
         </div>
         <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:24px;">
            <div style="background:var(--input-bg);padding:12px;border-radius:8px;border:1px solid var(--border);">
                <div style="font-size:11px;color:var(--accent);font-weight:600;margin-bottom:4px;">🧬 Real Chrome Kernel</div>
                <div style="font-size:11px;opacity:0.7;">Native Chrome + JS Injection</div>
            </div>
            <div style="background:var(--input-bg);padding:12px;border-radius:8px;border:1px solid var(--border);">
                <div style="font-size:11px;color:var(--accent);font-weight:600;margin-bottom:4px;">🔐 Hardware Fingerprint</div>
                <div style="font-size:11px;opacity:0.7;">CPU/Memory Randomization</div>
            </div>
            <div style="background:var(--input-bg);padding:12px;border-radius:8px;border:1px solid var(--border);">
                <div style="font-size:11px;color:var(--accent);font-weight:600;margin-bottom:4px;">🌍 60+ Languages</div>
                <div style="font-size:11px;opacity:0.7;">Timezone & Locale Spoofing</div>
            </div>
            <div style="background:var(--input-bg);padding:12px;border-radius:8px;border:1px solid var(--border);">
                <div style="font-size:11px;color:var(--accent);font-weight:600;margin-bottom:4px;">⚡ GPU Acceleration</div>
                <div style="font-size:11px;opacity:0.7;">Smooth UI Performance</div>
            </div>
         </div>

         <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">
            <div style="width:4px;height:18px;background:linear-gradient(180deg, #4CAF50, #2196F3);border-radius:2px;"></div>
            <h4 style="margin:0;color:var(--text-primary);font-size:14px;font-weight:600;">DETECTION STATUS</h4>
         </div>
         <div style="background:var(--input-bg);padding:14px;border-radius:8px;border:1px solid var(--border);margin-bottom:24px;">
            <div style="display:flex;flex-wrap:wrap;gap:16px;">
                <div style="font-size:12px;"><span style="color:#4CAF50;">✓</span> Browserscan Passed</div>
                <div style="font-size:12px;"><span style="color:#4CAF50;">✓</span> Pixelscan Clean</div>
                <div style="font-size:12px;"><span style="color:#4CAF50;">✓</span> Real TLS Fingerprint</div>
                <div style="font-size:12px;"><span style="color:#4CAF50;">✓</span> Minimal API Hook</div>
            </div>
         </div>

         <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">
            <div style="width:4px;height:18px;background:linear-gradient(180deg, #FF9800, #F44336);border-radius:2px;"></div>
            <h4 style="margin:0;color:var(--text-primary);font-size:14px;font-weight:600;">PLATFORM COMPATIBILITY</h4>
         </div>
         <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:24px;">
            <span style="background:linear-gradient(135deg, rgba(243,156,18,0.2), rgba(243,156,18,0.1));color:#f39c12;padding:6px 12px;border-radius:20px;font-size:11px;font-weight:500;">Amazon</span>
            <span style="background:linear-gradient(135deg, rgba(39,174,96,0.2), rgba(39,174,96,0.1));color:#27ae60;padding:6px 12px;border-radius:20px;font-size:11px;font-weight:500;">TikTok</span>
            <span style="background:linear-gradient(135deg, rgba(41,128,185,0.2), rgba(41,128,185,0.1));color:#2980b9;padding:6px 12px;border-radius:20px;font-size:11px;font-weight:500;">Facebook</span>
            <span style="background:linear-gradient(135deg, rgba(230,126,34,0.2), rgba(230,126,34,0.1));color:#e67e22;padding:6px 12px;border-radius:20px;font-size:11px;font-weight:500;">Shopee</span>
            <span style="background:linear-gradient(135deg, rgba(191,0,0,0.2), rgba(191,0,0,0.1));color:#bf0000;padding:6px 12px;border-radius:20px;font-size:11px;font-weight:500;">Rakuten</span>
            <span style="background:linear-gradient(135deg, rgba(241,196,15,0.2), rgba(241,196,15,0.1));color:#f1c40f;padding:6px 12px;border-radius:20px;font-size:11px;font-weight:500;">Mercado</span>
         </div>

         <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">
            <div style="width:4px;height:18px;background:linear-gradient(180deg, #9C27B0, #E91E63);border-radius:2px;"></div>
            <h4 style="margin:0;color:var(--text-primary);font-size:14px;font-weight:600;">COMMUNITY</h4>
         </div>
         <div style="background:linear-gradient(135deg, var(--input-bg), var(--card-bg));padding:16px;border-radius:8px;border:1px solid var(--border);text-align:center;">
            <div style="font-size:18px;margin-bottom:6px;">💬</div>
            <div style="font-size:12px;opacity:0.8;margin-bottom:8px;">Join our QQ Group for support</div>
            <a href="tencent://groupwpa/?subcmd=all&uin=1079216892" title="Click to join QQ Group" style="font-size:16px;font-weight:600;color:var(--accent);letter-spacing:1px;text-decoration:none;">Click to join: 1079216892</a>
         </div>`;
    } else if (window.curLang === 'vi') {
        manualHTML = `<div style="margin-bottom:25px;"><h4 style="color:var(--accent);margin-bottom:8px;">1. Tạo Cấu hình</h4><p style="font-size:14px;">Nhập tên và liên kết proxy. Hệ thống sẽ tự động tạo dấu vân tay duy nhất với Phần cứng ngẫu nhiên.</p></div>
         <div style="margin-bottom:25px;"><h4 style="color:var(--accent);margin-bottom:8px;">2. Khởi chạy</h4><p style="font-size:14px;">Nhấn Chạy. Nhãn màu xanh lá biểu thị trạng thái đang hoạt động. Mỗi môi trường hoàn toàn cô lập.</p></div>
         <div style="margin-bottom:25px;"><h4 style="color:var(--accent);margin-bottom:8px;">3. Tiền Proxy (Tùy chọn)</h4><p style="font-size:14px;">Chuỗi proxy để ẩn IP. Sử dụng giao thức TCP để ổn định.</p></div>
         <div style="margin-bottom:25px;"><h4 style="color:var(--accent);margin-bottom:8px;">4. Kinh nghiệm tốt nhất</h4><p style="font-size:14px;">• Sử dụng IP dân cư chất lượng cao<br>• Một tài khoản cho mỗi cấu hình<br>• Tránh chuyển đổi thường xuyên<br>• Mô phỏng hành vi người dùng thật</p></div>`;
        aboutHTML = `<div style="text-align:center;margin-bottom:24px;padding:20px 0;">
            <div style="font-size:28px;font-weight:700;color:var(--text-primary);letter-spacing:1px;">Geek<span style="color:var(--accent);">EZ</span></div>
            <div style="font-size:12px;opacity:0.5;margin-top:4px;">v1.4.0 · Trình duyệt Chống phát hiện</div>
         </div>
         
         <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">
            <div style="width:4px;height:18px;background:linear-gradient(180deg, var(--accent), #7c3aed);border-radius:2px;"></div>
            <h4 style="margin:0;color:var(--text-primary);font-size:14px;font-weight:600;">CÔNG NGHỆ CỐT LÕI</h4>
         </div>
         <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:24px;">
            <div style="background:var(--input-bg);padding:12px;border-radius:8px;border:1px solid var(--border);">
                <div style="font-size:11px;color:var(--accent);font-weight:600;margin-bottom:4px;">🧬 Lõi Chrome Thật</div>
                <div style="font-size:11px;opacity:0.7;">Chrome Gốc + JS Injection</div>
            </div>
            <div style="background:var(--input-bg);padding:12px;border-radius:8px;border:1px solid var(--border);">
                <div style="font-size:11px;color:var(--accent);font-weight:600;margin-bottom:4px;">🔐 Dấu vân tay Phần cứng</div>
                <div style="font-size:11px;opacity:0.7;">Ngẫu nhiên hóa CPU/Memory</div>
            </div>
            <div style="background:var(--input-bg);padding:12px;border-radius:8px;border:1px solid var(--border);">
                <div style="font-size:11px;color:var(--accent);font-weight:600;margin-bottom:4px;">🌍 Hơn 60 Ngôn ngữ</div>
                <div style="font-size:11px;opacity:0.7;">Giả lập Múi giờ & Ngôn ngữ</div>
            </div>
            <div style="background:var(--input-bg);padding:12px;border-radius:8px;border:1px solid var(--border);">
                <div style="font-size:11px;color:var(--accent);font-weight:600;margin-bottom:4px;">⚡ Tăng tốc GPU</div>
                <div style="font-size:11px;opacity:0.7;">Hiệu năng UI mượt mà</div>
            </div>
         </div>

         <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">
            <div style="width:4px;height:18px;background:linear-gradient(180deg, #4CAF50, #2196F3);border-radius:2px;"></div>
            <h4 style="margin:0;color:var(--text-primary);font-size:14px;font-weight:600;">TRẠNG THÁI PHÁT HIỆN</h4>
         </div>
         <div style="background:var(--input-bg);padding:14px;border-radius:8px;border:1px solid var(--border);margin-bottom:24px;">
            <div style="display:flex;flex-wrap:wrap;gap:16px;">
                <div style="font-size:12px;"><span style="color:#4CAF50;">✓</span> Browserscan Thông qua</div>
                <div style="font-size:12px;"><span style="color:#4CAF50;">✓</span> Pixelscan Sạch</div>
                <div style="font-size:12px;"><span style="color:#4CAF50;">✓</span> TLS Fingerprint thật</div>
                <div style="font-size:12px;"><span style="color:#4CAF50;">✓</span> Minimal API Hook</div>
            </div>
         </div>

         <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">
            <div style="width:4px;height:18px;background:linear-gradient(180deg, #FF9800, #F44336);border-radius:2px;"></div>
            <h4 style="margin:0;color:var(--text-primary);font-size:14px;font-weight:600;">ĐỘ TƯƠNG THÍCH NỀN TẢNG</h4>
         </div>
         <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:24px;">
            <span style="background:linear-gradient(135deg, rgba(243,156,18,0.2), rgba(243,156,18,0.1));color:#f39c12;padding:6px 12px;border-radius:20px;font-size:11px;font-weight:500;">Amazon</span>
            <span style="background:linear-gradient(135deg, rgba(39,174,96,0.2), rgba(39,174,96,0.1));color:#27ae60;padding:6px 12px;border-radius:20px;font-size:11px;font-weight:500;">TikTok</span>
            <span style="background:linear-gradient(135deg, rgba(41,128,185,0.2), rgba(41,128,185,0.1));color:#2980b9;padding:6px 12px;border-radius:20px;font-size:11px;font-weight:500;">Facebook</span>
            <span style="background:linear-gradient(135deg, rgba(230,126,34,0.2), rgba(230,126,34,0.1));color:#e67e22;padding:6px 12px;border-radius:20px;font-size:11px;font-weight:500;">Shopee</span>
            <span style="background:linear-gradient(135deg, rgba(191,0,0,0.2), rgba(191,0,0,0.1));color:#bf0000;padding:6px 12px;border-radius:20px;font-size:11px;font-weight:500;">Rakuten</span>
            <span style="background:linear-gradient(135deg, rgba(241,196,15,0.2), rgba(241,196,15,0.1));color:#f1c40f;padding:6px 12px;border-radius:20px;font-size:11px;font-weight:500;">Mercado</span>
         </div>

         <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">
            <div style="width:4px;height:18px;background:linear-gradient(180deg, #9C27B0, #E91E63);border-radius:2px;"></div>
            <h4 style="margin:0;color:var(--text-primary);font-size:14px;font-weight:600;">CỘNG ĐỒNG</h4>
         </div>
         <div style="background:linear-gradient(135deg, var(--input-bg), var(--card-bg));padding:16px;border-radius:8px;border:1px solid var(--border);text-align:center;">
            <div style="font-size:18px;margin-bottom:6px;">💬</div>
            <div style="font-size:12px;opacity:0.8;margin-bottom:8px;">Tham gia nhóm QQ để được hỗ trợ</div>
            <a href="tencent://groupwpa/?subcmd=all&uin=1079216892" title="Click to join QQ Group" style="font-size:16px;font-weight:600;color:var(--accent);letter-spacing:1px;text-decoration:none;">Tham gia ngay: 1079216892</a>
         </div>`;
    } else {
        manualHTML = `<div style="margin-bottom:25px;"><h4 style="color:var(--accent);margin-bottom:8px;">1. 新建环境</h4><p style="font-size:14px;">填写名称与代理链接。系统自动生成唯一指纹（硬件随机化）。</p></div>
         <div style="margin-bottom:25px;"><h4 style="color:var(--accent);margin-bottom:8px;">2. 启动环境</h4><p style="font-size:14px;">点击启动，列表中显示绿色运行标签。每个环境完全隔离。</p></div>
         <div style="margin-bottom:25px;"><h4 style="color:var(--accent);margin-bottom:8px;">3. 前置代理（可选）</h4><p style="font-size:14px;">用于隐藏本机IP或链路加速。建议使用TCP协议。</p></div>
         <div style="margin-bottom:25px;"><h4 style="color:var(--accent);margin-bottom:8px;">4. 最佳实践</h4><p style="font-size:14px;">• 使用高质量住宅IP<br>• 一个账号固定一个环境<br>• 避免频繁切换<br>• 模拟真实用户行为</p></div>`;
        aboutHTML = `<div style="text-align:center;margin-bottom:24px;padding:20px 0;">
            <div style="font-size:28px;font-weight:700;color:var(--text-primary);letter-spacing:1px;">Geek<span style="color:var(--accent);">EZ</span></div>
            <div style="font-size:12px;opacity:0.5;margin-top:4px;">v1.4.0 · 指纹浏览器</div>
         </div>
         
         <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">
            <div style="width:4px;height:18px;background:linear-gradient(180deg, var(--accent), #7c3aed);border-radius:2px;"></div>
            <h4 style="margin:0;color:var(--text-primary);font-size:14px;font-weight:600;">核心技术</h4>
         </div>
         <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:24px;">
            <div style="background:var(--input-bg);padding:12px;border-radius:8px;border:1px solid var(--border);">
                <div style="font-size:11px;color:var(--accent);font-weight:600;margin-bottom:4px;">🧬 真实 Chrome 内核</div>
                <div style="font-size:11px;opacity:0.7;">原生内核 + JS 注入</div>
            </div>
            <div style="background:var(--input-bg);padding:12px;border-radius:8px;border:1px solid var(--border);">
                <div style="font-size:11px;color:var(--accent);font-weight:600;margin-bottom:4px;">🔐 硬件指纹随机化</div>
                <div style="font-size:11px;opacity:0.7;">CPU/内存完全随机</div>
            </div>
            <div style="background:var(--input-bg);padding:12px;border-radius:8px;border:1px solid var(--border);">
                <div style="font-size:11px;color:var(--accent);font-weight:600;margin-bottom:4px;">🌍 60+ 语言适配</div>
                <div style="font-size:11px;opacity:0.7;">时区与语言完美伪装</div>
            </div>
            <div style="background:var(--input-bg);padding:12px;border-radius:8px;border:1px solid var(--border);">
                <div style="font-size:11px;color:var(--accent);font-weight:600;margin-bottom:4px;">⚡ GPU 硬件加速</div>
                <div style="font-size:11px;opacity:0.7;">流畅 UI 渲染体验</div>
            </div>
         </div>

         <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">
            <div style="width:4px;height:18px;background:linear-gradient(180deg, #4CAF50, #2196F3);border-radius:2px;"></div>
            <h4 style="margin:0;color:var(--text-primary);font-size:14px;font-weight:600;">检测状态</h4>
         </div>
         <div style="background:var(--input-bg);padding:14px;border-radius:8px;border:1px solid var(--border);margin-bottom:24px;">
            <div style="display:flex;flex-wrap:wrap;gap:16px;">
                <div style="font-size:12px;"><span style="color:#4CAF50;">✓</span> Browserscan 全绿</div>
                <div style="font-size:12px;"><span style="color:#4CAF50;">✓</span> Pixelscan 无检测</div>
                <div style="font-size:12px;"><span style="color:#4CAF50;">✓</span> TLS 指纹真实</div>
                <div style="font-size:12px;"><span style="color:#4CAF50;">✓</span> 最小化 API Hook</div>
            </div>
         </div>

         <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">
            <div style="width:4px;height:18px;background:linear-gradient(180deg, #FF9800, #F44336);border-radius:2px;"></div>
            <h4 style="margin:0;color:var(--text-primary);font-size:14px;font-weight:600;">平台适配</h4>
         </div>
         <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:24px;">
            <span style="background:linear-gradient(135deg, rgba(243,156,18,0.2), rgba(243,156,18,0.1));color:#f39c12;padding:6px 12px;border-radius:20px;font-size:11px;font-weight:500;">Amazon</span>
            <span style="background:linear-gradient(135deg, rgba(39,174,96,0.2), rgba(39,174,96,0.1));color:#27ae60;padding:6px 12px;border-radius:20px;font-size:11px;font-weight:500;">TikTok</span>
            <span style="background:linear-gradient(135deg, rgba(41,128,185,0.2), rgba(41,128,185,0.1));color:#2980b9;padding:6px 12px;border-radius:20px;font-size:11px;font-weight:500;">Facebook</span>
            <span style="background:linear-gradient(135deg, rgba(230,126,34,0.2), rgba(230,126,34,0.1));color:#e67e22;padding:6px 12px;border-radius:20px;font-size:11px;font-weight:500;">虾皮</span>
            <span style="background:linear-gradient(135deg, rgba(191,0,0,0.2), rgba(191,0,0,0.1));color:#bf0000;padding:6px 12px;border-radius:20px;font-size:11px;font-weight:500;">乐天</span>
            <span style="background:linear-gradient(135deg, rgba(241,196,15,0.2), rgba(241,196,15,0.1));color:#f1c40f;padding:6px 12px;border-radius:20px;font-size:11px;font-weight:500;">美客多</span>
         </div>

         <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">
            <div style="width:4px;height:18px;background:linear-gradient(180deg, #9C27B0, #E91E63);border-radius:2px;"></div>
            <h4 style="margin:0;color:var(--text-primary);font-size:14px;font-weight:600;">交流社群</h4>
         </div>
         <div style="background:linear-gradient(135deg, var(--input-bg), var(--card-bg));padding:16px;border-radius:8px;border:1px solid var(--border);text-align:center;">
            <div style="font-size:18px;margin-bottom:6px;">💬</div>
            <div style="font-size:12px;opacity:0.8;margin-bottom:8px;">加入 QQ 群获取支持与交流</div>
            <a href="tencent://groupwpa/?subcmd=all&uin=1079216892" title="点击加入QQ群" style="font-size:16px;font-weight:600;color:var(--accent);letter-spacing:1px;text-decoration:none;">点击加入：1079216892</a>
         </div>`;
    }

    const manualEl = document.getElementById('help-manual');
    const aboutEl = document.getElementById('help-about');
    if (manualEl) manualEl.innerHTML = manualHTML;
    if (aboutEl) aboutEl.innerHTML = aboutHTML;
}

function applyLang() {
    document.querySelectorAll('[data-i18n]').forEach(el => { el.innerText = t(el.getAttribute('data-i18n')); });
    document.querySelectorAll('.running-badge').forEach(el => { el.innerText = t('runningStatus'); });
    const themeSel = document.getElementById('themeSelect');
    if (themeSel) { themeSel.options[0].text = t('themeGeek'); themeSel.options[1].text = t('themeLight'); themeSel.options[2].text = t('themeDark'); }
    
    // Update language button label
    const langBtn = document.querySelector('.lang-btn');
    if (langBtn) {
        langBtn.innerText = curLang.toUpperCase();
    }

    renderHelpContent();
    updateToolbar(); loadProfiles(); renderGroupTabs();
}

function toggleLang() {
    if (curLang === 'cn') curLang = 'en';
    else if (curLang === 'en') curLang = 'vi';
    else curLang = 'cn';
    
    localStorage.setItem('geekez_lang', curLang);
    applyLang();
}

function setTheme(themeName) {
    document.body.setAttribute('data-theme', themeName);
    localStorage.setItem('geekez_theme', themeName);
    const themeColors = {
        'geek': { bg: '#1e1e2d', symbol: '#ffffff' },
        'light': { bg: '#f0f2f5', symbol: '#000000' },
        'dark': { bg: '#121212', symbol: '#ffffff' }
    };
    const colors = themeColors[themeName] || themeColors['geek'];
    window.electronAPI.invoke('set-title-bar-color', colors);
}

// Show Alert (supports loading state)
function showAlert(msg, showBtn = true) {
    document.getElementById('alertMsg').innerText = msg;
    const btn = document.getElementById('alertBtn');
    if (btn) btn.style.display = showBtn ? 'block' : 'none';
    document.getElementById('alertModal').style.display = 'flex';
}
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
    if (val && inputCallback) inputCallback(val);
    closeInputModal();
}

async function init() {
    const savedTheme = localStorage.getItem('geekez_theme') || 'geek';
    setTheme(savedTheme);
    document.getElementById('themeSelect').value = savedTheme;
    setTimeout(() => { const s = document.getElementById('splash'); if (s) { s.style.opacity = '0'; setTimeout(() => s.remove(), 500); } }, 1500);

    globalSettings = await window.electronAPI.getSettings();
    if (!globalSettings.preProxies) globalSettings.preProxies = [];
    if (!globalSettings.subscriptions) globalSettings.subscriptions = [];

    document.getElementById('enablePreProxy').checked = globalSettings.enablePreProxy || false;
    document.getElementById('enablePreProxy').addEventListener('change', updateToolbar);
    window.electronAPI.onProfileStatus(({ id, status }) => {
        const badge = document.getElementById(`status-${id}`);
        if (badge) status === 'running' ? badge.classList.add('active') : badge.classList.remove('active');
    });

    // API event listeners for remote refresh and launch
    window.electronAPI.onRefreshProfiles(() => {
        console.log('API triggered profile refresh');
        loadProfiles();
    });

    window.electronAPI.onApiLaunchProfile((id) => {
        console.log('API triggered launch for:', id);
        launch(id);
    });

    // 核心修复：版本号注入
    const info = await window.electronAPI.invoke('get-app-info');
    const verSpan = document.getElementById('app-version');
    if (verSpan) verSpan.innerText = `v${info.version}`;

    checkSubscriptionUpdates();
    applyLang();

    // Load timezones after DOM is ready - Custom Dropdown
    if (typeof window.TIMEZONES !== 'undefined' && Array.isArray(window.TIMEZONES)) {
        initCustomTimezoneDropdown('addTimezone', 'addTimezoneDropdown');
        initCustomTimezoneDropdown('editTimezone', 'editTimezoneDropdown');
    }

    // Check for updates silently on startup
    checkUpdatesSilent();
}


async function checkSubscriptionUpdates() {
    const now = Date.now();
    let updated = false;
    for (const sub of globalSettings.subscriptions) {
        if (!sub.interval || sub.interval == '0') continue;
        const intervalMs = parseInt(sub.interval) * 3600 * 1000;
        if (now - (sub.lastUpdated || 0) > intervalMs) {
            await updateSubscriptionNodes(sub);
            updated = true;
        }
    }
    if (updated) await window.electronAPI.saveSettings(globalSettings);
}

async function checkUpdates() {
    const btn = document.getElementById('btnUpdate');
    btn.style.transition = 'transform 1s';
    btn.style.transform = 'rotate(360deg)';

    // Show "Checking..." without button
    showAlert(t('checkingUpdate'), false);

    try {
        const appRes = await window.electronAPI.invoke('check-app-update');

        // Hide alert modal first to avoid conflict with showConfirm or to refresh state
        document.getElementById('alertModal').style.display = 'none';

        if (appRes.update) {
            // Found App Update -> Show Confirm with Skip option
            showUpdateConfirm(appRes.remote, appRes.url, appRes.notes);
            return;
        }

        const xrayRes = await window.electronAPI.invoke('check-xray-update');
        if (xrayRes.update) {
            showAlert(`${t('xrayUpdateFound')} (v${xrayRes.remote})`); // Shows OK button
            const success = await window.electronAPI.invoke('download-xray-update', xrayRes.downloadUrl);
            if (success) showAlert(t('updateDownloaded'));
            else showAlert(t('updateError'));
            return;
        }

        // No Update -> Show Alert with OK button
        showAlert(t('noUpdate'));

        // Clear badge if no update found after manual check
        btn.classList.remove('has-update');
    } catch (e) {
        showAlert(t('updateError') + " " + e.message);
    } finally {
        setTimeout(() => { btn.style.transform = 'none'; }, 1000);
    }
}

async function checkUpdatesSilent() {
    try {
        const appRes = await window.electronAPI.invoke('check-app-update');
        if (appRes.update) {
            // Check if this version was skipped
            const skippedVersion = localStorage.getItem('geekez_skipped_version');
            if (skippedVersion === appRes.remote) {
                console.log(`Version ${appRes.remote} was skipped, not showing update notification`);
                return;
            }

            const btn = document.getElementById('btnUpdate');
            if (btn) btn.classList.add('has-update');

            // Auto popup for App update with Skip option
            showUpdateConfirm(appRes.remote, appRes.url, appRes.notes);
            return;
        }
        const xrayRes = await window.electronAPI.invoke('check-xray-update');
        if (xrayRes.update) {
            const btn = document.getElementById('btnUpdate');
            if (btn) btn.classList.add('has-update');
        }
    } catch (e) {
        console.error('Silent update check failed:', e);
    }
}

// Simple markdown parser for release notes
function parseMarkdown(md) {
    if (!md) return '';
    return md
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') // Escape HTML
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // Bold
        .replace(/\*(.*?)\*/g, '<em>$1</em>') // Italic
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="#" onclick="window.electronAPI.invoke(\'open-url\', \'$2\'); return false;" style="color:var(--accent);text-decoration:none;">$1</a>') // Links
        .replace(/^\s*-\s+(.*)$/gm, '<li>$1</li>') // List items
        .replace(/(<li>.*<\/li>)/s, '<ul style="padding-left: 20px; margin: 5px 0;">$1</ul>') // Wrap lists
        .replace(/\n\n/g, '<br><br>') // Paragraphs
        .replace(/\n/g, '<br>'); // Line breaks
}

// Show update confirm dialog with Skip option
function showUpdateConfirm(version, url, notes) {
    const modal = document.getElementById('confirmModal');
    const msgEl = document.getElementById('confirmMsg');
    const notesEl = document.getElementById('confirmNotes');
    const yesBtn = document.getElementById('confirmYes');
    const noBtn = document.getElementById('confirmNo');

    msgEl.innerHTML = `${t('appUpdateFound')} (v${version})`;

    if (notes) {
        notesEl.innerHTML = parseMarkdown(notes);
        notesEl.style.display = 'block';
    } else {
        notesEl.style.display = 'none';
    }

    // Update button - go to download page
    yesBtn.textContent = t('goDownload') || '前往下载';
    yesBtn.onclick = () => {
        modal.style.display = 'none';
        window.electronAPI.invoke('open-url', url);
    };

    // Skip button - save skipped version
    noBtn.textContent = t('skipVersion') || '跳过此版本';
    noBtn.onclick = () => {
        localStorage.setItem('geekez_skipped_version', version);
        modal.style.display = 'none';
        showAlert(t('versionSkipped') || `已跳过 v${version} 版本更新`);
    };

    modal.style.display = 'flex';
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

// 简单的颜色生成器
function stringToColor(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
    return '#' + "00000".substring(0, 6 - c.length) + c;
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
        const filtered = profiles.filter(p => {
            const text = searchText;
            // 搜索逻辑增强：支持搜标签
            return p.name.toLowerCase().includes(text) ||
                p.proxyStr.toLowerCase().includes(text) ||
                (p.tags && p.tags.some(t => t.toLowerCase().includes(text)));
        });

        if (filtered.length === 0) {
            const isSearch = searchText.length > 0;
            const msg = isSearch ? t('noSearchResults') : t('emptyStateMsg');
            listEl.innerHTML = `<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg><div class="empty-state-text">${msg}</div></div>`;
            return;
        }

        filtered.forEach(p => {
            const fp = p.fingerprint || {};
            const screen = fp.screen || { width: 0, height: 0 };
            const override = p.preProxyOverride || 'default';
            const isRunning = runningIds.includes(p.id);

            // 渲染标签 HTML
            let tagsHtml = '';
            if (p.tags && p.tags.length > 0) {
                tagsHtml = p.tags.map(tag =>
                    `<span class="tag" style="background:${stringToColor(tag)}33; color:${stringToColor(tag)}; border:1px solid ${stringToColor(tag)}44;">${tag}</span>`
                ).join('');
            }

            const el = document.createElement('div');
            el.className = 'profile-item no-drag';
            el.innerHTML = `
                <div class="profile-info">
                    <div style="display:flex; align-items:center;"><h4>${p.name}</h4><span id="status-${p.id}" class="running-badge ${isRunning ? 'active' : ''}">${t('runningStatus')}</span></div>
                    <div class="profile-meta">
                        ${tagsHtml} <!-- 插入标签 -->
                        <span class="tag">${p.proxyStr.split('://')[0].toUpperCase() || 'N/A'}</span>
                        <span class="tag">${screen.width}x${screen.height}</span>
                        <span class="tag" style="border:1px solid var(--accent);">
                            <select class="quick-switch-select no-drag" onchange="quickUpdatePreProxy('${p.id}', this.value)">
                                <option value="default" ${override === 'default' ? 'selected' : ''}>${t('qsDefault')}</option>
                                <option value="on" ${override === 'on' ? 'selected' : ''}>${t('qsOn')}</option>
                                <option value="off" ${override === 'off' ? 'selected' : ''}>${t('qsOff')}</option>
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
    if (p) { p.preProxyOverride = val; await window.electronAPI.updateProfile(p); }
}

function openAddModal() {
    document.getElementById('addName').value = '';
    document.getElementById('addProxy').value = '';
    document.getElementById('addTags').value = ''; // Clear tags
    document.getElementById('addTimezone').value = 'Auto (No Change)';

    // Initialize location dropdown
    initCustomCityDropdown('addCity', 'addCityDropdown');
    document.getElementById('addCity').value = 'Auto (IP Based)';

    // Initialize language dropdown
    initCustomLanguageDropdown('addLanguage', 'addLanguageDropdown');
    document.getElementById('addLanguage').value = 'Auto (System Default)';

    document.getElementById('addModal').style.display = 'flex';
}
function closeAddModal() { document.getElementById('addModal').style.display = 'none'; }

async function saveNewProfile() {
    const nameBase = document.getElementById('addName').value.trim();
    const proxyText = document.getElementById('addProxy').value.trim();
    const tagsStr = document.getElementById('addTags').value;
    const timezoneInput = document.getElementById('addTimezone').value;
    // 将 "Auto (No Change)" 转换为 "Auto" 存储
    const timezone = timezoneInput === 'Auto (No Change)' ? 'Auto' : timezoneInput;

    const cityInput = document.getElementById('addCity').value;
    let city = null;
    let geolocation = null;
    if (cityInput && cityInput !== 'Auto (IP Based)') {
        const cityData = window.CITY_DATA ? window.CITY_DATA.find(c => c.name === cityInput) : null;
        if (cityData) {
            city = cityData.name;
            geolocation = { latitude: cityData.lat, longitude: cityData.lng, accuracy: 100 };
        }
    }

    // Get language value
    const languageInput = document.getElementById('addLanguage').value;
    const language = getLanguageCode(languageInput);

    // Get pre-proxy value
    const preProxyOverride = document.getElementById('addPreProxyOverride').value;

    // Get screen resolution
    const resW = parseInt(document.getElementById('addResW').value);
    const resH = parseInt(document.getElementById('addResH').value);
    let screen = null;
    if (!isNaN(resW) && !isNaN(resH)) {
        screen = { width: resW, height: resH };
    }

    const tags = tagsStr.split(/[,，]/).map(s => s.trim()).filter(s => s);

    // 分割多行代理链接
    const proxyLines = proxyText.split('\n').map(l => l.trim()).filter(l => l);

    if (!nameBase && proxyLines.length === 0) {
        return showAlert(t('inputReq'));
    }

    // 批量创建环境
    let createdCount = 0;
    const itemsToCreate = proxyLines.length > 0 ? proxyLines : [null]; 

    for (let i = 0; i < itemsToCreate.length; i++) {
        const proxyStr = itemsToCreate[i] || '';
        let name;

        if (!nameBase) {
            // 无名称输入，使用代理备注
            name = getProxyRemark(proxyStr) || `Profile-${String(i + 1).padStart(2, '0')}`;
        } else if (itemsToCreate.length === 1) {
            // 单个代理/无代理，使用输入名称
            name = nameBase;
        } else {
            // 多个代理，自动编号
            name = `${nameBase}-${String(i + 1).padStart(2, '0')}`;
        }

        try {
            await window.electronAPI.saveProfile({ name, proxyStr, tags, timezone, city, geolocation, language, screen, preProxyOverride });
            createdCount++;
        } catch (e) {
            console.error(`Failed to create profile ${name}:`, e);
        }
    }

    closeAddModal();
    await loadProfiles();

    if (proxyLines.length > 1) {
        showAlert(`${t('msgBatchCreated') || '批量创建成功'}: ${createdCount} ${t('msgProfiles') || '个环境'}`);
    }
}

async function launch(id) {
    try {
        const watermarkStyle = localStorage.getItem('geekez_watermark_style') || 'enhanced';
        const msg = await window.electronAPI.launchProfile(id, watermarkStyle);
        if (msg && msg.includes(':')) showAlert(msg);
    } catch (e) { showAlert('Error: ' + e.message); }
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
    document.getElementById('editTags').value = (p.tags || []).join(', ');

    // 回填时区，将 "Auto" 转换为 "Auto (No Change)" 显示
    const savedTimezone = fp.timezone || 'Auto';
    const displayTimezone = savedTimezone === 'Auto' ? 'Auto (No Change)' : savedTimezone;
    document.getElementById('editTimezone').value = displayTimezone;

    initCustomCityDropdown('editCity', 'editCityDropdown');

    // Use stored value directly or Default English Auto
    const savedCity = fp.city || "Auto (IP Based)";
    document.getElementById('editCity').value = savedCity;

    const sel = document.getElementById('editPreProxyOverride');
    sel.options[0].text = t('optDefault'); sel.options[1].text = t('optOn'); sel.options[2].text = t('optOff');
    sel.value = p.preProxyOverride || 'default';
    document.getElementById('editResW').value = fp.screen?.width || 1920;
    document.getElementById('editResH').value = fp.screen?.height || 1080;

    // Init Language Dropdown
    initCustomLanguageDropdown('editLanguage', 'editLanguageDropdown');
    document.getElementById('editLanguage').value = getLanguageName(fp.language || 'auto');

    // Load debug port and show/hide based on global setting
    const settings = await window.electronAPI.getSettings();
    const debugPortSection = document.getElementById('debugPortSection');
    if (settings.enableRemoteDebugging) {
        debugPortSection.style.display = 'block';
        document.getElementById('editDebugPort').value = p.debugPort || '';
    } else {
        debugPortSection.style.display = 'none';
    }

    // Load custom args and show/hide based on global setting
    const customArgsSection = document.getElementById('customArgsSection');
    if (settings.enableCustomArgs) {
        customArgsSection.style.display = 'block';
        document.getElementById('editCustomArgs').value = p.customArgs || '';
    } else {
        customArgsSection.style.display = 'none';
    }

    document.getElementById('editModal').style.display = 'flex';
}
function closeEditModal() { document.getElementById('editModal').style.display = 'none'; currentEditId = null; }
async function saveEditProfile() {
    console.log('[saveEditProfile] Called, currentEditId:', currentEditId);
    if (!currentEditId) return;
    const profiles = await window.electronAPI.getProfiles();
    let p = profiles.find(x => x.id === currentEditId);
    console.log('[saveEditProfile] Found profile:', p);
    if (p) {
        p.name = document.getElementById('editName').value;
        p.proxyStr = document.getElementById('editProxy').value;
        const tagsStr = document.getElementById('editTags').value;
        p.tags = tagsStr.split(/[,，]/).map(s => s.trim()).filter(s => s);
        p.preProxyOverride = document.getElementById('editPreProxyOverride').value;

        if (!p.fingerprint) p.fingerprint = {};
        p.fingerprint.screen = { width: parseInt(document.getElementById('editResW').value), height: parseInt(document.getElementById('editResH').value) };
        p.fingerprint.window = p.fingerprint.screen;
        const timezoneValue = document.getElementById('editTimezone').value;
        console.log('[saveEditProfile] Timezone value:', timezoneValue);
        p.fingerprint.timezone = timezoneValue === 'Auto (No Change)' ? 'Auto' : timezoneValue;
        console.log('[saveEditProfile] Converted timezone:', p.fingerprint.timezone);


        // Save City & Geolocation
        const cityInput = document.getElementById('editCity').value;
        if (cityInput && cityInput !== 'Auto (IP Based)') {
            const cityData = window.CITY_DATA ? window.CITY_DATA.find(c => c.name === cityInput) : null;
            if (cityData) {
                p.fingerprint.city = cityData.name;
                p.fingerprint.geolocation = { latitude: cityData.lat, longitude: cityData.lng, accuracy: 100 };
            }
        } else {
            // Auto mode: remove geolocation to let system/IP decide
            delete p.fingerprint.city;
            delete p.fingerprint.geolocation;
        }
        p.fingerprint.language = getLanguageCode(document.getElementById('editLanguage').value);

        // Save debug port if enabled
        const debugPortInput = document.getElementById('editDebugPort');
        if (debugPortInput.parentElement.style.display !== 'none') {
            const portValue = debugPortInput.value.trim();
            p.debugPort = portValue ? parseInt(portValue) : null;
        }

        // Save custom args if enabled
        const customArgsInput = document.getElementById('editCustomArgs');
        if (customArgsInput.parentElement.style.display !== 'none') {
            p.customArgs = customArgsInput.value.trim();
        }

        console.log('[saveEditProfile] Calling updateProfile...');
        await window.electronAPI.updateProfile(p);
        console.log('[saveEditProfile] Profile updated successfully');
        closeEditModal(); loadProfiles();
    }
}

async function openProxyManager() {
    globalSettings = await window.electronAPI.getSettings();
    if (!globalSettings.subscriptions) globalSettings.subscriptions = [];
    renderGroupTabs();
    document.getElementById('proxyModal').style.display = 'flex';
}
function closeProxyManager() { document.getElementById('proxyModal').style.display = 'none'; }

function renderGroupTabs() {
    const container = document.getElementById('proxyGroupTabs');
    if (!container) return;
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
    if (modeSel.options.length === 0) modeSel.innerHTML = `<option value="single">${t('modeSingle')}</option><option value="balance">${t('modeBalance')}</option><option value="failover">${t('modeFailover')}</option>`;
    modeSel.value = globalSettings.mode || 'single';
    document.getElementById('notifySwitch').checked = globalSettings.notify || false;

    const list = (globalSettings.preProxies || []).filter(p => {
        if (currentProxyGroup === 'manual') return !p.groupId || p.groupId === 'manual';
        return p.groupId === currentProxyGroup;
    });

    const listEl = document.getElementById('preProxyList');
    listEl.innerHTML = '';

    const groupName = currentProxyGroup === 'manual' ? t('groupManual') : (globalSettings.subscriptions.find(s => s.id === currentProxyGroup)?.name || 'Sub');
    document.getElementById('currentGroupTitle').innerText = `${groupName} (${list.length})`;

    const btnTest = document.querySelector('button[onclick="testCurrentGroup()"]');
    if (btnTest) btnTest.innerText = t('btnTestGroup');
    const btnNewSub = document.querySelector('button[onclick="openSubEditModal(true)"]');
    if (btnNewSub) btnNewSub.innerText = t('btnImportSub');
    const btnEditSub = document.getElementById('btnEditSub');
    if (btnEditSub) btnEditSub.innerText = t('btnEditSub');

    const isManual = currentProxyGroup === 'manual';
    document.getElementById('manualAddArea').style.display = isManual ? 'block' : 'none';
    document.getElementById('btnEditSub').style.display = isManual ? 'none' : 'inline-block';

    list.forEach(p => {
        const div = document.createElement('div');
        div.className = 'proxy-row no-drag';
        const isSel = globalSettings.mode === 'single' && globalSettings.selectedId === p.id;
        if (isSel) div.style.background = "rgba(0,224,255,0.08)";

        const inputType = globalSettings.mode === 'single' ? 'radio' : 'checkbox';
        const checked = globalSettings.mode === 'single' ? isSel : (p.enable !== false);
        const onchange = globalSettings.mode === 'single' ? `selP('${p.id}')` : `togP('${p.id}')`;
        const inputHtml = `<input type="${inputType}" name="ps" ${checked ? 'checked' : ''} onchange="${onchange}" style="cursor:pointer; margin:0;" class="no-drag">`;

        let latHtml = '';
        if (p.latency !== undefined) {
            if (p.latency === -1 || p.latency === 9999) latHtml = `<span class="proxy-latency" style="border:1px solid #e74c3c; color:#e74c3c;">Fail</span>`;
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
    if (btnDone) btnDone.innerText = t('done');
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
    if (!url) return;
    if (!remark) remark = getProxyRemark(url) || 'Manual Node';
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
    const headerTitle = modal.querySelector('.modal-header span'); if (headerTitle) headerTitle.innerText = t('subTitle');
    const labels = modal.querySelectorAll('label'); if (labels[0]) labels[0].innerText = t('subName'); if (labels[1]) labels[1].innerText = t('subUrl'); if (labels[2]) labels[2].innerText = t('subInterval');
    const options = document.getElementById('subInterval').options; options[0].text = t('optDisabled'); options[1].text = t('opt24h'); options[2].text = t('opt72h'); options[3].text = t('optCustom');
    const btnDel = document.getElementById('btnDelSub'); btnDel.innerText = t('btnDelSub'); btnDel.style.display = isNew ? 'none' : 'inline-block';
    const btnSave = modal.querySelector('button[onclick="saveSubscription()"]'); if (btnSave) btnSave.innerText = t('btnSaveUpdate');

    if (isNew) {
        document.getElementById('subId').value = '';
        document.getElementById('subName').value = '';
        document.getElementById('subUrl').value = '';
        document.getElementById('subInterval').value = '24';
        document.getElementById('subCustomInterval').style.display = 'none';
    }
    modal.style.display = 'flex';
    document.getElementById('subInterval').onchange = function () { document.getElementById('subCustomInterval').style.display = this.value === 'custom' ? 'block' : 'none'; }
}

function closeSubEditModal() { document.getElementById('subEditModal').style.display = 'none'; }

function editCurrentSubscription() {
    const sub = globalSettings.subscriptions.find(s => s.id === currentProxyGroup);
    if (!sub) return;
    openSubEditModal(false);
    document.getElementById('subId').value = sub.id;
    document.getElementById('subName').value = sub.name;
    document.getElementById('subUrl').value = sub.url;
    const sel = document.getElementById('subInterval');
    const cust = document.getElementById('subCustomInterval');
    if (['0', '24', '72'].includes(sub.interval)) { sel.value = sub.interval; cust.style.display = 'none'; }
    else { sel.value = 'custom'; cust.style.display = 'block'; cust.value = sub.interval; }
}

async function saveSubscription() {
    const id = document.getElementById('subId').value;
    const name = document.getElementById('subName').value || 'Subscription';
    const url = document.getElementById('subUrl').value.trim();
    let interval = document.getElementById('subInterval').value;
    if (interval === 'custom') interval = document.getElementById('subCustomInterval').value;
    if (!url) return;

    let sub;
    if (id) {
        sub = globalSettings.subscriptions.find(s => s.id === id);
        if (sub) { sub.name = name; sub.url = url; sub.interval = interval; }
    } else {
        function uuidv4() { return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8); return v.toString(16); }); }
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
    if (!id) return;
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
        try { if (!content.includes('://')) decoded = decodeBase64Content(content); } catch (e) { }
        const lines = decoded.split(/[\r\n]+/);
        globalSettings.preProxies = globalSettings.preProxies.filter(p => p.groupId !== sub.id);
        let count = 0;
        lines.forEach(line => {
            line = line.trim();
            if (line && line.includes('://')) {
                const remark = getProxyRemark(line) || `Node ${count + 1}`;
                function uuidv4() { return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8); return v.toString(16); }); }
                globalSettings.preProxies.push({ id: uuidv4(), remark, url: line, enable: true, groupId: sub.id });
                count++;
            }
        });
        sub.lastUpdated = Date.now();
        showAlert(`${t('msgSubUpdated')} ${sub.name} (${count} ${t('msgNodes')})`);
    } catch (e) {
        showAlert(`${t('msgUpdateFailed')} ${e.message}`);
    }
}

async function testSingleProxy(id) {
    const p = globalSettings.preProxies.find(x => x.id === id);
    if (!p) return;
    const btn = Array.from(document.querySelectorAll('#preProxyList button.outline')).find(el => el.onclick.toString().includes(id));
    if (btn) btn.innerText = "...";
    try {
        const res = await window.electronAPI.invoke('test-proxy-latency', p.url);
        p.latency = res.success ? res.latency : -1;
        renderProxyNodes();
    } catch (e) { console.error(e); }
}

async function testCurrentGroup() {
    const list = (globalSettings.preProxies || []).filter(p => {
        if (currentProxyGroup === 'manual') return !p.groupId || p.groupId === 'manual';
        return p.groupId === currentProxyGroup;
    });
    if (list.length === 0) return;

    // 先将所有测试按钮设置为加载状态
    list.forEach(p => {
        const btn = Array.from(document.querySelectorAll('#preProxyList button.outline')).find(el => el.onclick && el.onclick.toString().includes(p.id));
        if (btn) btn.innerText = "...";
    });

    const promises = list.map(async (p) => {
        const res = await window.electronAPI.invoke('test-proxy-latency', p.url);
        p.latency = res.success ? res.latency : -1;
        return p;
    });
    await Promise.all(promises);
    if (globalSettings.mode === 'single') {
        let best = null, min = 99999;
        list.forEach(p => { if (p.latency > 0 && p.latency < min) { min = p.latency; best = p; } });
        if (best) {
            globalSettings.selectedId = best.id;
            if (document.getElementById('notifySwitch').checked) new Notification('GeekEZ', { body: `Auto-Switched: ${best.remark}` });
        }
    }
    renderProxyNodes();
}

function delP(id) { globalSettings.preProxies = globalSettings.preProxies.filter(p => p.id !== id); renderProxyNodes(); }
function selP(id) { globalSettings.selectedId = id; renderProxyNodes(); }
function togP(id) { const p = globalSettings.preProxies.find(x => x.id === id); if (p) p.enable = !p.enable; }

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
    if (!enable) { d.innerText = "OFF"; d.style.color = "var(--text-secondary)"; d.style.border = "1px solid var(--border)"; return; }
    d.style.color = "var(--accent)"; d.style.border = "1px solid var(--accent)";
    let count = 0;
    if (globalSettings.mode === 'single') count = globalSettings.selectedId ? 1 : 0;
    else count = (globalSettings.preProxies || []).filter(p => p.enable !== false).length;
    let modeText = "";
    if (globalSettings.mode === 'single') modeText = t('modeSingle');
    else if (globalSettings.mode === 'balance') modeText = t('modeBalance');
    else modeText = t('modeFailover');
    d.innerText = `${modeText} [${count}]`;
}

// Export Logic (重构版)
let exportType = '';
let selectedProfileIds = [];
let passwordCallback = null;
let isImportMode = false;

function openExportModal() { document.getElementById('exportModal').style.display = 'flex'; }
function closeExportModal() { document.getElementById('exportModal').style.display = 'none'; }

async function openExportSelectModal(type) {
    exportType = type;
    closeExportModal();

    // 如果是仅导出代理，不需要选择环境
    if (type === 'proxies') {
        try {
            const result = await window.electronAPI.invoke('export-selected-data', { type: 'proxies', profileIds: [] });
            if (result.success) showAlert(t('msgExportSuccess'));
            else if (!result.cancelled) showAlert(result.error || t('msgNoData'));
        } catch (e) { showAlert("Export Failed: " + e.message); }
        return;
    }

    // 获取环境列表
    const profiles = await window.electronAPI.invoke('get-export-profiles');

    if (profiles.length === 0) {
        showAlert(t('expNoProfiles'));
        return;
    }

    // 渲染选择器
    renderExportProfileList(profiles);

    // 默认全选
    selectedProfileIds = profiles.map(p => p.id);
    document.getElementById('exportSelectAll').checked = true;
    updateExportSelectedCount(profiles.length);

    // 更新标题（使用 i18n）
    const titleSpan = document.querySelector('#exportSelectTitle span[data-i18n]');
    const iconSpan = document.querySelector('#exportSelectTitle span:first-child');
    if (type === 'full-backup') {
        if (titleSpan) titleSpan.innerText = t('expSelectTitleFull');
        if (iconSpan) iconSpan.innerText = '🔐';
    } else {
        if (titleSpan) titleSpan.innerText = t('expSelectTitle');
        if (iconSpan) iconSpan.innerText = '📦';
    }

    document.getElementById('exportSelectModal').style.display = 'flex';
}

function closeExportSelectModal() {
    document.getElementById('exportSelectModal').style.display = 'none';
    selectedProfileIds = [];
}

function renderExportProfileList(profiles) {
    const container = document.getElementById('exportProfileList');
    if (!profiles || profiles.length === 0) {
        container.innerHTML = `<div style="padding: 30px; text-align: center; color: var(--text-secondary);">
            <div style="font-size: 24px; margin-bottom: 8px;">📭</div>
            <div>${t('expNoProfiles')}</div>
        </div>`;
        return;
    }

    let html = '';
    for (const p of profiles) {
        const tagsHtml = (p.tags || []).map(tag =>
            `<span style="font-size: 9px; padding: 2px 6px; background: ${stringToColor(tag)}22; color: ${stringToColor(tag)}; border-radius: 4px; margin-left: 6px; font-weight: 500;">${tag}</span>`
        ).join('');

        html += `<label style="display: flex; align-items: center; padding: 10px 12px; margin: 4px 0; background: rgba(255,255,255,0.03); border: 1px solid transparent; border-radius: 8px; cursor: pointer; transition: all 0.15s ease;" 
            onmouseover="this.style.background='rgba(0,255,255,0.05)'; this.style.borderColor='var(--accent)';" 
            onmouseout="this.style.background='rgba(255,255,255,0.03)'; this.style.borderColor='transparent';">
            <input type="checkbox" id="export-${p.id}" checked 
                onchange="handleExportCheckboxChange('${p.id}', this.checked)"
                style="width: 18px; height: 18px; margin-right: 12px; cursor: pointer; accent-color: var(--accent); flex-shrink: 0;">
            <div style="flex: 1; min-width: 0;">
                <div style="font-size: 13px; font-weight: 500; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${p.name || t('expNoProfiles')}</div>
            </div>
            <div style="display: flex; align-items: center; flex-shrink: 0;">${tagsHtml}</div>
        </label>`;
    }
    container.innerHTML = html;
}

// 处理单个 checkbox 变化
function handleExportCheckboxChange(id, checked) {
    if (checked) {
        if (!selectedProfileIds.includes(id)) selectedProfileIds.push(id);
    } else {
        selectedProfileIds = selectedProfileIds.filter(pid => pid !== id);
    }

    // 更新全选状态
    const allCheckboxes = document.querySelectorAll('#exportProfileList input[type="checkbox"]');
    const allChecked = Array.from(allCheckboxes).every(cb => cb.checked);
    document.getElementById('exportSelectAll').checked = allChecked;

    updateExportSelectedCount(allCheckboxes.length);
}

function toggleExportProfile(id) {
    const checkbox = document.getElementById(`export-${id}`);
    checkbox.checked = !checkbox.checked;

    if (checkbox.checked) {
        if (!selectedProfileIds.includes(id)) selectedProfileIds.push(id);
    } else {
        selectedProfileIds = selectedProfileIds.filter(pid => pid !== id);
    }

    // 更新全选状态
    const allCheckboxes = document.querySelectorAll('#exportProfileList input[type="checkbox"]');
    const allChecked = Array.from(allCheckboxes).every(cb => cb.checked);
    document.getElementById('exportSelectAll').checked = allChecked;

    updateExportSelectedCount(allCheckboxes.length);
}

function toggleExportSelectAll() {
    const selectAll = document.getElementById('exportSelectAll').checked;
    const checkboxes = document.querySelectorAll('#exportProfileList input[type="checkbox"]');

    checkboxes.forEach(cb => {
        cb.checked = selectAll;
        const id = cb.id.replace('export-', '');
        if (selectAll) {
            if (!selectedProfileIds.includes(id)) selectedProfileIds.push(id);
        }
    });

    if (!selectAll) selectedProfileIds = [];

    updateExportSelectedCount(checkboxes.length);
}

function updateExportSelectedCount(total) {
    document.getElementById('exportSelectedCount').innerText = `${selectedProfileIds.length}/${total}`;
}

async function confirmExport() {
    if (selectedProfileIds.length === 0) {
        showAlert('请至少选择一个环境');
        return;
    }

    // 保存选中的 ID（因为 closeExportSelectModal 会清空）
    const idsToExport = [...selectedProfileIds];
    const typeToExport = exportType;

    closeExportSelectModal();

    if (typeToExport === 'full-backup') {
        // 保存到全局变量供密码提交后使用
        selectedProfileIds = idsToExport;
        isImportMode = false;
        openPasswordModal('设置备份密码', true);
    } else {
        // 直接导出
        try {
            const result = await window.electronAPI.invoke('export-selected-data', {
                type: typeToExport,
                profileIds: idsToExport
            });
            if (result.success) {
                showAlert(`导出成功！共 ${result.count} 个环境`);
            } else if (!result.cancelled) {
                showAlert(result.error || t('msgNoData'));
            }
        } catch (e) {
            showAlert("Export Failed: " + e.message);
        }
    }
}

// 密码模态框
function openPasswordModal(title, showConfirm) {
    document.getElementById('passwordModalTitle').innerText = title;
    document.getElementById('backupPassword').value = '';
    document.getElementById('backupPasswordConfirm').value = '';

    // 导入时不需要确认密码
    const confirmLabel = document.getElementById('confirmPasswordLabel');
    const confirmInput = document.getElementById('backupPasswordConfirm');
    if (showConfirm) {
        confirmLabel.style.display = 'block';
        confirmInput.style.display = 'block';
    } else {
        confirmLabel.style.display = 'none';
        confirmInput.style.display = 'none';
    }

    document.getElementById('passwordModal').style.display = 'flex';
    document.getElementById('backupPassword').focus();
}

function closePasswordModal() {
    document.getElementById('passwordModal').style.display = 'none';
    passwordCallback = null;
}

async function submitPassword() {
    const password = document.getElementById('backupPassword').value;
    const confirmPassword = document.getElementById('backupPasswordConfirm').value;

    if (!password) {
        showAlert('请输入密码');
        return;
    }

    if (!isImportMode && password !== confirmPassword) {
        showAlert('两次输入的密码不一致');
        return;
    }

    if (password.length < 4) {
        showAlert('密码长度至少 4 位');
        return;
    }

    closePasswordModal();

    if (isImportMode) {
        // 导入完整备份
        try {
            const result = await window.electronAPI.invoke('import-full-backup', { password });
            if (result.success) {
                showAlert(`导入成功！共 ${result.count} 个环境`);
                loadProfiles();
                globalSettings = await window.electronAPI.getSettings();
                renderGroupTabs();
                updateToolbar();
            } else if (!result.cancelled) {
                showAlert(result.error || '导入失败');
            }
        } catch (e) {
            showAlert("Import Failed: " + e.message);
        }
    } else {
        // 导出完整备份
        try {
            const result = await window.electronAPI.invoke('export-full-backup', {
                profileIds: selectedProfileIds,
                password
            });
            if (result.success) {
                showAlert(`完整备份成功！共 ${result.count} 个环境`);
            } else if (!result.cancelled) {
                showAlert(result.error || '备份失败');
            }
        } catch (e) {
            showAlert("Backup Failed: " + e.message);
        }
    }
}

// Import Logic
async function importData() {
    try {
        const result = await window.electronAPI.invoke('import-data');
        if (result) {
            globalSettings = await window.electronAPI.getSettings();
            if (!globalSettings.preProxies) globalSettings.preProxies = [];
            if (!globalSettings.subscriptions) globalSettings.subscriptions = [];
            loadProfiles(); renderGroupTabs(); updateToolbar();
            showAlert(t('msgImportSuccess'));
        }
    } catch (e) { showAlert("Import Failed: " + e.message); }
}

// 导入完整备份（.geekez 文件）
async function importFullBackup() {
    isImportMode = true;
    openPasswordModal('输入备份密码', false);
}

// Import Menu Toggle
function toggleImportMenu() {
    const menu = document.getElementById('importMenu');
    menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
}

function closeImportMenu() {
    document.getElementById('importMenu').style.display = 'none';
}

// 点击其他地方关闭菜单
document.addEventListener('click', (e) => {
    const menu = document.getElementById('importMenu');
    const btn = document.getElementById('importBtn');
    if (menu && btn && !menu.contains(e.target) && !btn.contains(e.target)) {
        menu.style.display = 'none';
    }
});

function openImportSub() { showInput(t('importSubTitle'), importSubscription); }
async function importSubscription(url) {
    if (!url) return;
    try {
        const content = await window.electronAPI.invoke('fetch-url', url);
        if (!content) return showAlert(t('subErr'));
        let decoded = content;
        try { if (!content.includes('://')) decoded = decodeBase64Content(content); } catch (e) { }
        const lines = decoded.split(/[\r\n]+/);
        let count = 0;
        if (!globalSettings.preProxies) globalSettings.preProxies = [];
        const groupId = `group-${Date.now()}`;
        const groupName = `Sub ${new Date().toLocaleTimeString()}`;
        lines.forEach(line => {
            line = line.trim();
            if (line && line.includes('://')) {
                const remark = getProxyRemark(line) || `Node ${count + 1}`;
                function uuidv4() { return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8); return v.toString(16); }); }
                globalSettings.preProxies.push({
                    id: uuidv4(), remark, url: line, enable: true, groupId, groupName
                });
                count++;
            }
        });
        renderProxyNodes(); await window.electronAPI.saveSettings(globalSettings);
        showAlert(`${t('msgImported')} ${count} ${t('msgNodes')}`);
    } catch (e) { showAlert(t('subErr') + " " + e); }
}

function switchHelpTab(tabName) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    const idx = tabName === 'manual' ? 0 : 1;
    const tabs = document.querySelectorAll('#helpModal .tab-btn');
    if (tabs[idx]) tabs[idx].classList.add('active');
    document.querySelectorAll('.help-section').forEach(el => el.classList.remove('active'));
    document.getElementById(`help-${tabName}`).classList.add('active');
}
// ============================================================================
// Settings Modal Functions
// ============================================================================
function openSettings() {
    document.getElementById('settingsModal').style.display = 'flex';
    loadUserExtensions();
    loadWatermarkStyle();
    loadRemoteDebuggingSetting();
    loadCustomArgsSetting();
    loadApiServerSetting();
    loadDataPathSetting();
}
function closeSettings() {
    document.getElementById('settingsModal').style.display = 'none';
}

// Watermark Style Functions
function loadWatermarkStyle() {
    const style = localStorage.getItem('geekez_watermark_style') || 'enhanced';
    const radios = document.getElementsByName('watermarkStyle');
    radios.forEach(radio => {
        if (radio.value === style) {
            radio.checked = true;
            radio.parentElement.style.borderColor = 'var(--accent)';
        } else {
            radio.parentElement.style.borderColor = 'var(--border)';
        }
    });
}

function saveWatermarkStyle(style) {
    localStorage.setItem('geekez_watermark_style', style);
    const radios = document.getElementsByName('watermarkStyle');
    radios.forEach(radio => {
        if (radio.checked) {
            radio.parentElement.style.borderColor = 'var(--accent)';
        } else {
            radio.parentElement.style.borderColor = 'var(--border)';
        }
    });
    showAlert('水印样式已保存，重启环境后生效');
}

// --- 自定义数据目录 ---
async function loadDataPathSetting() {
    try {
        const info = await window.electronAPI.invoke('get-data-path-info');
        document.getElementById('currentDataPath').textContent = info.currentPath;
        document.getElementById('resetDataPathBtn').style.display = info.isCustom ? 'inline-block' : 'none';
    } catch (e) {
        console.error('Failed to load data path:', e);
    }
}

async function selectDataDirectory() {
    const newPath = await window.electronAPI.invoke('select-data-directory');
    if (!newPath) return;

    // 确认迁移
    const migrate = confirm(t('dataPathConfirmMigrate') || '是否将现有数据迁移到新目录？\n\n选择"确定"迁移数据\n选择"取消"仅更改路径（不迁移）');

    showAlert(t('dataPathMigrating') || '正在迁移数据，请稍候...');

    const result = await window.electronAPI.invoke('set-data-directory', { newPath, migrate });

    if (result.success) {
        document.getElementById('currentDataPath').textContent = newPath;
        document.getElementById('resetDataPathBtn').style.display = 'inline-block';
        document.getElementById('dataPathWarning').style.display = 'block';
        showAlert(t('dataPathSuccess') || '数据目录已更改，请重启应用');
    } else {
        showAlert((t('dataPathError') || '更改失败: ') + result.error);
    }
}

async function resetDataDirectory() {
    if (!confirm(t('dataPathConfirmReset') || '确定要恢复默认数据目录吗？\n\n注意：这不会迁移数据，您需要手动处理自定义目录中的数据。')) {
        return;
    }

    const result = await window.electronAPI.invoke('reset-data-directory');

    if (result.success) {
        const info = await window.electronAPI.invoke('get-data-path-info');
        document.getElementById('currentDataPath').textContent = info.defaultPath;
        document.getElementById('resetDataPathBtn').style.display = 'none';
        document.getElementById('dataPathWarning').style.display = 'block';
        showAlert(t('dataPathResetSuccess') || '已恢复默认目录，请重启应用');
    } else {
        showAlert((t('dataPathError') || '操作失败: ') + result.error);
    }
}

async function saveRemoteDebuggingSetting(enabled) {
    const settings = await window.electronAPI.getSettings();
    settings.enableRemoteDebugging = enabled;
    await window.electronAPI.saveSettings(settings);
    showAlert(enabled ? '远程调试已启用，编辑环境时可设置端口' : '远程调试已禁用');
}

// Unified toggle handler for developer features
function handleDevToggle(checkbox) {
    const toggleSwitch = checkbox.closest('.toggle-switch');
    const track = toggleSwitch?.querySelector('.toggle-track');
    const knob = toggleSwitch?.querySelector('.toggle-knob');

    // Animate toggle - update track color and knob position
    if (track) {
        track.style.background = checkbox.checked ? 'var(--accent)' : 'var(--border)';
    }
    if (knob) {
        knob.style.left = checkbox.checked ? '22px' : '2px';
    }

    // Call appropriate save function based on checkbox id
    if (checkbox.id === 'enableRemoteDebugging') {
        saveRemoteDebuggingSetting(checkbox.checked);
    } else if (checkbox.id === 'enableCustomArgs') {
        saveCustomArgsSetting(checkbox.checked);
    } else if (checkbox.id === 'enableApiServer') {
        saveApiServerSetting(checkbox.checked);
    }
}

// Update toggle visual state (for loading saved state)
function updateToggleVisual(checkbox) {
    const toggleSwitch = checkbox.closest('.toggle-switch');
    const track = toggleSwitch?.querySelector('.toggle-track');
    const knob = toggleSwitch?.querySelector('.toggle-knob');

    if (track) {
        track.style.background = checkbox.checked ? 'var(--accent)' : 'var(--border)';
    }
    if (knob) {
        knob.style.left = checkbox.checked ? '22px' : '2px';
    }
}

async function loadRemoteDebuggingSetting() {
    const settings = await window.electronAPI.getSettings();
    const checkbox = document.getElementById('enableRemoteDebugging');
    if (checkbox) {
        checkbox.checked = settings.enableRemoteDebugging || false;
        updateToggleVisual(checkbox);
    }
}

// Custom Args Settings
async function saveCustomArgsSetting(enabled) {
    const settings = await window.electronAPI.getSettings();
    settings.enableCustomArgs = enabled;
    await window.electronAPI.saveSettings(settings);
    showAlert(enabled ? t('customArgsEnabled') || '自定义启动参数已启用' : t('customArgsDisabled') || '自定义启动参数已禁用');
}

async function loadCustomArgsSetting() {
    const settings = await window.electronAPI.getSettings();
    const checkbox = document.getElementById('enableCustomArgs');
    if (checkbox) {
        checkbox.checked = settings.enableCustomArgs || false;
        updateToggleVisual(checkbox);
    }
}

// API Server Settings
async function saveApiServerSetting(enabled) {
    const settings = await window.electronAPI.getSettings();
    settings.enableApiServer = enabled;
    await window.electronAPI.saveSettings(settings);

    // Show/hide port section
    document.getElementById('apiPortSection').style.display = enabled ? 'block' : 'none';

    if (enabled) {
        // Start API server
        const port = settings.apiPort || 12138;
        const result = await window.electronAPI.invoke('start-api-server', { port });
        if (result.success) {
            document.getElementById('apiStatus').style.display = 'inline-block';
            showAlert(`${t('apiStarted') || 'API 服务已启动'}: http://localhost:${port}`);
        } else {
            showAlert((t('apiError') || 'API 启动失败: ') + result.error);
        }
    } else {
        // Stop API server
        await window.electronAPI.invoke('stop-api-server');
        document.getElementById('apiStatus').style.display = 'none';
        showAlert(t('apiStopped') || 'API 服务已停止');
    }
}

async function saveApiPort() {
    const port = parseInt(document.getElementById('apiPortInput').value) || 12138;
    if (port < 1024 || port > 65535) {
        showAlert(t('apiPortInvalid') || '端口号必须在 1024-65535 之间');
        return;
    }

    const settings = await window.electronAPI.getSettings();
    settings.apiPort = port;
    await window.electronAPI.saveSettings(settings);
    document.getElementById('apiPortDisplay').textContent = port;

    // Restart API server if enabled
    if (settings.enableApiServer) {
        await window.electronAPI.invoke('stop-api-server');
        const result = await window.electronAPI.invoke('start-api-server', { port });
        if (result.success) {
            showAlert(`${t('apiRestarted') || 'API 服务已重启'}: http://localhost:${port}`);
        }
    } else {
        showAlert(t('apiPortSaved') || 'API 端口已保存');
    }
}

async function loadApiServerSetting() {
    const settings = await window.electronAPI.getSettings();
    const checkbox = document.getElementById('enableApiServer');
    const portInput = document.getElementById('apiPortInput');
    const portDisplay = document.getElementById('apiPortDisplay');
    const portSection = document.getElementById('apiPortSection');
    const apiStatus = document.getElementById('apiStatus');

    if (checkbox) {
        checkbox.checked = settings.enableApiServer || false;
        updateToggleVisual(checkbox);
    }
    if (portInput) {
        portInput.value = settings.apiPort || 12138;
    }
    if (portDisplay) {
        portDisplay.textContent = settings.apiPort || 12138;
    }
    if (portSection) {
        portSection.style.display = settings.enableApiServer ? 'block' : 'none';
    }

    // Check if API is running
    try {
        const status = await window.electronAPI.invoke('get-api-status');
        if (apiStatus) {
            apiStatus.style.display = status.running ? 'inline-block' : 'none';
        }
    } catch (e) { }
}

function openApiDocs() {
    window.electronAPI.invoke('open-url', 'https://browser.geekez.net/docs.html#doc-api');
}

function switchSettingsTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('#settingsModal .tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');

    // Update tab content
    document.querySelectorAll('.settings-section').forEach(section => {
        section.style.display = 'none';
    });
    document.getElementById('settings-' + tabName).style.display = 'block';
}
// ============================================================================
// Extension Management Functions
// ============================================================================
async function selectExtensionFolder() {
    const path = await window.electronAPI.invoke('select-extension-folder');
    if (path) {
        await window.electronAPI.invoke('add-user-extension', path);
        await loadUserExtensions();
        showAlert(t('settingsExtAdded'));
    }
}
async function loadUserExtensions() {
    const exts = await window.electronAPI.invoke('get-user-extensions');
    const list = document.getElementById('userExtensionList');
    if (!list) return;

    if (exts.length === 0) {
        list.innerHTML = `<div style="opacity:0.5; text-align:center; padding:20px;">${t('settingsExtNoExt')}</div>`;
        return;
    }

    list.innerHTML = exts.map(ext => {
        const name = ext.split(/[\\/]/).pop();
        return `
            <div class="ext-item">
                <div>
                    <div style="font-weight:bold;">${name}</div>
                    <div style="font-size:11px; opacity:0.6;">${ext}</div>
                </div>
                <button class="danger outline" onclick="removeUserExtension('${ext.replace(/\\/g, '\\\\')}')" style="padding:4px 12px; font-size:11px;">${t('settingsExtRemove')}</button>
            </div>
        `;
    }).join('');
}
async function removeUserExtension(path) {
    await window.electronAPI.invoke('remove-user-extension', path);
    await loadUserExtensions();
    showAlert(t('settingsExtRemoved'));
}
function openHelp() { switchHelpTab('manual'); document.getElementById('helpModal').style.display = 'flex'; } // flex
function closeHelp() { document.getElementById('helpModal').style.display = 'none'; }


// Custom timezone dropdown initialization
function initCustomTimezoneDropdown(inputId, dropdownId) {
    const input = document.getElementById(inputId);
    const dropdown = document.getElementById(dropdownId);

    if (!input || !dropdown || !window.TIMEZONES) return;

    let selectedIndex = -1;

    // Populate dropdown with all timezones
    function populateDropdown(filter = '') {
        const filtered = window.TIMEZONES.filter(tz =>
            tz.toLowerCase().includes(filter.toLowerCase())
        );

        dropdown.innerHTML = filtered.map((tz, index) =>
            `<div class="timezone-item" data-value="${tz}" data-index="${index}">${tz}</div>`
        ).join('');

        selectedIndex = -1;
    }



    // Hide dropdown
    function hideDropdown() {
        dropdown.classList.remove('active');
        selectedIndex = -1;
    }

    // Select item
    function selectItem(value) {
        input.value = value;
        hideDropdown();
    }

    // Input focus - show dropdown (Show ALL options, ignore current value filter)
    input.addEventListener('focus', () => {
        populateDropdown('');
        dropdown.classList.add('active');
    });

    // Input typing - filter
    input.addEventListener('input', () => {
        populateDropdown(input.value);
        if (!dropdown.classList.contains('active')) {
            dropdown.classList.add('active');
        }
    });

    // Keyboard navigation
    input.addEventListener('keydown', (e) => {
        const items = dropdown.querySelectorAll('.timezone-item:not(.hidden)');

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
            updateSelection(items);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            selectedIndex = Math.max(selectedIndex - 1, 0);
            updateSelection(items);
        } else if (e.key === 'Enter' && selectedIndex >= 0) {
            e.preventDefault();
            selectItem(items[selectedIndex].dataset.value);
        } else if (e.key === 'Escape') {
            hideDropdown();
        }
    });

    // Update selection highlight
    function updateSelection(items) {
        items.forEach((item, index) => {
            item.classList.toggle('selected', index === selectedIndex);
        });
        if (items[selectedIndex]) {
            items[selectedIndex].scrollIntoView({ block: 'nearest' });
        }
    }

    // Click on item
    dropdown.addEventListener('click', (e) => {
        const item = e.target.closest('.timezone-item');
        if (item) {
            selectItem(item.dataset.value);
        }
    });

    // Click outside to close
    document.addEventListener('click', (e) => {
        if (!input.contains(e.target) && !dropdown.contains(e.target)) {
            hideDropdown();
        }
    });
}
init();
