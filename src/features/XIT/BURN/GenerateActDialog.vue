<script setup lang="ts">
import PrunButton from '@src/components/PrunButton.vue';
import SectionHeader from '@src/components/SectionHeader.vue';
import Active from '@src/components/forms/Active.vue';
import NumberInput from '@src/components/forms/NumberInput.vue';
import SelectInput from '@src/components/forms/SelectInput.vue';
import RadioItem from '@src/components/forms/RadioItem.vue';
import Commands from '@src/components/forms/Commands.vue';
import { userData } from '@src/store/user-data';
import { calculatePlanetBurn } from '@src/core/burn';
import { configurableValue } from '@src/features/XIT/ACT/shared-types';
import { useXitParameters } from '@src/hooks/use-xit-parameters';
import { sitesStore } from '@src/infrastructure/prun-api/data/sites';
import { workforcesStore } from '@src/infrastructure/prun-api/data/workforces';
import { productionStore } from '@src/infrastructure/prun-api/data/production';
import { storagesStore } from '@src/infrastructure/prun-api/data/storage';
import { materialsStore } from '@src/infrastructure/prun-api/data/materials';
import { shipsStore } from '@src/infrastructure/prun-api/data/ships';
import { getEntityNameFromAddress } from '@src/infrastructure/prun-api/data/addresses';
import { fixed2 } from '@src/utils/format';
import { showBuffer } from '@src/infrastructure/prun-ui/buffers';

const parameters = useXitParameters();
const planetName = computed(() => parameters.join(' '));

const site = computed(() => sitesStore.getByPlanetNaturalIdOrName(planetName.value));

const burn = computed(() => {
  if (!site.value) {
    return undefined;
  }
  const id = site.value.siteId;
  const workforce = workforcesStore.getById(id)?.workforces;
  const production = productionStore.getBySiteId(id);
  const storage = storagesStore.getByAddressableId(id);
  if (!workforce || !production) {
    return undefined;
  }
  return {
    planetName: getEntityNameFromAddress(site.value.address) ?? planetName.value,
    burn: calculatePlanetBurn(production, workforce, storage ?? []),
  };
});

const days = ref(7);
const daysError = ref(false);
const includeConsumables = ref(true);
const includeInputs = ref(false);
const useBaseInv = ref(true);

// Exchange code to station name mapping.
const exchangeStationMap: Record<string, string> = {
  AI1: 'Antares Station',
  CI1: 'Benten Station',
  IC1: 'Hortus Station',
  NC1: 'Moria Station',
  CI2: 'Arclight Station',
  NC2: 'Hubur Station',
};

const exchanges = Object.keys(exchangeStationMap);
const exchange = ref(exchanges[0]);

// Auto-derive warehouse name from selected exchange.
const warehouseName = computed(() => `${exchangeStationMap[exchange.value]} Warehouse`);

// ── 飞船容量填满 ──────────────────────────────────────────────
const selectedShip = ref('');

const shipSelectOptions = computed(() => {
  const ships = shipsStore.all.value;
  if (!ships) return ['不限制'];
  const opts = ['不限制'];
  for (const ship of ships) {
    const store = storagesStore.getById(ship.idShipStore);
    const wCap = store?.weightCapacity ?? 0;
    const vCap = store?.volumeCapacity ?? 0;
    const label = ship.name
      ? `${ship.registration} (${ship.name}) ${fixed2(wCap)}t/${fixed2(vCap)}m³`
      : `${ship.registration} ${fixed2(wCap)}t/${fixed2(vCap)}m³`;
    opts.push(label);
  }
  return opts;
});

function getSelectedShip(): PrunApi.Ship | undefined {
  if (!selectedShip.value || selectedShip.value === '不限制') return undefined;
  const reg = selectedShip.value.split(' ')[0];
  return shipsStore.getByRegistration(reg);
}

