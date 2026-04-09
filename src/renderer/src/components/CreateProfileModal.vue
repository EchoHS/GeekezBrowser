<template>
  <div v-show="uiStore.addModalVisible" class="modal-overlay" @mousedown.self="uiStore.closeAddModal">
    <div class="modal-content">
      <div class="modal-header">
        <span>{{ $t('newProfile') }}</span>
        <span style="cursor:pointer" @click="uiStore.closeAddModal">✕</span>
      </div>
      <div class="modal-body">
        <label class="label-tiny">{{ $t('profileName') }}</label>
        <input v-model="form.name" type="text" placeholder="Name" spellcheck="false" autocomplete="off">

        <label class="label-tiny">{{ $t('tagsLabel') }}</label>
        <input v-model="form.tags" type="text" placeholder="tiktok, fb..." spellcheck="false" autocomplete="off">

        <label class="label-tiny">{{ $t('timezoneLabel') }}</label>
        <div class="timezone-wrapper">
          <input v-model="timezoneSearch" type="text" placeholder="Type to search or select..." autocomplete="off" @focus="showTimezoneList = true">
          <div v-if="showTimezoneList" class="timezone-dropdown active">
            <div v-for="tz in filteredTimezones" :key="tz" class="timezone-item" @click="selectTimezone(tz)">
              {{ tz }}
            </div>
          </div>
        </div>

        <label class="label-tiny">{{ $t('proxyLink') }}</label>
        <textarea v-model="form.proxyStr" rows="4" placeholder="vmess://, ss://... (one per line for batch)" spellcheck="false" autocomplete="off"></textarea>
        <div class="hint-text">{{ $t('batchHint') }}</div>

        <div class="flex-row">
          <div class="flex-1">
            <label class="label-tiny">{{ $t('preProxySetting') }}</label>
            <select v-model="form.preProxyOverride">
              <option value="default">{{ $t('optDefault') }}</option>
              <option value="on">{{ $t('optOn') }}</option>
              <option value="off">{{ $t('optOff') }}</option>
            </select>
          </div>
          <div class="flex-1">
            <label class="label-tiny">{{ $t('screenRes') }}</label>
            <div class="flex-row gap-5">
              <input v-model.number="form.resW" type="number" placeholder="W">
              <input v-model.number="form.resH" type="number" placeholder="H">
            </div>
          </div>
        </div>

        <label class="label-tiny mt-10">{{ $t('locationLabel') }}</label>
        <div class="timezone-wrapper">
          <input v-model="citySearch" type="text" placeholder="Type to search city..." autocomplete="off" @focus="showCityList = true">
          <div v-if="showCityList" class="timezone-dropdown active">
            <div v-for="city in filteredCities" :key="city.name" class="timezone-item" @click="selectCity(city)">
              {{ city.name }}
            </div>
          </div>
        </div>
        <div class="hint-text">{{ $t('geoHint') }}</div>

        <label class="label-tiny mt-10">{{ $t('languageLabel') }}</label>
        <div class="timezone-wrapper">
          <input v-model="languageSearch" type="text" placeholder="Type to search language..." autocomplete="off" @focus="showLanguageList = true">
          <div v-if="showLanguageList" class="timezone-dropdown active">
            <div v-for="lang in filteredLanguages" :key="lang.code" class="timezone-item" @click="selectLanguage(lang)">
              {{ lang.name }} ({{ lang.code }})
            </div>
          </div>
        </div>
        <template v-if="showUaWebglModify">
          <label class="label-tiny">{{ $t('browserVersionPresetLabel') }}</label>
          <select v-model="form.browserVersionPreset">
            <option v-for="opt in browserVersionPresetOptions" :key="opt.value" :value="opt.value">
              {{ getOptionLabel(opt) }}
            </option>
          </select>

          <label class="label-tiny">{{ $t('webglProfileLabel') }}</label>
          <select v-model="form.webglProfile">
            <option v-for="opt in webglProfileOptions" :key="opt.value" :value="opt.value">
              {{ getOptionLabel(opt) }}
            </option>
          </select>
        </template>

        <div v-if="settings.enableCustomArgs" class="mt-10">
          <label class="label-tiny">{{ $t('customArgsLabel') }}</label>
          <textarea v-model="form.customArgs" rows="2" placeholder="--start-maximized" class="mono-text"></textarea>
          <div class="hint-text">{{ $t('customArgsHint') }}</div>
        </div>

        <div class="hint-text mt-10">{{ $t('autoFingerprint') }}</div>
      </div>
      <div class="modal-footer">
        <button class="outline" @click="uiStore.closeAddModal">{{ $t('cancel') }}</button>
        <button :disabled="isSaving" @click="handleSave">
          {{ isSaving ? '...' : $t('generateBtn') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted, watch } from 'vue';
import { useUIStore } from '../store/useUIStore';
import { useProfileStore } from '../store/useProfileStore';
import { getProxyRemark } from '../utils/helpers';
import {
  browserVersionPresetOptions,
  webglProfileOptions,
  getOptionLabel
} from '../utils/fingerprintOptions';

const uiStore = useUIStore();
const profileStore = useProfileStore();

const isSaving = ref(false);
const settings = ref({});
const showUaWebglModify = ref(false);

const form = reactive({
  name: '',
  tags: '',
  proxyStr: '',
  timezone: 'Auto',
  city: 'Auto (IP Based)',
  language: 'auto',
  preProxyOverride: 'default',
  resW: null,
  resH: null,
  geolocation: null,
  customArgs: '',
  browserVersionPreset: 'none',
  webglProfile: 'none'
});

function parseBrowserVersionPreset(preset) {
  if (!preset || preset === 'none') {
    return { uaMode: 'none', browserType: 'auto', browserMajorVersion: 'auto' };
  }
  if (preset === 'auto') {
    return { uaMode: 'spoof', browserType: 'auto', browserMajorVersion: 'auto' };
  }
  const [browserTypeRaw, majorRaw] = String(preset).split(':');
  const browserType = browserTypeRaw === 'edge' ? 'edge' : 'chrome';
  const major = Number(majorRaw);
  if (!Number.isFinite(major)) {
    return { uaMode: 'none', browserType: 'auto', browserMajorVersion: 'auto' };
  }
  return { uaMode: 'spoof', browserType, browserMajorVersion: major };
}

// Searchable Dropdowns State
const timezoneSearch = ref('Auto (No Change)');
const showTimezoneList = ref(false);
const citySearch = ref('Auto (IP Based)');
const showCityList = ref(false);
const languageSearch = ref('Auto (System Default)');
const showLanguageList = ref(false);

// Lists (Accessing from global window if not imported)
const allTimezones = window.TIMEZONES || [];
const allCities = window.CITY_DATA || [];
const allLanguages = window.LANGUAGE_DATA || [
  { name: 'Auto (System Default)', code: 'auto' },
  { name: 'English (US)', code: 'en-US' }
];

const filteredTimezones = computed(() => {
  const s = timezoneSearch.value.toLowerCase();
  return allTimezones.filter(tz => tz.toLowerCase().includes(s)).slice(0, 50);
});

const filteredCities = computed(() => {
  const s = citySearch.value.toLowerCase();
  return allCities.filter(c => c.name.toLowerCase().includes(s)).slice(0, 50);
});

const filteredLanguages = computed(() => {
  const s = languageSearch.value.toLowerCase();
  return allLanguages.filter(l => l.name.toLowerCase().includes(s) || l.code.toLowerCase().includes(s));
});

function selectTimezone(tz) {
  form.timezone = tz === 'Auto (No Change)' ? 'Auto' : tz;
  timezoneSearch.value = tz;
  showTimezoneList.value = false;
}

function selectCity(city) {
  if (city.name === 'Auto (IP Based)') {
    form.city = null;
    form.geolocation = null;
    citySearch.value = 'Auto (IP Based)';
  } else {
    form.city = city.name;
    form.geolocation = { latitude: city.lat, longitude: city.lng, accuracy: 100 };
    citySearch.value = city.name;
  }
  showCityList.value = false;
}

function selectLanguage(lang) {
  form.language = lang.code;
  languageSearch.value = lang.name;
  showLanguageList.value = false;
}

// Global click to close dropdowns
function handleGlobalClick(e) {
  if (!e.target.closest('.timezone-wrapper')) {
    showTimezoneList.value = false;
    showCityList.value = false;
    showLanguageList.value = false;
  }
}

// Watch for modal open to reset form
watch(() => uiStore.addModalVisible, async (newVal) => {
  if (newVal) {
    Object.assign(form, {
      name: '',
      tags: '',
      proxyStr: '',
      timezone: 'Auto',
      city: 'Auto (IP Based)',
      language: 'auto',
      preProxyOverride: 'default',
      resW: null,
      resH: null,
      geolocation: null,
      customArgs: '',
      browserVersionPreset: 'none',
      webglProfile: 'none'
    });
    timezoneSearch.value = 'Auto (No Change)';
    citySearch.value = 'Auto (IP Based)';
    languageSearch.value = 'Auto (System Default)';
    try {
      settings.value = await window.electronAPI.getSettings();
      showUaWebglModify.value = !!settings.value?.enableUaWebglModify;
    } catch (e) {
      settings.value = {};
      showUaWebglModify.value = false;
    }
  }
});

onMounted(() => {
  window.addEventListener('mousedown', handleGlobalClick);
});

onUnmounted(() => {
  window.removeEventListener('mousedown', handleGlobalClick);
});

async function handleSave() {
  const proxyLines = form.proxyStr.split('\n').map(l => l.trim()).filter(l => l);
  if (proxyLines.length === 0) {
    uiStore.showAlert(window.t('inputReq'));
    return;
  }

  isSaving.value = true;
  try {
    const tags = form.tags.split(/[,，]/).map(s => s.trim()).filter(s => s);
    let createdCount = 0;

    for (let i = 0; i < proxyLines.length; i++) {
      const proxyStr = proxyLines[i];
      let name;
      if (!form.name) {
        try {
            name = getProxyRemark(proxyStr) || `Profile-${String(i + 1).padStart(2, '0')}`;
        } catch(e) {
            name = `Profile-${String(i + 1).padStart(2, '0')}`;
        }
      } else if (proxyLines.length === 1) {
        name = form.name;
      } else {
        name = `${form.name}-${String(i + 1).padStart(2, '0')}`;
      }

      const screen = (form.resW && form.resH) ? { width: form.resW, height: form.resH } : null;
      const browserPreset = parseBrowserVersionPreset(form.browserVersionPreset);

      await profileStore.createProfile({
        name,
        proxyStr,
        tags,
        timezone: form.timezone,
        city: form.city,
        geolocation: form.geolocation,
        language: form.language,
        screen,
        uaMode: browserPreset.uaMode,
        preProxyOverride: form.preProxyOverride,
        customArgs: form.customArgs,
        browserType: browserPreset.browserType,
        browserMajorVersion: browserPreset.browserMajorVersion,
        webglProfile: form.webglProfile
      });
      createdCount++;
    }

    uiStore.closeAddModal();
    if (proxyLines.length > 1) {
      uiStore.showAlert(`Batch created successfully: ${createdCount}`);
    }
  } catch (err) {
    console.error('Create profile failed:', err);
    uiStore.showAlert("Create Failed: " + err.message);
  } finally {
    isSaving.value = false;
  }
}
</script>

<style scoped>
.label-tiny {
  font-size: 11px;
  font-weight: bold;
  opacity: 0.8;
  display: block;
}

.hint-text {
  font-size: 10px;
  opacity: 0.5;
  margin-bottom: 8px;
}

.flex-row {
  display: flex;
  gap: 10px;
}

.flex-1 {
  flex: 1;
}

.mt-10 {
  margin-top: 10px;
}

.gap-5 {
  gap: 5px;
}

.mono-text {
  font-family: monospace;
  font-size: 11px;
}
</style>
