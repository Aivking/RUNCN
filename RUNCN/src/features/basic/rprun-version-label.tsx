import $style from './rprun-version-label.module.css';

async function onFooterReady(footer: HTMLElement) {
  const userCount = await $(footer, C.UsersOnlineCount.container);

  function onClick() {
    window.open('https://qm.qq.com/q/orvlELomcg', '_blank');
  }

  createFragmentApp(() => (
    <div
      class={[$style.container, C.HeadItem.container, C.fonts.fontRegular, C.type.typeRegular]}
      onClick={onClick}>
      <div class={[C.HeadItem.indicator, C.HeadItem.indicatorSuccess]} />
      <div
        class={[$style.label, C.HeadItem.label]}
        data-tooltip="琉璃制 FOXV"
        data-tooltip-position="top">
        v. {config.version} 琉璃制 FOXV
      </div>
    </div>
  )).before(userCount);
}

function init() {
  applyCssRule(`.${C.Frame.foot}`, $style.foot);
  subscribe($$(document, C.Frame.foot), onFooterReady);
}

features.add(import.meta.url, init, '在右下角添加"Refined PrUn 版本"标签。');
