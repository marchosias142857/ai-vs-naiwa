import { uiIcon, type UiIcon } from '../assets/uiArt';

const icons: Readonly<Record<string, UiIcon>> = {
  '#start-run, #hub-door, #enter-dungeon': 'door',
  '#continue-run, #pause-resume': 'play',
  '#pause-menu, #demo-menu, #talent-close, #bestiary-close, #cancel-dungeon, #layout-cancel': 'back',
  '#hub-bestiary': 'book',
  '#hub-altar, #talent-balance, [data-choice], #talent-rewards > strong': 'talent',
  '#talent-buy': 'unlock',
  '#talent-reset, #layout-reset, #demo-restart, #pwa-refresh': 'reset',
  '#talent-reset-cancel, #pwa-dismiss': 'close',
  '#settings-language': 'language',
  '#settings-flashes': 'flash',
  '.settings-layout, .layout-tools summary': 'layout',
  '#demo-menu-panel summary': 'settings',
  '.demo-map-toggle': 'map',
  '#buy-supplies, .demo-status': 'coin',
  '#layout-save': 'check',
};
/** One-time decoration after each panel has assembled its semantic controls. */
export function decorateUi(root: ParentNode): void {
  for (const [selector, icon] of Object.entries(icons))
    for (const element of root.querySelectorAll<HTMLElement>(selector)) uiIcon(element, icon);
}
