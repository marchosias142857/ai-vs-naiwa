import { Physics, Textures } from 'phaser';
import type { GameObjects, Scene } from 'phaser';
import { DEPTH, DEPTH_Y_SORT } from '../../config';
import { BALANCE } from '../../data/balance';
import { ENEMIES, type EnemyId } from '../../data/enemies';
import { BOSS_DEATH, enemyAnimation } from '../../data/enemyArt';
import type { EnemyDef } from '../../data/schema';
import type { CombatWorld } from '../../sim/combat/api';
import type { EventBus } from '../../sim/core/EventBus';
import type { GameEvents } from '../../sim/core/events';
import { settings } from '../../services/settings';
import type { CombatBridge } from '../world/CombatBridge';
import { HAZARD_FX as H, ROCK_PIXELS, ROCK_PALETTE } from './hazardParams';

interface Burst {
  x: number;
  y: number;
  radius: number;
  age: number;
  life: number;
  color: number;
}
interface BossDeath {
  id: number;
  x: number;
  y: number;
  top: number;
  age: number;
}

const ROCK_TEXTURE = 'hz_rock';

/**
 * 怪物招式与房间机关的表现层（ADR 0028）：毒气云、奶潭、天降石块（含静态碰撞体）、
 * 舌击与冲撞的预警线、眩晕星星、爆炸与落石的冲击圈、Boss 死亡的爆点与碎片。
 * 只读 sim 状态与事件，不改规则；所有显示对象初始化时预热，帧循环里只复用。
 */
export class HazardLayer {
  private readonly ground: GameObjects.Graphics;
  private readonly marks: GameObjects.Graphics;
  private readonly rocks: Physics.Arcade.Image[] = [];
  private readonly rockArt: GameObjects.Image[] = [];
  private readonly landed: boolean[] = [];
  private readonly bursts: Burst[] = [];
  private readonly group: Physics.Arcade.StaticGroup;
  private readonly colliders: Physics.Arcade.Collider[];
  private bossDeath: BossDeath | null = null;
  private time = 0;
  private destroyed = false;

  constructor(
    private readonly scene: Scene,
    private readonly sim: CombatWorld,
    private readonly bridge: CombatBridge,
    private readonly bus: EventBus<GameEvents>,
  ) {
    this.ground = scene.add.graphics().setDepth(DEPTH.floorDecals);
    this.marks = scene.add.graphics().setDepth(DEPTH.fx);
    if (!scene.textures.exists(ROCK_TEXTURE)) makeRockTexture(scene);
    this.group = scene.physics.add.staticGroup();
    for (let i = 0; i < BALANCE.rockCapacity; i++) {
      const body = this.group.create(0, 0, ROCK_TEXTURE) as Physics.Arcade.Image;
      body.setAlpha(0).disableBody(true, true);
      this.rocks.push(body);
      this.rockArt.push(scene.add.image(0, 0, ROCK_TEXTURE).setVisible(false));
      this.landed.push(false);
    }
    for (let i = 0; i < H.burstPool; i++)
      this.bursts.push({ x: 0, y: 0, radius: 0, age: 1, life: 0, color: 0 });
    this.colliders = [
      scene.physics.add.collider(bridge.actors.group, this.group),
      scene.physics.add.overlap(bridge.bullets.group, this.group, this.hitRock),
    ];
    bus.on('combat:exploded', this.onExploded);
    bus.on('entity:died', this.onDied);
    bus.on('enemy:acted', this.onActed);
    scene.physics.world.on(Physics.Arcade.Events.WORLD_STEP, this.tick);
    scene.events.once('shutdown', this.destroy);
  }

  private readonly hitRock = (object: unknown): void => {
    const slot = this.bridge.bullets.byImage.get(object as Physics.Arcade.Image);
    if (!slot?.id) return;
    const body = slot.image.body!;
    this.bridge.sim.hitWall(slot.id, body.center.x, body.center.y);
    this.bridge.bullets.recycle(slot);
  };

  /** 取一个空闲冲击圈；都在播放时顶替播得最久的那个。 */
  private burst(x: number, y: number, radius: number, life: number, color: number): void {
    let slot = this.bursts[0]!;
    for (const b of this.bursts) {
      if (b.age >= b.life) {
        slot = b;
        break;
      }
      if (b.age / b.life > slot.age / slot.life) slot = b;
    }
    slot.x = x;
    slot.y = y;
    slot.radius = radius;
    slot.age = 0;
    slot.life = life;
    slot.color = color;
  }

