import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Chrome, Gamepad2, Github, ShieldCheck, Trophy, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useGet } from '../api/hooks.js';
import { useToast } from '../context/ToastContext.jsx';
import { LangSwitcher } from '../components/ui.jsx';
import { Logo } from '../layouts/Logo.jsx';
import { api } from '../api/api.js';

const PROVIDERS = [
  { id: 'google', label: 'Google', icon: Chrome },
  { id: 'github', label: 'GitHub', icon: Github },
];

export default function Login() {
  const { t } = useTranslation();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [loadingProvider, setLoadingProvider] = useState('');
  const { data: providers } = useGet('/auth/providers', { dedupingInterval: 60_000, shouldRetryOnError: false });

  useEffect(() => {
    const error = searchParams.get('auth_error');
    if (!error) return;
    const messageKey = error === 'account_disabled' ? 'auth.accountDisabled' : 'auth.oauthFailed';
    toast.error(t(messageKey));
    searchParams.delete('auth_error');
    setSearchParams(searchParams, { replace: true });
  }, [searchParams, setSearchParams, t, toast]);

  const startOAuth = (provider) => {
    setLoadingProvider(provider);
    const base = String(api || '').replace(/\/+$/, '');
    window.location.assign(`${base}/api/auth/oauth/${provider}`);
  };

  const features = [
    { icon: Gamepad2, title: t('home.gamesTitle'), desc: t('home.heroSub') },
    { icon: Trophy, title: t('lb.title'), desc: t('lb.top') },
    { icon: Users, title: t('friends.title'), desc: t('friends.inviteHint') },
  ];

  return (
    <div
      className="min-h-screen flex flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,600px)] relative overflow-hidden"
      style={{ background: 'linear-gradient(135deg,#2a0a63 0%,#4c1d95 48%,#5b21b6 100%)' }}
    >
      <div aria-hidden="true" className="pointer-events-none absolute -top-32 -left-24 w-[460px] h-[460px] rounded-full opacity-25 blur-3xl" style={{ background: '#fdc700' }} />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-40 right-[-10%] w-[520px] h-[520px] rounded-full opacity-20 blur-3xl" style={{ background: '#7c3aed' }} />

      <aside className="hidden lg:flex flex-col justify-between px-14 py-12 relative z-10">
        <div className="flex items-center gap-3">
          <Logo size={46} />
          <div>
            <div className="text-white text-xl font-extrabold tracking-tight leading-none">XOLT Games</div>
            <div className="text-white/50 text-[12px] font-semibold mt-1">{t('home.heroSub')}</div>
          </div>
        </div>

        <div className="max-w-[520px]">
          <h2 className="text-white text-[40px] leading-[1.1] font-extrabold tracking-tight">{t('auth.publicTitle')}</h2>
          <p className="text-white/60 text-[15px] mt-3 leading-relaxed">{t('auth.publicDescription')}</p>
          <div className="mt-9 space-y-3">
            {features.map((feature) => (
              <div key={feature.title} className="flex items-start gap-3.5 rounded-2xl border border-white/10 bg-white/8 px-4 py-3.5 backdrop-blur-sm">
                <div className="w-10 h-10 rounded-xl bg-[#fdc700] text-[#472692] flex items-center justify-center shrink-0"><feature.icon size={18} /></div>
                <div className="min-w-0">
                  <div className="text-white font-bold text-[14px]">{feature.title}</div>
                  <div className="text-white/55 text-[12.5px] truncate">{feature.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-white/35 text-[12px] font-semibold">© XOLT Games</span>
          <LangSwitcher dark />
        </div>
      </aside>

      <main className="flex-1 flex items-center justify-center px-4 py-8 sm:px-8 relative z-10">
        <div className="w-full max-w-[460px]">
          <div className="flex items-center justify-between mb-6 lg:hidden">
            <div className="flex items-center gap-2.5"><Logo size={38} /><span className="text-white text-lg font-extrabold tracking-tight">XOLT Games</span></div>
            <div className="rounded-xl bg-white/10 p-1 backdrop-blur"><LangSwitcher dark compact /></div>
          </div>

          <div className="rounded-3xl border border-white/15 bg-white/10 backdrop-blur-xl p-7 sm:p-8 shadow-[0_24px_60px_rgba(20,6,50,0.4)]">
            <div className="w-14 h-14 rounded-2xl bg-[#fdc700] text-[#472692] flex items-center justify-center mb-5 shadow-lg shadow-yellow-400/20"><Gamepad2 size={26} /></div>
            <h1 className="text-[28px] font-extrabold text-white tracking-tight">{t('auth.welcome')}</h1>
            <p className="text-white/60 mt-2 font-medium text-[14px] leading-relaxed">{t('auth.publicDescription')}</p>

            <div className="mt-7 space-y-3">
              {PROVIDERS.map(({ id, label, icon: Icon }) => {
                const configured = providers?.[id];
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => startOAuth(id)}
                    disabled={Boolean(loadingProvider) || configured === false}
                    className="w-full min-h-14 rounded-2xl bg-white text-[#24133f] hover:bg-yellow-50 font-extrabold text-[15px] transition-all hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 flex items-center justify-center gap-3 shadow-[0_10px_28px_rgba(20,6,50,0.22)]"
                  >
                    {loadingProvider === id ? <span className="animate-spin w-5 h-5 border-2 border-[#472692]/30 border-t-[#472692] rounded-full" /> : <Icon size={20} />}
                    {t('auth.continueWith', { provider: label })}
                  </button>
                );
              })}
            </div>

            {providers && !providers.github && !providers.google && (
              <div className="mt-4 rounded-xl border border-yellow-200/25 bg-yellow-300/10 px-3.5 py-3 text-[12px] leading-relaxed text-yellow-50">
                {t('auth.oauthSetupHint')}
              </div>
            )}

            <div className="mt-6 flex items-start gap-2.5 border-t border-white/12 pt-5 text-[12px] leading-relaxed text-white/50">
              <ShieldCheck size={17} className="shrink-0 mt-0.5 text-emerald-200" />
              <span>{t('auth.oauthPrivacy')}</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
