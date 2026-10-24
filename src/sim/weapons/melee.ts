/** 圆与闭扇形相交：包括圆跨过边界射线的情况，不把背后的圆当作正面命中。 */
export function sectorHitsCircle(
  dx: number,
  dy: number,
  radius: number,
  facing: number,
  range: number,
  arcDegrees: number,
): boolean {
  const distance = Math.hypot(dx, dy);
  if (distance > range + radius) return false;
  if (distance <= radius || arcDegrees >= 360) return true;
  const angle = Math.abs(
    Math.atan2(Math.sin(Math.atan2(dy, dx) - facing), Math.cos(Math.atan2(dy, dx) - facing)),
  );
  const half = (arcDegrees * Math.PI) / 360;
  if (angle <= half) return true;
  const delta = angle - half,
    along = distance * Math.cos(delta);
  const closest = Math.max(0, Math.min(range, along));
  return (along - closest) ** 2 + (distance * Math.sin(delta)) ** 2 <= radius ** 2;
}