// 根据指定天数计算材料清单的总重量和总体积。
function calcBillWeightVolume(d: number): { weight: number; volume: number } {
  if (!burn.value || d <= 0) return { weight: 0, volume: 0 };
  const consumablesOnly = includeConsumables.value && !includeInputs.value;
  let burnData = burn.value.burn;
  if (!useBaseInv.value && site.value) {
    const id = site.value.siteId;
    const wf = workforcesStore.getById(id)?.workforces;
    const prod = productionStore.getBySiteId(id);
    burnData = calculatePlanetBurn(consumablesOnly ? undefined : prod, wf, undefined);
  }
  let weight = 0;
  let volume = 0;
  for (const ticker of Object.keys(burnData)) {
    const matBurn = burnData[ticker];
    if (matBurn.dailyAmount >= 0) continue;
    if (consumablesOnly && matBurn.type !== 'workforce') continue;
    if (!consumablesOnly && !includeConsumables.value && matBurn.type === 'workforce') continue;
    const need = useBaseInv.value
      ? Math.ceil((matBurn.daysLeft - d) * matBurn.dailyAmount)
      : Math.ceil(-d * matBurn.dailyAmount);
    if (need > 0) {
      const mat = materialsStore.getByTicker(ticker);
      if (mat) {
        weight += mat.weight * need;
        volume += mat.volume * need;
      }
    }
  }
  return { weight, volume };
}

// 选中飞船时自动计算最大天数。
watch([selectedShip, includeConsumables, includeInputs, useBaseInv], () => {
  const ship = getSelectedShip();
  if (!ship) return;
  const store = storagesStore.getById(ship.idShipStore);
  if (!store) return;
  const wCap = store.weightCapacity;
  const vCap = store.volumeCapacity;
  // 二分搜索最大天数
  let lo = 1;
  let hi = 9999;
  let best = 1;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const { weight, volume } = calcBillWeightVolume(mid);
    if (weight <= wCap && volume <= vCap) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  days.value = best;
});

const packageName = computed(() => {
  const name = burn.value?.planetName ?? planetName.value;
  return `${name} Resupply ${days.value}d`;
});

// Calculate material bill for preview.
const materialBill = computed(() => {
  if (!burn.value || days.value <= 0) {
    return undefined;
  }
  const consumablesOnly = includeConsumables.value && !includeInputs.value;
  const planetBurn = burn.value.burn;

  // When useBaseInv is off, recalculate without storage.
  let burnData = planetBurn;
  if (!useBaseInv.value && site.value) {
    const id = site.value.siteId;
    const workforce = workforcesStore.getById(id)?.workforces;
    const production = productionStore.getBySiteId(id);
    burnData = calculatePlanetBurn(consumablesOnly ? undefined : production, workforce, undefined);
  }

  const result: Record<string, number> = {};
  for (const ticker of Object.keys(burnData)) {
    const matBurn = burnData[ticker];
    if (matBurn.dailyAmount >= 0) {
      continue;
    }
    if (consumablesOnly && matBurn.type !== 'workforce') {
      continue;
    }
    if (!consumablesOnly && !includeConsumables.value && matBurn.type === 'workforce') {
      continue;
    }
    const need = useBaseInv.value
      ? Math.ceil((matBurn.daysLeft - days.value) * matBurn.dailyAmount)
      : Math.ceil(-days.value * matBurn.dailyAmount);
    if (need > 0) {
      result[ticker] = need;
    }
  }
  return result;
});

// Preview: total volume and weight.
const showPreview = ref(false);

const previewTotalWeight = computed(() => {
  if (!materialBill.value) {
    return 0;
  }
  let total = 0;
  for (const [ticker, amount] of Object.entries(materialBill.value)) {
    const mat = materialsStore.getByTicker(ticker);
    if (mat) {
      total += mat.weight * amount;
    }
  }
  return total;
});

const previewTotalVolume = computed(() => {
  if (!materialBill.value) {
    return 0;
  }
  let total = 0;
  for (const [ticker, amount] of Object.entries(materialBill.value)) {
    const mat = materialsStore.getByTicker(ticker);
    if (mat) {
      total += mat.volume * amount;
    }
  }
  return total;
});

function onPreviewClick() {
  if (days.value <= 0) {
    daysError.value = true;
    return;
  }
  daysError.value = false;
  showPreview.value = !showPreview.value;
}

