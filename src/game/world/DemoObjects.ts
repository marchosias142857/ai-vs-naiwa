import { ART, weaponTexture } from '../assets/demoArt';
import { WEAPON_ART } from '../../data/art';
import type { GameObjects, Scene } from 'phaser';
import { t } from '../../i18n/t';
import { COLORS, DEPTH } from '../../config';
import type { DemoSession } from '../systems/DemoSession';
import { textStyle } from '../ui/text';
import { GRAYBOX_BOUNDS as B } from './graybox';

/** 掉落一槽一对象；武器用独立图集，小型补给用高对比符号。 */
export class DemoObjects {
  private readonly weapons: GameObjects.Image[] = [];
  private readonly chest?: GameObjects.Image;
  private readonly exitArt?: GameObjects.Image;
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
    if (scene.textures.exists(ART.weapons)) {
      for (let i = 0; i < session.loot.slots.length; i++)
        this.weapons.push(
          scene.add
            .image(0, 0, ART.weapons, 'pistol_basic')
            .setDepth(DEPTH.floorDecals + 1)
            .setVisible(false),
        );
      this.chest = scene.add
        .image(B.x + B.width / 2, B.y + B.height / 2 - 15, ART.environment, 'chest_open')
        .setDisplaySize(24, 25)
        .setDepth(DEPTH.floorDecals);
      this.exitArt = scene.add
        .image(B.x + B.width / 2, B.y + B.height / 2, ART.environment, 'crystal')
        .setDisplaySize(28, 30)
        .setDepth(DEPTH.floorDecals);
    }
    this.portal = scene.add
      .text(B.x + B.width / 2, B.y + B.height / 2, t('hint.portal'), textStyle(12, COLORS.accent))
      .setOrigin(0.5)
      .setDepth(DEPTH.floorDecals);
  }
  update(): void {
    const s = this.session;
    this.portal.setVisible(s.dungeon.room.kind === 'exit');
    const exit = s.arena.anchor('exit'),
      chest = s.arena.anchor('chest');
    this.portal.setPosition(exit.x, exit.y + 22);
    this.exitArt?.setPosition(exit.x, exit.y);
    this.chest?.setPosition(chest.x, chest.y - 15);
    this.chest?.setVisible(s.dungeon.room.kind === 'chest');
    this.exitArt?.setVisible(s.dungeon.room.kind === 'exit');
    if (this.revision === s.loot.revision) return;
    this.revision = s.loot.revision;
    for (let i = 0; i < this.loot.length; i++) {
      const slot = s.loot.slots[i]!,
        text = this.loot[i]!;
      const shown = slot.active && slot.room === s.loot.room,
        weapon = this.weapons[i];
      weapon?.setVisible(shown && slot.kind === 'weapon');
      if (shown && slot.kind === 'weapon' && weapon)
        weapon
          .setPosition(slot.x, slot.y)
          .setTexture(weaponTexture(slot.weapon), slot.weapon)
          .setScale(WEAPON_ART[slot.weapon].scale);
      text.setVisible(shown && (slot.kind !== 'weapon' || !weapon));
      text.setColor(slot.kind === 'coin' ? '#edce84' : slot.kind === 'health' ? '#ff8d9d' : '#91f3e7');
      if (slot.active)
        text
          .setPosition(slot.x, slot.y)
          .setText(
            slot.kind === 'coin' ? '◆' : slot.kind === 'energy' ? '✦' : slot.kind === 'health' ? '♥' : 'W',
          );
    }
  }
}
