import { Physics } from 'phaser';
import type { GameObjects, Scene } from 'phaser';
import { DEPTH, DEPTH_Y_SORT } from '../../config';
import { BALANCE } from '../../data/balance';
import { MAP_ART, MAP_THEME_FRAMES, type MapFrame } from '../../data/mapArt';
import { TRAP_RULES } from '../../data/traps';
import type { CombatWorld, TrapView } from '../../sim/combat/api';
import type { CombatBridge } from '../world/CombatBridge';
import type { RoomArena } from '../world/RoomArena';
import { newBarrelBody, syncBarrelBody, type BarrelBody } from './barrelBody';
import { TRAP_FX as F } from './trapParams';

/**
 * 房间机关的表现层（ADR 0032）：地刺、水流、海草丛用平铺贴图，泡泡地雷与鱼雷桶用单张贴图；
 * 立着的鱼雷桶开启静态碰撞体挡人挡子弹，子弹打中时交给 sim 扣耐久。
 * 显示对象与碰撞体初始化时按机关槽位预热，帧循环里只复用。
 */
export class TrapLayer {
  private readonly fields: GameObjects.TileSprite[] = [];
  private readonly props: GameObjects.Image[] = [];
  private readonly bodies: Physics.Arcade.Image[] = [];
  private readonly slotOf = new Map<Physics.Arcade.Image, number>();
  private readonly placed: BarrelBody[] = [];
  private readonly group: Physics.Arcade.StaticGroup;
  private readonly colliders: Physics.Arcade.Collider[];
  private readonly enabled: boolean;
  private time = 0;

  constructor(
    private readonly scene: Scene,
    private readonly sim: CombatWorld,
    private readonly bridge: CombatBridge,
    private readonly arena: RoomArena,
  ) {
    this.enabled = scene.textures.exists(MAP_ART.textures.objects);
    this.group = scene.physics.add.staticGroup();
    for (let i = 0; i < BALANCE.trapCapacity; i++) {
      const frame = this.enabled ? 'weed' : undefined;
      this.fields.push(
        scene.add
          .tileSprite(0, 0, 1, 1, this.enabled ? MAP_ART.textures.objects : '__DEFAULT', frame)
          .setDepth(DEPTH.floorDecals)
          .setVisible(false),
      );
      this.props.push(
        scene.add
          .image(
            0,
            0,
            this.enabled ? MAP_ART.textures.objects : '__DEFAULT',
            this.enabled ? 'mine' : undefined,
          )
          .setVisible(false),
      );
      const body = this.group.create(0, 0, '__DEFAULT') as Physics.Arcade.Image;
      body.setAlpha(0).disableBody(true, true);
      this.bodies.push(body);
      this.slotOf.set(body, i);
      this.placed.push(newBarrelBody());
    }
    this.colliders = [
      scene.physics.add.collider(bridge.actors.group, this.group),
      scene.physics.add.overlap(bridge.bullets.group, this.group, this.hitBarrel),
    ];
    scene.physics.world.on(Physics.Arcade.Events.WORLD_STEP, this.tick);
    scene.events.once('shutdown', this.destroy);
  }

  private readonly hitBarrel = (bullet: unknown, barrel: unknown): void => {
    const slot = this.bridge.bullets.byImage.get(bullet as Physics.Arcade.Image);
    const index = this.slotOf.get(barrel as Physics.Arcade.Image);
    if (!slot?.id || index === undefined) return;
    const body = slot.image.body!;
    if (this.sim.hitTrap(slot.id, index, body.center.x, body.center.y)) this.bridge.bullets.recycle(slot);
  };

  /**
   * 物理步里同步鱼雷桶的碰撞体：立起来或换房后换了位置就摆到桶上，爆掉就关掉并让导航重新计算。
   * 换房时导航已由 `RoomArena` 重算，这里只在桶爆掉时通知。
   */
  private readonly tick = (dt: number): void => {
    this.time += dt;
    const traps = this.sim.traps;
    let changed = false;
    for (let i = 0; i < this.bodies.length; i++) {
      const body = this.bodies[i]!,
        placed = this.placed[i]!;
      const action = syncBarrelBody(placed, traps[i], F.barrelBody);
      if (action === 'place') {
        body.enableBody(true, placed.x, placed.y, true, false);
        body.setDisplaySize(placed.size, placed.size).refreshBody();
      } else if (action === 'remove') {
        body.disableBody(true, true);
        changed = true;
      }
    }
    if (changed) this.arena.invalidateNavigation();
  };

