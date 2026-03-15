<script setup lang="ts">
import { useTileState, PlannedBuilding } from '@src/features/XIT/PLAN/tile-state';
import {
  fioBuildingsStore,
  loadFioBuildings,
  FioBuilding,
  FioRecipeIO,
} from '@src/features/XIT/PLAN/fio-buildings';
import { BUILDING_NAMES_ZH } from '@src/features/XIT/PLAN/building-names-zh';
import { useXitParameters } from '@src/hooks/use-xit-parameters';
import { getPrice } from '@src/infrastructure/fio/cx';
import { userData } from '@src/store/user-data';
import { planetsStore } from '@src/infrastructure/prun-api/data/planets';
import { sitesStore } from '@src/infrastructure/prun-api/data/sites';
import { configurableValue } from '@src/features/XIT/ACT/shared-types';
import { showBuffer } from '@src/infrastructure/prun-ui/buffers';
import { formatCurrency } from '@src/utils/format';
import PrunButton from '@src/components/PrunButton.vue';
import MaterialIcon from '@src/components/MaterialIcon.vue';
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

// ── 星球环境建材 ──────────────────────────────────────────────
const PER_AREA_ENV = new Set(['MCG', 'INS', 'SEA']);
const PER_BUILDING_ENV = new Set(['TSH', 'MGC', 'BL', 'HSE', 'AEF']);

interface PlanetEnvCosts {
  perArea: Record<string, number>;
  perBuilding: Record<string, number>;
}

const planetDetailCache = new Map<string, { MaterialTicker: string; MaterialAmount: number }[]>();
const planetBuildReqs = ref<{ MaterialTicker: string; MaterialAmount: number }[] | undefined>();

async function fetchPlanetDetail(naturalId: string) {
  if (planetDetailCache.has(naturalId)) {
    planetBuildReqs.value = planetDetailCache.get(naturalId);
    return;
  }
  try {
    const resp = await fetch(`https://rest.fnar.net/planet/${encodeURIComponent(naturalId)}`);
    if (!resp.ok) {
      planetBuildReqs.value = undefined;
      return;
    }
    const data = await resp.json();
    const reqs = ((data.BuildRequirements ?? []) as any[]).map(r => ({
      MaterialTicker: r.MaterialTicker as string,
      MaterialAmount: r.MaterialAmount as number,
    }));
    planetDetailCache.set(naturalId, reqs);
    planetBuildReqs.value = reqs;
  } catch {
    planetBuildReqs.value = undefined;
  }
}

const envCosts = computed<PlanetEnvCosts | undefined>(() => {
  const reqs = planetBuildReqs.value;
  if (!reqs || reqs.length === 0) {
    return undefined;
  }
  const cm = findFioBuilding('CM');
  if (!cm) {
    return undefined;
  }
  const cmArea = cm.AreaCost;
  const result: PlanetEnvCosts = { perArea: {}, perBuilding: {} };
  for (const req of reqs) {
    if (PER_AREA_ENV.has(req.MaterialTicker)) {
      result.perArea[req.MaterialTicker] = req.MaterialAmount / cmArea;
    } else if (PER_BUILDING_ENV.has(req.MaterialTicker)) {
      result.perBuilding[req.MaterialTicker] = req.MaterialAmount;
    }
  }
  return result;
});

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

function findFioBuilding(ticker: string): FioBuilding | undefined {
  return fioBuildingsStore.buildings?.find(x => x.Ticker === ticker);
}

// ── 建筑元数据（类型 + 人口容量）──────────────────────────────
interface BuildingMetaEntry {
  type: PrunApi.PlatformModuleType;
  name: string;
  wfCapacities: PrunApi.WorkforceCapacity[];
}

const buildingMeta = computed(() => {
  const sites = sitesStore.all.value;
  const map = new Map<string, BuildingMetaEntry>();
  if (!sites) {
    return map;
  }
  for (const site of sites) {
    for (const opt of site.buildOptions.options) {
      if (!map.has(opt.ticker)) {
        map.set(opt.ticker, {
          type: opt.type,
          name: opt.name,
          wfCapacities: opt.workforceCapacities,
        });
      }
    }
  }
  return map;
});

type WfTier = 'Pioneers' | 'Settlers' | 'Technicians' | 'Engineers' | 'Scientists';
const tierToLevel: Record<WfTier, PrunApi.WorkforceLevel> = {
  Pioneers: 'PIONEER',
  Settlers: 'SETTLER',
  Technicians: 'TECHNICIAN',
  Engineers: 'ENGINEER',
  Scientists: 'SCIENTIST',
};

