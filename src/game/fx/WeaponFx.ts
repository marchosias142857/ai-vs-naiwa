import type { GameObjects, Scene } from 'phaser';
import { DEPTH } from '../../config';
import { ARSENAL_SHOT_SCALE } from '../../data/arsenalArt';
import { BALANCE } from '../../data/balance';
import { enemyAnimation } from '../../data/enemyArt';
import type { WeaponDef } from '../../data/schema';
import { WEAPONS } from '../../data/weapons';
import type { CombatWorld, ShotView } from '../../sim/combat/api';
import type { EventBus } from '../../sim/core/EventBus';
import type { GameEvents } from '../../sim/core/events';
import { ART } from '../assets/demoArt';
import { WEAPON_FX as W } from './weaponParams';

interface Bolt {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  age: number;
  seed: number;
}

/** 不用随机数的抖动：同一道闪电在它存在期间形状固定。 */
function jitter(seed: number, k: number): number {
  const v = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453;
  return (v - Math.floor(v)) * 2 - 1;
}

/** 一道闪电的折线：两端固定，中间各节沿法线方向抖开。 */
function strokeBolt(g: GameObjects.Graphics, b: Bolt, width: number, color: number, alpha: number): void {
  const dx = b.x2 - b.x1,
    dy = b.y2 - b.y1,
    len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len,
    ny = dx / len;
  g.lineStyle(width, color, alpha).beginPath().moveTo(b.x1, b.y1);
  for (let k = 1; k < W.chainSegments; k++) {
    const t = k / W.chainSegments,
      off = jitter(b.seed, k) * W.chainJitter;
    g.lineTo(b.x1 + dx * t + nx * off, b.y1 + dy * t + ny * off);
  }
  g.lineTo(b.x2, b.y2).strokePath();
}

/**
 * 新武器的表现层（ADR 0031）：特殊弹体贴图、光束、连锁闪电、蓄力圈、冻住的冰壳。
 * 只读 sim 状态与事件；贴图与闪电记录初始化时预热，帧循环里只复用。
 */
export class WeaponFx {
  private readonly images: GameObjects.Image[] = [];
  private readonly ids: number[] = [];
  private readonly lines: GameObjects.Graphics;
  private readonly bolts: Bolt[] = [];
  private boltSeed = 0;
  private last = 0;

  constructor(
    private readonly scene: Scene,
    private readonly sim: CombatWorld,
    private readonly bus: EventBus<GameEvents>,
  ) {
    for (let i = 0; i < BALANCE.shotCapacity; i++) {
      this.images.push(
        scene.add.image(0, 0, ART.arsenal, 'shot_bubble').setVisible(false).setDepth(DEPTH.playerBullets),
      );
      this.ids.push(0);
    }
    for (let i = 0; i < W.chainPool; i++) this.bolts.push({ x1: 0, y1: 0, x2: 0, y2: 0, age: 1, seed: 0 });
    this.lines = scene.add.graphics().setDepth(DEPTH.fx);
    bus.on('weapon:chained', this.onChained);
    scene.events.once('shutdown', this.destroy);
  }

  private readonly onChained = (e: GameEvents['weapon:chained']): void => {
    let slot = this.bolts[0]!;
    for (const b of this.bolts) {
      if (b.age >= W.chainSeconds) {
        slot = b;
        break;
      }
      if (b.age > slot.age) slot = b;
    }
    slot.x1 = e.x1;
    slot.y1 = e.y1;
    slot.x2 = e.x2;
    slot.y2 = e.y2;
    slot.age = 0;
    slot.seed = ++this.boltSeed;
  };

  /** 每渲染帧调用。 */
  update(): void {
    const now = this.sim.time,
      dt = Math.max(0, now - this.last);
    this.last = now;
    const zoom = this.scene.cameras.main.zoom;
    const shots = this.sim.shots;
    for (let i = 0; i < this.images.length; i++) this.drawShot(this.images[i]!, i, shots[i], zoom);
    const g = this.lines;
    g.clear();
    this.drawFrozen(g);
    this.drawBeam(g, now);
    this.drawBolts(g, dt);
    this.drawCharge(g, now);
  }

