import type { GameObjects, Physics, Scene } from 'phaser';
import { COLORS, DEPTH, POOL_SIZES } from '../config';
import type { CombatWorld, ActorView } from '../sim/combat/api';
import type { CombatBridge } from '../game/world/CombatBridge';

interface DebugSource {
  sim: CombatWorld;
  bridge: CombatBridge;
  waves: { wave: number; alive: number };
  player: ActorView | undefined;
  kills: number;
  fx?: { activeCount: number };
}
import { setDebugProbe } from '../game/testHooks';
import { textStyle } from '../game/ui/text';

/** 面板文字每秒刷新的次数；调试面板不需要每帧重建字符串。 */
const PANEL_HZ = 4;
/** 面板左上角位置，游戏像素。 */
const PANEL_X = 6;
const PANEL_Y = 20;

/** 碰撞框开关跨「重来」保留：调试时通常希望一直开着。 */
let showHitboxes = false;

/**
 * `?debug=1` 时的调试工具（Issue #17，docs/ARCHITECTURE.md「调试工具」）。只在调试模式下创建，
 * 非调试模式完全不存在，不注册任何监听。
 *
 * - 左上角面板：FPS、种子、波次、实体数、子弹池与角色池占用、生命、击杀、无敌标记。
 * - F1：显示 / 隐藏 Arcade 碰撞框。
 * - F2：清房，杀死全部怪物（`CombatWorld.debugKillEnemies`，ADR 0005）。
 */
export class DebugTools {
  private readonly panel: GameObjects.Text;
  private readonly abort = new AbortController();
  private sinceRefresh = Infinity;

  constructor(
    private readonly scene: Scene,
    private readonly run: DebugSource,
    private readonly info: { seed: number; godMode: boolean },
  ) {
    // 放在左上角标题下方：右上角是暂停键，左下和右下是触屏摇杆与射击键。
    this.panel = scene.add
      .text(run.fx ? 380 : PANEL_X, run.fx ? 50 : PANEL_Y, '', textStyle(run.fx ? 5 : 8, COLORS.accent))
      .setScrollFactor(0)
      .setDepth(DEPTH.hud);
    this.applyHitboxes();
    window.addEventListener('keydown', this.onKey, { signal: this.abort.signal });
    scene.events.once('shutdown', () => {
      this.abort.abort();
      setDebugProbe(undefined);
    });
    setDebugProbe(() => ({ hitboxes: showHitboxes, godMode: this.info.godMode }));
  }

  /** 由战斗场景 update 调用（早于 Arcade 在 POST_UPDATE 画碰撞框）；`deltaMs` 为毫秒。 */
  update(deltaMs: number): void {
    if (showHitboxes) this.hideIdleBodies();
    this.sinceRefresh += deltaMs;
    if (this.sinceRefresh < 1000 / PANEL_HZ) return;
    this.sinceRefresh = 0;

    const { run } = this;
    const bullets = run.bridge.bullets;
    let actorSlots = 0;
    for (const slot of run.bridge.actors.slots) if (slot.id) actorSlots++;
    const p = run.player;
    this.panel.setText(
      [
        `FPS ${this.scene.game.loop.actualFps.toFixed(0)} · seed ${this.info.seed}`,
        `wave ${run.waves.wave} · alive ${run.waves.alive} · entities ${run.sim.actors.length}`,
        `bullets ${bullets.activeCount}/${bullets.slots.length}`,
        `actor slots ${actorSlots}/${run.bridge.actors.slots.length}`,
        ...(run.fx ? [`fx ${run.fx.activeCount}/${POOL_SIZES.fx}`] : []),
        `hp ${p?.hp ?? 0}/${p?.maxHp ?? 0} · kills ${run.kills}${this.info.godMode ? ' · GOD' : ''}`,
        `F1 碰撞框${showHitboxes ? '：开' : ''} · F2 清房`,
      ].join('\n'),
    );
  }

  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.key !== 'F1' && e.key !== 'F2') return;
    // 浏览器默认 F1 打开帮助页；调试模式下由游戏接管。
    e.preventDefault();
    if (e.repeat || this.scene.scene.isPaused()) return;
    if (e.key === 'F1') {
      showHitboxes = !showHitboxes;
      this.applyHitboxes();
    } else {
      this.run.sim.debugKillEnemies();
    }
    this.sinceRefresh = Infinity;
  };

  /**
   * Arcade 会给世界里的每个物理体画碰撞框，包括对象池里停用、停在 (0, 0) 的那几百个。
   * 只让启用中的物理体显示碰撞框和速度线。
   */
  private hideIdleBodies(): void {
    for (const slot of this.run.bridge.bullets.slots) this.showBodyDebug(slot.image.body);
    for (const slot of this.run.bridge.actors.slots) this.showBodyDebug(slot.image.body);
  }

  private showBodyDebug(body: Physics.Arcade.Body | Physics.Arcade.StaticBody | null): void {
    if (!body) return;
    body.debugShowBody = body.enable;
    if ('debugShowVelocity' in body) body.debugShowVelocity = body.enable;
  }

  private applyHitboxes(): void {
    const world = this.scene.physics.world;
    const graphic = (world.debugGraphic as GameObjects.Graphics | undefined) ?? world.createDebugGraphic();
    world.drawDebug = showHitboxes;
    // Arcade 只在 drawDebug 为真时才清空并重画，关闭时要自己清掉最后一帧。
    if (!showHitboxes) graphic.clear();
  }
}
