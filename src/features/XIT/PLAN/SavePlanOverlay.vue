<script setup lang="ts">
import PrunButton from '@src/components/PrunButton.vue';
import SectionHeader from '@src/components/SectionHeader.vue';
import Active from '@src/components/forms/Active.vue';
import TextInput from '@src/components/forms/TextInput.vue';
import Commands from '@src/components/forms/Commands.vue';

const { onSave, initialName } = defineProps<{
  onSave: (name: string) => void;
  initialName?: string;
}>();
const emit = defineEmits<{ (e: 'close'): void }>();

const name = ref(initialName ?? '');
const nameError = ref(false);
watch(name, () => (nameError.value = name.value.trim().length === 0));

function onSaveClick() {
  if (name.value.trim().length === 0) {
    nameError.value = true;
    return;
  }
  onSave(name.value.trim());
  emit('close');
}
</script>

<template>
  <div :class="C.DraftConditionEditor.form">
    <SectionHeader>保存基地计划</SectionHeader>
    <form>
      <Active label="计划名称" :error="nameError">
        <TextInput v-model="name" />
      </Active>
      <Commands>
        <PrunButton primary @click="onSaveClick">保存</PrunButton>
      </Commands>
    </form>
  </div>
</template>
