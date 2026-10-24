import { t } from '../../i18n/t';
import type { WeaponId } from '../../data/weapons';
export function weaponLabel(id: WeaponId): string {
  return t(`weapon.${id}`);
}
