<script setup lang="ts">
import PrunButton from '@src/components/PrunButton.vue';
import { fetchPluginUsers, FactionApiError } from '../FACTION/use-faction-api';
import type { PluginUser } from '../FACTION/types';
import css from './MMOD.module.css';

const users = ref<PluginUser[]>([]);
const loading = ref(false);
const error = ref('');

function formatLastActive(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  return `${days}天前`;
}

async function loadData() {
  loading.value = true;
  error.value = '';
  try {
    const result = await fetchPluginUsers();
    users.value = result.users;
  } catch (e) {
    if (e instanceof FactionApiError) {
      error.value = e.response.message;
    }
  } finally {
    loading.value = false;
  }
}

onMounted(loadData);
</script>

<template>
  <div :class="css.container">
    <div :class="css.toolbar">
      <span :class="css.title">插件用户 ({{ users.length }})</span>
      <PrunButton dark @click="loadData">刷新</PrunButton>
    </div>

    <div v-if="error" :class="css.error">{{ error }}</div>
    <div v-if="loading" :class="css.message">加载中...</div>

    <template v-else>
      <div v-if="users.length === 0" :class="css.message">暂无用户数据</div>

      <div :class="css.list">
        <div v-for="user in users" :key="user.username" :class="css.userRow">
          <div :class="css.userInfo">
            <span :class="css.username">{{ user.username }}</span>
            <span :class="css.company">{{ user.companyName }}</span>
          </div>
          <span :class="css.lastActive">{{ formatLastActive(user.lastActive) }}</span>
        </div>
      </div>
    </template>
  </div>
</template>
