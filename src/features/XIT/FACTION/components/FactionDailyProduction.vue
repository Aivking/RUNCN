<script setup lang="ts">
import PrunButton from '@src/components/PrunButton.vue';
import MaterialIcon from '@src/components/MaterialIcon.vue';
import {
  fetchProductionSummary,
  reportProduction,
  aggregateMyProduction,
  updateProductionQuantity,
  deleteProductionByMember,
  FactionApiError,
} from '../use-faction-api';
import type { ProductionMemberSummary, MemberRole } from '../types';
import { sitesStore } from '@src/infrastructure/prun-api/data/sites';
import { materialsStore } from '@src/infrastructure/prun-api/data/materials';
import { sortMaterials } from '@src/core/sort-materials';
import { fixed0, fixed1, fixed2 } from '@src/utils/format';
import $style from './FactionDailyProduction.module.css';

const props = defineProps<{ myRole: MemberRole }>();

const members = ref<ProductionMemberSummary[]>([]);
const loading = ref(false);
const error = ref('');
const submitStatus = ref<'idle' | 'submitting' | 'ok'>('idle');
const today = new Date().toISOString().slice(0, 10);
const editingItem = ref<{ id: string; quantity: number } | null>(null);
const searchQuery = ref('');

const isExecutive = computed(() => props.myRole === 'executive');

// 每个成员卡片的展开状态
const expandedCards = ref(new Set<string>());

function toggleExpand(companyName: string) {
  if (expandedCards.value.has(companyName)) {
    expandedCards.value.delete(companyName);
  } else {
    expandedCards.value.add(companyName);
  }
}

// 搜索时或已展开时不限制高度
function isExpanded(companyName: string): boolean {
  return !!searchQuery.value.trim() || expandedCards.value.has(companyName);
}

const filteredMembers = computed(() => {
  const q = searchQuery.value.trim().toUpperCase();
  if (!q) return members.value;
  return members.value
    .map(m => {
      const matched = m.items.filter(i => i.ticker.includes(q));
      return matched.length > 0 ? { ...m, items: matched } : null;
    })
    .filter((m): m is ProductionMemberSummary => m !== null);
});

function sortedItems(items: ProductionMemberSummary['items']) {
  const mats = items.map(i => materialsStore.getByTicker(i.ticker)).filter(m => m !== undefined);
  const sorted = sortMaterials(mats);
  return sorted.map(m => items.find(i => i.ticker === m.ticker)!);
}

function formatQty(n: number) {
  const abs = Math.abs(n);
  return abs >= 1000 ? fixed0(abs) : abs >= 100 ? fixed1(abs) : fixed2(abs);
}

async function loadData() {
  loading.value = true;
  error.value = '';
  try {
    const result = await fetchProductionSummary();
    members.value = result.members;
  } catch (e) {
    error.value = e instanceof FactionApiError ? e.response.message : '无法加载产出数据';
  } finally {
    loading.value = false;
  }
}

async function handleSubmitMyProduction() {
  if (submitStatus.value === 'submitting') return;
  submitStatus.value = 'submitting';
  error.value = '';

  if (!sitesStore.fetched.value) {
    error.value = '游戏数据未就绪，请稍后再试';
    submitStatus.value = 'idle';
    return;
  }

  try {
    const items = await aggregateMyProduction();

    if (items.length === 0) {
      error.value = '未检测到产出数据（确认游戏已完全加载且有生产订单）';
      submitStatus.value = 'idle';
      return;
    }

    await reportProduction(items);
    submitStatus.value = 'ok';
    await loadData();
  } catch (e) {
    error.value = e instanceof FactionApiError ? e.response.message : '提交失败';
    submitStatus.value = 'idle';
  }
}

function startEdit(item: { id?: string; quantity: number }) {
  if (!item.id) return;
  editingItem.value = { id: item.id, quantity: item.quantity };
}

async function saveEdit() {
  if (!editingItem.value) return;
  try {
    await updateProductionQuantity(editingItem.value.id, editingItem.value.quantity);
    editingItem.value = null;
    await loadData();
  } catch (e) {
    error.value = e instanceof FactionApiError ? e.response.message : '更新失败';
  }
}

function cancelEdit() {
  editingItem.value = null;
}

async function handleDeleteMemberProduction(companyName: string) {
  try {
    await deleteProductionByMember(companyName, today);
    await loadData();
  } catch (e) {
    error.value = e instanceof FactionApiError ? e.response.message : '删除失败';
  }
}

onMounted(loadData);
</script>

<template>
  <div>
    <div :class="$style.toolbar">
      <div style="display: flex; align-items: center; gap: 6px">
        <PrunButton dark @click="loadData">刷新</PrunButton>
        <span :class="$style.dateLabel">{{ today }}</span>
      </div>
      <div style="display: flex; align-items: center; gap: 6px">
        <input
          v-model="searchQuery"
          :class="$style.searchInput"
          type="text"
          placeholder="搜索材料..."
          autocomplete="off" />
        <PrunButton
          dark
          :disabled="submitStatus === 'submitting'"
          @click="handleSubmitMyProduction">
          <template v-if="submitStatus === 'submitting'">上报中...</template>
          <template v-else-if="submitStatus === 'ok'">✓ 已上报</template>
          <template v-else>上报我的产出</template>
        </PrunButton>
      </div>
    </div>

    <div v-if="error" :class="$style.errorMsg">{{ error }}</div>
    <div v-if="loading" :class="$style.loadingMsg">加载中...</div>

    <template v-else>
      <div v-if="filteredMembers.length === 0" :class="$style.emptyMsg">
        {{ searchQuery ? '未找到匹配的材料' : '暂无产出数据 — 点击「上报我的产出」提交' }}
      </div>

      <div :class="$style.grid">
        <div v-for="member in filteredMembers" :key="member.companyName" :class="$style.card">
          <div :class="$style.cardHeader">
            <span :class="$style.cardName">
              {{ member.companyName }}
              <span v-if="member.username" :class="$style.cardUsername">{{ member.username }}</span>
            </span>
            <PrunButton
              v-if="isExecutive"
              danger
              :class="$style.deleteBtn"
              @click="handleDeleteMemberProduction(member.companyName)">
              ✕
            </PrunButton>
          </div>
          <div :class="[$style.itemsWrap, isExpanded(member.companyName) ? '' : $style.collapsed]">
            <div
              v-for="item in sortedItems(member.items)"
              :key="item.ticker"
              :class="$style.item"
              @dblclick="isExecutive && startEdit(item)">
              <MaterialIcon size="small" :ticker="item.ticker" />
              <template v-if="editingItem && editingItem.id === item.id">
                <input
                  v-model.number="editingItem.quantity"
                  :class="$style.editInput"
                  type="number"
                  @keyup.enter="saveEdit"
                  @keyup.escape="cancelEdit"
                  @blur="saveEdit" />
              </template>
              <span v-else :class="$style.qty">{{ formatQty(item.quantity) }}</span>
            </div>
          </div>
          <div
            v-if="!searchQuery.trim() && sortedItems(member.items).length > 14"
            :class="$style.expandBtn"
            @click="toggleExpand(member.companyName)">
            {{ expandedCards.has(member.companyName) ? '收起 ▲' : '展开 ▼' }}
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
