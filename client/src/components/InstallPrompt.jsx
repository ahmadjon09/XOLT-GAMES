// PWA o'rnatish qo'ng'irovi — ilova ornatilmagan bo'lsa ekranning chekasida
// kichik modal chiqadi ("O'rnatib oling"). Chrome/Edge: beforeinstallprompt
// orqali haqiqiy o'rnatish; iOS Safari: "Bosh sahifaga qo'shish" yo'riqnomasi.
import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, X, Share2 } from 'lucide-react';

const DISMISSED_KEY = 'xolt_pwa_dismissed';
const INSTALLED_KEY = 'xolt_pwa_installed';

export default function InstallPrompt() {
  const { t } = useTranslation();
  const [deferred, setDeferred] = useState(null);
  const [visible, setVisible] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    const isInstalled =
      localStorage.getItem(INSTALLED_KEY) === '1' ||
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true;
    if (isInstalled || localStorage.getItem(DISMISSED_KEY) === '1') return;

    const onBeforeInstall = (e) => {
      e.preventDefault();
      setDeferred(e);
      setIsIos(false);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setVisible(true), 2500);
    };
    const onInstalled = () => {
      localStorage.setItem(INSTALLED_KEY, '1');
      setDeferred(null);
      setVisible(false);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);

    // iOS Safari beforeinstallprompt yubormaydi — Share → "Add to Home Screen"
    const ios = /iphone|ipad|ipod/i.test(window.navigator.userAgent);
    if (ios) {
      setIsIos(true);
      if (!timerRef.current) timerRef.current = setTimeout(() => setVisible(true), 4500);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const dismiss = () => {
    setVisible(false);
    localStorage.setItem(DISMISSED_KEY, '1');
  };

  const doInstall = async () => {
    if (!deferred) return;
    deferred.prompt();
    try {
      const { outcome } = await deferred.userChoice;
      if (outcome === 'accepted') localStorage.setItem(INSTALLED_KEY, '1');
    } catch (e) { /* foydalanuvchi tanlov berdi */ }
    setDeferred(null);
    setVisible(false);
    localStorage.setItem(DISMISSED_KEY, '1');
  };

  const shareIos = () => {
    if (navigator.share) {
      navigator
        .share({ title: document.title, url: window.location.href })
        .catch(() => { });
    }
  };

  if (!visible) return null;

  return (
    <div className="install-banner" role="dialog" aria-label={t('install.title')}>
      <button onClick={dismiss} className="install-close" aria-label={t('common.close')}>
        <X size={14} />
      </button>
      <img src="/icons/icon-192.png" alt="" className="install-ico" />
      <div className="install-text min-w-0">
        <div className="install-title">{isIos ? t('install.iosTitle') : t('install.title')}</div>
        <div className="install-desc">{isIos ? t('install.iosDesc') : t('install.desc')}</div>
      </div>
      {isIos ? (
        <button className="install-btn ios" onClick={shareIos} aria-label={t('install.iosTitle')}>
          <Share2 size={16} />
        </button>
      ) : (
        <button className="install-btn" onClick={doInstall}>
          <Download size={16} /> {t('install.button')}
        </button>
      )}
    </div>
  );
}
