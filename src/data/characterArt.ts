import { HERO_ART } from './art';
import type { CharacterId } from './characters';
import type { CharacterAction, CharacterArt } from './schema/art';

/** 每个可玩角色都须注册美术；新增角色无需修改加载器或动画渲染器。 */
export const CHARACTER_ART: Readonly<Record<CharacterId, CharacterArt>> = {
  ai_proto: HERO_ART,
};

export const DEFAULT_CHARACTER_ART: CharacterArt = CHARACTER_ART.ai_proto;

/** sim 已校验角色 ID；未知调试角色使用默认外观，避免影响场景运行。 */
export function characterArtFor(id: string): CharacterArt {
  return CHARACTER_ART[id as CharacterId] ?? DEFAULT_CHARACTER_ART;
}

export function characterTexture(art: CharacterArt, action: CharacterAction): string {
  return action === 'hurt' || action === 'death' ? art.reactionTexture : art.texture;
}
