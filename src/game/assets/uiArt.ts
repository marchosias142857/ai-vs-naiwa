import { Textures, type Scene } from 'phaser';

export const UI_ART = { icons: 'ui_icons_v1', controls: 'ui_controls_v1' } as const;
export const UI_ICONS = [
  'coin',
  'heart',
  'shield',
  'energy',
  'map',
  'book',
  'pause',
  'play',
  'settings',
  'sound',
  'mute',
  'language',
  'move',
  'aim',
  'skill',
  'swap',
  'interact',
  'door',
  'back',
  'reset',
  'check',
  'close',
  'unlock',
  'lock',
  'talent',
  'chest',
  'exit',
  'boss',
  'unknown',
  'compass',
  'count3',
  'count2',
  'count1',
  'water',
  'flash',
  'layout',
] as const;
export type UiIcon = (typeof UI_ICONS)[number];
export const UI_CONTROLS = [
  'moveBase',
  'moveKnob',
  'fireBase',
  'fireKnob',
  'pauseBase',
  'countdown',
] as const;
export type UiControl = (typeof UI_CONTROLS)[number];
export const uiAsset = (file: string): string => `${import.meta.env.BASE_URL}assets/ui/${file}`;

/** Shared fixed-cell raster atlas; DOM decoration never changes the accessible label. */
export function uiIcon(element: HTMLElement, icon: UiIcon): void {
  const index = UI_ICONS.indexOf(icon);
  element.dataset.uiIcon = icon;
  element.style.setProperty('--icon-x', `${(index % 6) * 20}%`);
  element.style.setProperty('--icon-y', `${Math.floor(index / 6) * 20}%`);
}
export function preloadUiArt(scene: Scene): void {
  scene.load.image(UI_ART.icons, uiAsset('icons-v1.png'));
  scene.load.image(UI_ART.controls, uiAsset('controls-v1.png'));
}
export function installUiArt(scene: Scene): void {
  for (const [key, names, cell, columns] of [
    [UI_ART.icons, UI_ICONS, 64, 6],
    [UI_ART.controls, UI_CONTROLS, 128, 3],
  ] as const) {
    const texture = scene.textures.get(key);
    texture.setFilter(Textures.FilterMode.NEAREST);
    names.forEach((name, index) => {
      if (!texture.has(name))
        texture.add(name, 0, (index % columns) * cell, Math.floor(index / columns) * cell, cell, cell);
    });
  }
}
