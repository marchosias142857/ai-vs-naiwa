import { z } from 'zod';

/**
 * 数据 schema 只在测试与校验脚本中运行；游戏运行时只用 `z.infer` 得到的类型（`import type`），
 * 因此 zod 不会进入生产包（ADR 0002，ESLint 强制）。
 */

/** 数据 ID：小写字母开头的 snake_case。 */
export const IdSchema = z.string().regex(/^[a-z][a-z0-9_]*$/, '数据 ID 必须是 snake_case');

const I18N_KEY = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/;

/** i18n 文案 key：`领域.名称`，如 `weapon.pistol_basic`。 */
export const I18nKeySchema = z.string().regex(I18N_KEY, 'i18n key 格式为 领域.名称');

/** 纹理 key（`src/game/assets/keys.ts` 中的值）。是否真实存在由单测检查。 */
export const TextureKeySchema = z.string().min(1);

export const Seconds = z.number().min(0);
export const PositiveNumber = z.number().positive();
export const Probability = z.number().min(0).max(1);
