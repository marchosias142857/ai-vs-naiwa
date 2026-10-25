import { z } from 'zod';
const point = z.strictObject({ x: z.number().finite(), y: z.number().finite() });
export const ArtFrameSchema = z.strictObject({
  rect: z.tuple([z.int().nonnegative(), z.int().nonnegative(), z.int().positive(), z.int().positive()]),
  pivot: point,
  grip: point,
  seconds: z.number().positive(),
});
export const CharacterArtSchema = z.strictObject({
  /** 未翻转源图的角色朝向；握持点仍使用源图坐标。 */
  nativeFacing: z.enum(['left', 'right']),
  texture: z.string().min(1),
  source: z.string().min(1),
  reactionTexture: z.string().min(1),
  reactionSource: z.string().min(1),
  /** 待机/行走复用的面部；pivot 相对这块贴图，反应动作仍用原帧。 */
  face: z
    .strictObject({ frame: z.string().min(1), rect: ArtFrameSchema.shape.rect.readonly(), pivot: point })
    .optional(),
  frames: z.record(z.string(), ArtFrameSchema),
  scale: z.number().positive(),
  reactionScale: z.number().positive(),
  standardGrip: point,
  behindUpDegrees: z.number().min(0).max(90),
  idle: z.array(z.string()).min(1).readonly(),
  run: z.array(z.string()).min(1).readonly(),
  hurt: z.array(z.string()).min(1).readonly(),
  death: z.array(z.string()).min(1).readonly(),
});
export const WeaponArtSchema = z.strictObject({
  rect: ArtFrameSchema.shape.rect,
  grip: point,
  /** 相对握把的源图像素偏移；乘 scale 才是 sim 的游戏像素。 */
  muzzle: point,
  scale: z.number().positive(),
});
/**
 * 怪物逐帧图集（ADR 0030）：同一怪物的帧尺寸相同，`frames` 记录每个动作的帧左上角；
 * `pivot` 是身体圆心在帧内的位置，`scale` 是 1 个图集像素对应的游戏像素，`facing` 是未翻转时的朝向。
 */
const corner = z.tuple([z.int().nonnegative(), z.int().nonnegative()]).readonly();
export const MonsterArtSchema = z.strictObject({
  size: z.tuple([z.int().positive(), z.int().positive()]).readonly(),
  pivot: point,
  scale: z.number().positive(),
  facing: z.enum(['left', 'right']),
  frames: z.record(z.string(), z.array(corner).min(1).readonly()),
  seconds: z.record(z.string(), z.number().positive()),
});
export type MonsterArt = z.infer<typeof MonsterArtSchema>;
export type ArtFrame = z.infer<typeof ArtFrameSchema>;
export type CharacterArt = z.infer<typeof CharacterArtSchema>;
export type CharacterAction = 'idle' | 'run' | 'hurt' | 'death';
export type WeaponArt = z.infer<typeof WeaponArtSchema>;
export const PresentationSchema = z.strictObject({
  shadowColor: z.int().nonnegative(),
  shadowAlpha: z.number().min(0).max(1),
  shadowWidth: z.number().positive(),
  shadowHeight: z.number().positive(),
  enemySize: z.number().positive(),
  bobPixels: z.number().nonnegative(),
  bobSpeed: z.number().positive(),
  invulnerableAlpha: z.number().min(0).max(1),
  deathSeconds: z.number().positive(),
  deathAngle: z.number().finite(),
  hurtSeconds: z.number().positive(),
  weaponDepth: z.number().positive(),
  arcWidth: z.number().positive(),
  arcColor: z.int().nonnegative(),
  arcAlpha: z.number().min(0).max(1),
});
export type Presentation = z.infer<typeof PresentationSchema>;
