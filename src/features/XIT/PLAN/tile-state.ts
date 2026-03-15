// 基地规划磁贴状态。
import { createTileStateHook } from '@src/store/user-data-tiles';

export interface PlannedBuilding {
  ticker: string;
  count: number;
  // 选中配方索引，-1 表示未选。
  recipeIdx: number;
}

export const useTileState = createTileStateHook({
  planet: '',
  permits: 1,
  exchange: 'IC1',
  buildings: [] as PlannedBuilding[],
});
