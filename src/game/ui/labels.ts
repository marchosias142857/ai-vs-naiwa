import { t } from '../../i18n/t';
import { WEAPONS, type WeaponId } from '../../data/weapons';
export function weaponLabel(id: WeaponId): string {
  return t('weapon.qualityLabel', { name: t(`weapon.${id}`), quality: t(`quality.${WEAPONS[id].rarity}`) });
}
