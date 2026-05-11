<template>
    <div class="layout">
        <div class="main-list" id="profileList" :class="{ 'grid-view': isGridView }">
            <template v-if="filteredProfiles.length > 0">
                <ProfileCard 
                    v-for="profile in filteredProfiles" 
                    :key="profile.id" 
                    :profile="profile" 
                    :isRunning="profileStore.isRunning(profile.id)"
                    :isLaunching="profileStore.isLaunching(profile.id)"
                    :isSelected="profileStore.isSelected(profile.id)"
                />
            </template>
            <div v-else class="empty-state">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                    <circle cx="12" cy="7" r="4"></circle>
                </svg>
                <div class="empty-state-text">{{ emptyMessage }}</div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { computed, onMounted } from 'vue';
import { useProfileStore } from '../store/useProfileStore';
import ProfileCard from './ProfileCard.vue';

const profileStore = useProfileStore();

const filteredProfiles = computed(() => profileStore.filteredProfiles);
const isGridView = computed(() => profileStore.viewMode === 'grid');

const emptyMessage = computed(() => {
    const t = window.t || ((key) => key);
    if (profileStore.searchText.length > 0) {
        return "No Search Results";
    }
    return t('emptyStateMsg');
});

onMounted(() => {
    profileStore.loadProfiles();
});
</script>
