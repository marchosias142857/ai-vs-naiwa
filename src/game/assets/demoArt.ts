import type { Scene } from 'phaser';
import { Textures } from 'phaser';
import { DOOR_ART, ENEMY_ART, ENVIRONMENT_ART, WEAPON_ART } from '../../data/art';
import { CHARACTER_ART, DEFAULT_CHARACTER_ART, characterTexture } from '../../data/characterArt';

export const ART = {
  hero: DEFAULT_CHARACTER_ART.texture,
  weapons: 'demo_weapons',
  enemies: 'demo_enemies',
  environment: 'demo_environment',
  title: 'demo_title',
  doors: 'demo_doors',
} as const;
/** 命名帧只切 Texture 坐标，不复制图片像素；全部图集进入 PWA 预缓存。 */
export function preloadDemoArt(scene: Scene): void {
  const base = `${import.meta.env.BASE_URL}assets/demo/`;
  for (const art of Object.values(CHARACTER_ART)) {
    scene.load.image(art.texture, `${base}${art.source}`);
    if (art.reactionTexture !== art.texture)
      scene.load.image(art.reactionTexture, `${base}${art.reactionSource}`);
  }
  scene.load.image(ART.weapons, `${base}weapons.png`);
  scene.load.image(ART.enemies, `${base}enemies.png`);
  scene.load.image(ART.environment, `${base}environment.png`);
  scene.load.image(ART.title, `${base}title-confrontation-v1.webp`);
  scene.load.image(ART.doors, `${base}doors.png`);
}
export function installDemoArt(scene: Scene): void {
  // 仅游戏图集保留像素边缘；画布与文字仍按完整渲染分辨率绘制。
  for (const key of [ART.weapons, ART.enemies, ART.environment, ART.doors, ART.title])
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
  }
  for (const [name, f] of Object.entries(WEAPON_ART)) add(ART.weapons, name, f.rect);
  for (const [name, rect] of Object.entries(ENEMY_ART)) add(ART.enemies, name, rect);
  for (const [name, rect] of Object.entries(ENVIRONMENT_ART)) add(ART.environment, name, rect);
  for (const [name, rect] of Object.entries(DOOR_ART)) add(ART.doors, name, rect);
}
