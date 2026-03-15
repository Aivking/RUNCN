<script setup lang="ts">
import PrunButton from '@src/components/PrunButton.vue';
import MaterialIcon from '@src/components/MaterialIcon.vue';
import SectionHeader from '@src/components/SectionHeader.vue';
import { fetchProductionSummary, reportProduction, FactionApiError } from '../use-faction-api';
import type { ProductionMemberSummary, MemberRole } from '../types';
import { getPlanetBurn } from '@src/core/burn';
import { sitesStore } from '@src/infrastructure/prun-api/data/sites';
import { materialsStore } from '@src/infrastructure/prun-api/data/materials';
import { sortMaterials } from '@src/core/sort-materials';
import { fixed0, fixed1, fixed2 } from '@src/utils/format';
import $style from '../FactionPanel.module.css';

defineProps<{ myRole: MemberRole }>();

const members = ref<ProductionMemberSummary[]>([]);
const loading = ref(false);
const error = ref('');
const submitStatus = ref<'idle' | 'submitting' | 'ok'>('idle');
const today = new Date().toISOString().slice(0, 10);

function sortedItems(items: ProductionMemberSummary['items']) {
  const mats = items.map(i => materialsStore.getByTicker(i.ticker)).filter(m => m !== undefined);
  const sorted = sortMaterials(mats);
  return sorted.map(m => items.find(i => i.ticker === m.ticker)!);
}

function formatQty(n: number) {
  const abs = Math.abs(n);
  return abs >= 1000 ? fixed0(abs) : abs >= 100 ? fixed1(abs) : fixed2(abs);
}

async function loadData() {
  loading.value = true;
  error.value = '';
  try {
    const result = await fetchProductionSummary();
    members.value = result.members;
  } catch (e) {
    if (e instanceof FactionApiError) {
      error.value = e.response.message;
    } else {
      error.value = '无法加载产出数据';
    }
  } finally {
    loading.value = false;
  }
}

async function handleSubmitMyProduction() {
  if (submitStatus.value === 'submitting') return;
  submitStatus.value = 'submitting';
  error.value = '';

  if (!sitesStore.fetched.value) {
    error.value = '游戏数据未就绪，请稍后再试';
    submitStatus.value = 'idle';
    return;
  }

  try {
    const aggregated: Record<string, number> = {};
    for (const site of sitesStore.all.value ?? []) {
      const planetBurn = getPlanetBurn(site);
      if (!planetBurn) continue;
      for (const [ticker, mat] of Object.entries(planetBurn.burn)) {
        if (mat.output > 0) {
          aggregated[ticker] = (aggregated[ticker] ?? 0) + mat.output;
        }
      }
    }

    const items = Object.entries(aggregated).map(([ticker, quantity]) => ({
      ticker,
      quantity: Math.round(quantity),
    }));

    if (items.length === 0) {
      error.value = '未检测到产出数据（确认游戏已完全加载且有生产订单）';
      submitStatus.value = 'idle';
      return;
    }

    await reportProduction(items);
    submitStatus.value = 'ok';
    await loadData();
  } catch (e) {
    if (e instanceof FactionApiError) {
      error.value = e.response.message;
    } else {
      error.value = '提交失败，请检查网络连接';
    }
    submitStatus.value = 'idle';
  }
}

onMounted(loadData);
</script>

<template>
  <div>
    <div :class="$style.membersToolbar">
      <div style="display: flex; align-items: center; gap: 6px">
        <PrunButton dark @click="loadData">刷新</PrunButton>
        <span style="font-size: 10px; opacity: 0.5">{{ today }}</span>
      </div>
      <PrunButton dark :disabled="submitStatus === 'submitting'" @click="handleSubmitMyProduction">
        <template v-if="submitStatus === 'submitting'">上报中...</template>
        <template v-else-if="submitStatus === 'ok'">✓ 已上报</template>
        <template v-else>上报我的产出</template>
      </PrunButton>
    </div>

    <div v-if="error" :class="$style.errorMessage">{{ error }}</div>
    <div v-if="loading" :class="$style.loadingMessage">加载中...</div>

    <template v-else>
      <div v-if="members.length === 0" :class="$style.emptyMessage">
        暂无产出数据 — 点击「上报我的产出」提交
      </div>

      <template v-for="member in members" :key="member.companyName">
        <SectionHeader>{{ member.companyName }}</SectionHeader>
        <table>
          <tbody>
            <tr v-for="item in sortedItems(member.items)" :key="item.ticker">
              <td :class="$style.burnIconCell">
                <MaterialIcon size="inline-table" :ticker="item.ticker" />
              </td>
              <td :class="$style.burnTickerCell">{{ item.ticker }}</td>
              <td>
                <span :class="C.ColoredValue.positive"> +{{ formatQty(item.quantity) }}/天 </span>
              </td>
            </tr>
          </tbody>
        </table>
      </template>
    </template>
  </div>
</template>
