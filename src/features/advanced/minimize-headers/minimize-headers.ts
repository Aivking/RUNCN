import MinimizeRow from './MinimizeRow.vue';
import { streamHtmlCollection } from '@src/utils/stream-html-collection';
import { computedTileState } from '@src/store/user-data-tiles';
import { getTileState } from './tile-state';

const MINIMIZE_ATTR = 'data-rp-minimize-row';

function onTileReady(tile: PrunTile) {
  const isMinimized = computedTileState(getTileState(tile), 'minimizeHeader', true);
  let minimizeRowCreated = false;

  subscribe(streamHtmlCollection(tile.anchor, tile.anchor.children), async child => {
    const header = await $(child, C.FormComponent.containerPassive);
    setHeaders(tile, isMinimized.value);

    if (!minimizeRowCreated) {
      minimizeRowCreated = true;
      createFragmentApp(
        MinimizeRow,
        reactive({
          isMinimized,
          onClick: () => {
            isMinimized.value = !isMinimized.value;
            setHeaders(tile, isMinimized.value);
          },
        }),
      ).before(header);
      // Mark the created MinimizeRow so setHeaders can skip it
      const minimizeEl = header.previousElementSibling;
      if (minimizeEl) {
        minimizeEl.setAttribute(MINIMIZE_ATTR, '');
      }
    }
  });
}

function setHeaders(tile: PrunTile, isMinimized: boolean) {
  for (const header of _$$(tile.anchor, C.FormComponent.containerPassive)) {
    // Skip the MinimizeRow added by this feature
    if (header.hasAttribute(MINIMIZE_ATTR)) {
      continue;
    }
    const label = _$(header, C.FormComponent.label);
    if (label?.textContent === 'Minimize' || label?.textContent === '最小化') {
      continue;
    }
    if (label?.textContent === 'Termination request') {
      const value = _$(header, C.FormComponent.input);
      if (value?.textContent !== '--') {
        continue;
      }
    }
    header.style.display = isMinimized ? 'none' : 'flex';
  }
}

function init() {
  tiles.observe(['CX', 'CONT', 'LM', 'SYSI'], onTileReady);
}

features.add(import.meta.url, init, '最小化 CX、CONT、LM 和 SYSI 中的标题栏。');
