import { ART, weaponTexture } from '../assets/demoArt';
import { WEAPON_ART } from '../../data/art';
import { MAP_ART, MAP_THEME_FRAMES } from '../../data/mapArt';
import type { GameObjects, Scene } from 'phaser';
import { COLORS, DEPTH } from '../../config';
import type { DemoSession } from '../systems/DemoSession';
import { textStyle } from '../ui/text';
import { GRAYBOX_BOUNDS as B } from './graybox';

/** 掉落一槽一图像；武器与补给共享槽位，缺图时才使用文字回退。 */
export class DemoObjects {
  private readonly weapons: GameObjects.Image[] = [];
  private readonly weaponArtAvailable: boolean;
  private readonly chest?: GameObjects.Image;
  private readonly exitArt?: GameObjects.Image;
  private readonly loot: GameObjects.Text[] = [];
  private revision = -1;
  constructor(
    scene: Scene,
    private readonly session: DemoSession,
  ) {
    this.weaponArtAvailable = scene.textures.exists(ART.weapons);
    for (let i = 0; i < session.loot.slots.length; i++)
      this.loot.push(
        scene.add
          .text(0, 0, '', textStyle(9, COLORS.accent))
          .setOrigin(0.5)
          .setDepth(DEPTH.floorDecals)
          .setVisible(false),
      );
    if (this.weaponArtAvailable || scene.textures.exists(MAP_ART.textures.hub)) {
      for (let i = 0; i < session.loot.slots.length; i++)
        this.weapons.push(
          scene.add
            .image(
              0,
              0,
              this.weaponArtAvailable ? ART.weapons : MAP_ART.textures.hub,
              this.weaponArtAvailable ? 'pistol_basic' : 'pickup_coin',
            )
            .setDepth(DEPTH.floorDecals + 1)
            .setVisible(false),
        );
    }
    if (scene.textures.exists(MAP_ART.textures.objects)) {
      this.chest = scene.add
        .image(B.x + B.width / 2, B.y + B.height / 2 - 15, MAP_ART.textures.objects, 'chest_open')
        .setDisplaySize(24, 25)
        .setDepth(DEPTH.floorDecals);
      this.exitArt = scene.add
        .image(
          B.x + B.width / 2,
          B.y + B.height / 2,
          MAP_ART.textures.crystals,
          MAP_THEME_FRAMES[session.arena.artTheme].crystal,
        )
        .setDisplaySize(28, 30)
        .setDepth(DEPTH.floorDecals);
    }
  }
  update(): void {
    const s = this.session;
    const exit = s.arena.anchor('exit'),
      chest = s.arena.anchor('chest');
    this.exitArt?.setPosition(exit.x, exit.y);
    const crystal = MAP_THEME_FRAMES[s.arena.artTheme].crystal;
    if (this.exitArt && this.exitArt.frame.name !== crystal) this.exitArt.setFrame(crystal);
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
      const supplyAvailable = !!weapon?.scene.textures.exists(MAP_ART.textures.hub);
      weapon?.setVisible(shown && (slot.kind === 'weapon' ? this.weaponArtAvailable : supplyAvailable));
      if (shown && slot.kind === 'weapon' && weapon && this.weaponArtAvailable)
        weapon
          .setPosition(slot.x, slot.y)
          .setTexture(weaponTexture(slot.weapon), slot.weapon)
          .setScale(WEAPON_ART[slot.weapon].scale);
      if (shown && slot.kind !== 'weapon' && supplyAvailable)
        weapon
          ?.setPosition(slot.x, slot.y)
          .setTexture(MAP_ART.textures.hub, `pickup_${slot.kind}`)
          .setDisplaySize(8, 8);
      text.setVisible(shown && (slot.kind === 'weapon' ? !this.weaponArtAvailable : !supplyAvailable));
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
