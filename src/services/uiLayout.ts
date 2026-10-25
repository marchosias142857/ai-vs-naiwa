import { loadValue, saveValue } from './storage';

export const UI_KEYS = ['health', 'armor', 'energy', 'move', 'fire', 'skill', 'swap', 'interact'] as const;
export type UiKey = (typeof UI_KEYS)[number];
export interface UiItem {
  x: number | null;
  y: number | null;
  scale: number;
  opacity: number;
}
export type UiLayout = Record<UiKey, UiItem>;
export const UI_LAYOUT_CHANGED = 'avn:ui-layout';
export const uiEditor = { open: false };
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const number = (v: unknown, fallback: number, lo: number, hi: number) =>
  typeof v === 'number' && Number.isFinite(v) ? clamp(v, lo, hi) : fallback;
export const isVital = (key: UiKey) => key === 'health' || key === 'armor' || key === 'energy';

/** 位置为安全画布内的中心比例；null 表示随屏幕边缘自适应的默认位置。 */
export function parseUiLayout(value: unknown): UiLayout {
  const input = value && typeof value === 'object' ? (value as Partial<UiLayout>) : {};
  return Object.fromEntries(
    UI_KEYS.map((key) => {
      const v = input[key];
      return [
        key,
        {
          x: typeof v?.x === 'number' && Number.isFinite(v.x) ? clamp(v.x, 0, 1) : null,
          y: typeof v?.y === 'number' && Number.isFinite(v.y) ? clamp(v.y, 0, 1) : null,
          scale: number(v?.scale, 1, 0.8, 1.5),
          opacity: number(v?.opacity, isVital(key) ? 0.95 : 0.55, 0.25, 1),
        },
      ];
    }),
  ) as UiLayout;
}
export const uiLayout = parseUiLayout(loadValue('avn.ui-layout.v1'));
/** 写入成功才替换正在使用的布局，失败时编辑器保留草稿。 */
export function saveUiLayout(value: UiLayout): boolean {
  const next = parseUiLayout(value);
  if (!saveValue('avn.ui-layout.v1', next)) return false;
  Object.assign(uiLayout, next);
  window.dispatchEvent(new Event(UI_LAYOUT_CHANGED));
  return true;
}
/** 绘制、编辑预览和触控判定共用同一个 CSS 像素矩形。 */
export function uiRect(key: UiKey, width: number, height: number, layout = uiLayout) {
  const item = layout[key],
    vital = isVital(key);
  const size = key === 'move' ? 104 : key === 'fire' ? 112 : 56;
  const w = (vital ? 140 : size) * item.scale,
    h = (vital ? 18 : size) * item.scale;
  const defaultX = vital
    ? 12 + w / 2
    : key === 'move'
      ? 100
      : width - (key === 'fire' ? 88 : key === 'skill' ? 190 : key === 'swap' ? 174 : 72);
  const defaultY = vital
    ? 12 + UI_KEYS.indexOf(key) * 22 * item.scale + h / 2
    : height -
      (key === 'move' ? 100 : key === 'fire' ? 88 : key === 'skill' ? 76 : key === 'swap' ? 150 : 196);
  const x = clamp(
    item.x === null ? defaultX : item.x * width,
    w / 2 + 8,
    Math.max(w / 2 + 8, width - w / 2 - 8),
  );
  const y = clamp(
    item.y === null ? defaultY : item.y * height,
    h / 2 + 8,
    Math.max(h / 2 + 8, height - h / 2 - 8),
  );
  return { x, y, width: w, height: h, scale: item.scale, opacity: item.opacity };
}
export function placeUi(
  element: HTMLElement,
  key: UiKey,
  width: number,
  height: number,
  layout = uiLayout,
): void {
  const r = uiRect(key, width, height, layout);
  Object.assign(element.style, {
    position: 'absolute',
    left: `${r.x - r.width / 2}px`,
    top: `${r.y - r.height / 2}px`,
    width: `${r.width}px`,
    height: `${r.height}px`,
    opacity: String(r.opacity),
    fontSize: `${(isVital(key) ? 10 : 12) * r.scale}px`,
  });
}

/** 不允许把操作按钮盖住另一个触控命中区或固定菜单入口。 */
export function controlsOverlap(width: number, height: number, layout: UiLayout): boolean {
  const circles = UI_KEYS.filter((key) => !isVital(key)).map((key) => {
    const r = uiRect(key, width, height, layout);
    return { x: r.x, y: r.y, radius: r.width / 2 + (key === 'fire' ? 12 * r.scale : 0) };
  });
  // 地图是 DOM 按钮，覆盖轮盘后会吞掉该区域的触点。
  if (
    circles.some(
      (c) => Math.hypot(c.x - clamp(c.x, width - 116, width - 56), c.y - clamp(c.y, 8, 48)) < c.radius + 4,
    )
  )
    return true;
  circles.push({ x: width - 28, y: 28, radius: 22 });
  return circles.some((a, i) =>
    circles.slice(i + 1).some((b) => Math.hypot(a.x - b.x, a.y - b.y) < a.radius + b.radius + 4),
  );
}
