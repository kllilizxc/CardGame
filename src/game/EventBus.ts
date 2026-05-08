import { Events } from 'phaser';

// Used to emit events between components, HTML and Phaser scenes
export const EventBus = new Events.EventEmitter();
export const EXPEDITION_BATTLE_COMPLETE_EVENT = 'expedition-battle-complete';
