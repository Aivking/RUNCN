<script setup lang="ts">
import { computed } from 'vue';
import ContractLink from '@src/features/XIT/CONTS/ContractLink.vue';
import PartnerLink from '@src/features/XIT/CONTS/PartnerLink.vue';
import ProgressBarWithText from '@src/components/ProgressBarWithText.vue';
import { formatAmount, getStatusText, getStatusClass } from '@src/features/XIT/CONTS/utils';

const { contract } = defineProps<{
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
  return formatAmount(payout.amount.amount, payout.amount.currency);
});

// 每期利息（取第一个分期的利息信息）
const interest = computed(() => {
  const first = installments.value[0];
  if (!first?.interest) return '-';
  return formatAmount(first.interest.amount, first.interest.currency);
});

// 已完成的分期数
const fulfilledCount = computed(
  () => installments.value.filter(c => c.status === 'FULFILLED').length,
);

// 总分期数
const totalCount = computed(() => installments.value.length);

// 合同状态
const statusText = computed(() => getStatusText(contract.status));
const statusClass = computed(() => $style[getStatusClass(contract.status)]);
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
      <ProgressBarWithText :current="fulfilledCount" :total="totalCount" :showText="true" />
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
</style>
