import { act } from '@src/features/XIT/ACT/act-registry';
import { fixed0, fixed02 } from '@src/utils/format';
import { changeInputValue, clickElement } from '@src/util';
import { fillAmount } from '@src/features/XIT/ACT/actions/cx-buy/utils';
import { storagesStore } from '@src/infrastructure/prun-api/data/storage';
import { exchangesStore } from '@src/infrastructure/prun-api/data/exchanges';
import { warehousesStore } from '@src/infrastructure/prun-api/data/warehouses';
import { watchWhile } from '@src/utils/watch';
import { materialsStore } from '@src/infrastructure/prun-api/data/materials';
import { watchEffect } from 'vue';
import { AssertFn } from '@src/features/XIT/ACT/shared-types';

interface Data {
  exchange: string;
  ticker: string;
  amount: number;
  priceLimit: number;
  buyPartial: boolean;
  allowUnfilled: boolean;
}

export const CXPO_BUY = act.addActionStep<Data>({
  type: 'CXPO_BUY',
  preProcessData: data => ({ ...data, ticker: data.ticker.toUpperCase() }),
  description: data => {
    const { ticker, exchange } = data;
    const cxTicker = `${ticker}.${exchange}`;
    const filled = fillAmount(cxTicker, data.amount, data.priceLimit);
    const amount = filled?.amount ?? data.amount;
    const priceLimit = filled?.priceLimit ?? data.priceLimit;
    const allowUnfilled = data.allowUnfilled ?? false;
    const willFillCompletely = filled && filled.amount === data.amount;

    if (!willFillCompletely && allowUnfilled) {
      let description = `在 ${exchange} 上投标 ${fixed0(data.amount)} ${ticker}`;
      if (isFinite(priceLimit)) {
        description += `，价格 ${fixed02(data.priceLimit)}`;
        description += `（总费用 ${fixed0(data.amount * data.priceLimit)}）`;
      }
      return description;
    }

    let description = `在 ${exchange} 上购买 ${fixed0(amount)} ${ticker}`;
    if (isFinite(priceLimit)) {
      description += `，价格限制 ${fixed02(priceLimit)}`;
    }
    if (filled) {
      description += `（总费用 ${fixed0(filled.cost)}）`;
    } else {
      description += '（暂无价格数据）';
    }
    return description;
  },
  execute: async ctx => {
    const { data, log, setStatus, requestTile, waitAct, waitActionFeedback, complete, skip, fail } =
      ctx;
    const assert: AssertFn = ctx.assert;
    const { amount, ticker, exchange, priceLimit } = data;
    const cxTicker = `${ticker}.${exchange}`;
    const cxWarehouse = computed(() => {
      const naturalId = exchangesStore.getNaturalIdFromCode(exchange);
      const warehouse = warehousesStore.getByEntityNaturalId(naturalId);
      return storagesStore.getById(warehouse?.storeId);
    });
    assert(cxWarehouse.value, `CX warehouse not found for ${exchange}`);

    if (amount <= 0) {
      log.warning(`${ticker} 未购买（目标数量为 0）`);
      skip();
      return;
    }

    const material = materialsStore.getByTicker(ticker);
    assert(material, `Unknown material ${ticker}`);

    const canFitWeight =
      material.weight * amount <= cxWarehouse.value.weightCapacity - cxWarehouse.value.weightLoad;
    const canFitVolume =
      material.volume * amount <= cxWarehouse.value.volumeCapacity - cxWarehouse.value.volumeLoad;
    assert(
      canFitWeight && canFitVolume,
      `Cannot not buy ${fixed0(amount)} ${ticker} (will not fit in the warehouse)`,
    );

    const tile = await requestTile(`CXPO ${cxTicker}`);
    if (!tile) {
      return;
    }

    setStatus('正在设置 CXPO 缓冲区...');

    const buyButton = await $(tile.anchor, C.Button.success);
    const form = await $(tile.anchor, C.ComExPlaceOrderForm.form);
    const inputs = _$$(form, 'input');
    const quantityInput = inputs[0];
    assert(quantityInput !== undefined, 'Missing quantity input');
    const priceInput = inputs[1];
    assert(priceInput !== undefined, 'Missing price input');

    let shouldUnwatch = false;
    const unwatch = watchEffect(() => {
      if (shouldUnwatch) {
        unwatch();
        return;
      }

      const filled = fillAmount(cxTicker, amount, priceLimit);

      if (!filled) {
        shouldUnwatch = true;
        fail(`缺少 ${cxTicker} 订单簿数据`);
        return;
      }

      if (filled.amount < amount && !data.allowUnfilled) {
        if (!data.buyPartial) {
          let message = `${exchange} 上没有足够的材料购买 ${fixed0(amount)} ${ticker}`;
          if (isFinite(priceLimit)) {
            message += ` with price limit ${fixed02(priceLimit)}/u`;
          }
          shouldUnwatch = true;
          fail(message);
          return;
        }

        const leftover = amount - filled.amount;
        let message =
          `${fixed0(leftover)} ${ticker} 将不会在 ${exchange} 上购买 ` +
          `（${fixed0(filled.amount)}/${fixed0(amount)} 可用`;
        if (isFinite(priceLimit)) {
          message += ` with price limit ${fixed02(priceLimit)}/u`;
        }
        message += ')';
        log.warning(message);
        if (filled.amount === 0) {
          shouldUnwatch = true;
          skip();
          return;
        }
      }

      if (data.allowUnfilled) {
        changeInputValue(quantityInput, data.amount.toString());
        changeInputValue(priceInput, fixed02(data.priceLimit));
      } else {
        changeInputValue(quantityInput, filled.amount.toString());
        changeInputValue(priceInput, fixed02(filled.priceLimit));
      }

      // 在点击买入按钮之前缓存描述，因为
      // 点击后订单簿数据会发生变化。
      ctx.cacheDescription();
    });

    await waitAct();
    unwatch();

    const warehouseAmount = computed(() => {
      return (
        cxWarehouse.value?.items
          .map(x => x.quantity ?? undefined)
          .filter(x => x !== undefined)
          .find(x => x.material.ticker === ticker)?.amount ?? 0
      );
    });
    const currentAmount = warehouseAmount.value;
    const amountToFill = fillAmount(cxTicker, amount, priceLimit)?.amount ?? 0;
    const shouldWaitForUpdate = amountToFill > 0;

    await clickElement(buyButton);
    await waitActionFeedback(tile);

    if (shouldWaitForUpdate) {
      setStatus('等待存储更新...');
      await watchWhile(() => warehouseAmount.value === currentAmount);
    } else {
      setStatus('买单已创建');
    }

    complete();
  },
});
