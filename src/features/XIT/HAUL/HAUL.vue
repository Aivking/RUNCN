<script setup lang="ts">
import LoadingSpinner from '@src/components/LoadingSpinner.vue';
import { contractsStore } from '@src/infrastructure/prun-api/data/contracts';
import HaulRow from '@src/features/XIT/HAUL/HaulRow.vue';
import { isEmpty } from 'ts-extras';

// 只匹配带 SHIPMENT 后缀的条件（真正的运输合同）
const TRANSPORT_TYPES: PrunApi.ContractConditionType[] = [
  'DELIVERY_SHIPMENT',
  'PICKUP_SHIPMENT',
  'PROVISION_SHIPMENT',
];

// 合同状态定义
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

// 判断是否为运输合同
function isTransportContract(contract: PrunApi.Contract) {
  return contract.conditions.some(c => TRANSPORT_TYPES.includes(c.type));
}

// 判断我是否为承运方（我负责提货和交付）
function isCarrier(contract: PrunApi.Contract) {
  // 承运方负责 PICKUP_SHIPMENT 和 DELIVERY_SHIPMENT
  const pickup = contract.conditions.find(c => c.type === 'PICKUP_SHIPMENT');
  if (pickup) return pickup.party === contract.party;
  const delivery = contract.conditions.find(c => c.type === 'DELIVERY_SHIPMENT');
  if (delivery) return delivery.party === contract.party;
  return false;
}

// 所有运输合同（应用状态筛选）
const transportContracts = computed(() =>
  (contractsStore.all.value ?? []).filter(
    c => isTransportContract(c) && activeFilters.value.has(c.status),
  ),
);

// 承运合同（我负责运输）
const carrying = computed(() =>
  transportContracts.value
    .filter(isCarrier)
    .sort((a, b) => (b.date?.timestamp ?? 0) - (a.date?.timestamp ?? 0)),
);

// 委托运输（别人帮我运）
const shipping = computed(() =>
  transportContracts.value
    .filter(c => !isCarrier(c))
    .sort((a, b) => (b.date?.timestamp ?? 0) - (a.date?.timestamp ?? 0)),
);

// 摘要统计
function getTransportSummary(contracts: PrunApi.Contract[]) {
  let totalPayment = 0;
  let currency = '';
  let totalContracts = contracts.length;
  let completedContracts = 0;

  for (const contract of contracts) {
    if (contract.status === 'FULFILLED') completedContracts++;
    for (const cond of contract.conditions) {
      if (cond.type === 'PAYMENT' && cond.amount) {
        totalPayment += cond.amount.amount;
        if (!currency) currency = cond.amount.currency;
      }
    }
  }

  return { totalPayment, currency, totalContracts, completedContracts };
}

const carryingSummary = computed(() => getTransportSummary(carrying.value));
const shippingSummary = computed(() => getTransportSummary(shipping.value));

function formatAmount(amount: number, currency: string) {
  if (!currency) return '0';
  return `${amount.toLocaleString()} ${currency}`;
}
</script>

<template>
  <LoadingSpinner v-if="!contractsStore.fetched" />
  <div v-else :class="$style.container">
    <!-- 筛选栏 -->
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

    <!-- 承运合同 -->
    <table>
      <thead>
        <tr>
          <th colspan="8" :class="$style.sectionHeader">
            🚀 承运合同
            <span v-if="!isEmpty(carrying)" :class="$style.summary">
              共 {{ carryingSummary.totalContracts }} 单 | 已完成
              {{ carryingSummary.completedContracts }} 单 | 运费合计:
              {{ formatAmount(carryingSummary.totalPayment, carryingSummary.currency) }}
            </span>
          </th>
        </tr>
        <tr>
          <th>合同</th>
          <th>对方</th>
          <th>起点</th>
          <th>终点</th>
          <th>货物</th>
          <th>运费</th>
          <th>进度</th>
          <th>状态</th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="isEmpty(carrying)">
          <td colspan="8" :class="$style.empty">暂无承运合同</td>
        </tr>
        <template v-else>
          <HaulRow
            v-for="contract in carrying"
            :key="contract.id"
            :contract="contract"
            type="carrier" />
        </template>
      </tbody>
    </table>

    <!-- 委托运输 -->
    <table :class="$style.secondTable">
      <thead>
        <tr>
          <th colspan="8" :class="$style.sectionHeader">
            📦 委托运输
            <span v-if="!isEmpty(shipping)" :class="$style.summary">
              共 {{ shippingSummary.totalContracts }} 单 | 已完成
              {{ shippingSummary.completedContracts }} 单 | 运费合计:
              {{ formatAmount(shippingSummary.totalPayment, shippingSummary.currency) }}
            </span>
          </th>
        </tr>
        <tr>
          <th>合同</th>
          <th>对方</th>
          <th>起点</th>
          <th>终点</th>
          <th>货物</th>
          <th>运费</th>
          <th>进度</th>
          <th>状态</th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="isEmpty(shipping)">
          <td colspan="8" :class="$style.empty">暂无委托运输</td>
        </tr>
        <template v-else>
          <HaulRow
            v-for="contract in shipping"
            :key="contract.id"
            :contract="contract"
            type="shipper" />
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

.sectionHeader {
  text-align: left;
  font-size: 14px;
  padding: 6px 8px;
}

.summary {
  font-weight: normal;
  font-size: 12px;
  margin-left: 12px;
  opacity: 0.7;
}

.secondTable {
  margin-top: 12px;
}

.empty {
  text-align: center;
  opacity: 0.5;
  padding: 12px;
}
</style>
