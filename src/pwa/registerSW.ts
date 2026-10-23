/// <reference types="vite-plugin-pwa/vanillajs" />
import { registerSW } from 'virtual:pwa-register';

// 注册失败不能阻止游戏启动；开发服务器不注册，避免缓存干扰热更新。
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  const prompt = document.querySelector<HTMLElement>('#pwa-update');
  const refresh = document.querySelector<HTMLButtonElement>('#pwa-refresh');
  const dismiss = document.querySelector<HTMLButtonElement>('#pwa-dismiss');
  const message = document.querySelector<HTMLElement>('#pwa-update-message');
  let requestedReload = false;
  let updateActivated = false;
  const showUpdate = () => {
    if (prompt) prompt.hidden = false;
  };
  const onActivatedUpdate = () => {
    if (updateActivated) return;
    updateActivated = true;
    if (requestedReload) window.location.reload();
    else showUpdate();
  };
  let controller = navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    const previous = controller;
    controller = navigator.serviceWorker.controller;
    // Workbox 在首次加载页面保留 isUpdate=false；原生事件覆盖该页后续的更新。
    if (previous && controller !== previous) onActivatedUpdate();
  });
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh: showUpdate,
    // 另一个标签页确认更新时，也不能刷新正在进行的一局。
    onNeedReload: onActivatedUpdate,
    onRegisteredSW(_url, registration) {
      const checkUpdate = () => {
        if (navigator.onLine && document.visibilityState === 'visible') {
          void registration?.update().catch(() => {
            // 离线或服务器暂时不可用时继续使用已缓存版本。
          });
        }
      };
      window.addEventListener('online', checkUpdate);
      document.addEventListener('visibilitychange', checkUpdate);
      window.setInterval(checkUpdate, 60 * 60 * 1000);
    },
    onRegisterError(error: unknown) {
      console.warn('离线缓存暂不可用', error);
    },
  });
  dismiss?.addEventListener('click', () => {
    if (prompt) prompt.hidden = true;
  });
  prompt?.addEventListener('keydown', (event) => event.stopPropagation());
  refresh?.addEventListener('click', () => {
    requestedReload = true;
    refresh.disabled = true;
    if (updateActivated) window.location.reload();
    else {
      void updateSW().catch(() => {
        requestedReload = false;
        refresh.disabled = false;
        if (message) message.textContent = '更新失败，请重试';
      });
    }
  });
}
