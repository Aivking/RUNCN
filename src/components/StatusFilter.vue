<script setup lang="ts">
import { ref, computed } from 'vue';

// 合同状态定义
const STATUS_FILTERS = [
  { key: 'OPEN', label: '公开', colorClass: 'neutral' },
  { key: 'CLOSED', label: '进行中', colorClass: 'good' },
  { key: 'FULFILLED', label: '已完成', colorClass: 'good' },
  { key: 'PARTIALLY_FULFILLED', label: '部分完成', colorClass: 'partial' },
  { key: 'BREACHED', label: '已违约', colorClass: 'bad' },
  { key: 'TERMINATED', label: '已终止', colorClass: 'bad' },
  { key: 'CANCELLED', label: '已取消', colorClass: 'bad' },
  { key: 'REJECTED', label: '已拒绝', colorClass: 'bad' },
  { key: 'DEADLINE_EXCEEDED', label: '已逾期', colorClass: 'bad' },
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
      <span :class="$style.filterIcon">⚙</span>
      <button :class="$style.filterAction" @click="selectAll">全部</button>
      <button :class="$style.filterAction" @click="selectNone">无</button>
      <button :class="$style.filterAction" @click="showFilters = !showFilters">
        {{ showFilters ? '隐藏过滤器' : '显示过滤器' }}
      </button>
    </div>
    <div v-if="showFilters" :class="$style.statusFilters">
      <button
        v-for="f in STATUS_FILTERS"
        :key="f.key"
        :class="[
          $style.statusBtn,
          $style[f.colorClass],
          !activeFilters.has(f.key) && $style.inactive,
        ]"
        @click="toggleFilter(f.key)">
        {{ f.label }}
      </button>
    </div>
  </div>
</template>

<style module>
.container {
  width: 100%;
}

.filterBar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.filterIcon {
  opacity: 0.5;
  font-size: 12px;
}

.filterAction {
  background: none;
  border: none;
  color: var(--rp-color-accent-primary);
  cursor: pointer;
  font-size: 11px;
  padding: 2px 4px;
  text-decoration: underline;
}

.filterAction:hover {
  opacity: 0.8;
}

.statusFilters {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 6px 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.statusBtn {
  border: none;
  padding: 2px 6px;
  font-size: 11px;
  cursor: pointer;
  background: none;
  transition: opacity 0.15s;
  font-weight: bold;
}

.statusBtn.inactive {
  opacity: 0.3;
  font-weight: normal;
}

.good {
  color: var(--rp-color-green);
}

.bad {
  color: var(--rp-color-red);
}

.neutral {
  color: var(--rp-color-text);
}

.partial {
  color: var(--rp-color-orange);
}
</style>
