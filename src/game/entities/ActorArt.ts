import { TintModes } from 'phaser';
import type { GameObjects, Scene } from 'phaser';
import { DEPTH, DEPTH_Y_SORT, RENDER_SCALE } from '../../config';
import { ENEMY_ART, WEAPON_ART } from '../../data/art';
import { DEFAULT_CHARACTER_ART, characterArtFor, characterTexture } from '../../data/characterArt';
import { PRESENTATION as P } from '../../data/presentation';
import { WEAPONS } from '../../data/weapons';
import type { WeaponDef } from '../../data/schema';
import type { CombatWorld } from '../../sim/combat/api';
import { ART } from '../assets/demoArt';
import type { CombatActors } from './CombatActors';
import { frameAt } from './artPose';
import { settings } from '../../services/settings';

interface ArtSlot {
  image: GameObjects.Image;
  shadow: GameObjects.Ellipse;
  id: number;
  flash: number;
  death: number;
  hurtAt: number;
  wasHurt: boolean;
  pose: 'idle' | 'run';
  poseAt: number;
}
/** 所有图片预热；物理代理保持固定尺寸，换帧/翻面/持握点永不写入 Arcade。 */
export class ActorArt {
  readonly slots: ArtSlot[] = [];
  readonly weapon: GameObjects.Image;
  showWeapon = true;
  private readonly arc: GameObjects.Graphics;
  constructor(
    private readonly scene: Scene,
    private readonly sim: CombatWorld,
    private readonly actors: CombatActors,
  ) {
    for (let i = 0; i < actors.slots.length; i++)
      this.slots.push({
        image: scene.add
          .image(0, 0, DEFAULT_CHARACTER_ART.texture, DEFAULT_CHARACTER_ART.idle[0])
          .setVisible(false),
        shadow: scene.add
          .ellipse(0, 0, 1, 1, P.shadowColor, P.shadowAlpha)
          .setDepth(DEPTH.shadows)
          .setVisible(false),
        id: 0,
        flash: 0,
        death: 0,
        hurtAt: -Infinity,
        wasHurt: false,
        pose: 'idle',
        poseAt: 0,
      });
    this.weapon = scene.add.image(0, 0, ART.weapons, 'pistol_basic').setVisible(false);
    this.arc = scene.add.graphics().setDepth(DEPTH.fx);
    scene.events.on('postupdate', this.update);
  }
  feedback(index: number, flash: number, death: number): void {
    const slot = this.slots[index]!;
    slot.flash = flash;
    slot.death = death;
  }
  private readonly update = (): void => {
    this.weapon.setVisible(false);
    this.arc.clear();
    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i]!,
        physical = this.actors.slots[i]!,
        a = this.sim.getActor(physical.id);
      const visible = !!a && a.phase !== 'telegraph';
      slot.image.setVisible(visible);
      slot.shadow.setVisible(visible && a?.phase !== 'dead');
      if (!a) {
        slot.id = 0;
        continue;
      }
      physical.image.setAlpha(0);
      if (slot.id !== a.id) {
        slot.id = a.id;
        slot.hurtAt = -Infinity;
        slot.wasHurt = false;
        slot.pose = 'idle';
        slot.poseAt = this.sim.time;
      }
      if (!visible) continue;
      if (slot.flash > 0 && !slot.wasHurt) slot.hurtAt = this.sim.time;
      slot.wasHurt = slot.flash > 0;
      const left = Math.cos(a.facing) < 0,
        mirror = left ? -1 : 1;
      const depth = DEPTH.actors + a.y * DEPTH_Y_SORT;
      const image = slot.image;
      image
        .setPosition(a.x, a.y)
        .setFlipX(left)
        .setAngle(0)
        .setDepth(depth)
        .setAlpha(a.invulnerable ? P.invulnerableAlpha : 1);
      if (a.team === 'enemy' && slot.flash && settings.flashes)
        image.setTint(0xffffff).setTintMode(TintModes.FILL);
      else image.clearTint().setTintMode(TintModes.MULTIPLY);
      slot.shadow
        .setPosition(a.x, a.y + a.radius)
        .setDisplaySize(a.radius * P.shadowWidth, a.radius * P.shadowHeight);
      if (a.team === 'enemy') {
        const rect = ENEMY_ART[a.kind as keyof typeof ENEMY_ART];
        image
          .setTexture(ART.enemies, a.kind)
          .setOrigin(0.5, 0.5)
          .setScale((a.radius * P.enemySize) / rect[3]);
        if (a.phase === 'dead')
          image
            .setAlpha(Math.max(0, 1 - slot.death / P.deathSeconds))
            .setAngle((slot.death / P.deathSeconds) * P.deathAngle);
        else if (a.vx || a.vy) image.y += Math.sin(this.sim.time * P.bobSpeed + a.id) * P.bobPixels;
        continue;
      }
      const pose = a.vx || a.vy ? 'run' : 'idle';
      if (slot.pose !== pose) {
        slot.pose = pose;
        slot.poseAt = this.sim.time;
      }
      const character = characterArtFor(a.kind);
      const bodyLeft = Math.cos(this.sim.playerBodyFacing) < 0,
        flipBody = bodyLeft !== (character.nativeFacing === 'left'),
        sourceMirror = character.nativeFacing === 'left' ? -1 : 1;
      const action =
        a.phase === 'dead' ? 'death' : this.sim.time - slot.hurtAt < P.hurtSeconds ? 'hurt' : pose;
      const time =
        action === 'death' ? slot.death : this.sim.time - (action === 'hurt' ? slot.hurtAt : slot.poseAt);
      const name = frameAt(action, time, character),
        texture = characterTexture(character, action),
        f = character.frames[name]!,
        scale = action === 'hurt' || action === 'death' ? character.reactionScale : character.scale;
      image
        .setTexture(texture, name)
        .setFlipX(flipBody)
        .setOrigin(flipBody ? 1 - f.pivot.x / f.rect[2] : f.pivot.x / f.rect[2], f.pivot.y / f.rect[3])
        .setScale(scale);
      // 只对齐角色图像左上角到渲染像素；不量化物理坐标或旋转武器。
      const originX = (flipBody ? f.rect[2] - f.pivot.x : f.pivot.x) * scale;
      const originY = f.pivot.y * scale;
      image.setPosition(
        Math.round((a.x - originX) * RENDER_SCALE) / RENDER_SCALE + originX,
        Math.round((a.y - originY) * RENDER_SCALE) / RENDER_SCALE + originY,
      );
      if (a.phase !== 'active' || !this.showWeapon) continue;
      const id = this.sim.weaponId,
        art = WEAPON_ART[id],
        m = this.sim.melee;
      const def: Readonly<WeaponDef> = WEAPONS[id];
      let angle = a.facing;
      if (m.active && def.melee) {
        const half = (def.melee.arcDegrees * Math.PI) / 360;
        angle = m.angle + (1 - (2 * m.remaining) / m.duration) * half;
        this.arc
          .lineStyle(P.arcWidth, P.arcColor, P.arcAlpha)
          .beginPath()
          .arc(a.x, a.y, def.melee.range, m.angle - half, angle, false)
          .strokePath();
      }
      const up = Math.sin(angle) < -Math.cos((character.behindUpDegrees * Math.PI) / 180);
      this.weapon
        .setTexture(ART.weapons, id)
        .setVisible(true)
        .setPosition(
          // 先将源图握持点归一到朝右，再按武器朝向镜像；身体可独立朝走路方向。
          image.x + (f.grip.x - f.pivot.x) * scale * sourceMirror * mirror,
          image.y + (f.grip.y - f.pivot.y) * scale,
        )
        .setOrigin(art.grip.x / art.rect[2], left ? 1 - art.grip.y / art.rect[3] : art.grip.y / art.rect[3])
        .setFlipY(left)
        .setScale(art.scale)
        .setRotation(angle)
        .setAlpha(image.alpha)
        .setDepth(depth + (up ? -P.weaponDepth : P.weaponDepth));
    }
  };
  inspect() {
    const index = this.actors.slots.findIndex((s) => s.id === this.sim.playerId),
      hero = this.slots[index]?.image;
    if (!hero) return null;
    const source = hero.texture.getSourceImage();
    return {
      frame: hero.frame.name,
      texture: hero.texture.key,
      source: source instanceof HTMLImageElement ? source.src : '',
      sourceWidth: source.width,
      sourceHeight: source.height,
      x: hero.x,
      y: hero.y,
      flipX: hero.flipX,
      depth: hero.depth,
      weapon: {
        x: this.weapon.x,
        y: this.weapon.y,
        flipY: this.weapon.flipY,
        angle: this.weapon.rotation,
        depth: this.weapon.depth,
        visible: this.weapon.visible,
      },
    };
  }
  destroy(): void {
    this.scene.events.off('postupdate', this.update);
    for (const slot of this.slots) {
      slot.image.destroy();
      slot.shadow.destroy();
    }
    this.weapon.destroy();
    this.arc.destroy();
  }
}