function getBuildingType(ticker: string): PrunApi.PlatformModuleType | undefined {
  return buildingMeta.value.get(ticker)?.type;
}

function isProductionBuilding(ticker: string): boolean {
  const t = getBuildingType(ticker);
  if (t) {
    return t === 'PRODUCTION' || t === 'RESOURCES';
  }
  const fb = findFioBuilding(ticker);
  return fb ? fb.Recipes.length > 0 : false;
}

function isHabitationBuilding(ticker: string): boolean {
  const t = getBuildingType(ticker);
  if (t) {
    return t === 'HABITATION';
  }
  if (ticker in HABITATION_FALLBACK) {
    return true;
  }
  const fb = findFioBuilding(ticker);
  return fb ? fb.Name.toLowerCase().includes('habitation') : false;
}

function isStorageBuilding(ticker: string): boolean {
  const t = getBuildingType(ticker);
  if (t) {
    return t === 'STORAGE';
  }
  const fb = findFioBuilding(ticker);
  return fb
    ? fb.Name.toLowerCase().includes('storage') || fb.Name.toLowerCase().includes('store')
    : false;
}

// 获取居住建筑在指定层级的容量。
// 优先使用游戏 API 数据，容量为 0 或不可用时回退到硬编码表。
function getWfCapacity(ticker: string, tier: WfTier): number {
  const meta = buildingMeta.value.get(ticker);
  if (meta) {
    const gameCap = meta.wfCapacities.find(c => c.level === tierToLevel[tier])?.capacity;
    if (gameCap !== undefined && gameCap > 0) {
      return gameCap;
    }
  }
  return HABITATION_FALLBACK[ticker]?.[tier] ?? 0;
}

// 已知居住建筑的默认容量回退表。
// 数据来源：PRUNner 开源项目，与游戏内部数据一致。
const HABITATION_FALLBACK: Record<string, Partial<Record<WfTier, number>>> = {
  HB1: { Pioneers: 100 },
  HB2: { Settlers: 100 },
  HB3: { Technicians: 100 },
  HB4: { Engineers: 100 },
  HB5: { Scientists: 100 },
  HBB: { Pioneers: 75, Settlers: 75 },
  HBC: { Settlers: 75, Technicians: 75 },
  HBM: { Technicians: 75, Engineers: 75 },
  HBL: { Engineers: 75, Scientists: 75 },
};

// 获取建筑显示名称：中文 → 游戏内名称 → FIO camelCase 格式化。
function getBuildingDisplayName(ticker: string): string {
  if (BUILDING_NAMES_ZH[ticker]) {
    return BUILDING_NAMES_ZH[ticker];
  }
  const gameName = buildingMeta.value.get(ticker)?.name;
  if (gameName) {
    return gameName;
  }
  const fb = findFioBuilding(ticker);
  if (!fb) {
    return ticker;
  }
  return fb.Name.replace(/([A-Z])/g, ' $1')
    .trim()
    .replace(/^./, s => s.toUpperCase());
}

