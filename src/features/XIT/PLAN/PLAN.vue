<script setup lang="ts">
import { useTileState, PlannedBuilding } from '@src/features/XIT/PLAN/tile-state';
import {
  fioBuildingsStore,
  loadFioBuildings,
  FioBuilding,
  isHabitationBuilding,
  isProductionBuilding,
} from '@src/features/XIT/PLAN/fio-buildings';
import { useXitParameters } from '@src/hooks/use-xit-parameters';
import { getPrice } from '@src/infrastructure/fio/cx';
import { userData } from '@src/store/user-data';
import { planetsStore } from '@src/infrastructure/prun-api/data/planets';
import { configurableValue } from '@src/features/XIT/ACT/shared-types';
import { showBuffer } from '@src/infrastructure/prun-ui/buffers';
import { formatCurrency } from '@src/utils/format';
import PrunButton from '@src/components/PrunButton.vue';
import Active from '@src/components/forms/Active.vue';
import SelectInput from '@src/components/forms/SelectInput.vue';
import NumberInput from '@src/components/forms/NumberInput.vue';

// 从 XIT 参数中读取初始星球。
const parameters = useXitParameters();

const planet = useTileState('planet');
const permits = useTileState('permits');
const exchange = useTileState('exchange');
const buildings = useTileState('buildings');

// 若用户通过参数传入星球，则预填充。
if (parameters.length > 0 && !planet.value) {
  planet.value = parameters[0];
}

// 懒加载 FIO 建筑数据。
loadFioBuildings();

// 交易所选项列表。
const exchangeOptions = ['IC1', 'AI1', 'NC1', 'CI1', 'NC2', 'CI2'];

// 可供选择的所有建筑列表（按 Ticker 排序）。
const allBuildings = computed<FioBuilding[]>(() => {
  const list = fioBuildingsStore.buildings;
  if (!list) {
    return [];
  }
  return [...list].sort((a, b) => a.Ticker.localeCompare(b.Ticker));
});

// 当前已选建筑对应的 FioBuilding 信息。
function findFioBuilding(ticker: string): FioBuilding | undefined {
  return fioBuildingsStore.buildings?.find(x => x.Ticker === ticker);
}

// 已用面积合计。
const totalArea = computed<number>(() => {
  let sum = 0;
  for (const pb of buildings.value) {
    const fb = findFioBuilding(pb.ticker);
    if (fb) {
      sum += fb.AreaCost * pb.count;
    }
  }
  return sum;
});

// 最大可用面积（每张许可证 500 平方单位）。
const maxArea = computed<number>(() => permits.value * 500);

// 各层级劳动力需求（来自生产建筑）。
const workforceNeeded = computed(() => {
  const result = { Pioneers: 0, Settlers: 0, Technicians: 0, Engineers: 0, Scientists: 0 };
  for (const pb of buildings.value) {
    const fb = findFioBuilding(pb.ticker);
    if (!fb || !isProductionBuilding(fb)) {
      continue;
    }
    result.Pioneers += fb.Pioneers * pb.count;
    result.Settlers += fb.Settlers * pb.count;
    result.Technicians += fb.Technicians * pb.count;
    result.Engineers += fb.Engineers * pb.count;
    result.Scientists += fb.Scientists * pb.count;
  }
  return result;
});

// 各层级劳动力供给（来自居住建筑）。
const workforceProvided = computed(() => {
  const result = { Pioneers: 0, Settlers: 0, Technicians: 0, Engineers: 0, Scientists: 0 };
  for (const pb of buildings.value) {
    const fb = findFioBuilding(pb.ticker);
    if (!fb || !isHabitationBuilding(fb)) {
      continue;
    }
    result.Pioneers += fb.Pioneers * pb.count;
    result.Settlers += fb.Settlers * pb.count;
    result.Technicians += fb.Technicians * pb.count;
    result.Engineers += fb.Engineers * pb.count;
    result.Scientists += fb.Scientists * pb.count;
  }
  return result;
});

