<script setup lang="ts">
import LoadingSpinner from '@src/components/LoadingSpinner.vue';
import { contractsStore } from '@src/infrastructure/prun-api/data/contracts';
import LoanRow from '@src/features/XIT/LOAN/LoanRow.vue';
import { isEmpty } from 'ts-extras';

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

// 筛选状态：存储每个状态是否被选中
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

// 判断合同是否为贷款合同（包含 LOAN_PAYOUT 或 LOAN_INSTALLMENT 条件）
function isLoanContract(contract: PrunApi.Contract) {
  return contract.conditions.some(c => c.type === 'LOAN_PAYOUT' || c.type === 'LOAN_INSTALLMENT');
}

// 判断我是否为借款方（对方发放贷款给我）
function isBorrowing(contract: PrunApi.Contract) {
  const payout = contract.conditions.find(c => c.type === 'LOAN_PAYOUT');
  if (!payout) return false;
  return payout.party !== contract.party;
}

// 所有贷款合同（应用状态筛选）
const loanContracts = computed(() =>
  (contractsStore.all.value ?? []).filter(
    c => isLoanContract(c) && activeFilters.value.has(c.status),
  ),
);

// 借入贷款
const borrowed = computed(() =>
  loanContracts.value
    .filter(isBorrowing)
    .sort((a, b) => (b.date?.timestamp ?? 0) - (a.date?.timestamp ?? 0)),
);

// 放出贷款
const lent = computed(() =>
  loanContracts.value
    .filter(c => !isBorrowing(c))
    .sort((a, b) => (b.date?.timestamp ?? 0) - (a.date?.timestamp ?? 0)),
);

// 获取贷款摘要信息
function getLoanSummary(contracts: PrunApi.Contract[]) {
  let totalPrincipal = 0;
  let totalPaid = 0;
  let remainingInterest = 0;
  let totalInstallments = 0;
  let fulfilledInstallments = 0;
  let currency = '';

  for (const contract of contracts) {
    for (const cond of contract.conditions) {
      if (cond.type === 'LOAN_PAYOUT' && cond.amount) {
        totalPrincipal += cond.amount.amount;
        if (!currency) currency = cond.amount.currency;
      }
      if (cond.type === 'LOAN_INSTALLMENT') {
        totalInstallments++;
        if (cond.status === 'FULFILLED') {
          fulfilledInstallments++;
          if (cond.repayment) {
            totalPaid += cond.repayment.amount;
          }
        } else {
          // 累计未完成期数的剩余利息
          if (cond.interest) {
            remainingInterest += cond.interest.amount;
          }
        }
      }
    }
  }

  // 未还/未收本金 = 原始本金 - 已归还本金
  const remainingPrincipal = totalPrincipal - totalPaid;
  const remainingInstallments = totalInstallments - fulfilledInstallments;
  return {
    totalPrincipal: remainingPrincipal,
    totalInterest: remainingInterest,
    totalInstallments: remainingInstallments,
    fulfilledInstallments,
    currency,
  };
}

const borrowedSummary = computed(() => getLoanSummary(borrowed.value));
const lentSummary = computed(() => getLoanSummary(lent.value));

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

    <!-- 借入贷款 -->
    <table>
      <thead>
        <tr>
          <th colspan="6" :class="$style.sectionHeader">
            📥 借入贷款
            <span v-if="!isEmpty(borrowed)" :class="$style.summary">
              未还本金:
              {{ formatAmount(borrowedSummary.totalPrincipal, borrowedSummary.currency) }}
              | 未还利息:
              {{ formatAmount(borrowedSummary.totalInterest, borrowedSummary.currency) }}
              | 已还: {{ borrowedSummary.fulfilledInstallments }} | 剩余:
              {{ borrowedSummary.totalInstallments }} 期
            </span>
          </th>
        </tr>
        <tr>
          <th>合同</th>
          <th>对方</th>
          <th>本金</th>
          <th>利息</th>
          <th>还款进度</th>
          <th>状态</th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="isEmpty(borrowed)">
          <td colspan="6" :class="$style.empty">暂无借入贷款</td>
        </tr>
        <template v-else>
          <LoanRow
            v-for="contract in borrowed"
            :key="contract.id"
            :contract="contract"
            type="borrow" />
        </template>
      </tbody>
    </table>

    <!-- 放出贷款 -->
    <table :class="$style.secondTable">
      <thead>
        <tr>
          <th colspan="6" :class="$style.sectionHeader">
            📤 放出贷款
            <span v-if="!isEmpty(lent)" :class="$style.summary">
              未收本金:
              {{ formatAmount(lentSummary.totalPrincipal, lentSummary.currency) }}
              | 未收利息:
              {{ formatAmount(lentSummary.totalInterest, lentSummary.currency) }}
              | 已收: {{ lentSummary.fulfilledInstallments }} | 剩余:
              {{ lentSummary.totalInstallments }} 期
            </span>
          </th>
        </tr>
        <tr>
          <th>合同</th>
          <th>对方</th>
          <th>本金</th>
          <th>利息</th>
          <th>回收进度</th>
          <th>状态</th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="isEmpty(lent)">
          <td colspan="6" :class="$style.empty">暂无放出贷款</td>
        </tr>
        <template v-else>
          <LoanRow v-for="contract in lent" :key="contract.id" :contract="contract" type="lend" />
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
