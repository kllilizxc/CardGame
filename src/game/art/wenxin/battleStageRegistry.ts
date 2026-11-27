import type { Scene } from 'phaser';
import type { WenxinBattleStage } from './WenxinBattleStage';

/** Keep battle orchestration importable without constructing Phaser's browser renderer. */
export const battleStages = new WeakMap<Scene, WenxinBattleStage>();
export function getWenxinBattleStage(scene: Scene) { return battleStages.get(scene); }
