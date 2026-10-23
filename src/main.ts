import { AUTO, Game, Scale, VERSION } from 'phaser';
import type { Types } from 'phaser';
import { COLORS, GAME_HEIGHT, GAME_WIDTH } from './config';
import { debugParams } from './debug/params';
import { BootScene } from './game/scenes/BootScene';
import { GameScene } from './game/scenes/GameScene';
import { MenuScene } from './game/scenes/MenuScene';
import { PreloadScene } from './game/scenes/PreloadScene';
import { setTestHooks } from './game/testHooks';

const config: Types.Core.GameConfig = {
  type: AUTO,
  parent: 'game',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: COLORS.background,
  pixelArt: true,
  roundPixels: true,
  scale: {
    mode: Scale.FIT,
    autoCenter: Scale.CENTER_BOTH,
  },
  physics: {
    default: 'arcade',
    arcade: { debug: debugParams().debug },
  },
  input: { activePointers: 3 },
  scene: [BootScene, PreloadScene, MenuScene, GameScene],
};

setTestHooks({ ready: false, phaserVersion: VERSION });
export const game = new Game(config);