  private readonly onExploded = (e: GameEvents['combat:exploded']): void =>
    this.burst(e.x, e.y, e.radius, H.explosionSeconds, H.explosionColor);
  private readonly onActed = (e: GameEvents['enemy:acted']): void => {
    const feet = e.y + (ENEMIES[e.kind as EnemyId]?.radius ?? 0);
    if (e.action === 'land' || e.action === 'emerge' || e.action === 'crash' || e.action === 'stun')
      this.burst(e.x, feet, H.dustRadius, H.dustSeconds, H.dustColor);
    else if (e.action === 'shatter') this.burst(e.x, e.y, H.dustRadius, H.dustSeconds, ROCK_PALETTE.light);
  };
  private readonly onDied = (e: GameEvents['entity:died']): void => {
    if (e.kind !== 'naiwa_boss') return;
    const art = enemyAnimation(e.kind)?.art;
    const top = art ? art.pivot.y * art.scale : 20;
    this.bossDeath = { id: e.id, x: e.x, y: e.y, top, age: 0 };
  };

  /** 石块落地才开启碰撞体；物理步里同步，下一步的移动与子弹就会被挡住。 */
  private readonly tick = (dt: number): void => {
    this.time += dt;
    for (const b of this.bursts) if (b.age < b.life) b.age += dt;
    if (this.bossDeath) this.bossDeath.age += dt;
    const rocks = this.sim.rocks;
    for (let i = 0; i < this.rocks.length; i++) {
      const r = rocks[i],
        body = this.rocks[i]!;
      const solid = !!r?.active && r.landed;
      if (solid && !this.landed[i]) {
        // 方形碰撞体比圆略小，贴图边角不会挡住人。
        body.enableBody(true, r.x, r.y, true, false);
        body.setDisplaySize(r.radius * H.rockBody, r.radius * H.rockBody).refreshBody();
        this.burst(r.x, r.y, r.radius * 1.8, H.dustSeconds, H.dustColor);
      } else if (!solid && this.landed[i]) {
        body.disableBody(true, true);
        if (r && !r.active) this.burst(body.x, body.y, r.radius * 1.4, H.dustSeconds, ROCK_PALETTE.light);
      }
      this.landed[i] = solid;
    }
  };

  /** 每渲染帧重画；对象数量固定。 */
  update(): void {
    const g = this.ground,
      m = this.marks;
    g.clear();
    m.clear();
    this.drawZones(g);
    this.drawRocks(m);
    this.drawTells(m);
    this.drawBursts(m);
    this.drawBossDeath(m);
  }

  private drawZones(g: GameObjects.Graphics): void {
    for (const z of this.sim.zones) {
      if (!z.active) continue;
      const fade = Math.min(1, z.remaining / H.zoneFade, (z.duration - z.remaining) / H.zoneFade + 0.2);
      if (z.kind === 'milk') {
        g.fillStyle(H.milkColor, H.milkAlpha * fade).fillEllipse(z.x, z.y, z.radius * 2.2, z.radius * 1.5);
        g.fillStyle(0xffffff, 0.5 * fade);
        g.fillEllipse(z.x - z.radius * 0.35, z.y - z.radius * 0.2, z.radius * 0.6, 3);
        continue;
      }
      g.fillStyle(H.poisonColor, H.poisonAlpha * fade).fillCircle(z.x, z.y, z.radius);
      g.lineStyle(1, H.poisonRim, 0.6 * fade).strokeCircle(z.x, z.y, z.radius);
      // 冒泡：位置由时间与区域坐标决定，不用随机。
      for (let k = 0; k < H.bubbles; k++) {
        const phase = (this.time * H.bubbleSpeed + k / H.bubbles + z.x * 0.013) % 1;
        const angle = k * 2.399 + z.y * 0.07;
        const rr = z.radius * 0.7 * Math.sqrt((k + 0.5) / H.bubbles);
        g.fillStyle(H.poisonRim, 0.8 * fade * (1 - phase)).fillCircle(
          z.x + Math.cos(angle) * rr,
          z.y + Math.sin(angle) * rr - phase * 6,
          1 + phase,
        );
      }
    }
  }

