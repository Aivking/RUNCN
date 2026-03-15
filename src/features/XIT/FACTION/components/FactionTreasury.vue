<script setup lang="ts">
import PrunButton from '@src/components/PrunButton.vue';
import {
  fetchTreasuryBalance,
  fetchTreasuryRecords,
  createTreasuryRecord,
  FactionApiError,
} from '../use-faction-api';
import type { TreasuryRecord, MemberRole } from '../types';
import $style from '../FactionPanel.module.css';

const props = defineProps<{ myRole: MemberRole }>();

const balance = ref(0);
const records = ref<TreasuryRecord[]>([]);
const loading = ref(false);
const error = ref('');

// Form state.
const showForm = ref(false);
const formAmount = ref('');
const formNote = ref('');
const formIsExpense = ref(false);

const isExecutive = computed(() => props.myRole === 'executive');
const canViewRecords = computed(() => props.myRole !== 'member');

async function loadBalance() {
  try {
    const result = await fetchTreasuryBalance();
    balance.value = result.balance;
  } catch (e) {
    if (e instanceof FactionApiError) {
      error.value = e.response.message;
    }
  }
}

async function loadRecords() {
  if (!canViewRecords.value) {
    return;
  }
  loading.value = true;
  try {
    const result = await fetchTreasuryRecords();
    records.value = result.records;
  } catch (e) {
    if (e instanceof FactionApiError) {
      error.value = e.response.message;
    }
  } finally {
    loading.value = false;
  }
}

async function handleSubmit() {
  const amt = parseFloat(formAmount.value);
  if (isNaN(amt) || amt === 0) {
    return;
  }
  const finalAmount = formIsExpense.value ? -Math.abs(amt) : Math.abs(amt);
  try {
    await createTreasuryRecord(finalAmount, formNote.value);
    showForm.value = false;
    formAmount.value = '';
    formNote.value = '';
    formIsExpense.value = false;
    await loadBalance();
    await loadRecords();
  } catch (e) {
    if (e instanceof FactionApiError) {
      error.value = e.response.message;
    }
  }
}

function formatAmount(amount: number): string {
  const sign = amount >= 0 ? '+' : '';
  return `${sign}${amount.toFixed(2)}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

onMounted(() => {
  loadBalance();
  loadRecords();
});
</script>

<template>
  <div>
    <!-- Balance -->
    <div :class="$style.membersToolbar">
      <div>
        <span style="opacity: 0.6; font-size: 11px">当前余额</span>
        <span
          style="font-size: 18px; margin-left: 8px"
          :style="{ color: balance >= 0 ? 'rgb(146, 196, 125)' : 'rgb(217, 83, 79)' }">
          {{ balance.toFixed(2) }}
        </span>
      </div>
      <div style="display: flex; gap: 4px">
        <PrunButton
          dark
          @click="
            loadBalance();
            loadRecords();
          "
          >刷新</PrunButton
        >
        <PrunButton v-if="isExecutive" dark @click="showForm = !showForm">
          {{ showForm ? '取消' : '录入' }}
        </PrunButton>
      </div>
    </div>

    <!-- Add record form -->
    <div v-if="showForm" :class="$style.loginContainer">
      <div :class="$style.field">
        <div :class="$style.fieldLabel">类型</div>
        <div style="display: flex; gap: 8px; font-size: 12px">
          <label
            ><input type="radio" :checked="!formIsExpense" @change="formIsExpense = false" />
            收入</label
          >
          <label
            ><input type="radio" :checked="formIsExpense" @change="formIsExpense = true" />
            支出</label
          >
        </div>
      </div>
      <div :class="$style.field">
        <div :class="$style.fieldLabel">金额</div>
        <input
          v-model="formAmount"
          :class="$style.fieldInput"
          type="number"
          step="0.01"
          min="0.01" />
      </div>
      <div :class="$style.field">
        <div :class="$style.fieldLabel">备注</div>
        <input v-model="formNote" :class="$style.fieldInput" type="text" />
      </div>
      <div :class="$style.buttonRow">
        <PrunButton primary :disabled="!formAmount" @click="handleSubmit">提交</PrunButton>
      </div>
    </div>

    <div v-if="error" :class="$style.errorMessage">{{ error }}</div>

    <!-- Records list -->
    <div v-if="canViewRecords">
      <div v-if="loading" :class="$style.loadingMessage">加载中...</div>
      <template v-else>
        <div v-if="records.length === 0" :class="$style.emptyMessage">暂无收支记录</div>
        <div v-for="record in records" :key="record.id" :class="$style.memberRow">
          <div :class="$style.memberInfo">
            <span
              :style="{
                color: record.amount >= 0 ? 'rgb(146, 196, 125)' : 'rgb(217, 83, 79)',
                minWidth: '80px',
                display: 'inline-block',
              }">
              {{ formatAmount(record.amount) }}
            </span>
            <span style="opacity: 0.6; font-size: 12px">{{ record.operator }}</span>
            <span v-if="record.note" style="opacity: 0.5; font-size: 12px; margin-left: 8px">{{
              record.note
            }}</span>
          </div>
          <span :class="$style.memberJoined">{{ formatDate(record.createdAt) }}</span>
        </div>
      </template>
    </div>
    <div v-else :class="$style.emptyMessage">成员仅可查看余额</div>
  </div>
</template>
