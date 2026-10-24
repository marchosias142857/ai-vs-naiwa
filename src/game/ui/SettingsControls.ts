import { unlockSound, silenceSound } from '../../services/Sound';
import { t } from '../../i18n/t';
import { settings, setSettings } from '../../services/settings';
/** 与主菜单共用按钮导航，不新增独立输入监听。 */
export function addSettings(root: HTMLElement, signal: AbortSignal, refreshLanguage: () => void): void {
  const sound = document.createElement('button'),
    flashes = document.createElement('button'),
    language = document.createElement('button');
  sound.id = 'settings-sound';
  flashes.id = 'settings-flashes';
  language.id = 'settings-language';
  const refresh = () => {
    sound.textContent = t('settings.sound', { value: t(settings.sound ? 'settings.on' : 'settings.off') });
    flashes.textContent = t('settings.flash', {
      value: t(settings.flashes ? 'settings.on' : 'settings.off'),
    });
    language.textContent = t('settings.language');
  };
  sound.addEventListener(
    'click',
    () => {
      setSettings({ sound: !settings.sound });
      if (settings.sound) unlockSound();
      else silenceSound();
      refresh();
    },
    { signal },
  );
  flashes.addEventListener(
    'click',
    () => {
      setSettings({ flashes: !settings.flashes });
      refresh();
    },
    { signal },
  );
  language.addEventListener(
    'click',
    () => {
      setSettings({ language: settings.language === 'en' ? 'zh-CN' : 'en' });
      refreshLanguage();
    },
    { signal },
  );
  refresh();
  root.append(sound, flashes, language);
}
