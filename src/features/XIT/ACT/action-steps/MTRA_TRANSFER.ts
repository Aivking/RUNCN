import { act } from '@src/features/XIT/ACT/act-registry';
import { serializeStorage } from '@src/features/XIT/ACT/actions/utils';
import { fixed0 } from '@src/utils/format';
import { changeInputValue, clickElement, focusElement } from '@src/util';
import { materialsStore } from '@src/infrastructure/prun-api/data/materials';
import { watchWhile } from '@src/utils/watch';
import { storagesStore } from '@src/infrastructure/prun-api/data/storage';
import { AssertFn } from '@src/features/XIT/ACT/shared-types';

interface Data {
  from: string;
  to: string;
  ticker: string;
  amount: number;
}

export const MTRA_TRANSFER = act.addActionStep<Data>({
  type: 'MTRA_TRANSFER',
  preProcessData: data => ({ ...data, ticker: data.ticker.toUpperCase() }),
  description: data => {
    const from = storagesStore.getById(data.from);
    const to = storagesStore.getById(data.to);
    const fromName = from ? serializeStorage(from) : 'NOT FOUND';
    const toName = to ? serializeStorage(to) : 'NOT FOUND';
    return `从 ${fromName} 转移 ${fixed0(data.amount)} ${data.ticker} 到 ${toName}`;
  },
  execute: async ctx => {
    const { data, log, setStatus, requestTile, waitAct, waitActionFeedback, complete, skip, fail } =
      ctx;
    const assert: AssertFn = ctx.assert;
    const { ticker, amount } = data;
    const from = storagesStore.getById(data.from);
    assert(from, 'Origin inventory not found');
    const to = storagesStore.getById(data.to);
    assert(to, 'Destination inventory not found');

    if (!from.items.find(x => x.quantity?.material.ticker === ticker)) {
      log.warning(`${ticker} 未转移（出发点中不存在）`);
      skip();
      return;
    }

    if (amount <= 0) {
      log.warning(`${ticker} 未转移（目标数量为 0）`);
      skip();
      return;
    }

    const material = materialsStore.getByTicker(ticker);
    assert(material, `Unknown material ${ticker}`);

    // 检查是否能容纳一个单位。否则 MTRA 将无法使用。
    const epsilon = 0.000001;
    const canFitWeight = to.weightCapacity - to.weightLoad - material.weight + epsilon >= 0;
    const canFitVolume = to.volumeCapacity - to.volumeLoad - material.volume + epsilon >= 0;
    if (!canFitWeight || !canFitVolume) {
      log.warning(`${ticker} 未转移（没有空间）`);
      skip();
      return;
    }

    const tile = await requestTile(
      `MTRA from-${from.id.substring(0, 8)} to-${to.id.substring(0, 8)}`,
    );
    if (!tile) {
      return;
    }

    setStatus('正在设置 MTRA 缓冲区...');
    // 点击 tile 确保窗口获得焦点。
    await clickElement(tile.anchor as HTMLElement);
    window.getSelection()?.removeAllRanges();

    const container = await $(tile.anchor, C.MaterialSelector.container);
    const input = (await $(container, 'input')) as HTMLInputElement;

    const suggestionsContainer = await $(container, C.MaterialSelector.suggestionsContainer);

    // 确保输入框获得焦点并显示建议列表，失败时自动重试。
    let suggestionsList: Element | undefined;
    for (let attempt = 0; attempt < 15; attempt++) {
      await clickElement(input);
      focusElement(input);
      input.focus();
      changeInputValue(input, ticker);
      window.getSelection()?.removeAllRanges();
      await new Promise(r => setTimeout(r, 150));
      suggestionsList = _$(container, C.MaterialSelector.suggestionsList);
      if (suggestionsList) {
        break;
      }
    }
    if (!suggestionsList) {
      fail(`无法打开材料选择器`);
      return;
    }

    suggestionsContainer.style.display = 'none';
    const match = _$$(suggestionsList, C.MaterialSelector.suggestionEntry).find(
      x => _$(x, C.ColoredIcon.label)?.textContent === ticker,
    );

    if (!match) {
      suggestionsContainer.style.display = '';
      fail(`在材料选择器中未找到 ${ticker}`);
      return;
    }

    await clickElement(match);
    suggestionsContainer.style.display = '';

    const sliderNumbers = _$$(tile.anchor, 'rc-slider-mark-text').map(x =>
      Number(x.textContent ?? 0),
    );
    const maxAmount = Math.max(...sliderNumbers);
    const allInputs = _$$(tile.anchor, 'input');
    const amountInput = allInputs[1];
    assert(amountInput !== undefined, 'Amount input not found');
    if (amount > maxAmount) {
      const leftover = amount - maxAmount;
      log.warning(
        `${fixed0(leftover)} ${ticker} 未转移 ` +
          `（已转移 ${fixed0(maxAmount)}/${fixed0(amount)}）`,
      );
      if (maxAmount === 0) {
        skip();
        return;
      }
    }
    changeInputValue(amountInput, Math.min(amount, maxAmount).toString());
    window.getSelection()?.removeAllRanges();

    const transferButton = await $(tile.anchor, C.Button.btn);

    await waitAct();
    const destinationAmount = computed(() => {
      const store = storagesStore.getById(data.to);
      return (
        store?.items
          .map(x => x.quantity ?? undefined)
          .filter(x => x !== undefined)
          .find(x => x.material.ticker === ticker)?.amount ?? 0
      );
    });
    const currentAmount = destinationAmount.value;
    await clickElement(transferButton);
    await waitActionFeedback(tile);
    setStatus('等待存储更新...');
    await watchWhile(() => destinationAmount.value === currentAmount);

    complete();
  },
});
