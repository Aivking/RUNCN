<script setup lang="ts">
import { computed } from 'vue';
import ContractLink from '@src/features/XIT/CONTS/ContractLink.vue';
import PartnerLink from '@src/features/XIT/CONTS/PartnerLink.vue';
import ProgressBarWithText from '@src/components/ProgressBarWithText.vue';
import {
  formatAmount,
  getStatusText,
  getStatusClass,
  calculateProgress,
} from '@src/features/XIT/CONTS/utils';

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

// 货物信息（总重量/总体积）
const cargo = computed(() => {
  let totalWeight = 0;
  let totalVolume = 0;
  for (const cond of contract.conditions) {
    if (
      cond.type === 'DELIVERY_SHIPMENT' ||
      cond.type === 'PICKUP_SHIPMENT' ||
      cond.type === 'PROVISION_SHIPMENT'
    ) {
      // 直接使用 weight 和 volume 属性（单位都是吨和立方米）
      if (cond.weight != null && cond.volume != null) {
        totalWeight += cond.weight;
        totalVolume += cond.volume;
      }
    }
  }
  if (totalWeight === 0 && totalVolume === 0) return '-';
  const w = totalWeight.toFixed(2);
  const v = totalVolume.toFixed(2);
  return `${w}t / ${v}m³`;
});

// 运费（PAYMENT 条件）
const payment = computed(() => {
  const pay = contract.conditions.find(c => c.type === 'PAYMENT');
  if (!pay?.amount) return '-';
  return formatAmount(pay.amount.amount, pay.amount.currency);
});

// 条件完成进度
const progress = computed(() => calculateProgress(contract));

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
    <td>{{ origin }}</td>
    <td>{{ destination }}</td>
    <td>{{ cargo }}</td>
    <td>{{ payment }}</td>
    <td>
      <ProgressBarWithText :current="progress.fulfilled" :total="progress.total" :showText="true" />
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
