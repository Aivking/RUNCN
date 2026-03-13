import { prunCssStylesheets } from '@src/infrastructure/prun-ui/prun-css';
import $style from './prun-bugs.module.css';

function removeMobileCssRules() {
  for (const style of prunCssStylesheets) {
    const styleSheet = style.sheet!;
    const rules = styleSheet.cssRules;
    try {
      for (let j = rules.length - 1; j >= 0; j--) {
        const rule = rules[j];
        if (rule instanceof CSSMediaRule && rule.media.mediaText.includes('screen')) {
          styleSheet.deleteRule(j);
        }
      }
    } catch (e) {
      console.log(`Could not modify stylesheet: ${styleSheet.href}, Error: ${e}`);
    }
  }
}

function fixZOrder() {
  applyCssRule(
    [
      `.${C.ComExOrdersPanel.filter}`,
      `.${C.LocalMarket.filter}`,
      `.${C.ContractsListTable.filter}`,
    ],
    $style.filter,
  );
  applyCssRule(`.${C.ScrollView.track}`, $style.scrollTrack);
}

function init() {
  removeMobileCssRules();
  fixZOrder();

  // 防止右上角用户信息缩小。
  applyCssRule(`.${C.Head.container}`, $style.head);

  // 项目子标签缺少 word-break。
  applyCssRule(`.${C.ColoredIcon.subLabel}`, $style.subLabel);

  // 移除 GridItemView 背景色。
  applyCssRule(`.${C.GridItemView.container}`, $style.gridItem);
  // Prevent layout shifts when items become selected by making the border consistent width.
  applyCssRule(`.${C.GridItemView.selected}`, $style.gridItemSelected);

  // 为 GridItemView 名称添加文本居中。
  applyCssRule(`.${C.GridItemView.name}`, $style.gridItemName);

  // 覆盖层会阻止材料被点击。
  applyCssRule(['PROD', 'PRODQ'], `.${C.OrderTile.overlay}`, $style.disablePointerEvents);

  // 防止 PROD 缓冲区垂直滚动条槽始终可见。
  applyCssRule('PROD', `.${C.SiteProductionLines.container}`, $style.containerScrollbarGutter);

  // GIFT 中的用户搜索结果框太大，无法适应磁贴。
  applyCssRule('GIFT', `.${C.UserSelector.suggestionsContainer}`, $style.giftSearchResults);

  // 修复系统信息中的点/箭头左偏问题
  applyCssRule(
    'SYSI',
    `.${C.EnvironmentTable.gridContainer} .${C.ColoredValue.positive}`,
    $style.centerText,
  );
  applyCssRule(
    'SYSI',
    `.${C.EnvironmentTable.gridContainer} .${C.ColoredValue.negative}`,
    $style.centerText,
  );

  // 修复工具提示箭头位置。
  applyCssRule('[data-tooltip-position="bottom"]', $style.tooltipBottom);
  applyCssRule('[data-tooltip-position="right"]', $style.tooltipRight);
}

features.add(import.meta.url, init, '修复 PrUn 的 bug。');