function onGenerateClick() {
  if (days.value <= 0) {
    daysError.value = true;
    return;
  }

  const name = burn.value?.planetName ?? planetName.value;
  const groupName = 'Resupply';
  const consumablesOnly = includeConsumables.value && !includeInputs.value;

  const pkg: UserData.ActionPackageData = {
    global: { name: packageName.value },
    groups: [
      {
        type: 'Resupply',
        name: groupName,
        planet: name,
        days: days.value,
        useBaseInv: useBaseInv.value,
        consumablesOnly,
        includeConsumables: includeConsumables.value,
        includeInputs: includeInputs.value,
        exclusions: [],
      },
    ],
    actions: [
      {
        type: 'CX Buy',
        name: 'CX Buy',
        group: groupName,
        exchange: exchange.value,
        buyPartial: false,
        allowUnfilled: false,
        useCXInv: true,
      },
      {
        type: 'MTRA',
        name: 'Transfer to Ship',
        group: groupName,
        origin: warehouseName.value,
        dest: configurableValue,
      },
    ],
  };

  // Overwrite existing package with same name, or push new one.
  const existing = userData.actionPackages.find(x => x.global.name === packageName.value);
  if (existing) {
    const index = userData.actionPackages.indexOf(existing);
    userData.actionPackages[index] = pkg;
  } else {
    userData.actionPackages.push(pkg);
  }

  // Auto-open the generated ACT execution window.
  showBuffer(`XIT ACT_${packageName.value.split(' ').join('_')}`);
}
</script>

<template>
  <div v-if="!burn" :class="C.DraftConditionEditor.form">
    <SectionHeader>生成 ACT 补充包</SectionHeader>
    <div :class="$style.notice">在 {{ planetName }} 上没有找到基地。</div>
  </div>
  <div v-else :class="C.DraftConditionEditor.form">
    <SectionHeader>生成 ACT 补充包</SectionHeader>
    <form>
      <Active label="星球">
        <span>{{ burn.planetName }}</span>
      </Active>
      <Active label="补充天数" :error="daysError">
        <NumberInput v-model="days" />
      </Active>
      <Active label="消耗品" tooltip="包含劳动力消耗品（食物、饮料等）。">
        <RadioItem v-model="includeConsumables">消耗品</RadioItem>
      </Active>
      <Active label="生产原料" tooltip="包含生产线所需的输入原料。">
        <RadioItem v-model="includeInputs">生产原料</RadioItem>
      </Active>
      <Active label="使用基地库存" tooltip="计算补充量时是否将基地中现有材料计入。">
        <RadioItem v-model="useBaseInv">使用基地库存</RadioItem>
      </Active>
      <Active label="交易所" tooltip="选择交易所，仓库自动绑定对应空间站。">
        <SelectInput v-model="exchange" :options="exchanges" />
      </Active>
      <Active label="飞船填满" tooltip="选择飞船后自动计算能装多少天补给，填满飞船。">
        <SelectInput v-model="selectedShip" :options="shipSelectOptions" />
      </Active>
      <Active label="仓库">
        <span>{{ warehouseName }}</span>
      </Active>
      <Active label="包名称">
        <span>{{ packageName }}</span>
      </Active>
      <Commands>
        <PrunButton primary @click="onGenerateClick">生成</PrunButton>
        <PrunButton primary @click="onPreviewClick">
          {{ showPreview ? '隐藏预览' : '预览' }}
        </PrunButton>
      </Commands>
    </form>
    <template v-if="showPreview && materialBill">
      <SectionHeader>预览</SectionHeader>
      <div :class="$style.preview">
        <Active label="总体积">
          <span>{{ fixed2(previewTotalVolume) }} m³</span>
        </Active>
        <Active label="总重量">
          <span>{{ fixed2(previewTotalWeight) }} t</span>
        </Active>
        <Active label="材料种类">
          <span>{{ Object.keys(materialBill).length }}</span>
        </Active>
      </div>
    </template>
  </div>
</template>

<style module>
.notice {
  padding: 8px 4px;
  color: rgb(217, 83, 79);
}

.preview {
  padding: 4px 0;
}
</style>