// 计算单条生产线的每日利润（输出价值减去输入价值）。
function calcDailyProfit(fb: FioBuilding, recipeIdx: number, count: number): number | undefined {
  if (recipeIdx < 0 || recipeIdx >= fb.Recipes.length) {
    return undefined;
  }
  const recipe = fb.Recipes[recipeIdx];
  // 每日运行次数。
  const runsPerDay = 86400000 / recipe.DurationMs;
  let outputValue = 0;
  for (const out of recipe.Outputs) {
    const price = getPrice(out.Ticker);
    if (price === undefined) {
      return undefined;
    }
    outputValue += out.Amount * price * runsPerDay;
  }
  let inputValue = 0;
  for (const inp of recipe.Inputs) {
    const price = getPrice(inp.Ticker);
    if (price === undefined) {
      return undefined;
    }
    inputValue += inp.Amount * price * runsPerDay;
  }
  return (outputValue - inputValue) * count;
}

// 所有建筑的每日总利润。
const dailyProfit = computed<number | undefined>(() => {
  let total = 0;
  for (const pb of buildings.value) {
    const fb = findFioBuilding(pb.ticker);
    if (!fb || !isProductionBuilding(fb)) {
      continue;
    }
    const profit = calcDailyProfit(fb, pb.recipeIdx, pb.count);
    if (profit === undefined) {
      return undefined;
    }
    total += profit;
  }
  return total;
});

// 汇总所有计划建筑所需的建材。
const totalMaterials = computed<Record<string, number>>(() => {
  const result: Record<string, number> = {};
  for (const pb of buildings.value) {
    const fb = findFioBuilding(pb.ticker);
    if (!fb) {
      continue;
    }
    for (const cost of fb.BuildingCosts) {
      result[cost.CommodityTicker] = (result[cost.CommodityTicker] ?? 0) + cost.Amount * pb.count;
    }
  }
  return result;
});

// 劳动力层级列表（有序）。
type WfTier = 'Pioneers' | 'Settlers' | 'Technicians' | 'Engineers' | 'Scientists';
const wfTiers: WfTier[] = ['Pioneers', 'Settlers', 'Technicians', 'Engineers', 'Scientists'];

// 中文层级名称映射。
const wfTierNames: Record<WfTier, string> = {
  Pioneers: '先驱',
  Settlers: '定居者',
  Technicians: '技师',
  Engineers: '工程师',
  Scientists: '科学家',
};

// 自动配平居住建筑：为每个缺口层级补充居住建筑。
function onAutoBalance() {
  const allFio = fioBuildingsStore.buildings;
  if (!allFio) {
    return;
  }

  for (const tier of wfTiers) {
    const deficit = workforceNeeded.value[tier] - workforceProvided.value[tier];
    if (deficit <= 0) {
      continue;
    }

    // 找到仅提供该层级劳动力的居住建筑。
    const candidates = allFio.filter(fb => {
      if (!isHabitationBuilding(fb)) {
        return false;
      }
      // 只允许唯一层级有值，其余为零。
      const tiers: WfTier[] = ['Pioneers', 'Settlers', 'Technicians', 'Engineers', 'Scientists'];
      for (const t of tiers) {
        if (t !== tier && fb[t] > 0) {
          return false;
        }
      }
      return fb[tier] > 0;
    });

    if (candidates.length === 0) {
      continue;
    }

    // 选择容量最大的居住建筑。
    candidates.sort((a, b) => b[tier] - a[tier]);
    const best = candidates[0];
    const capacity = best[tier];
    const neededCount = Math.ceil(deficit / capacity);

    // 查找已有的规划条目。
    const existing = buildings.value.find(x => x.ticker === best.Ticker);
    const newList = [...buildings.value];
    if (existing) {
      const idx = newList.indexOf(existing);
      newList[idx] = { ...existing, count: existing.count + neededCount };
    } else {
      newList.push({ ticker: best.Ticker, count: neededCount, recipeIdx: -1 });
    }
    buildings.value = newList;
  }
}

