import type { Scene } from 'phaser';
import { ENEMY_ART, ENVIRONMENT_ART, HERO_FRAMES, WEAPON_ART } from '../../data/art';

export const ART = {
  hero: 'demo_hero',
  weapons: 'demo_weapons',
  enemies: 'demo_enemies',
  environment: 'demo_environment',
  title: 'demo_title',
} as const;
/** 五张真实 PNG；源图保留在仓库，命名帧只切 Texture 坐标，不复制图片像素。 */
export function preloadDemoArt(scene: Scene): void {
  const base = `${import.meta.env.BASE_URL}assets/demo/`;
  scene.load.image(ART.hero, `${base}da-fei-yu.png`);
  scene.load.image(ART.weapons, `${base}weapons.png`);
  scene.load.image(ART.enemies, `${base}enemies.png`);
  scene.load.image(ART.environment, `${base}environment.png`);
  scene.load.image(ART.title, `${base}title.png`);
}
export function installDemoArt(scene: Scene): void {
  const add = (atlas: string, name: string, rect: readonly [number, number, number, number]) => {
    if (scene.textures.exists(atlas) && !scene.textures.get(atlas).has(name))
      scene.textures.get(atlas).add(name, 0, ...rect);
  };
  for (const [name, f] of Object.entries(HERO_FRAMES)) add(ART.hero, name, f.rect);
  for (const [name, f] of Object.entries(WEAPON_ART)) add(ART.weapons, name, f.rect);
  for (const [name, rect] of Object.entries(ENEMY_ART)) add(ART.enemies, name, rect);
  for (const [name, rect] of Object.entries(ENVIRONMENT_ART)) add(ART.environment, name, rect);
}
