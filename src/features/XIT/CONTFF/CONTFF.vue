<script setup lang="ts">
import LoadingSpinner from '@src/components/LoadingSpinner.vue';
import { contractsStore } from '@src/infrastructure/prun-api/data/contracts';
import ContractLink from '@src/features/XIT/CONTS/ContractLink.vue';
import PartnerLink from '@src/features/XIT/CONTS/PartnerLink.vue';
import MaterialIcon from '@src/components/MaterialIcon.vue';
import ShipmentIcon from '@src/components/ShipmentIcon.vue';
import { isEmpty } from 'ts-extras';
import {
  canAcceptContract,
  isFactionContract,
  isSelfCondition,
  calculateContractTotals,
} from '@src/features/XIT/CONTS/utils';
import { timestampEachSecond } from '@src/utils/dayjs';
import { objectId } from '@src/utils/object-id';
import dayjs from 'dayjs';

const STATUS_FILTERS = [
  { key: 'OPEN', label: '公开', colorClass: 'neutral' },
  { key: 'CLOSED', label: '进行中', colorClass: 'good' },
  { key: 'FULFILLED', label: '已完成', colorClass: 'good' },
  { key: 'PARTIALLY_FULFILLED', label: '部分完成', colorClass: 'partial' },
  { key: 'BREACHED', label: '已违约', colorClass: 'bad' },
  { key: 'TERMINATED', label: '已终止', colorClass: 'bad' },
  { key: 'CANCELLED', label: '已取消', colorClass: 'bad' },
  { key: 'REJECTED', label: '已拒绝', colorClass: 'bad' },
  { key: 'DEADLINE_EXCEEDED', label: '已逾期', colorClass: 'bad' },
] as const;

const activeFilters = ref(
  new Set<string>(['OPEN', 'CLOSED', 'PARTIALLY_FULFILLED', 'DEADLINE_EXCEEDED']),
);
const showFilters = ref(true);

function toggleFilter(key: string) {
  const newSet = new Set(activeFilters.value);
  if (newSet.has(key)) {
    newSet.delete(key);
  } else {
    newSet.add(key);
  }
  activeFilters.value = newSet;
}

function selectAll() {
  activeFilters.value = new Set(STATUS_FILTERS.map(f => f.key));
}

function selectNone() {
  activeFilters.value = new Set();
}

const filtered = computed(() =>
  (contractsStore.all.value ?? [])
    .filter(c => isFactionContract(c))
    .filter(c => activeFilters.value.has(c.status))
    .sort(compareContracts),
);

function compareContracts(a: PrunApi.Contract, b: PrunApi.Contract) {
  if (canAcceptContract(a) && !canAcceptContract(b)) {
    return -1;
  }
  if (canAcceptContract(b) && !canAcceptContract(a)) {
    return 1;
  }
  return (b.date?.timestamp ?? 0) - (a.date?.timestamp ?? 0);
}

const totals = computed(() => calculateContractTotals(filtered.value));

function formatAmount(amount: number, currency: string) {
  if (!currency || amount === 0) return '-';
  return `${amount.toLocaleString()} ${currency}`;
}

// 物品图标列表（小尺寸）
interface ShipmentIconProps {
  type: 'SHIPMENT';
  shipmentId: string;
  fulfilled: boolean;
}

interface MaterialIconProps {
  type: 'MATERIAL';
  ticker: string;
  amount: number;
  fulfilled: boolean;
}

function getIcons(contract: PrunApi.Contract) {
  const result: (ShipmentIconProps | MaterialIconProps)[] = [];
  for (const condition of contract.conditions) {
    switch (condition.type) {
      case 'DELIVERY_SHIPMENT': {
        if (isSelfCondition(contract, condition)) {
          result.push({
            type: 'SHIPMENT',
            shipmentId: condition.shipmentItemId!,
            fulfilled: condition.status === 'FULFILLED',
          });
          continue;
        }
        break;
      }
      case 'PROVISION':
      case 'PICKUP_SHIPMENT': {
        continue;
      }
    }

    const quantity = condition.quantity;
    if (!quantity?.material) {
      continue;
    }

    result.push({
      type: 'MATERIAL',
      ticker: quantity.material.ticker,
      amount: quantity.amount,
      fulfilled: condition.status === 'FULFILLED',
    });
  }
  return result;
}