// 添加建筑到规划列表。
function onAddBuilding(ticker: string) {
  if (!ticker) {
    return;
  }
  const existing = buildings.value.find(x => x.ticker === ticker);
  const newList = [...buildings.value];
  if (existing) {
    const idx = newList.indexOf(existing);
    newList[idx] = { ...existing, count: existing.count + 1 };
  } else {
    newList.push({ ticker, count: 1, recipeIdx: -1 });
  }
  buildings.value = newList;
  selectedTicker.value = '';
}

// 删除规划列表中的建筑条目。
function onRemoveBuilding(idx: number) {
  const newList = [...buildings.value];
  newList.splice(idx, 1);
  buildings.value = newList;
}

// 更新某行的数量。
function onCountChange(idx: number, value: number | undefined) {
  if (value === undefined) {
    return;
  }
  const newList = [...buildings.value];
  newList[idx] = { ...newList[idx], count: Math.max(1, value) };
  buildings.value = newList;
}

// 更新某行的选中配方索引。
function onRecipeChange(idx: number, value: string) {
  const newList = [...buildings.value];
  newList[idx] = { ...newList[idx], recipeIdx: parseInt(value, 10) };
  buildings.value = newList;
}

// 生成建材采购 ACT 操作包。
function onGenerateAct() {
  const materials = totalMaterials.value;
  if (Object.keys(materials).length === 0) {
    return;
  }

  // 固定包名。
  const pkgName = 'JIHUAJIANZHU';

  const pkg: UserData.ActionPackageData = {
    global: { name: pkgName },
    groups: [
      {
        type: 'Manual',
        name: '建材',
        materials: { ...materials },
      },
    ],
    actions: [
      {
        type: 'CX Buy',
        name: '采购建材',
        group: '建材',
        exchange: exchange.value !== configurableValue ? exchange.value : undefined,
        buyPartial: false,
        allowUnfilled: false,
        useCXInv: true,
      },
    ],
  };

  // 找到同名包并替换，否则新增。
  const existingIdx = userData.actionPackages.findIndex(x => x.global.name === pkgName);
  if (existingIdx >= 0) {
    userData.actionPackages[existingIdx] = pkg;
  } else {
    userData.actionPackages.push(pkg);
  }

  showBuffer(`XIT ACT GEN ${pkgName}`);
}

// 构建建筑下拉选项列表。
const buildingOptions = computed(() => {
  return allBuildings.value.map(fb => ({
    label: `${fb.Ticker} - ${fb.Name}`,
    value: fb.Ticker,
  }));
});

// 当前在添加建筑下拉框中选中的 Ticker。
const selectedTicker = ref('');

// 星球搜索建议列表（最多 20 条，按自然编号匹配优先）。
const planetSuggestions = computed(() => {
  const input = planet.value.trim().toLowerCase();
  if (!input || input.length < 1) {
    return [];
  }
  return (planetsStore.all.value ?? [])
    .filter(p => p.naturalId.toLowerCase().includes(input) || p.name.toLowerCase().includes(input))
    .slice(0, 20);
});

// 若 CM 核心尚未在规划列表中则添加到列表首位。
function addCoreIfMissing() {
  if (!buildings.value.find(x => x.ticker === 'CM')) {
    buildings.value = [{ ticker: 'CM', count: 1, recipeIdx: -1 }, ...buildings.value];
  }
}

// 监听星球输入：匹配到已知星球时自动添加 CM 核心。
watch(planet, newVal => {
  if (planetsStore.find(newVal.trim())) {
    addCoreIfMissing();
  }
});

// 获取建筑某行的配方选项列表。
function recipeOptions(fb: FioBuilding) {
  return fb.Recipes.map((r, i) => ({
    label: r.RecipeName,
    value: String(i),
  }));
}

