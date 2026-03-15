<script setup lang="ts">
import { computed } from 'vue';

// 合同状态定义
const STATUS_FILTERS = [
  { key: 'DRAFT', label: '草案', colorClass: 'neutral' },
  { key: 'OPEN', label: '公开', colorClass: 'neutral' },
  { key: 'REJECTED', label: '已拒绝', colorClass: 'bad' },
  { key: 'DEADLINE_EXCEEDED', label: '已超期', colorClass: 'bad' },
  { key: 'BREACHED', label: '已违约', colorClass: 'bad' },
  { key: 'CANCELLED', label: '已取消', colorClass: 'bad' },
  { key: 'TERMINATED', label: '已终止', colorClass: 'bad' },
  { key: 'SIGNED', label: '已签约', colorClass: 'partial' },
  { key: 'PARTIALLY_FULFILLED', label: '部分完成', colorClass: 'partial' },
  { key: 'FULFILLED', label: '已完成', colorClass: 'good' },
] as const;

const props = defineProps<{
  modelValue: Set<string>;
  showFilters?: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: Set<string>];
  'update:showFilters': [value: boolean];
}>();

const activeFilters = computed({
  get: () => props.modelValue,
  set: value => emit('update:modelValue', value),
});

const showFilters = computed({
  get: () => props.showFilters ?? true,
  set: value => emit('update:showFilters', value),
});

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
</script>

<template>
  <div :class="$style.container">
    <div :class="$style.filterBar">
      <button :class="$style.filterButton" @click="selectAll">全部</button>
      <button :class="$style.filterButton" @click="selectNone">无</button>
      <button :class="$style.filterButton" @click="showFilters = !showFilters">
        {{ showFilters ? '隐藏过滤器' : '显示过滤器' }}
      </button>
    </div>
    <div v-if="showFilters" :class="$style.contractsListTableFilter">
      <span v-for="f in STATUS_FILTERS" :key="f.key" :class="$style.radioItemContainer">
        <div
          :class="[$style.radioItemIndicator, activeFilters.has(f.key) && $style.radioItemActive]">
        </div>
        <div :class="$style.radioItemValue" @click="toggleFilter(f.key)">
          <span
            :class="
              $style[
                'contractStatus' + f.colorClass.charAt(0).toUpperCase() + f.colorClass.slice(1)
              ]
            ">
            {{ f.label }}
          </span>
        </div>
      </span>
    </div>
  </div>
</template>

<style module>
.container {
  width: 100%;
  --rp-color-text-component: #bbb;
  --rp-color-text: #999;
  --rp-color-disabled: #444;
  --rp-color-green: #5cb85c;
  --rp-color-red: #d9534f;
  --rp-color-orange: #f0ad4e;
  --rp-color-accent-primary: #ffc856;
  -webkit-font-smoothing: antialiased;
  user-select: auto;
  font-family: 'Droid Sans', sans-serif;
  font-size: 11px;
  line-height: 1.1;
  color: #bbb;
  box-sizing: border-box;
  position: relative;
  display: flex;
  flex-direction: column;
  isolation: isolate;
}

.filterBar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.filterButton {
  background-color: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  color: var(--rp-color-text-component);
  cursor: pointer;
  font-size: 11px;
  padding: 3px 6px;
  transition: all 0.2s ease;
}

.filterButton:hover {
  background-color: rgba(0, 0, 0, 0.5);
  border-color: rgba(255, 255, 255, 0.2);
}

.contractsListTableFilter {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  column-gap: 3px;
  padding: 5px;
  position: sticky;
  top: -1px;
  background: #23282b;
  z-index: 1;
}

.radioItemContainer {
  display: inline-flex;
  align-items: center;
  cursor: pointer;
  margin-right: 8px;
  position: relative;
}

.radioItemIndicator {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 2px;
  border-radius: 1px;
  background-color: transparent;
  border: none;
  transition: all 0.2s ease;
}

.radioItemActive {
  background-color: var(--rp-color-accent-primary);
  box-shadow: 0 0 2px 2px rgba(255, 200, 86, 0.3);
}

.radioItemValue {
  font-size: 11px;
  font-weight: normal;
  user-select: none;
  padding-bottom: 2px;
}

.contractStatusNeutral {
  color: var(--rp-color-text);
}

.contractStatusGood {
  color: var(--rp-color-green);
}

.contractStatusBad {
  color: var(--rp-color-red);
}

.contractStatusPartial {
  color: var(--rp-color-orange);
}
</style>
