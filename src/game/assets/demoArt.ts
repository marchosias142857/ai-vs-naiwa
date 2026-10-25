import type { Scene } from 'phaser';
import { Textures } from 'phaser';
import { DOOR_ART, ENEMY_ART, ENVIRONMENT_ART, WEAPON_ART } from '../../data/art';
import { ARSENAL_SHOT_ART } from '../../data/arsenalArt';
import { ROOM_ART } from '../../data/roomArt';
import type { WeaponArt } from '../../data/schema/art';
import type { WeaponId } from '../../data/weapons';
import { CHARACTER_ART, DEFAULT_CHARACTER_ART, characterTexture } from '../../data/characterArt';
import { ENEMIES } from '../../data/enemies';
import { MONSTER_TEXTURES, enemyAnimation, monsterFrame } from '../../data/enemyArt';

export const ART = {
  hero: DEFAULT_CHARACTER_ART.texture,
  weapons: 'demo_weapons',
  arsenal: 'demo_arsenal',
  rooms: 'demo_rooms',
  enemies: 'demo_enemies',
  environment: 'demo_environment',
  title: 'demo_title',
  doors: 'demo_doors',
  altar: 'talent_altar',
} as const;
/** 武器所在的图集：原武器在 `demo_weapons`，ADR 0031 的新武器在 `demo_arsenal`。 */
export function weaponTexture(id: WeaponId): string {
  return (WEAPON_ART[id] as WeaponArt).texture ?? ART.weapons;
}
/** 命名帧只切 Texture 坐标，不复制图片像素；全部图集进入 PWA 预缓存。 */
export function preloadDemoArt(scene: Scene): void {
  const base = `${import.meta.env.BASE_URL}assets/demo/`;
  for (const art of Object.values(CHARACTER_ART)) {
    scene.load.image(art.texture, `${base}${art.source}`);
    if (art.reactionTexture !== art.texture)
      scene.load.image(art.reactionTexture, `${base}${art.reactionSource}`);
  }
  scene.load.image(ART.weapons, `${base}weapons.png`);
  scene.load.image(ART.arsenal, `${base}arsenal-v1.png`);
  scene.load.image(ART.rooms, `${base}rooms-v1.png`);
  scene.load.image(ART.enemies, `${base}enemies.png`);
  scene.load.image(ART.environment, `${base}environment.png`);
  scene.load.image(ART.title, `${base}title-confrontation-v1.webp`);
  scene.load.image(ART.altar, `${base}talent-altar-v1.png`);
  scene.load.image(ART.doors, `${base}doors.png`);
  // 只加载有帧数据的图集；普通怪物图集生成前不请求不存在的文件。
  const used = new Set(Object.keys(ENEMIES).map((kind) => enemyAnimation(kind)?.texture));
  for (const [name, t] of Object.entries(MONSTER_TEXTURES))
    if (used.has(name as keyof typeof MONSTER_TEXTURES)) scene.load.image(t.key, `${base}${t.source}`);
}
export function installDemoArt(scene: Scene): void {
  // 仅游戏图集保留像素边缘；画布与文字仍按完整渲染分辨率绘制。
  for (const key of [
    ART.weapons,
    ART.arsenal,
    ART.rooms,
    ART.enemies,
    ART.environment,
    ART.doors,
    ART.title,
    ART.altar,
  ])
    if (scene.textures.exists(key)) scene.textures.get(key).setFilter(Textures.FilterMode.NEAREST);
  const add = (atlas: string, name: string, rect: readonly [number, number, number, number]) => {
    if (scene.textures.exists(atlas) && !scene.textures.get(atlas).has(name))
      scene.textures.get(atlas).add(name, 0, ...rect);
  };
  for (const art of Object.values(CHARACTER_ART)) {
    for (const key of [art.texture, art.reactionTexture])
      if (scene.textures.exists(key)) scene.textures.get(key).setFilter(Textures.FilterMode.NEAREST);
    for (const action of ['idle', 'run', 'hurt', 'death'] as const)
      for (const name of art[action]) add(characterTexture(art, action), name, art.frames[name]!.rect);
    if (art.face) add(art.texture, art.face.frame, art.face.rect);
  }
  for (const [name, f] of Object.entries(WEAPON_ART)) add(weaponTexture(name as WeaponId), name, f.rect);
  for (const [name, rect] of Object.entries(ARSENAL_SHOT_ART)) add(ART.arsenal, name, rect);
  for (const [name, rect] of Object.entries(ROOM_ART)) add(ART.rooms, name, rect);
  for (const [name, rect] of Object.entries(ENEMY_ART)) add(ART.enemies, name, rect);
  for (const [name, rect] of Object.entries(ENVIRONMENT_ART)) add(ART.environment, name, rect);
  for (const [name, rect] of Object.entries(DOOR_ART)) add(ART.doors, name, rect);
  // 怪物逐帧图集（ADR 0030）：帧名为「怪物:动作:序号」。
  for (const t of Object.values(MONSTER_TEXTURES))
    if (scene.textures.exists(t.key)) scene.textures.get(t.key).setFilter(Textures.FilterMode.NEAREST);
  for (const kind of Object.keys(ENEMIES)) {
    const anim = enemyAnimation(kind);
    if (!anim) continue;
    const [w, h] = anim.art.size,
      key = MONSTER_TEXTURES[anim.texture].key;
    for (const [action, corners] of Object.entries(anim.art.frames))
      corners.forEach(([x, y], i) => add(key, monsterFrame(kind, action, i), [x, y, w, h]));
  }
}
