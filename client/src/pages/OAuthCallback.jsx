import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { setToken } from '../api/fetcher.js';

// Server /auth/callback#token=<jwt> ga redirect qiladi. Fragment'dagi tokenni
// saqlab olamiz — keyin barcha so'rovlar Authorization: Bearer bilan ketadi.
function captureTokenFromHash() {
  const hash = window.location.hash?.startsWith('#') ? window.location.hash.slice(1) : '';
  if (!hash) return;
  const token = new URLSearchParams(hash).get('token');
  if (token) {
    setToken(token);
    // Tokenni URL'dan olib tashlaymiz (tarix/ulashishda ko'rinmasligi uchun).
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }
}

export default function OAuthCallback() {
  const { t } = useTranslation();
  const { refresh } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  useEffect(() => {
    let mounted = true;
    captureTokenFromHash();
    refresh().then((profile) => {
      if (!mounted) return;
      if (profile) {
        navigate(profile.kind === 'staff' ? '/staff' : '/', { replace: true });
      } else {
        toast.error(t('auth.oauthFailed'));
        navigate('/login', { replace: true });
      }
    });
    return () => { mounted = false; };
  }, [refresh, navigate, toast, t]);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-4 bg-[#f8f6fc] text-primary">
      <Loader2 size={36} className="animate-spin" />
      <p className="font-bold">{t('auth.oauthLoading')}</p>
    </main>
  );
}
