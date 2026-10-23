import type { GameObjects } from 'phaser';
import { Scene } from 'phaser';
import { COLORS, DEPTH, GAME_HEIGHT, GAME_WIDTH, SCENES, TILE_SIZE } from '../../config';
import { debugParams } from '../../debug/params';
import { EventBus } from '../../sim/core/EventBus';
import type { GameEvents } from '../../sim/core/events';
import { Random, freshSeed } from '../../sim/core/Random';
import { TEX } from '../assets/keys';
import { DEATH_UI, INPUT_UI } from '../fx/params';
import { CombatRun } from '../systems/CombatRun';
import { setCombatProbe, setTestHooks } from '../testHooks';
import { InputScene } from '../ui/InputScene';
import { textStyle } from '../ui/text';
import { ROOM_COLS, ROOM_ROWS } from '../world/graybox';

/** 本页面开过的局数，供测试确认「重来」确实新开了一局。 */
let runCount = 0;

/**
 * 战斗场景（M1 手感原型）：一间灰盒房间，分波刷追击怪；玩家死亡后提示重来。
 * 重来时整个场景重启，新建 CombatWorld（ADR 0003）；`?seed=` 固定时沿用同一种子，否则换新种子。
 * M2 换成地牢生成的 Tilemap。
 */
export class GameScene extends Scene {
  readonly bus = new EventBus<GameEvents>();
  private rng!: Random;
  private seed = 0;
  private run!: CombatRun;
  private debugText?: GameObjects.Text;
  private deathDim!: GameObjects.Rectangle;
  private restartPrompt: GameObjects.Text[] = [];
  private dimStarted = false;
  private restartArmed = false;
  /** 手柄重来需要先松开开火键，避免死前一直按着的 RT 直接触发重来。 */
  private fireReleased = false;
  private domListeners?: AbortController;

  constructor() {
    super(SCENES.game);
  }

  create(): void {
    this.seed = debugParams().seed ?? freshSeed();
    this.rng = new Random(this.seed);
    this.restartArmed = false;
    this.fireReleased = false;
    this.dimStarted = false;
    runCount++;

    this.drawGrayboxRoom();

    this.add
      .text(6, 6, 'M1 手感原型 · Esc 暂停', textStyle(9, COLORS.textDim))
      .setScrollFactor(0)
      .setDepth(DEPTH.hud);

    if (debugParams().debug) {
      this.debugText = this.add
        .text(GAME_WIDTH - 6, 6, '', textStyle(8, COLORS.accent, { align: 'right' }))
        .setOrigin(1, 0)
        .setScrollFactor(0)
        .setDepth(DEPTH.hud);
    }

    this.scene.launch(InputScene.KEY);
    const inputScene = this.scene.get(InputScene.KEY) as InputScene;
    this.run = new CombatRun(this, { seed: this.seed, rng: this.rng, bus: this.bus, inputScene });
    this.createDeathScreen();

    this.events.once('shutdown', () => {
      this.scene.stop(InputScene.KEY);
      this.domListeners?.abort();
      this.domListeners = undefined;
      setCombatProbe(undefined);
      this.bus.clear();
    });

    setCombatProbe(() => {
      const p = this.run.player;
      return {
        runs: runCount,
        phase: this.run.phase,
        playerHp: p?.hp ?? 0,
        playerMaxHp: p?.maxHp ?? 0,
        wave: this.run.waves.wave,
        alive: this.run.waves.alive,
        kills: this.run.kills,
        time: this.run.sim.time,
      };
    });
    this.bus.emit('run:started', { seed: this.seed });
    setTestHooks({ ready: true, scene: SCENES.game, seed: this.seed });
  }

  override update(_time: number, delta: number): void {
    this.run.update(delta / 1000);
    if (this.run.phase !== 'playing' && !this.dimStarted) {
      // 玩家倒下等动画由 #16 负责；这里只做压暗与提示，保证提示可读。
      this.dimStarted = true;
      this.tweens.add({ targets: this.deathDim, alpha: DEATH_UI.dimAlpha, duration: DEATH_UI.dimMs });
    }
    if (this.run.phase === 'restartable') this.armRestart();

    if (this.debugText) {
      const p = this.run.player;
      this.debugText.setText(
        [
          `FPS ${this.game.loop.actualFps.toFixed(0)}`,
          `seed ${this.seed}`,
          `wave ${this.run.waves.wave} · alive ${this.run.waves.alive}`,
          `hp ${p?.hp ?? 0}/${p?.maxHp ?? 0} · kills ${this.run.kills}`,
          `bullets ${this.run.bridge.bullets.activeCount}`,
        ].join('\n'),
      );
    }
  }

  /** 进入可重来阶段：显示提示，开始接收「点击 / 任意键」。 */
  private armRestart(): void {
    if (!this.restartArmed) {
      this.restartArmed = true;
      for (const text of this.restartPrompt) text.setVisible(true);
      this.listenForRestart();
    }
    // 手柄：没有可点的位置，用开火键（RT）重来；必须先松开一次。
    const fire = this.run.fireHeld;
    if (!fire) this.fireReleased = true;
    else if (this.fireReleased) this.restart();
  }

  private listenForRestart(): void {
    const abort = new AbortController();
    this.domListeners = abort;
    const options = { signal: abort.signal };
    window.addEventListener(
      'keydown',
      (e) => {
        // Esc 是暂停键；长按产生的重复 keydown 不算新的按键。
        if (e.repeat || e.key === 'Escape') return;
        this.restart();
      },
      options,
    );
    const canvas = this.game.canvas;
    canvas.addEventListener(
      'pointerdown',
      (e) => {
        if (this.onPauseButton(canvas, e)) return;
        this.restart();
      },
      options,
    );
  }

  /**
   * 暂停键也在画布上，点它只暂停，不重来。判定区与输入层（#12）共用 `INPUT_UI.pause` 参数。
   */
  private onPauseButton(canvas: HTMLCanvasElement, e: PointerEvent): boolean {
    const rect = canvas.getBoundingClientRect();
    const { inset, hitRadius } = INPUT_UI.pause;
    const x = e.clientX - rect.left,
      y = e.clientY - rect.top;
    return Math.hypot(x - (rect.width - inset), y - inset) <= hitRadius;
  }

  private restart(): void {
    // 手动暂停时不响应；只重启一次。
    if (!this.restartArmed || this.scene.isPaused()) return;
    this.restartArmed = false;
    this.domListeners?.abort();
    this.domListeners = undefined;
    this.scene.restart();
  }

  private createDeathScreen(): void {
    const cx = GAME_WIDTH / 2,
      cy = GAME_HEIGHT / 2;
    this.deathDim = this.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, DEATH_UI.dimColor)
      .setOrigin(0, 0)
      .setAlpha(0)
      .setScrollFactor(0)
      .setDepth(DEPTH.screenFx);
    this.restartPrompt = [
      this.add.text(cx, cy + DEATH_UI.titleOffsetY, '失败了', textStyle(DEATH_UI.titleSize, COLORS.text)),
      this.add.text(
        cx,
        cy + DEATH_UI.hintOffsetY,
        '点击 / 按任意键重来',
        textStyle(DEATH_UI.hintSize, COLORS.textDim),
      ),
    ];
    for (const text of this.restartPrompt)
      text.setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH.hud).setVisible(false);
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
}
