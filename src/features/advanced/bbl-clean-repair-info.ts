import css from '@src/utils/css-utils.module.css';
import { watchEffectWhileNodeAlive } from '@src/utils/watch';
import { refPrunId } from '@src/infrastructure/prun-ui/attributes';
import { sitesStore } from '@src/infrastructure/prun-api/data/sites';
import { isRepairableBuilding } from '@src/core/buildings';

function onTileReady(tile: PrunTile) {
  const siteId = tile.parameter;
  const site = computed(() => sitesStore.getById(siteId));
  subscribe($$(tile.anchor, C.SectionList.section), section => {
    const id = refPrunId(section);
    const building = computed(() => site.value?.platforms.find(p => p.id == id.value));
    watchEffectWhileNodeAlive(section, () => {
      if (!building.value) {
        return;
      }

      setAttribute(section, 'data-rp-established', building.value.lastRepair === null);
      setAttribute(section, 'data-rp-repaired', building.value.lastRepair !== null);
      setAttribute(section, 'data-rp-infrastructure', !isRepairableBuilding(building.value));
    });
  });
}

function setAttribute(element: HTMLElement, attribute: string, value: boolean) {
  if (value) {
    element.setAttribute(attribute, '');
  } else {
    element.removeAttribute(attribute);
  }
}

function init() {
  // 隐藏 '上次维修'
  applyCssRule(
    'BBL',
    `.${C.SectionList.section}[data-rp-established] .${C.SectionList.table} tr:nth-child(2)`,
    css.hidden,
  );
  // 隐藏 '建立日期'
  applyCssRule(
    'BBL',
    `.${C.SectionList.section}[data-rp-repaired] .${C.SectionList.table} tr:nth-child(1)`,
    css.hidden,
  );
  // 隐藏 '维修费用'
  applyCssRule(
    'BBL',
    `.${C.SectionList.section}[data-rp-infrastructure] .${C.SectionList.table} tr:nth-child(3)`,
    css.hidden,
  );
  tiles.observe('BBL', onTileReady);
}

features.add(
  import.meta.url,
  init,
  'BBL\uff1a\u5f53\"\u4e0a\u6b21\u7ef4\u4fee\"\u3001\"\u5efa\u7acb\u65f6\u95f4\"\u548c\"\u7ef4\u4fee\u8d39\u7528\"\u884c\u4e3a\u7a7a\u6216\u4e0e\u7ef4\u4fee\u65e0\u5173\u65f6\u9690\u85cf\u5b83\u4eec\u3002',
);
