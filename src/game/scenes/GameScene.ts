import type { GameObjects } from 'phaser';
import { Scene } from 'phaser';
import { COLORS, GAME_HEIGHT, GAME_WIDTH, SCENES, TILE_SIZE } from '../../config';
import { debugParams } from '../../debug/params';
import { EventBus } from '../../sim/core/EventBus';
import type { GameEvents } from '../../sim/core/events';
import { Random, freshSeed } from '../../sim/core/Random';
import { TEX } from '../assets/keys';
import { setTestHooks } from '../testHooks';
import { InputScene } from '../ui/InputScene';
import { textStyle } from '../ui/text';

import { ROOM_COLS, ROOM_ROWS } from '../world/graybox';

/**
 * 战斗场景（M0 版本）：一间灰盒房间 + 静止的占位角色。
 * M1 在这里接入玩家移动、射击、敌人；M2 换成地牢生成的 Tilemap。
 */
export class GameScene extends Scene {
  readonly bus = new EventBus<GameEvents>();
  private rng!: Random;
  private seed = 0;
  private debugText?: GameObjects.Text;

  constructor() {
    super(SCENES.game);
  }

  create(): void {
    this.seed = debugParams().seed ?? freshSeed();
    this.rng = new Random(this.seed);

    this.drawGrayboxRoom();
    this.placeholders();

    this.add
      .text(6, 6, 'M1 输入验收 · Esc 暂停', textStyle(9, COLORS.textDim))
      .setScrollFactor(0)
      .setDepth(100);

    if (debugParams().debug) {
      this.debugText = this.add
        .text(GAME_WIDTH - 6, 6, '', textStyle(8, COLORS.accent, { align: 'right' }))
        .setOrigin(1, 0)
        .setScrollFactor(0)
        .setDepth(100);
    }

    this.scene.launch(InputScene.KEY);
    this.events.once('shutdown', () => this.scene.stop(InputScene.KEY));
    this.events.once('shutdown', () => this.bus.clear());

    this.bus.emit('run:started', { seed: this.seed });
    setTestHooks({ ready: true, scene: SCENES.game, seed: this.seed });
  }

  override update(): void {
    if (this.debugText) {
      this.debugText.setText(
        [
          `FPS ${this.game.loop.actualFps.toFixed(0)}`,
          `seed ${this.seed}`,
          `objs ${this.children.length}`,
        ].join('\n'),
      );
    }
  }

  private drawGrayboxRoom(): void {
    const roomW = ROOM_COLS * TILE_SIZE;
    const roomH = ROOM_ROWS * TILE_SIZE;
    const ox = Math.floor((GAME_WIDTH - roomW) / 2);
    const oy = Math.floor((GAME_HEIGHT - roomH) / 2);
    const floorRng = this.rng.fork('graybox-floor');

    for (let row = 0; row < ROOM_ROWS; row++) {
      for (let col = 0; col < ROOM_COLS; col++) {
        const isWall = row === 0 || col === 0 || row === ROOM_ROWS - 1 || col === ROOM_COLS - 1;
        const key = isWall ? TEX.wall : floorRng.chance(0.15) ? TEX.floorAlt : TEX.floor;
        this.add.image(ox + col * TILE_SIZE, oy + row * TILE_SIZE, key).setOrigin(0, 0);
      }
    }
  }

  private placeholders(): void {
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    this.add.image(cx, cy + 40, TEX.player);
    const spots = this.rng.fork('graybox-enemies');
    for (let i = 0; i < 3; i++) {
      this.add.image(cx + spots.int(-110, 110), cy + spots.int(-70, 0), TEX.enemy);
    }
    this.add.image(cx + 6, cy + 20, TEX.bulletPlayer);
    this.add.image(cx - 40, cy - 30, TEX.bulletEnemy);
  }
}
