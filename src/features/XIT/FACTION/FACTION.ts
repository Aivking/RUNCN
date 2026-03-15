import FactionPanel from './FactionPanel.vue';

xit.add({
  command: ['FACTION'],
  name: '组织管理面板',
  description: '为组织提供内部管理面板。',
  optionalParameters: 'tab',
  component: () => FactionPanel,
});