  private drawRocks(m: GameObjects.Graphics): void {
    const rocks = this.sim.rocks;
    for (let i = 0; i < this.rockArt.length; i++) {
      const r = rocks[i],
        art = this.rockArt[i]!;
      if (!r?.active) {
        art.setVisible(false);
        continue;
      }
      const size = (r.radius * 2) / ROCK_PIXELS[0]!.length;
      if (r.landed) {
        const crumble = Math.min(1, r.time / H.rockCrumble);
        art
          .setVisible(true)
          .setPosition(r.x, r.y)
          .setScale(size)
          .setAlpha(crumble)
          .setDepth(DEPTH.actors + (r.y + r.radius) * DEPTH_Y_SORT);
        continue;
      }
      // 预警：红圈逐渐收紧，石块从高处落下，地上的影子越来越实。
      const t = 1 - r.time / r.fall;
      m.lineStyle(1, H.warnColor, 0.5 + 0.5 * t).strokeCircle(r.x, r.y, r.radius * (1.6 - 0.6 * t));
      m.fillStyle(H.warnColor, 0.12 + 0.18 * t).fillCircle(r.x, r.y, r.radius);
      m.fillStyle(0x07111e, 0.35 * t).fillEllipse(r.x, r.y + r.radius * 0.3, r.radius * 2 * t, r.radius * t);
      art
        .setVisible(t > 0.35)
        .setPosition(r.x, r.y - (1 - t) * H.rockDrop)
        .setScale(size)
        .setAlpha(1)
        .setDepth(DEPTH.fx);
    }
  }

  /** 招式预警：舌击线、冲撞通道、自爆半径；出舌时画舌头；眩晕时头顶转星星。 */
  private drawTells(m: GameObjects.Graphics): void {
    const pulse = 0.5 + 0.5 * Math.sin(this.time * H.pulseSpeed);
    for (const a of this.sim.actors) {
      if (a.team !== 'enemy' || a.phase !== 'active') continue;
      const def = ENEMIES[a.kind as EnemyId] as Readonly<EnemyDef>;
      const cx = Math.cos(a.aim),
        cy = Math.sin(a.aim);
      if (a.move === 'lash' && def.lash) {
        if (a.pose === 'windup')
          this.dashed(m, a.x, a.y, a.x + cx * def.lash.length, a.y + cy * def.lash.length, pulse);
        else if (a.pose === 'attack') this.tongue(m, a.x, a.y, cx, cy, def.lash);
      }
      if (a.move === 'bump' && a.pose === 'windup') {
        const len = H.bumpTell,
          w = a.radius;
        m.fillStyle(H.warnColor, 0.1 + 0.12 * pulse)
          .beginPath()
          .moveTo(a.x - cy * w, a.y + cx * w)
          .lineTo(a.x - cy * w + cx * len, a.y + cx * w + cy * len)
          .lineTo(a.x + cy * w + cx * len, a.y - cx * w + cy * len)
          .lineTo(a.x + cy * w, a.y - cx * w)
          .closePath()
          .fillPath();
      }
      if (a.move === 'fuse' && def.fuse)
        m.lineStyle(1, H.warnColor, 0.4 + 0.6 * pulse).strokeCircle(a.x, a.y, def.fuse.radius);
      if (a.move === 'bump' && a.pose === 'recover')
        this.stars(m, a.x, a.y - this.headHeight(a.kind, a.radius));
    }
  }

  private headHeight(kind: string, radius: number): number {
    const art = enemyAnimation(kind)?.art;
    return art ? art.pivot.y * art.scale + 2 : radius * 1.6;
  }

  private dashed(
    m: GameObjects.Graphics,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    pulse: number,
  ): void {
    const len = Math.hypot(x2 - x1, y2 - y1),
      n = Math.max(1, Math.floor(len / H.dash));
    m.lineStyle(1, H.warnColor, 0.45 + 0.55 * pulse);
    for (let i = 0; i < n; i += 2) {
      const a = i / n,
        b = Math.min(1, (i + 1) / n);
      m.lineBetween(x1 + (x2 - x1) * a, y1 + (y2 - y1) * a, x1 + (x2 - x1) * b, y1 + (y2 - y1) * b);
    }
  }

  private tongue(
    m: GameObjects.Graphics,
    x: number,
    y: number,
    cx: number,
    cy: number,
    lash: NonNullable<EnemyDef['lash']>,
  ): void {
    const tx = x + cx * lash.length,
      ty = y + cy * lash.length;
    m.lineStyle(lash.width + 1, H.tongueDark, 1).lineBetween(x, y, tx, ty);
    m.lineStyle(lash.width - 1, H.tongueColor, 1).lineBetween(x, y, tx, ty);
    m.fillStyle(H.tongueColor, 1).fillCircle(tx, ty, lash.width * 0.8);
  }