// 获取建筑行的每日利润格式化文本。
function rowProfitText(pb: PlannedBuilding): string {
  const fb = findFioBuilding(pb.ticker);
  if (!fb || !isProductionBuilding(fb)) {
    return '--';
  }
  const profit = calcDailyProfit(fb, pb.recipeIdx, pb.count);
  if (profit === undefined) {
    return '?';
  }
  return formatCurrency(profit);
}

// 劳动力状态标志（是否满足）。
function wfOk(tier: WfTier): boolean {
  return workforceProvided.value[tier] >= workforceNeeded.value[tier];
}
</script>

<template>
  <div :class="$style.container">
    <!-- 加载状态 -->
    <div v-if="fioBuildingsStore.loading" :class="$style.status">载入中...</div>
    <div v-else-if="fioBuildingsStore.error" :class="$style.status">加载失败，无法连接 FIO。</div>

    <template v-else>
      <!-- 顶部参数行 -->
      <div :class="$style.paramRow">
        <Active label="星球">
          <input
            v-model="planet"
            type="text"
            placeholder="星球标识符或名称"
            list="bplan-planet-list"
            :class="$style.planetInput" />
          <datalist id="bplan-planet-list">
            <option v-for="p in planetSuggestions" :key="p.naturalId" :value="p.naturalId">
              {{ p.name }}
            </option>
          </datalist>
        </Active>
        <Active label="许可证">
          <NumberInput :model-value="permits" @update:model-value="v => (permits = v ?? 1)" />
        </Active>
        <span :class="$style.areaInfo">已用面积：{{ totalArea }} / {{ maxArea }}</span>
        <Active label="交易所">
          <SelectInput v-model="exchange" :options="exchangeOptions" />
        </Active>
      </div>

      <!-- 建筑列表 -->
      <div :class="$style.section">
        <div :class="$style.sectionHeader">
          <span>建筑列表</span>
          <div :class="$style.addRow">
            <SelectInput
              v-model="selectedTicker"
              :options="[{ label: '— 选择建筑 —', value: '' }, ...buildingOptions]" />
            <PrunButton primary :disabled="!selectedTicker" @click="onAddBuilding(selectedTicker)">
              + 添加
            </PrunButton>
          </div>
        </div>

        <!-- 表格头 -->
        <div v-if="buildings.length > 0" :class="$style.tableHeader">
          <span :class="$style.colTicker">建筑</span>
          <span :class="$style.colCount">数量</span>
          <span :class="$style.colRecipe">配方</span>
          <span :class="$style.colArea">面积</span>
          <span :class="$style.colProfit">每日利润</span>
          <span :class="$style.colDel"></span>
        </div>

        <!-- 建筑行 -->
        <div v-for="(pb, idx) in buildings" :key="idx" :class="$style.buildingRow">
          <span :class="$style.colTicker">{{ pb.ticker }}</span>
          <span :class="$style.colCount">
            <input
              type="number"
              min="1"
              :value="pb.count"
              :class="$style.countInput"
              @change="
                e => onCountChange(idx, parseInt((e.target as HTMLInputElement).value, 10))
              " />
          </span>
          <span :class="$style.colRecipe">
            <template
              v-if="
                findFioBuilding(pb.ticker) && isProductionBuilding(findFioBuilding(pb.ticker)!)
              ">
              <select
                :value="String(pb.recipeIdx)"
                :class="$style.recipeSelect"
                @change="e => onRecipeChange(idx, (e.target as HTMLSelectElement).value)">
                <option value="-1">— 选择配方 —</option>
                <option
                  v-for="opt in recipeOptions(findFioBuilding(pb.ticker)!)"
                  :key="opt.value"
                  :value="opt.value">
                  {{ opt.label }}
                </option>
              </select>
            </template>
            <template v-else>
              <span :class="$style.noRecipe">居住</span>
            </template>
          </span>
          <span :class="$style.colArea">
            {{ findFioBuilding(pb.ticker)?.AreaCost ?? 0 }}
          </span>
          <span :class="$style.colProfit">{{ rowProfitText(pb) }}</span>
          <span :class="$style.colDel">
            <PrunButton danger inline @click="onRemoveBuilding(idx)">✕</PrunButton>
          </span>
        </div>

        <div v-if="buildings.length === 0" :class="$style.empty"
          >暂无建筑，请从上方下拉列表添加。</div
        >
      </div>

      <!-- 自动配平 -->
      <div :class="$style.section">
        <PrunButton neutral @click="onAutoBalance">自动配平居住建筑</PrunButton>
      </div>

      <!-- 人口统计 -->
      <div :class="$style.section">
        <div :class="$style.wfRow">
          <span :class="$style.wfLabel">人口统计：</span>
          <span
            v-for="tier in wfTiers"
            :key="tier"
            :class="[$style.wfTier, wfOk(tier) ? $style.wfOk : $style.wfWarn]">
            {{ wfTierNames[tier] }}
            {{ workforceProvided[tier] }}/{{ workforceNeeded[tier] }}
            {{ wfOk(tier) ? '✓' : '⚠' }}
          </span>
        </div>
      </div>

      <!-- 每日总利润 -->
      <div :class="$style.section">
        <span :class="$style.profitLabel">每日总利润：</span>
        <span
          :class="[
            $style.profitValue,
            dailyProfit !== undefined && dailyProfit >= 0 ? $style.positive : $style.negative,
          ]">
          {{ dailyProfit !== undefined ? formatCurrency(dailyProfit) : '价格数据加载中...' }}
        </span>
      </div>

      <!-- 所需建材 -->
      <div :class="$style.section">
        <span :class="$style.matLabel">所需建材：</span>
        <span v-if="Object.keys(totalMaterials).length === 0" :class="$style.empty">无</span>
        <span v-for="(amt, ticker) in totalMaterials" :key="ticker" :class="$style.matChip">
          {{ ticker }}×{{ amt }}
        </span>
      </div>

      <!-- 生成 ACT -->
      <div :class="$style.section">
        <PrunButton
          primary
          :disabled="Object.keys(totalMaterials).length === 0"
          @click="onGenerateAct">
          生成建材采购 ACT
        </PrunButton>
      </div>
    </template>
  </div>
