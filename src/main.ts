import { decorateUi } from './game/ui/decorateUi';
import { destroySound } from './services/Sound';
import { AUTO, Game, Scale, VERSION } from 'phaser';
import type { Types } from 'phaser';
import { COLORS, GAME_HEIGHT, GAME_WIDTH, RENDER_SCALE } from './config';
import { debugParams } from './debug/params';
import { bindLifecycle } from './game/bindLifecycle';
import { BootScene } from './game/scenes/BootScene';
import { GameScene } from './game/scenes/GameScene';
import { HubScene } from './game/scenes/HubScene';
import { MenuScene } from './game/scenes/MenuScene';
import { PreloadScene } from './game/scenes/PreloadScene';
import { setTestHooks } from './game/testHooks';
import './pwa/registerSW';
import { InputScene } from './game/ui/InputScene';

decorateUi(document);

const config: Types.Core.GameConfig = {
  type: AUTO,
  parent: 'game',
  width: GAME_WIDTH * RENDER_SCALE,
  height: GAME_HEIGHT * RENDER_SCALE,
  backgroundColor: COLORS.background,
  antialias: true,
  roundPixels: false,
  scale: {
    mode: Scale.FIT,
    autoCenter: Scale.CENTER_BOTH,
  },
  physics: {
    default: 'arcade',
    arcade: { debug: debugParams().debug },
  },
  input: { activePointers: 3, gamepad: true },
  scene: [BootScene, PreloadScene, MenuScene, HubScene, GameScene, InputScene],
};

setTestHooks({ ready: false, phaserVersion: VERSION });
export const game = new Game(config);
export const lifecycle = bindLifecycle(game);

game.events.once('destroy', destroySound);