  private stars(m: GameObjects.Graphics, x: number, y: number): void {
    for (let k = 0; k < 3; k++) {
      const a = this.time * H.starSpeed + (k * Math.PI * 2) / 3;
      m.fillStyle(H.starColor, 1).fillRect(x + Math.cos(a) * 8 - 1, y + Math.sin(a) * 2.5 - 1, 2, 2);
    }
  }

  private drawBursts(m: GameObjects.Graphics): void {
    for (const b of this.bursts) {
      if (b.age >= b.life) continue;
      const t = b.age / b.life;
      m.lineStyle(2, b.color, 1 - t).strokeCircle(b.x, b.y, b.radius * (0.4 + 0.6 * t));
      if (t < 0.4 && settings.flashes)
        m.fillStyle(0xffffff, 0.5 * (1 - t / 0.4)).fillCircle(b.x, b.y, b.radius * 0.5);
    }
  }

  /** Boss 死亡：前段身上连续爆点，最后整个身体碎成向外飞的像素块，结尾一次白闪。 */
  private drawBossDeath(m: GameObjects.Graphics): void {
    const d = this.bossDeath;
    if (!d) return;
    const D = BOSS_DEATH;
    if (d.age > D.total + H.finalFlash) {
      this.bossDeath = null;
      return;
    }
    const cy = d.y - d.top * 0.45;
    for (let i = 0; i < D.pops; i++) {
      const start = (i / D.pops) * (D.shake + D.laugh),
        t = (d.age - start) / H.popSeconds;
      if (t < 0 || t > 1) continue;
      const angle = i * 2.399,
        r = d.top * 0.5 * Math.sqrt((i + 0.5) / D.pops);
      const x = d.x + Math.cos(angle) * r,
        y = cy + Math.sin(angle) * r * 1.2;
      m.fillStyle(i % 2 ? H.explosionColor : 0xffffff, 1 - t).fillCircle(x, y, 2 + 6 * t);
    }
    const shardStart = D.shake + D.laugh;
    if (d.age > shardStart) {
      const t = Math.min(1, (d.age - shardStart) / D.dissolve);
      for (let i = 0; i < D.shards; i++) {
        const angle = i * 2.399,
          speed = 0.5 + ((i * 7) % 10) / 10;
        const dist = t * d.top * 1.4 * speed;
        const x = d.x + Math.cos(angle) * dist,
          y = cy + Math.sin(angle) * dist - t * (1 - t) * 20 + t * t * 10;
        m.fillStyle(i % 3 === 0 ? H.bossCream : H.bossYellow, 1 - t * 0.8).fillRect(x - 1, y - 1, 2, 2);
      }
    }
    const flash = d.age - D.total;
    if (flash > 0 && settings.flashes)
      m.fillStyle(0xffffff, 0.5 * (1 - flash / H.finalFlash)).fillCircle(d.x, cy, d.top * 1.6);
  }

  readonly destroy = (): void => {
    if (this.destroyed) return;
    this.destroyed = true;
    this.bus.off('combat:exploded', this.onExploded);
    this.bus.off('entity:died', this.onDied);
    this.bus.off('enemy:acted', this.onActed);
    const world = this.scene.physics.world;
    if (world) {
      world.off(Physics.Arcade.Events.WORLD_STEP, this.tick);
      for (const c of this.colliders) if (c.world) c.destroy();
    }
    this.group.destroy(true, true);
    for (const art of this.rockArt) art.destroy();
    this.ground.destroy();
    this.marks.destroy();
  };
}

/** 奶块：按像素图生成一次纹理，之后复用。 */
function makeRockTexture(scene: Scene): void {
  const rows = ROCK_PIXELS,
    g = scene.make.graphics({}, false);
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      const color = ROCK_PALETTE[ch as keyof typeof ROCK_PALETTE];
      if (typeof color === 'number') g.fillStyle(color, 1).fillRect(x, y, 1, 1);
    }),
  );
  g.generateTexture(ROCK_TEXTURE, rows[0]!.length, rows.length);
  g.destroy();
  scene.textures.get(ROCK_TEXTURE).setFilter(Textures.FilterMode.NEAREST);
}
