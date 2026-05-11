<template>
    <div id="progressModal" class="modal-overlay" :class="{ active: uiStore.progressModalVisible }" style="z-index: 2500;" @mousedown.stop>
        <div class="modal-content launch-progress-modal">
            <div class="launch-progress-topline">
                <span class="launch-progress-pulse"></span>
                <span>{{ t('launchingStatus') }}</span>
            </div>

            <div style="font-size: 16px; font-weight: 600; margin-bottom: 8px; color: var(--accent);">
                {{ uiStore.progressTitle }}
            </div>

            <div v-if="uiStore.progressProfileName" class="launch-progress-profile">
                {{ uiStore.progressProfileName }}
            </div>

            <div v-if="uiStore.progressTotalSteps > 0" class="launch-progress-step">
                {{ t('launchingStepLabel') }}
                {{ uiStore.progressStep }}/{{ uiStore.progressTotalSteps }}
            </div>

            <div class="launch-progress-bar">
                <div :style="{ width: uiStore.progressPercent + '%' }" class="launch-progress-fill"></div>
            </div>

            <div class="launch-progress-meta">
                <span class="launch-progress-message">{{ uiStore.progressMessage || '...' }}</span>
                <span class="launch-progress-percent">{{ uiStore.progressPercent }}%</span>
            </div>

            <p class="launch-progress-warn">
                {{ uiStore.progressWarn }}
            </p>
        </div>
    </div>
</template>

<script setup>
import { useUIStore } from '../store/useUIStore';
const uiStore = useUIStore();
const t = (key) => window.t ? window.t(key) : key;
</script>

<style scoped>
.launch-progress-modal {
    width: min(420px, calc(100vw - 32px));
    text-align: center;
    padding: 26px 24px 22px;
    border: 1px solid rgba(0, 224, 255, 0.18);
    background:
        radial-gradient(circle at top, rgba(0, 224, 255, 0.12), transparent 52%),
        linear-gradient(180deg, rgba(255, 255, 255, 0.02), rgba(255, 255, 255, 0));
    box-shadow: 0 18px 40px rgba(0, 0, 0, 0.28);
}

.launch-progress-topline {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
    padding: 5px 10px;
    border-radius: 999px;
    color: var(--text-secondary);
    font-size: 11px;
    letter-spacing: 0.6px;
    text-transform: uppercase;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.08);
}

.launch-progress-pulse {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #f39c12;
    box-shadow: 0 0 0 rgba(243, 156, 18, 0.45);
    animation: launchPulse 1.4s ease-in-out infinite;
}

.launch-progress-profile {
    margin-bottom: 12px;
    color: var(--text-primary);
    font-size: 13px;
    font-weight: 600;
    word-break: break-word;
}

.launch-progress-step {
    margin-bottom: 12px;
    color: var(--text-secondary);
    font-size: 12px;
}

.launch-progress-bar {
    width: 100%;
    background: rgba(0, 0, 0, 0.22);
    height: 10px;
    border-radius: 999px;
    overflow: hidden;
    margin: 0 0 14px;
    border: 1px solid var(--border);
}

.launch-progress-fill {
    height: 100%;
    border-radius: inherit;
    transition: width 0.25s ease;
    background: linear-gradient(90deg, #00bcd4, var(--accent), #6ee7f9);
}

.launch-progress-meta {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    font-size: 12px;
    color: var(--text-secondary);
    margin-bottom: 14px;
    text-align: left;
}

.launch-progress-message {
    flex: 1;
}

.launch-progress-percent {
    font-weight: 700;
    color: var(--accent);
    white-space: nowrap;
}

.launch-progress-warn {
    margin: 0;
    padding: 10px 12px;
    border-radius: 10px;
    font-size: 12px;
    line-height: 1.5;
    color: #f7b267;
    background: rgba(243, 156, 18, 0.12);
    border: 1px solid rgba(243, 156, 18, 0.22);
}

@keyframes launchPulse {
    0% {
        transform: scale(0.92);
        box-shadow: 0 0 0 0 rgba(243, 156, 18, 0.38);
    }
    70% {
        transform: scale(1);
        box-shadow: 0 0 0 9px rgba(243, 156, 18, 0);
    }
    100% {
        transform: scale(0.92);
        box-shadow: 0 0 0 0 rgba(243, 156, 18, 0);
    }
}
</style>
