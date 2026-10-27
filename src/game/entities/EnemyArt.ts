import { TintModes } from 'phaser';
import type { GameObjects } from 'phaser';
import {
  BOSS_DEATH,
  MONSTER_TEXTURES,
  POSE_FALLBACK,
  enemyAnimation,
  monsterFrame,
  type EnemyAnimation,
} from '../../data/enemyArt';
import type { ActorView } from '../../sim/combat/api';
import { settings } from '../../services/settings';
import { WEAPON_FX } from '../fx/weaponParams';

interface PoseClock {
  id: number;
  action: string;
  since: number;
  /** 上一次绘制时的 sim 时间；冻住期间动画时钟跟着平移，画面停在当前帧（ADR 0031）。 */
  last: number;
}

/**
 * 怪物逐帧动画（ADR 0030）：按 sim 给的 pose 选动作，腾空时整张图抬高 `lift`。
 * 只换贴图帧与位置，物理代理不受影响；没有逐帧图的怪物交还给 ActorArt 的旧静态画法。
 */
export class EnemyArt {
  private readonly clocks: PoseClock[] = [];
  private zoom = 1;

  constructor(slots: number) {
    for (let i = 0; i < slots; i++) this.clocks.push({ id: 0, action: '', since: 0, last: 0 });
  }

  /**
   * 返回 false 表示这个怪物没有逐帧动画。`death` 是死亡后经过的秒数，`flash` 是受击闪白剩余秒数，
   * `zoom` 是世界相机的缩放，用来把帧对齐到渲染像素。
   */
  draw(
    index: number,
    image: GameObjects.Image,
    a: ActorView,
    time: number,
    death: number,
    flash: number,
    zoom: number,
    shadow?: GameObjects.Ellipse,
    hurtAt = -Infinity,
  ): boolean {
    this.zoom = zoom;
    const anim = enemyAnimation(a.kind);
    if (!anim) return false;
    // 长腿和奶怪的脚底与身体半径无关；腾空时影子仍留在固定地面位置。
    const ground = anim.art.shadowY;
    shadow?.setPosition(
      a.x,
      a.y + (ground === undefined ? a.radius : (ground - anim.art.pivot.y) * anim.art.scale),
    );
    const clock = this.clocks[index]!;
    const wanted = a.phase === 'dead' ? 'death' : a.pose;
    let action = pick(anim, wanted);
    if (clock.id !== a.id || clock.action !== action) {
      clock.id = a.id;
      clock.action = action;
      clock.since = time;
    } else if (a.frozen) clock.since += time - clock.last;
    clock.last = time;
    const frames = anim.art.frames[action]!;
    const seconds = anim.art.seconds[action] ?? 0.1;
    let frame: number;
    let dx = 0,
      alpha = 1,
      white = flash > 0;
    if (a.phase === 'dead') {
      if (a.kind === 'naiwa_boss') {
        // Boss 演出：定住闪白狂抖 → 捧腹狂笑 → 倒地消散（碎成像素的粒子由 HazardLayer 画）。
        const d = BOSS_DEATH;
        if (death < d.shake) {
          frame = 0;
          dx = Math.sin(death * 90) * d.shakePixels;
          white = Math.floor(death / d.flashEvery) % 2 === 0;
        } else if (death < d.shake + d.laugh) {
          const laughAction = anim.art.frames.laugh ? 'laugh' : action;
          const laugh = anim.art.frames[laughAction]!;
          const k = Math.floor((death - d.shake) / (anim.art.seconds[laughAction] ?? 0.12)) % laugh.length;
          const wobble = Math.sin(death * 70) * d.laughShakePixels;
          return this.place(image, anim, a, laughAction, k, wobble, 1, 1, 1, false);
        } else {
          const t = Math.min(1, (death - d.shake - d.laugh) / d.dissolve);
          frame = Math.min(frames.length - 1, Math.floor(t * frames.length));
          alpha = 1 - t;
          white = t < 0.25;
        }
      } else {
        frame = Math.min(frames.length - 1, Math.floor(death / seconds));
        // 最后一帧边淡出，免得尸体突然消失。
        if (frame === frames.length - 1) alpha = Math.max(0, 1 - (death - frame * seconds) / seconds);
      }
    } else {
      const step = Math.floor(Math.max(0, time - clock.since) / seconds);
      // 蓄力与收招播到末帧后保持，不能在状态尚未结束时突然倒回第一帧。
      const once =
        action === 'windup' ||
        action === 'attack' ||
        action === 'recover' ||
        action === 'hurt' ||
        action === 'air';
      frame = once ? Math.min(frames.length - 1, step) : step % frames.length;
      const hurt = anim.art.frames.hurt;
      const hurtSeconds = anim.art.seconds.hurt ?? 0.08;
      const hurtTime = time - hurtAt;
      // 受击不盖住出招/腾空/钻地姿态，也不重置原动作时钟。
      if (
        hurt &&
        !a.frozen &&
        (action === 'idle' || action === 'move' || action === 'recover') &&
        hurtTime >= 0 &&
        hurtTime < hurt.length * hurtSeconds
      ) {
        action = 'hurt';
        frame = Math.floor(hurtTime / hurtSeconds);
      }
    }
    return this.place(image, anim, a, action, frame, dx, 1, 1, alpha, white);
  }

  private place(
    image: GameObjects.Image,
    anim: EnemyAnimation,
    a: ActorView,
    action: string,
    frame: number,
    dx: number,
    sx: number,
    sy: number,
    alpha: number,
    white: boolean,
  ): true {
    const art = anim.art;
    const [w, h] = art.size;
    const faceLeft = Math.cos(a.facing) < 0;
    const flip = faceLeft !== (art.facing === 'left');
    const ox = flip ? w - art.pivot.x : art.pivot.x;
    image
      .setTexture(MONSTER_TEXTURES[anim.texture].key, monsterFrame(a.kind, action, frame))
      .setFlipX(flip)
      .setAngle(0)
      .setOrigin(ox / w, art.pivot.y / h)
      .setScale(art.scale * sx, art.scale * sy)
      .setAlpha(alpha * (a.invulnerable ? 0.65 : 1));
    if (white && settings.flashes) image.setTint(0xffffff).setTintMode(TintModes.FILL);
    else if (a.frozen) image.setTint(WEAPON_FX.frozenTint).setTintMode(TintModes.MULTIPLY);
    else if (a.chill > 0) image.setTint(chillTint(a.chill)).setTintMode(TintModes.MULTIPLY);
    else image.clearTint().setTintMode(TintModes.MULTIPLY);
    // 帧左上角对齐渲染像素，像素块不抖。
    const left = ox * art.scale * sx,
      top = art.pivot.y * art.scale * sy;
    const x = a.x + dx,
      y = a.y - a.lift;
    image.setPosition(
      Math.round((x - left) * this.zoom) / this.zoom + left,
      Math.round((y - top) * this.zoom) / this.zoom + top,
    );
    return true;
  }
}

/** 减速越多越蓝：白色按减速比例混向冰蓝。 */
function chillTint(chill: number): number {
  const c = WEAPON_FX.chillTint,
    k = Math.min(1, chill / WEAPON_FX.chillFull);
  const mixChannel = (shift: number) => Math.round(255 + (((c >> shift) & 0xff) - 255) * k) << shift;
  return mixChannel(16) | mixChannel(8) | mixChannel(0);
}

function pick(anim: EnemyAnimation, wanted: string): string {
  for (const action of POSE_FALLBACK[wanted] ?? ['idle']) if (anim.art.frames[action]?.length) return action;
  return Object.keys(anim.art.frames)[0]!;
}