// 待收款（对方需要付给我的）
function getReceivable(contract: PrunApi.Contract) {
  let total = 0;
  let currency = '';
  for (const cond of contract.conditions) {
    if (cond.type === 'PAYMENT' && cond.amount && cond.status !== 'FULFILLED') {
      if (cond.party !== contract.party) {
        total += cond.amount.amount;
        if (!currency) currency = cond.amount.currency;
      }
    }
  }
  return { total, currency };
}

// 条件完成进度
function getProgress(contract: PrunApi.Contract) {
  const fulfilledCount = contract.conditions.filter(c => c.status === 'FULFILLED').length;
  const totalCount = contract.conditions.length;
  if (totalCount === 0) return { fulfilled: 0, total: 0, percentage: 0 };
  return {
    fulfilled: fulfilledCount,
    total: totalCount,
    percentage: Math.round((fulfilledCount / totalCount) * 100),
  };
}

// 合同状态
function getStatusInfo(contract: PrunApi.Contract) {
  const statusText =
    {
      OPEN: '待接受',
      CLOSED: '进行中',
      FULFILLED: '已完成',
      PARTIALLY_FULFILLED: '部分完成',
      BREACHED: '已违约',
      TERMINATED: '已终止',
      CANCELLED: '已取消',
      REJECTED: '已拒绝',
      DEADLINE_EXCEEDED: '已逾期',
    }[contract.status] || contract.status;

  return { text: statusText };
}

function getDeadline(contract: PrunApi.Contract): string {
  const deadline = contract.dueDate;
  if (!deadline?.timestamp) return '-';
  const remaining = deadline.timestamp - timestampEachSecond.value;
  if (remaining <= 0) return '已逾期';
  const d = dayjs.duration({ milliseconds: remaining });
  if (d.days() > 0) return `${d.days()}天 ${d.hours()}小时`;
  if (d.hours() > 0) return `${d.hours()}小时 ${d.minutes()}分钟`;
  return `${d.minutes()}分钟`;
}
</script>

