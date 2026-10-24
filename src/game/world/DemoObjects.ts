import type { GameObjects, Scene } from 'phaser';
import { COLORS, DEPTH } from '../../config';
import type { DemoSession } from '../systems/DemoSession';
import { textStyle } from '../ui/text';
import { GRAYBOX_BOUNDS as B } from './graybox';

/** 掉落一槽一对象；灰盒只用字母标识，正式拾取物视觉待画面方案。 */
export class DemoObjects {
  private readonly loot: GameObjects.Text[] = [];
  private readonly portal: GameObjects.Text;
  private revision = -1;
  constructor(
    scene: Scene,
    private readonly session: DemoSession,
  ) {
    for (let i = 0; i < session.loot.slots.length; i++)
      this.loot.push(
        scene.add
          .text(0, 0, '', textStyle(9, COLORS.accent))
          .setOrigin(0.5)
          .setDepth(DEPTH.floorDecals)
          .setVisible(false),
      );
    this.portal = scene.add
      .text(B.x + B.width / 2, B.y + B.height / 2, '[ ↑ E ]', textStyle(12, COLORS.accent))
      .setOrigin(0.5)
      .setDepth(DEPTH.floorDecals);
  }
  update(): void {
    const s = this.session;
    this.portal.setVisible(s.dungeon.room.kind === 'exit');
    if (this.revision === s.loot.revision) return;
    this.revision = s.loot.revision;
    for (let i = 0; i < this.loot.length; i++) {
      const slot = s.loot.slots[i]!,
        text = this.loot[i]!;
      text.setVisible(slot.active);
      if (slot.active)
        text
          .setPosition(slot.x, slot.y)
          .setText(
            slot.kind === 'coin' ? '$' : slot.kind === 'energy' ? 'E' : slot.kind === 'health' ? '+' : 'W',
          );
    }
  }
}