  /** 每渲染帧更新贴图。 */
  update(): void {
    if (!this.enabled) return;
    const traps = this.sim.traps;
    for (let i = 0; i < this.fields.length; i++) {
      const t = traps[i],
        field = this.fields[i]!,
        prop = this.props[i]!;
      if (!t?.active) {
        field.setVisible(false);
        prop.setVisible(false);
        continue;
      }
      if (t.kind === 'mine' || t.kind === 'barrel') {
        field.setVisible(false);
        this.drawProp(prop, t);
      } else {
        prop.setVisible(false);
        this.drawField(field, t);
      }
    }
  }

  private drawField(field: GameObjects.TileSprite, t: TrapView): void {
    field.setVisible(true).setPosition(t.x, t.y).setRotation(0).setAlpha(1);
    if (t.kind === 'spikes') {
      // 预警时在两张图之间闪，刺出前一眼能看出来。
      const blink = t.state === 'warn' && Math.floor(this.time * F.warnBlink) % 2 === 0;
      const state = t.state === 'on' ? 'on' : blink ? 'warn' : 'idle';
      const frame = MAP_THEME_FRAMES[this.arena.artTheme].spikes[state];
      this.fieldFrame(field, frame);
      field.setSize(t.width, t.height);
      field.setTilePosition(0, 0);
      return;
    }
    if (t.kind === 'current') {
      // 水纹沿贴图横轴滚动；竖直水流旋转 90 度，宽高对调后仍覆盖真实区域。
      const vertical = Math.abs(Math.sin(t.angle)) > 0.5;
      this.fieldFrame(field, 'current');
      field
        .setSize(vertical ? t.height : t.width, vertical ? t.width : t.height)
        .setRotation(t.angle)
        .setAlpha(F.currentAlpha)
        .setTilePosition((-this.time * TRAP_RULES.current.speed) / field.tileScaleX, 0);
      return;
    }
    this.fieldFrame(field, 'weed');
    field
      .setSize(t.width, t.height)
      .setTilePosition((Math.sin(this.time * F.weedSway) * F.weedSwayPixels * 0.5) / field.tileScaleX, 0);
  }

  private fieldFrame(field: GameObjects.TileSprite, name: MapFrame): void {
    const frame = MAP_ART.frames[name];
    const size = name === 'current' || name === 'weed' ? MAP_ART.naturalFieldTile : MAP_ART.fieldTile;
    const texture = name.includes('_spikes_') ? MAP_ART.textures.spikes : MAP_ART.textures.objects;
    if (field.texture.key !== texture || field.frame.name !== name) field.setTexture(texture, name);
    field.setTileScale(size / frame[2]);
  }

  private drawProp(prop: GameObjects.Image, t: TrapView): void {
    prop.setVisible(true).setPosition(t.x, t.y).setOrigin(0.5).setAlpha(1);
    if (t.kind === 'mine') {
      const lit = t.state === 'fuse' && Math.floor(this.time * F.fuseBlink) % 2 === 0;
      prop
        .setFrame(lit ? 'mine_lit' : 'mine')
        .setDisplaySize(15, 15)
        .setDepth(DEPTH.floorDecals + 1);
      // 爆炸后重新布设：先很淡，快布设好时长回原样。
      if (t.state === 'idle') {
        const k = Math.min(1, t.time / TRAP_RULES.mine.rearm);
        prop
          .setAlpha(F.rearmAlpha + (1 - F.rearmAlpha) * k * k)
          .setDisplaySize(15 * (0.4 + 0.6 * k), 15 * (0.4 + 0.6 * k));
      }
      return;
    }
    if (t.state === 'broken') {
      prop
        .setFrame('barrel_broken')
        .setDisplaySize(21, 13)
        .setDepth(DEPTH.floorDecals + 1);
      return;
    }
    const cracked = t.hp <= TRAP_RULES.barrel.hp / 2;
    // 桶之间按脚底排序，但完整/受击桶始终低于人物与怪物。
    prop
      .setFrame(cracked ? 'barrel_hit' : 'barrel')
      .setDisplaySize(18, 23)
      .setOrigin(0.5, 0.65)
      .setDepth(DEPTH.obstacles + (t.y + t.radius) * DEPTH_Y_SORT);
  }

  private readonly destroy = (): void => {
    this.scene.physics.world?.off(Physics.Arcade.Events.WORLD_STEP, this.tick);
    for (const c of this.colliders) if (c.world) c.destroy();
    this.group.destroy(true, true);
    for (const f of this.fields) f.destroy();
    for (const p of this.props) p.destroy();
  };
}
