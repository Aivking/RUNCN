<script setup lang="ts">
import { fixed02 } from '@src/utils/format';
import AddressLink from '@src/features/XIT/CONTC/AddressLink.vue';

defineProps<{ condition: PrunApi.ContractCondition }>();
</script>

<template>
  <template v-if="condition.type === 'PAYMENT'">
    支付 {{ fixed02(condition.amount!.amount) }} {{ condition.amount!.currency }}
  </template>
  <template v-else-if="condition.type === 'LOAN_PAYOUT'">
    支付 {{ fixed02(condition.amount!.amount) }} {{ condition.amount!.currency }}
  </template>
  <template v-else-if="condition.type === 'LOAN_INSTALLMENT'">
    支付 {{ fixed02(condition.repayment!.amount + condition.interest!.amount) }}
    {{ condition.repayment!.currency }}（自动）
  </template>
  <template v-else-if="condition.type === 'DELIVERY_SHIPMENT'">
    交付货物 @
    <AddressLink :address="condition.destination!" />
  </template>
  <template v-else-if="condition.type === 'DELIVERY'">
    交付 {{ condition.quantity!.amount }} {{ condition.quantity!.material.ticker }} @
    <AddressLink :address="condition.address!" />
  </template>
  <template v-else-if="condition.type === 'PICKUP_SHIPMENT'">
    提取货物 @
    <AddressLink :address="condition.address!" />
  </template>
  <template v-else-if="condition.type === 'PROVISION_SHIPMENT'">
    供应 {{ condition.quantity!.amount }} {{ condition.quantity!.material.ticker }} @
    <AddressLink :address="condition.address!" />
  </template>
  <template v-else-if="condition.type === 'PROVISION'">
    供应 {{ condition.quantity!.amount }} {{ condition.quantity!.material.ticker }} @
    <AddressLink :address="condition.address!" />
  </template>
  <template v-else-if="condition.type === 'EXPLORATION'">
    探索
    <AddressLink :address="condition.address!" />
  </template>
  <template v-else-if="condition.type === 'COMEX_PURCHASE_PICKUP'">
    提取 {{ condition.quantity!.amount - condition.pickedUp!.amount }}
    {{ condition.quantity!.material.ticker }} @
    <AddressLink :address="condition.address!" />
  </template>
  <template v-else-if="condition.type === 'HEADQUARTERS_UPGRADE'">升级总部</template>
  <template v-else-if="condition.type === 'BASE_CONSTRUCTION'">建造基地</template>
  <template v-else-if="condition.type === 'FINISH_FLIGHT'">完成飞行</template>
  <template v-else-if="condition.type === 'PLACE_ORDER'">下单</template>
  <template v-else-if="condition.type === 'PRODUCTION_ORDER_COMPLETED'"> 完成生产订单 </template>
  <template v-else-if="condition.type === 'PRODUCTION_RUN'">运行生产</template>
  <template v-else-if="condition.type === 'START_FLIGHT'">开始飞行</template>
  <template v-else-if="condition.type === 'POWER'">成为总督</template>
  <template v-else-if="condition.type === 'REPAIR_SHIP'">修复飞船</template>
  <template v-else-if="condition.type === 'CONTRIBUTION'">贡献</template>
  <template v-else>
    {{ condition.type }}
  </template>
</template>
