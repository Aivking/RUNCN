import QuickRefuelButton from './QuickRefuelButton.vue';

async function onTileReady(tile: PrunTile) {
  if (!tile.parameter) {
    return;
  }

  const container = await $(tile.anchor, C.ShipFuelInventory.container);
  createFragmentApp(QuickRefuelButton, { registration: tile.parameter, tile }).before(container);
}

function init() {
  tiles.observe('SHPF', onTileReady);
}

features.add(import.meta.url, init, 'SHPF：添加一键加油按钮。');