<template>
  <LoadingSpinner v-if="!contractsStore.fetched" />
  <div v-else :class="$style.container">
    <div :class="$style.filterBar">
      <span :class="$style.filterIcon">⚙</span>
      <button :class="$style.filterAction" @click="selectAll">全部</button>
      <button :class="$style.filterAction" @click="selectNone">无</button>
      <button :class="$style.filterAction" @click="showFilters = !showFilters">
        {{ showFilters ? '隐藏过滤器' : '显示过滤器' }}
      </button>
    </div>
    <div v-if="showFilters" :class="$style.statusFilters">
      <button
        v-for="f in STATUS_FILTERS"
        :key="f.key"
        :class="[
          $style.statusBtn,
          $style[f.colorClass],
          !activeFilters.has(f.key) && $style.inactive,
        ]"
        @click="toggleFilter(f.key)">
        {{ f.label }}
      </button>
    </div>

    <div v-if="totals.currency" :class="$style.totalsBar">
      <span>共 {{ filtered.length }} 单</span>

      <!-- 混合货币警告 -->
      <span v-if="totals.hasMixedCurrency" :class="$style.warningText">
        ⚠️ 检测到不同货币，金额统计可能不准确
      </span>

      <span v-if="totals.receivable > 0" :class="$style.receivableText">
        待收: {{ formatAmount(totals.receivable, totals.currency) }}
      </span>
    </div>

    <table>
      <thead>
        <tr>
          <th>合同</th>
          <th>物品</th>
          <th>对方</th>
          <th>待收款</th>
          <th>限期</th>
          <th>进度</th>
          <th>状态</th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="isEmpty(filtered)">
          <td colspan="7" :class="$style.empty">没有活动派系合同</td>
        </tr>
        <template v-else>
          <tr v-for="contract in filtered" :key="contract.id">
            <td>
              <ContractLink :contract="contract" />
            </td>
            <td>
              <div :class="$style.iconGrid">
                <template v-for="icon in getIcons(contract)" :key="objectId(icon)">
                  <div :class="[icon.fulfilled && $style.dimmed]">
                    <ShipmentIcon
                      v-if="icon.type === 'SHIPMENT'"
                      size="small"
                      :shipment-id="icon.shipmentId" />
                    <MaterialIcon
                      v-if="icon.type === 'MATERIAL'"
                      size="small"
                      compact
                      :ticker="icon.ticker"
                      :amount="icon.amount" />
                  </div>
                </template>
              </div>
            </td>
            <td>
              <PartnerLink :contract="contract" />
            </td>
            <td :class="$style.receivable">
              {{ formatAmount(getReceivable(contract).total, getReceivable(contract).currency) }}
            </td>
            <td :class="$style.deadlineCell">{{ getDeadline(contract) }}</td>
            <td>
              <div class="progressContainer">
                <div class="progressBar">
                  <div
                    class="progressFill"
                    :style="{ width: getProgress(contract).percentage + '%' }"></div>
                </div>
                <span class="progressText"
                  >{{ getProgress(contract).fulfilled }}/{{ getProgress(contract).total }}</span
                >
              </div>
            </td>
            <td>{{ getStatusInfo(contract).text }}</td>
          </tr>
        </template>
      </tbody>
    </table>
  </div>
</template>

<style module>
.container {
  padding: 4px;
}

.filterBar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.filterIcon {
  opacity: 0.5;
  font-size: 12px;
}

.filterAction {
  background: none;
  border: none;
  color: var(--rp-color-accent-primary);
  cursor: pointer;
  font-size: 11px;
  padding: 2px 4px;
  text-decoration: underline;
}

.filterAction:hover {
  opacity: 0.8;
}

.statusFilters {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 6px 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.statusBtn {
  border: none;
  padding: 2px 6px;
  font-size: 11px;
  cursor: pointer;
  background: none;
  transition: opacity 0.15s;
  font-weight: bold;
}

.statusBtn.inactive {
  opacity: 0.3;
  font-weight: normal;
}

.good {
  color: var(--rp-color-green);
}

.bad {
  color: var(--rp-color-red);
}

.neutral {
  color: var(--rp-color-text);
}

.partial {
  color: var(--rp-color-orange);
}

.totalsBar {
  display: flex;
  gap: 16px;
  padding: 6px 8px;
  font-size: 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  opacity: 0.8;
}

.receivableText {
  color: var(--rp-color-green);
}

.warningText {
  color: var(--rp-color-orange);
  font-weight: bold;
}

.deadlineCell {
  color: var(--rp-color-accent-primary);
  white-space: nowrap;
}

.iconGrid {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  align-items: center;
}

.dimmed {
  opacity: 0.3;
  filter: grayscale(0.6);
}

.receivable {
  color: var(--rp-color-green);
  white-space: nowrap;
}

.progressContainer {
  display: flex;
  align-items: center;
  gap: 6px;
}

.progressBar {
  flex: 1;
  height: 6px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
  min-width: 40px;
}

.progressFill {
  height: 100%;
  border-radius: 3px;
  background: var(--rp-color-green);
  transition: width 0.3s ease;
}

.progressFill.partial {
  background: var(--rp-color-orange);
}

.progressFill.neutral {
  background: var(--rp-color-text);
}

.progressText {
  font-size: 11px;
  white-space: nowrap;
}

.empty {
  text-align: center;
  opacity: 0.5;
  padding: 12px;
}
</style>
