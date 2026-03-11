<script setup lang="ts">
import ContractLink from '@src/features/XIT/CONTS/ContractLink.vue';
import PartnerLink from '@src/features/XIT/CONTS/PartnerLink.vue';

const { contract } = defineProps<{
  contract: PrunApi.Contract;
  type: 'carrier' | 'shipper';
}>();

const $style = useCssModule();

// 格式化地址
function formatAddress(address?: PrunApi.Address): string {
  if (!address?.lines) return '-';
  const parts: string[] = [];
  for (const line of address.lines) {
    if (line.entity) {
      parts.push(line.entity.name);
    }
  }
  return parts.join(' / ') || '-';
}

// 提取起点地址（从 PICKUP_SHIPMENT/PROVISION_SHIPMENT 条件）
const origin = computed(() => {
  const pickup = contract.conditions.find(c => c.type === 'PICKUP_SHIPMENT');
  if (pickup?.address) return formatAddress(pickup.address);
  const provision = contract.conditions.find(c => c.type === 'PROVISION_SHIPMENT');
  if (provision?.address) return formatAddress(provision.address);
  return '-';
});

// 提取终点地址（从 DELIVERY_SHIPMENT 条件）
const destination = computed(() => {
  const delivery = contract.conditions.find(c => c.type === 'DELIVERY_SHIPMENT');
  if (delivery?.destination) return formatAddress(delivery.destination);
  if (delivery?.address) return formatAddress(delivery.address);
  return '-';
});

// 货物信息（重量/体积）
const cargo = computed(() => {
  const items: string[] = [];
  for (const cond of contract.conditions) {
    if (
      (cond.type === 'DELIVERY_SHIPMENT' || cond.type === 'PROVISION_SHIPMENT') &&
      cond.weight != null
    ) {
      const w = (cond.weight / 1000).toFixed(1);
      const v = (cond.volume! / 1000).toFixed(1);
      items.push(`${w}t / ${v}m³`);
    }
  }
  return items.length > 0 ? items.join(', ') : '-';
});

// 运费（PAYMENT 条件）
const payment = computed(() => {
  const pay = contract.conditions.find(c => c.type === 'PAYMENT');
  if (!pay?.amount) return '-';
  return `${pay.amount.amount.toLocaleString()} ${pay.amount.currency}`;
});

// 条件完成进度
const fulfilledCount = computed(
  () => contract.conditions.filter(c => c.status === 'FULFILLED').length,
);
const totalCount = computed(() => contract.conditions.length);
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
    <td>{{ origin }}</td>
    <td>{{ destination }}</td>
    <td>{{ cargo }}</td>
    <td>{{ payment }}</td>
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
