<script setup lang="ts">
import PrunButton from '@src/components/PrunButton.vue';
import SectionHeader from '@src/components/SectionHeader.vue';
import { fetchBulletins, postBulletin, FactionApiError } from '../use-faction-api';
import type { Bulletin, MemberRole } from '../types';
import { userData } from '@src/store/user-data';
import $style from '../FactionPanel.module.css';

const props = defineProps<{ myRole: MemberRole }>();

const bulletins = ref<Bulletin[]>([]);
const loading = ref(false);
const error = ref('');
const fromCache = ref(false);

// Post form.
const showForm = ref(false);
const formTitle = ref('');
const formContent = ref('');

const isExecutive = computed(() => props.myRole === 'executive');

function notifyNewBulletins(incoming: Bulletin[]) {
  const lastSeen = userData.factionLastSeenBulletinAt;
  const newOnes = lastSeen ? incoming.filter(b => b.createdAt > lastSeen) : incoming.slice(0, 1); // first load: only notify the latest one

  if (newOnes.length === 0) return;

  if (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    Notification.permission === 'granted'
  ) {
    for (const b of newOnes) {
      new Notification(`[琉璃主权资本] 新公告：${b.title}`, {
        body: b.content.slice(0, 80),
        tag: `faction-bulletin-${b.id}`,
      });
    }
  }

  // Update last seen to the most recent bulletin timestamp.
  userData.factionLastSeenBulletinAt = incoming[0]?.createdAt;
}

async function loadData() {
  loading.value = true;
  error.value = '';
  try {
    const result = await fetchBulletins();
    bulletins.value = result.bulletins;
    fromCache.value = result.fromCache ?? false;
    if (!result.fromCache) {
      notifyNewBulletins(result.bulletins);
    }
  } catch (e) {
    if (e instanceof FactionApiError) {
      error.value = e.response.message;
    } else {
      error.value = '无法加载公告，请检查网络连接';
    }
  } finally {
    loading.value = false;
  }
}

async function handlePost() {
  if (!formTitle.value || !formContent.value) {
    return;
  }
  try {
    await postBulletin(formTitle.value, formContent.value);
    showForm.value = false;
    formTitle.value = '';
    formContent.value = '';
    await loadData();
  } catch (e) {
    if (e instanceof FactionApiError) {
      error.value = e.response.message;
    }
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

onMounted(() => {
  // Request notification permission on first open.
  if (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    Notification.permission === 'default'
  ) {
    Notification.requestPermission();
  }
  loadData();
});
</script>

<template>
  <div>
    <div :class="$style.membersToolbar">
      <div style="display: flex; align-items: center; gap: 6px">
        <PrunButton dark @click="loadData">刷新</PrunButton>
        <span v-if="fromCache" style="font-size: 10px; opacity: 0.5">（离线缓存）</span>
      </div>
      <PrunButton v-if="isExecutive" dark @click="showForm = !showForm">
        {{ showForm ? '取消' : '发布公告' }}
      </PrunButton>
    </div>

    <!-- Post form -->
    <div v-if="showForm" :class="$style.loginContainer">
      <div :class="$style.field">
        <div :class="$style.fieldLabel">标题</div>
        <input v-model="formTitle" :class="$style.fieldInput" type="text" />
      </div>
      <div :class="$style.field">
        <div :class="$style.fieldLabel">内容</div>
        <textarea
          v-model="formContent"
          :class="$style.fieldInput"
          rows="4"
          style="resize: vertical; font-family: inherit; width: 100%; box-sizing: border-box" />
      </div>
      <div :class="$style.buttonRow">
        <PrunButton primary :disabled="!formTitle || !formContent" @click="handlePost"
          >发布</PrunButton
        >
      </div>
    </div>

    <div v-if="error" :class="$style.errorMessage">{{ error }}</div>
    <div v-if="loading" :class="$style.loadingMessage">加载中...</div>

    <template v-else>
      <div v-if="bulletins.length === 0" :class="$style.emptyMessage">暂无公告</div>
      <div
        v-for="bulletin in bulletins"
        :key="bulletin.id"
        :class="$style.memberRow"
        style="flex-direction: column; align-items: stretch; gap: 4px">
        <div style="display: flex; justify-content: space-between; align-items: center">
          <SectionHeader style="color: rgb(230, 200, 80)">{{ bulletin.title }}</SectionHeader>
          <span :class="$style.memberJoined"
            >{{ bulletin.author }} · {{ formatDate(bulletin.createdAt) }}</span
          >
        </div>
        <div
          style="
            font-size: 12px;
            color: rgb(220, 220, 220);
            white-space: pre-wrap;
            padding: 2px 0 6px;
          "
          >{{ bulletin.content }}</div
        >
      </div>
    </template>
  </div>
</template>
