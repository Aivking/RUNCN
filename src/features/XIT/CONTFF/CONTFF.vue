<script setup lang="ts">
import { ref, computed } from 'vue';
import LoadingSpinner from '@src/components/LoadingSpinner.vue';
import StatusFilter from '@src/components/StatusFilter.vue';
import ProgressBarWithText from '@src/components/ProgressBarWithText.vue';
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
  formatAmount,
  calculateProgress,
  getStatusText,
  getStatusClass,
} from '@src/features/XIT/CONTS/utils';
import { timestampEachSecond } from '@src/utils/dayjs';
import { objectId } from '@src/utils/object-id';
import dayjs from 'dayjs';
import '@src/utils/dayjs';

const activeFilters = ref(
  new Set<string>(['OPEN', 'CLOSED', 'PARTIALLY_FULFILLED', 'DEADLINE_EXCEEDED']),
);
const showFilters = ref(true);

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

function getDeadline(contract: PrunApi.Contract): string {
  const deadline = contract.dueDate;
  if (!deadline?.timestamp) return '-';
  const remaining = deadline.timestamp - timestampEachSecond.value;
  if (remaining <= 0) return '已逾期';
  const d = dayjs.duration(remaining);
  if (d.days() > 0) return `${d.days()}天 ${d.hours()}小时`;
  if (d.hours() > 0) return `${d.hours()}小时 ${d.minutes()}分钟`;
  return `${d.minutes()}分钟`;
}
</script>

<template>
  <LoadingSpinner v-if="!contractsStore.fetched" />
  <div v-else :class="$style.container">
    <!-- 筛选栏 -->
    <StatusFilter v-model="activeFilters" v-model:showFilters="showFilters" />

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
              <ProgressBarWithText
                :current="calculateProgress(contract).fulfilled"
                :total="calculateProgress(contract).total"
                :showText="true" />
            </td>
            <td :class="$style[getStatusClass(contract.status)]">
              {{ getStatusText(contract.status) }}
            </td>
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

.fulfilled {
  color: var(--rp-color-green);
}

.active {
  color: var(--rp-color-orange);
}

.failed {
  color: var(--rp-color-red);
}

.pending {
  color: var(--rp-color-text);
}

.empty {
  text-align: center;
  opacity: 0.5;
  padding: 12px;
}
</style>
