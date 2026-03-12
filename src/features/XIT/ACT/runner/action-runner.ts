import { act } from '@src/features/XIT/ACT/act-registry';
import { deepToRaw } from '@src/utils/deep-to-raw';
import { Logger } from '@src/features/XIT/ACT/runner/logger';
import { TileAllocator } from '@src/features/XIT/ACT/runner/tile-allocator';
import { StepMachine } from '@src/features/XIT/ACT/runner/step-machine';
import { StepGenerator } from '@src/features/XIT/ACT/runner/step-generator';
import { ActionPackageConfig, ActionStep } from '@src/features/XIT/ACT/shared-types';
import { showBuffer } from '@src/infrastructure/prun-ui/buffers';
import { clickElement } from '@src/util';
import { sleep } from '@src/utils/sleep';

interface ActionRunnerOptions {
  tile: PrunTile;
  log: Logger;
  onBufferSplit: () => void;
  onStart: () => void;
  onEnd: () => void;
  onStatusChanged: (status: string, keepReady?: boolean) => void;
  onActReady: () => void;
  isAutoAct: () => boolean;
}

export class ActionRunner {
  private readonly tileAllocator: TileAllocator;
  private readonly stepGenerator: StepGenerator;
  private stepMachine?: StepMachine;
  private preOpenedWindows: Element[] = [];

  constructor(private options: ActionRunnerOptions) {
    this.tileAllocator = new TileAllocator(options);
    this.stepGenerator = new StepGenerator(options);
  }

  get log() {
    return this.options.log;
  }

  get isRunning() {
    return this.stepMachine?.isRunning ?? false;
  }

  async preview(pkg: UserData.ActionPackageData, config: ActionPackageConfig) {
    if (this.isRunning) {
      this.log.error('操作包已在运行中');
      return;
    }
    // 创建副本以防止执行期间的修改。
    const copy = structuredClone(deepToRaw(pkg));
    const { steps, fail } = await this.stepGenerator.generateSteps(copy, config);
    if (steps.length === 0) {
      return;
    }
    if (fail) {
      this.log.info('已为有效操作生成步骤：');
    }
    for (const step of steps) {
      const stepInfo = act.getActionStepInfo(step.type);
      this.log.action(stepInfo.description(step));
    }
  }

  async execute(pkg: UserData.ActionPackageData, config: ActionPackageConfig) {
    if (this.isRunning) {
      this.log.error('操作包已在运行中');
      return;
    }
    // 创建副本以防止执行期间的修改。
    const copy = structuredClone(deepToRaw(pkg));
    const { steps, fail } = await this.stepGenerator.generateSteps(copy, config);
    if (fail) {
      this.log.error('操作包执行失败');
      return;
    }
    this.log.info('操作包开始执行');
    if (this.options.isAutoAct()) {
      await this.preOpenTiles(steps);
    }
    this.stepMachine = new StepMachine(steps, {
      ...this.options,
      tileAllocator: this.tileAllocator,
      onEnd: () => {
        this.closePreOpenedWindows();
        this.options.onEnd();
      },
    });
    this.stepMachine.start();
  }

  act() {
    this.stepMachine?.act();
    if (!this.stepMachine?.isRunning) {
      this.stepMachine = undefined;
    }
  }

  skip() {
    this.stepMachine?.skip();
    if (!this.stepMachine?.isRunning) {
      this.stepMachine = undefined;
    }
  }

  cancel() {
    this.stepMachine?.cancel();
    this.stepMachine = undefined;
    this.closePreOpenedWindows();
  }

  private async preOpenTiles(steps: ActionStep[]) {
    const commands = new Set<string>();
    for (const step of steps) {
      if (step.type === 'CXPO_BUY') {
        const data = step as ActionStep & { ticker: string; exchange: string };
        commands.add(`CXPO ${data.ticker}.${data.exchange}`);
      }
    }
    if (commands.size === 0) {
      return;
    }
    this.log.info(`正在预加载 ${commands.size} 个交易所窗口...`);
    for (const command of commands) {
      this.options.onStatusChanged(`正在打开 ${command}...`);
      const window = await showBuffer(command, { force: true, autoSubmit: true });
      if (window) {
        this.preOpenedWindows.push(window);
      }
    }
    this.options.onStatusChanged('等待订单簿数据加载...');
    await sleep(1000);
    this.log.info('交易所窗口预加载完成');
  }

  private closePreOpenedWindows() {
    for (const win of this.preOpenedWindows) {
      const buttons = win.getElementsByClassName(C.Window.button);
      const closeButton = Array.from(buttons).find(x => x.textContent === 'x') as
        | HTMLElement
        | undefined;
      closeButton?.click();
    }
    this.preOpenedWindows = [];
  }
}