  private drawShot(image: GameObjects.Image, i: number, s: ShotView | undefined, zoom: number): void {
    if (!s?.active) {
      image.setVisible(false);
      this.ids[i] = 0;
      return;
    }
    const def = (WEAPONS[s.source] as Readonly<WeaponDef>).shot;
    if (!def) return;
    if (this.ids[i] !== s.id) {
      this.ids[i] = s.id;
      image.setFrame(s.child ? (def.split?.sprite ?? def.sprite) : def.sprite).setScale(ARSENAL_SHOT_SCALE);
    }
    // 环绕弹快到寿命时淡出，其余弹体到头就直接消失。
    const fade = !s.child && def.motion === 'orbit' ? Math.min(1, (s.life - s.time) / W.shotFade) : 1;
    image
      .setVisible(true)
      .setAlpha(fade)
      .setRotation(s.angle)
      .setPosition(Math.round(s.x * zoom) / zoom, Math.round(s.y * zoom) / zoom);
  }

  private drawBeam(g: GameObjects.Graphics, now: number): void {
    const b = this.sim.beam;
    if (!b.active) return;
    const ex = b.x + Math.cos(b.angle) * b.length,
      ey = b.y + Math.sin(b.angle) * b.length;
    const w = b.width * (1 + Math.sin(now * W.beamFlicker) * W.beamFlickerWidth);
    g.lineStyle(w * 1.8, W.beamGlow, W.beamGlowAlpha).lineBetween(b.x, b.y, ex, ey);
    g.lineStyle(w * 0.9, W.beamGlow, 0.9).lineBetween(b.x, b.y, ex, ey);
    g.lineStyle(w * 0.35, W.beamCore, 1).lineBetween(b.x, b.y, ex, ey);
    g.fillStyle(W.beamCore, 1).fillCircle(ex, ey, w * W.beamSpot);
    g.fillStyle(W.beamGlow, 0.8).fillCircle(b.x, b.y, w * W.beamSpot * 0.8);
  }

  private drawBolts(g: GameObjects.Graphics, dt: number): void {
    for (const b of this.bolts) {
      if (b.age >= W.chainSeconds) continue;
      b.age += dt;
      const alpha = Math.max(0, 1 - b.age / W.chainSeconds);
      strokeBolt(g, b, 3, W.chainGlow, 0.6 * alpha);
      strokeBolt(g, b, 1, W.chainCore, alpha);
    }
  }

  private drawCharge(g: GameObjects.Graphics, now: number): void {
    const k = this.sim.charge,
      id = this.sim.playerId;
    const p = id === null ? undefined : this.sim.getActor(id);
    if (k <= 0 || !p || p.phase !== 'active') return;
    const full = k >= 1;
    if (full && Math.floor(now * W.chargeBlink) % 2) return;
    const start = -Math.PI / 2;
    g.lineStyle(W.chargeWidth, full ? W.chargeFull : W.chargeColor, 0.9)
      .beginPath()
      .arc(p.x, p.y, W.chargeRadius, start, start + Math.PI * 2 * k, false)
      .strokePath();
  }

  /** 冻住的怪物罩一层半透明冰壳，大小按怪物贴图。 */
  private drawFrozen(g: GameObjects.Graphics): void {
    for (const a of this.sim.actors) {
      if (!a.frozen || a.phase !== 'active') continue;
      const art = enemyAnimation(a.kind)?.art;
      const w = art ? art.size[0] * art.scale * 0.8 : a.radius * 3,
        top = art ? art.pivot.y * art.scale : a.radius * 2,
        h = art ? art.size[1] * art.scale * 0.85 : a.radius * 3;
      const x = a.x - w / 2,
        y = a.y - a.lift - top;
      g.fillStyle(W.frozenTint, 0.35).fillRoundedRect(x, y, w, h, 2);
      g.lineStyle(1, 0xffffff, 0.8).strokeRoundedRect(x, y, w, h, 2);
      g.lineStyle(1, 0xffffff, 0.9).lineBetween(x + 2, y + 2, x + 2, y + h * 0.4);
    }
  }

  private readonly destroy = (): void => {
    this.bus.off('weapon:chained', this.onChained);
    for (const image of this.images) image.destroy();
    this.lines.destroy();
  };
}
