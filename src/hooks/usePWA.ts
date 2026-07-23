import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

export function usePWA() {
  const [installPromptEvent, setInstallPromptEvent] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState<boolean>(false);
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError(error) { console.warn('[PWA] SW register error', error); },
  });

  useEffect(() => {
    const handler = (e: any) => { e.preventDefault(); setInstallPromptEvent(e); };
    const installedHandler = () => setIsInstalled(true);
    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', installedHandler);
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    const mm = window.matchMedia('(display-mode: standalone)');
    if (mm.matches) setIsInstalled(true);
    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', installedHandler);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  const promptInstall = async () => {
    if (!installPromptEvent) return false;
    installPromptEvent.prompt();
    const result = await installPromptEvent.userChoice;
    setInstallPromptEvent(null);
    return result?.outcome === 'accepted';
  };

  const applyUpdate = () => {
    updateServiceWorker(true);
    setNeedRefresh(false);
  };

  return { isOnline, isInstalled, canInstall: !!installPromptEvent, promptInstall, needRefresh, applyUpdate };
}