// 建筑行类型标签（非生产建筑的配方列显示）。
function buildingTypeLabel(ticker: string): string {
  if (isHabitationBuilding(ticker)) {
    return '居住';
  }
  if (isStorageBuilding(ticker)) {
    return '仓库';
  }
  if (ticker === 'CM') {
    return '核心';
  }
  return '--';
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

const maxArea = computed<number>(() => permits.value * 500);

// 各层级劳动力需求（来自生产建筑）。
const workforceNeeded = computed(() => {
  const result = { Pioneers: 0, Settlers: 0, Technicians: 0, Engineers: 0, Scientists: 0 };
  for (const pb of buildings.value) {
    const fb = findFioBuilding(pb.ticker);
    if (!fb || !isProductionBuilding(pb.ticker)) {
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
    if (!isHabitationBuilding(pb.ticker)) {
      continue;
    }
    for (const tier of wfTiers) {
      result[tier] += getWfCapacity(pb.ticker, tier) * pb.count;
    }
  }
  return result;
});

function calcDailyProfit(fb: FioBuilding, recipeIdx: number, count: number): number | undefined {
  if (recipeIdx < 0 || recipeIdx >= fb.Recipes.length) {
    return undefined;
  }
  const recipe = fb.Recipes[recipeIdx];
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

const dailyProfit = computed<number | undefined>(() => {
  let total = 0;
  for (const pb of buildings.value) {
    const fb = findFioBuilding(pb.ticker);
    if (!fb || !isProductionBuilding(pb.ticker)) {
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

// 汇总所有建筑所需建材（基础 + 环境）。
const totalMaterials = computed<Record<string, number>>(() => {
  const result: Record<string, number> = {};
  const env = envCosts.value;
  for (const pb of buildings.value) {
    const fb = findFioBuilding(pb.ticker);
    if (!fb) {
      continue;
    }
    for (const cost of fb.BuildingCosts) {
      result[cost.CommodityTicker] = (result[cost.CommodityTicker] ?? 0) + cost.Amount * pb.count;
    }
    if (env) {
      for (const [ticker, rate] of Object.entries(env.perArea)) {
        result[ticker] = (result[ticker] ?? 0) + rate * fb.AreaCost * pb.count;
      }
      for (const [ticker, amount] of Object.entries(env.perBuilding)) {
        result[ticker] = (result[ticker] ?? 0) + amount * pb.count;
      }
    }
  }
  return result;
});

const wfTiers: WfTier[] = ['Pioneers', 'Settlers', 'Technicians', 'Engineers', 'Scientists'];

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

  // 收集所有待添加的居住建筑，最后一次性更新列表。
  const additions: { ticker: string; count: number }[] = [];

  for (const tier of wfTiers) {
    // 计算初始缺口 + 前序迭代已添加的供给。
    let provided = workforceProvided.value[tier];
    for (const a of additions) {
      provided += getWfCapacity(a.ticker, tier) * a.count;
    }
    const deficit = workforceNeeded.value[tier] - provided;
    if (deficit <= 0) {
      continue;
    }

    // 找到仅提供该层级劳动力的居住建筑。
    const candidates = allFio.filter(fb => {
      if (!isHabitationBuilding(fb.Ticker)) {
        return false;
      }
      const cap = getWfCapacity(fb.Ticker, tier);
      if (cap <= 0) {
        return false;
      }
      return wfTiers.every(t => t === tier || getWfCapacity(fb.Ticker, t) === 0);
    });

    if (candidates.length === 0) {
      continue;
    }

    candidates.sort((a, b) => getWfCapacity(b.Ticker, tier) - getWfCapacity(a.Ticker, tier));
    const best = candidates[0];
    const capacity = getWfCapacity(best.Ticker, tier);
    const neededCount = Math.ceil(deficit / capacity);
    additions.push({ ticker: best.Ticker, count: neededCount });
  }

  // 一次性合并到建筑列表。
  if (additions.length === 0) {
    return;
  }
  const newList = [...buildings.value];
  for (const a of additions) {
    const existing = newList.find(x => x.ticker === a.ticker);
    if (existing) {
      const idx = newList.indexOf(existing);
      newList[idx] = { ...existing, count: existing.count + a.count };
    } else {
      newList.push({ ticker: a.ticker, count: a.count, recipeIdx: -1 });
    }
  }
  buildings.value = newList;
}

// 添加建筑到规划列表（每次添加新行以支持多配方）。
function onAddBuilding(ticker: string) {
  if (!ticker) {
    return;
  }
  const newList = [...buildings.value];
  newList.push({ ticker, count: 1, recipeIdx: -1 });
  buildings.value = newList;
  selectedTicker.value = '';
}

function onRemoveBuilding(idx: number) {
  const newList = [...buildings.value];
  newList.splice(idx, 1);
  buildings.value = newList;
}

function onCountChange(idx: number, value: number | undefined) {
  if (value === undefined) {
    return;
  }
  const newList = [...buildings.value];
  newList[idx] = { ...newList[idx], count: Math.max(1, value) };
  buildings.value = newList;
}

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
  const pkgName = 'JIHUAJIANZHU';
  const pkg: UserData.ActionPackageData = {
    global: { name: pkgName },
    groups: [{ type: 'Manual', name: '建材', materials: { ...materials } }],
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
  const existingIdx = userData.actionPackages.findIndex(x => x.global.name === pkgName);
  if (existingIdx >= 0) {
    userData.actionPackages[existingIdx] = pkg;
  } else {
    userData.actionPackages.push(pkg);
  }
  showBuffer(`XIT ACT GEN ${pkgName}`);
}

// 按类型分组的建筑选项（不含行星项目等其他建筑）。
interface BuildingGroup {
  label: string;
  items: { ticker: string; displayName: string }[];
}

const buildingGroups = computed<BuildingGroup[]>(() => {
  const production: BuildingGroup['items'] = [];
  const habitation: BuildingGroup['items'] = [];
  const storage: BuildingGroup['items'] = [];
  for (const fb of allBuildings.value) {
    if (fb.Ticker === 'CM') {
      continue;
    }
    const item = {
      ticker: fb.Ticker,
      displayName: `${fb.Ticker} - ${getBuildingDisplayName(fb.Ticker)}`,
    };
    if (isProductionBuilding(fb.Ticker)) {
      production.push(item);
    } else if (isHabitationBuilding(fb.Ticker)) {
      habitation.push(item);
    } else if (isStorageBuilding(fb.Ticker)) {
      storage.push(item);
    }
    // 其他建筑（行星项目等）不显示在下拉中。
  }
  const groups: BuildingGroup[] = [];
  if (production.length > 0) {
    groups.push({ label: '生产建筑', items: production });
  }
  if (habitation.length > 0) {
    groups.push({ label: '居住建筑', items: habitation });
  }
  if (storage.length > 0) {
    groups.push({ label: '仓库', items: storage });
  }
  return groups;
});

const selectedTicker = ref('');

const planetSuggestions = computed(() => {
  const input = planet.value.trim().toLowerCase();
  if (!input || input.length < 1) {
    return [];
  }
  return (planetsStore.all.value ?? [])
    .filter(p => p.naturalId.toLowerCase().includes(input) || p.name.toLowerCase().includes(input))
    .slice(0, 20);
});

function addCoreIfMissing() {
  if (!buildings.value.find(x => x.ticker === 'CM')) {
    buildings.value = [{ ticker: 'CM', count: 1, recipeIdx: -1 }, ...buildings.value];
  }
}

watch(
  planet,
  newVal => {
    const matched = planetsStore.find(newVal.trim());
    if (matched) {
      addCoreIfMissing();
      fetchPlanetDetail(matched.naturalId);
    } else {
      planetBuildReqs.value = undefined;
    }
  },
  { immediate: true },
);

function recipeOptions(fb: FioBuilding) {
  return fb.Recipes.map((r, i) => ({
    label: r.RecipeName,
    value: String(i),
  }));
}

// 获取已选配方的产出材料列表。
function getRecipeOutputs(pb: PlannedBuilding): FioRecipeIO[] {
  const fb = findFioBuilding(pb.ticker);
  if (!fb || pb.recipeIdx < 0 || pb.recipeIdx >= fb.Recipes.length) {
    return [];
  }
  return fb.Recipes[pb.recipeIdx].Outputs;
}

function rowProfitText(pb: PlannedBuilding): string {
  const fb = findFioBuilding(pb.ticker);
  if (!fb || !isProductionBuilding(pb.ticker)) {
    return '--';
  }
  const profit = calcDailyProfit(fb, pb.recipeIdx, pb.count);
  if (profit === undefined) {
    return '?';
  }
  return formatCurrency(profit);
}

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
            <select v-model="selectedTicker" :class="$style.buildingSelect">
              <option value="">— 选择建筑 —</option>
              <optgroup v-for="group in buildingGroups" :key="group.label" :label="group.label">
                <option v-for="b in group.items" :key="b.ticker" :value="b.ticker">
                  {{ b.displayName }}
                </option>
              </optgroup>
            </select>
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
            <template v-if="findFioBuilding(pb.ticker) && isProductionBuilding(pb.ticker)">
              <div :class="$style.recipeRow">
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
                <span v-if="pb.recipeIdx >= 0" :class="$style.recipeIcons">
                  <MaterialIcon
                    v-for="out in getRecipeOutputs(pb)"
                    :key="out.Ticker"
                    :ticker="out.Ticker"
                    size="inline" />
                </span>
              </div>
            </template>
            <template v-else>
              <span :class="$style.noRecipe">{{ buildingTypeLabel(pb.ticker) }}</span>
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
/* 统一暗色主题：所有表单元素与游戏风格一致 */
.container input,
.container select {
  background: rgba(14, 21, 28, 0.85);
  color: #bbb;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 2px;
  padding: 2px 4px;
  font-size: 11px;
}

.container input:focus,
.container select:focus {
  border-color: rgba(255, 200, 86, 0.5);
  outline: none;
}

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

.buildingSelect {
  width: 240px;
  font-size: 11px;
}

.recipeRow {
  display: flex;
  align-items: center;
  gap: 4px;
}

.recipeSelect {
  flex: 1;
  min-width: 0;
  font-size: 11px;
}

.recipeIcons {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
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
