/** 线段与闭合轴对齐矩形相交；数值输入/输出，无临时几何对象。 */
export function segmentHitsBox(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  left: number,
  top: number,
  right: number,
  bottom: number,
): boolean {
  const dx = x2 - x1,
    dy = y2 - y1;
  let near = 0,
    far = 1;
  if (dx === 0) {
    if (x1 < left || x1 > right) return false;
  } else {
    const a = (left - x1) / dx,
      b = (right - x1) / dx;
    near = Math.max(near, Math.min(a, b));
    far = Math.min(far, Math.max(a, b));
  }
  if (dy === 0) {
    if (y1 < top || y1 > bottom) return false;
  } else {
    const a = (top - y1) / dy,
      b = (bottom - y1) / dy;
    near = Math.max(near, Math.min(a, b));
    far = Math.min(far, Math.max(a, b));
  }
  return near <= far;
}
