<script setup lang="ts">
import ContractLink from '@src/features/XIT/CONTS/ContractLink.vue';
import PartnerLink from '@src/features/XIT/CONTS/PartnerLink.vue';

const { contract, type } = defineProps<{
  contract: PrunApi.Contract;
  type: 'borrow' | 'lend';
}>();

const $style = useCssModule();

// 贷款发放条件
const payoutCondition = computed(() => contract.conditions.find(c => c.type === 'LOAN_PAYOUT'));

// 所有分期还款条件
const installments = computed(() => contract.conditions.filter(c => c.type === 'LOAN_INSTALLMENT'));

// 本金金额
const principal = computed(() => {
  const payout = payoutCondition.value;
  if (!payout?.amount) return '';
  return `${payout.amount.amount.toLocaleString()} ${payout.amount.currency}`;
});

// 每期利息（取第一个分期的利息信息）
const interest = computed(() => {
  const first = installments.value[0];
  if (!first?.interest) return '-';
  return `${first.interest.amount.toLocaleString()} ${first.interest.currency}`;
});

// 已完成的分期数
const fulfilledCount = computed(
  () => installments.value.filter(c => c.status === 'FULFILLED').length,
);

// 总分期数
const totalCount = computed(() => installments.value.length);

// 进度百分比
const progress = computed(() => {
  if (totalCount.value === 0) return 0;
  return Math.round((fulfilledCount.value / totalCount.value) * 100);
});

// 合同状态
const statusText = computed(() => {
  switch (contract.status) {
    case 'OPEN':
      return '待接受';
    case 'CLOSED':
      return '进行中';
    case 'FULFILLED':
      return '已完成';
    case 'PARTIALLY_FULFILLED':
      return '部分完成';
    case 'BREACHED':
      return '已违约';
    case 'TERMINATED':
      return '已终止';
    case 'CANCELLED':
      return '已取消';
    case 'REJECTED':
      return '已拒绝';
    case 'DEADLINE_EXCEEDED':
      return '已逾期';
    default:
      return contract.status;
  }
});

const statusClass = computed(() => {
  switch (contract.status) {
    case 'FULFILLED':
      return $style.fulfilled;
    case 'CLOSED':
    case 'PARTIALLY_FULFILLED':
      return $style.active;
    case 'BREACHED':
    case 'TERMINATED':
    case 'DEADLINE_EXCEEDED':
      return $style.failed;
    case 'OPEN':
      return $style.pending;
    default:
      return '';
  }
});

const progressClass = computed(() => {
  if (progress.value >= 100) return $style.fulfilled;
  if (progress.value > 50) return $style.active;
  return $style.pending;
});
</script>

<template>
  <tr>
    <td>
      <ContractLink :contract="contract" />
    </td>
    <td>
      <PartnerLink :contract="contract" />
    </td>
    <td>{{ principal }}</td>
    <td>{{ interest }}</td>
    <td>
      <div :class="$style.progressContainer">
        <div :class="$style.progressBar">
          <div :class="[$style.progressFill, progressClass]" :style="{ width: progress + '%' }" />
        </div>
        <span :class="$style.progressText">{{ fulfilledCount }}/{{ totalCount }}</span>
      </div>
    </td>
    <td :class="statusClass">{{ statusText }}</td>
  </tr>
</template>

<style module>
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

.progressFill.active {
  background: var(--rp-color-orange);
}

.progressFill.pending {
  background: var(--rp-color-text);
}

.progressText {
  font-size: 11px;
  white-space: nowrap;
}
</style>
