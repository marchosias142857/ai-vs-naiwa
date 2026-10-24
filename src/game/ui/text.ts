import type { Types } from 'phaser';
import { COLORS, RENDER_SCALE } from '../../config';

export const FONT_FAMILY =
  'system-ui, "PingFang SC", "Hiragino Sans GB", "Noto Sans SC", "Microsoft YaHei", sans-serif';

/** 统一的文字样式。玩家可见文字后续改为 i18n 的 t('key')（M4）。 */
export function textStyle(
  size: number,
  color: string = COLORS.text,
  extra: Types.GameObjects.Text.TextStyle = {},
): Types.GameObjects.Text.TextStyle {
  return { fontFamily: FONT_FAMILY, fontSize: `${size}px`, resolution: RENDER_SCALE, color, ...extra };
}
