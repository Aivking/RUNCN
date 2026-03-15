<script setup lang="ts">
import PrunButton from '@src/components/PrunButton.vue';
import {
  fetchLogistics,
  createLogisticsRequest,
  reviewLogistics,
  FactionApiError,
} from '../use-faction-api';
import { LOGISTICS_STATUS_LABELS, type LogisticsRequest, type MemberRole } from '../types';
import $style from '../FactionPanel.module.css';

const props = defineProps<{ myRole: MemberRole }>();

const requests = ref<LogisticsRequest[]>([]);
const loading = ref(false);
const error = ref('');

// Form state.
const showForm = ref(false);
const formTicker = ref('');
const formQuantity = ref('');
const formDestination = ref('');
const formReason = ref('');

const isExecutive = computed(() => props.myRole === 'executive');
const canRequest = computed(() => props.myRole !== 'member');

async function loadData() {
  loading.value = true;
  error.value = '';
  try {
    const result = await fetchLogistics();
    requests.value = result.requests;
  } catch (e) {
    if (e instanceof FactionApiError) {
      error.value = e.response.message;
    }
  } finally {
    loading.value = false;
  }
}

async function handleSubmit() {
  const qty = parseInt(formQuantity.value);
  if (!formTicker.value || isNaN(qty) || qty <= 0 || !formDestination.value) {
    return;
  }
  try {
    await createLogisticsRequest(
      formTicker.value.toUpperCase(),
      qty,
      formDestination.value,
      formReason.value,
    );
    showForm.value = false;
    formTicker.value = '';
    formQuantity.value = '';
    formDestination.value = '';
    formReason.value = '';
    await loadData();
  } catch (e) {
    if (e instanceof FactionApiError) {
      error.value = e.response.message;
    }
  }
}

async function handleReview(id: string, status: string) {
  try {
    await reviewLogistics(id, status);
    await loadData();
  } catch (e) {
    if (e instanceof FactionApiError) {
      error.value = e.response.message;
    }
  }
}

function statusColor(status: string): string {
  switch (status) {
    case 'approved':
      return 'rgb(146, 196, 125)';
    case 'rejected':
      return 'rgb(217, 83, 79)';
    case 'completed':
      return 'rgba(255, 255, 255, 0.5)';
    default:
      return 'rgb(217, 163, 79)';
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

onMounted(loadData);
</script>

<template>
  <div>
    <div :class="$style.membersToolbar">
      <PrunButton dark @click="loadData">刷新</PrunButton>
      <PrunButton v-if="canRequest" dark @click="showForm = !showForm">
        {{ showForm ? '取消' : '提交申请' }}
      </PrunButton>
    </div>

    <!-- Request form -->
    <div v-if="showForm" :class="$style.loginContainer">
      <div :class="$style.field">
        <div :class="$style.fieldLabel">物料 Ticker</div>
        <input
          v-model="formTicker"
          :class="$style.fieldInput"
          type="text"
          placeholder="如 RAT, DW"
          style="text-transform: uppercase" />
      </div>
      <div :class="$style.field">
        <div :class="$style.fieldLabel">数量</div>
        <input v-model="formQuantity" :class="$style.fieldInput" type="number" min="1" />
      </div>
      <div :class="$style.field">
        <div :class="$style.fieldLabel">目的地</div>
        <input v-model="formDestination" :class="$style.fieldInput" type="text" />
      </div>
      <div :class="$style.field">
        <div :class="$style.fieldLabel">理由</div>
        <input v-model="formReason" :class="$style.fieldInput" type="text" />
      </div>
      <div :class="$style.buttonRow">
        <PrunButton
          primary
          :disabled="!formTicker || !formQuantity || !formDestination"
          @click="handleSubmit"
          >提交</PrunButton
        >
      </div>
    </div>

    <div v-if="error" :class="$style.errorMessage">{{ error }}</div>

    <div v-if="loading" :class="$style.loadingMessage">加载中...</div>

    <template v-else>
      <div v-if="requests.length === 0" :class="$style.emptyMessage">暂无调配申请</div>
      <div
        v-for="req in requests"
        :key="req.id"
        :class="$style.memberRow"
        style="flex-direction: column; align-items: stretch">
        <div style="display: flex; justify-content: space-between; align-items: center">
          <div :class="$style.memberInfo">
            <span style="font-weight: bold; font-size: 13px">{{ req.materialTicker }}</span>
            <span style="opacity: 0.7">×{{ req.quantity }}</span>
            <span style="opacity: 0.5; font-size: 11px">→ {{ req.destination }}</span>
            <span
              :class="[$style.roleBadge]"
              :style="{
                color: statusColor(req.status),
                backgroundColor: statusColor(req.status)
                  .replace('rgb', 'rgba')
                  .replace(')', ', 0.15)'),
              }">
              {{ LOGISTICS_STATUS_LABELS[req.status] }}
            </span>
          </div>
          <span :class="$style.memberJoined"
            >{{ req.requester }} · {{ formatDate(req.createdAt) }}</span
          >
        </div>
        <div v-if="req.reason" style="opacity: 0.5; font-size: 11px; margin-top: 2px">{{
          req.reason
        }}</div>
        <!-- Executive review buttons -->
        <div
          v-if="isExecutive && req.status === 'pending'"
          style="display: flex; gap: 4px; margin-top: 4px">
          <PrunButton success @click="handleReview(req.id, 'approved')">批准</PrunButton>
          <PrunButton danger @click="handleReview(req.id, 'rejected')">拒绝</PrunButton>
        </div>
        <div v-if="isExecutive && req.status === 'approved'" style="margin-top: 4px">
          <PrunButton dark @click="handleReview(req.id, 'completed')">标记完成</PrunButton>
        </div>
      </div>
    </template>
  </div>
</template>
