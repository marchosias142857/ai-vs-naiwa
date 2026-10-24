import { HERO_ART, WEAPON_ART } from '../../data/art';
import type { WeaponId } from '../../data/weapons';
import type { Vec2 } from '../core/types';

/** 固定标准持握点与局部枪口；不读取动画、Phaser 或渲染帧。左瞄准保持枪身朝上。 */
export function playerMuzzle(out: Vec2, x: number, y: number, angle: number, id: WeaponId): void {
  const art = WEAPON_ART[id],
    left = Math.cos(angle) < 0,
    mirror = left ? -1 : 1;
  const mx = art.muzzle.x * art.scale,
    my = art.muzzle.y * art.scale * mirror;
  out.x = x + HERO_ART.standardGrip.x * mirror + mx * Math.cos(angle) - my * Math.sin(angle);
  out.y = y + HERO_ART.standardGrip.y + mx * Math.sin(angle) + my * Math.cos(angle);
}
