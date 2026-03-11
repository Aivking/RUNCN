import CONTS from '@src/features/XIT/CONTS/CONTS.vue';

xit.add({
  command: ['CONTS', 'CONTRACTS'],
  name: '活跃合同',
  description: '显示活跃合同。',
  contextItems: () => [{ cmd: 'XIT CONTC' }, { cmd: 'CONTS' }, { cmd: 'CONTD' }],
  component: () => CONTS,
});
