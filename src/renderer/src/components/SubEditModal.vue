<template>
    <div id="subEditModal" class="modal-overlay" style="z-index: 1100;" @mousedown.self="uiStore.subEditModalVisible = false">
        <div class="modal-content">
            <div class="modal-header">
                <span>{{ isNew ? (t('subTitleNew') || 'New Subscription') : (t('subTitle') || 'Subscription Settings') }}</span>
                <span style="cursor:pointer" @click="uiStore.subEditModalVisible = false">✕</span>
            </div>
            
            <label>{{ t('subName') || 'Name' }}</label>
            <input type="text" v-model="form.name" spellcheck="false" autocomplete="off">
            
            <label>{{ t('subUrl') || 'URL' }}</label>
            <input type="text" v-model="form.url" spellcheck="false" autocomplete="off">
            
            <label>{{ t('subInterval') || 'Auto Update' }}</label>
            <select v-model="form.interval">
                <option value="0">{{ t('optDisabled') || 'Disabled' }}</option>
                <option value="24">{{ t('opt24h') || '24h' }}</option>
                <option value="72">{{ t('opt72h') || '72h' }}</option>
                <option value="custom">{{ t('optCustom') || 'Custom' }}</option>
            </select>
            
            <input v-if="form.interval === 'custom'" type="number" v-model.number="form.customInterval" placeholder="Hours" style="margin-top: 10px;">
            
            <div style="text-align:right; margin-top:15px; display:flex; justify-content:space-between;">
                <button v-if="!isNew" class="danger" @click="handleDelete" :disabled="isSaving">
                    {{ t('delete') || 'Delete' }}
                </button>
                <div v-else></div>
                
                <button @click="handleSave" :disabled="isSaving">
                    {{ isSaving ? '...' : (t('save') || 'Save') }}
                </button>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, reactive, watch } from 'vue';
import { useUIStore } from '../store/useUIStore';
import { useProxyStore } from '../store/useProxyStore';
import { formatUnsupportedXrayInsecureWarning, uuidv4 } from '../utils/helpers';

const uiStore = useUIStore();
const proxyStore = useProxyStore();
const t = window.t || ((key) => key);

const isNew = ref(false);
const isSaving = ref(false);

const form = reactive({
    id: '',
    name: '',
    url: '',
    interval: '0',
    customInterval: ''
});

watch(() => uiStore.subEditModalVisible, (visible) => {
    if (visible) {
        const sub = uiStore.currentSubEdit;
        if (sub) {
            isNew.value = false;
            form.id = sub.id;
            form.name = sub.name || '';
            form.url = sub.url || '';
            const intv = sub.updateInterval || 0;
            if ([0, 24, 72].includes(intv)) {
                form.interval = String(intv);
                form.customInterval = '';
            } else {
                form.interval = 'custom';
                form.customInterval = intv;
            }
        } else {
            isNew.value = true;
            form.id = uuidv4();
            form.name = '';
            form.url = '';
            form.interval = '0';
            form.customInterval = '';
        }
    }
});

const handleDelete = () => {
    uiStore.showConfirm(t('confirmDelSub') || 'Delete this subscription?', async () => {
        isSaving.value = true;
        try {
            await proxyStore.deleteSub(form.id);
            uiStore.subEditModalVisible = false;
        } finally {
            isSaving.value = false;
        }
    });
};

const handleSave = async () => {
    if (!form.url.trim() || (!form.name.trim() && !isNew.value)) {
        uiStore.showAlert(t('inputReq') || 'URL and Name required');
        return;
    }
    
    isSaving.value = true;
    try {
        let intervalNum = 0;
        if (form.interval === 'custom') {
            intervalNum = parseInt(form.customInterval) || 0;
        } else {
            intervalNum = parseInt(form.interval) || 0;
        }

        const subData = {
            id: form.id,
            name: form.name.trim() || 'Sub-' + form.id.substring(0, 4),
            url: form.url.trim(),
            updateInterval: intervalNum
        };

        if (isNew.value) {
            const res = await proxyStore.addSubscription(subData);
            if (res.success) {
                const insecureWarning = formatUnsupportedXrayInsecureWarning(res.unsupportedInsecureCount || 0);
                let message = (t('msgImported') || 'Imported') + ' ' + res.count + ' ' + (t('msgNodes') || 'nodes.');
                if (insecureWarning) message += `\n\n${insecureWarning}`;
                uiStore.showAlert(message);
                uiStore.subEditModalVisible = false;
            } else {
                uiStore.showAlert((t('subErr') || 'Failed to parse subscription.') + ' ' + (res.error || ''));
            }
        } else {
            const res = await proxyStore.updateSubscription(subData);
            if (res.success) {
                const insecureWarning = formatUnsupportedXrayInsecureWarning(res.unsupportedInsecureCount || 0);
                uiStore.subEditModalVisible = false;
                if (insecureWarning) uiStore.showAlert(insecureWarning);
            } else {
                uiStore.showAlert((t('msgUpdateFailed') || 'Update Failed:') + ' ' + (res.error || ''));
            }
        }
    } finally {
        isSaving.value = false;
    }
};
</script>
