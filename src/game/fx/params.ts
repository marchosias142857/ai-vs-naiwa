/** 输入控件的 CSS 像素尺寸；绘制与命中判定必须共用。 */
export const INPUT_UI = {
  pause: { inset: 28, radius: 18, hitRadius: 22, fontSize: 18 },
  fire: { inset: 88, radius: 40, pressedScale: 0.94, transitionMs: 60 },
  resume: { radius: 40, fontSize: 16 },
  joystick: { homeInset: 100, radius: 52, knobRadius: 22, activeAlpha: 0.8, idleAlpha: 0.35 },
  moveArea: { widthFraction: 0.45, top: 48 },
  deadzone: 0.12,
  outline: 2,
  crosshair: { radius: 3, outline: 3, stroke: 1 },
} as const;