</template>

<style module>
.container {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 4px;
  font-size: 11px;
}

.status {
  padding: 8px;
  color: #aaa;
}

.paramRow {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
}

.planetInput {
  width: 140px;
}

.areaInfo {
  white-space: nowrap;
  padding: 0 4px;
}

.section {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  padding-top: 4px;
}

.sectionHeader {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  gap: 4px;
}

.addRow {
  display: flex;
  align-items: center;
  gap: 4px;
}

.tableHeader,
.buildingRow {
  display: grid;
  grid-template-columns: 50px 60px 1fr 50px 100px 30px;
  gap: 4px;
  align-items: center;
  width: 100%;
}

.tableHeader {
  font-weight: bold;
  opacity: 0.7;
}

.colTicker,
.colCount,
.colRecipe,
.colArea,
.colProfit,
.colDel {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.countInput {
  width: 50px;
}

.recipeSelect {
  width: 100%;
  font-size: 11px;
}

.noRecipe {
  opacity: 0.5;
}

.empty {
  opacity: 0.5;
  font-style: italic;
}

.wfRow {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.wfLabel {
  font-weight: bold;
}

.wfTier {
  white-space: nowrap;
}

.wfOk {
  color: #4caf50;
}

.wfWarn {
  color: #ff9800;
}

.profitLabel {
  font-weight: bold;
}

.positive {
  color: #4caf50;
}

.negative {
  color: #f44336;
}

.matLabel {
  font-weight: bold;
}

.matChip {
  background: rgba(255, 255, 255, 0.08);
  padding: 1px 5px;
  border-radius: 3px;
}
</style>
