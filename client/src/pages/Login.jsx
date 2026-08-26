import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FaUserPlus, FaSignInAlt, FaEye, FaEyeSlash, FaLock, FaUser, FaAt, FaGamepad, FaTrophy, FaUsers } from 'react-icons/fa';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { errorMessage } from '../api/fetcher.js';
import { LangSwitcher, PhoneInput } from '../components/ui.jsx';
import { Logo } from '../layouts/Logo.jsx';
import { initAudio, sounds } from '../utils/sound.js';

// Barcha maydonlar bir xil: h-14, radius 16px, chap ikonka 16px, matn 48px dan
const inputCls =
  'w-full h-14 pl-12 pr-4 rounded-2xl bg-white/12 backdrop-blur-sm border border-white/25 text-white placeholder-white/45 outline-none transition-all duration-200 hover:border-white/40 focus:border-yellow-400 focus:ring-4 focus:ring-yellow-400/25';

export default function Login() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [mode, setMode] = useState('login');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const doLogin = async (p, pw) => {
    setLoading(true);
    try {
      initAudio();
      sounds.join();
      const profile = await login(p, pw);
      navigate(profile.kind === 'staff' ? '/staff' : '/');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = (e) => {
    e.preventDefault();
    if (!phone || !password) {
      toast.error(t('auth.fill_required'));
      return;
    }
    doLogin(phone, password);
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!fullName || !phone || !password) {
      toast.error(t('auth.fill_all_fields'));
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: fullName, phone, password, username: username || undefined }),
      });
      const data = await res.json();
      if (!data.success) {
        toast.error(data.error?.message || t('common.serverError'));
        return;
      }
      toast.success(t('auth.register_success'));
      sounds.join();
      localStorage.setItem('xolt_token', data.data.token);
      window.location.href = '/';
    } catch (err) {
      toast.error(t('errors.NETWORK'));
    } finally {
      setLoading(false);
    }
  };

  const switchMode = () => {
    setMode(mode === 'login' ? 'register' : 'login');
    setPhone('');
    setPassword('');
    setFullName('');
    setUsername('');
  };

  const DEMO = [
    { key: 'auth.demoStudent', phone: '+998900000001', password: '1234' },
    { key: 'auth.demoTeacher', phone: '+998901234569', password: 'teacher123' },
    { key: 'auth.demoCashier', phone: '+998901234568', password: 'cashier123' },
    { key: 'auth.demoAdmin', phone: '+998901234567', password: 'admin123' },
  ];

  const fillDemo = (d) => {
    setMode('login');
    setPhone(d.phone);
    setPassword(d.password);
    doLogin(d.phone, d.password);
  };

  const features = [
    { icon: FaGamepad, title: t('home.gamesTitle'), desc: t('home.heroSub') },
    { icon: FaTrophy, title: t('lb.title'), desc: t('lb.top') },
    { icon: FaUsers, title: t('staff.groups'), desc: t('staff.teacherDesc') },
  ];

  return (
    <div
      className="min-h-screen flex flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,600px)] relative overflow-hidden"
      style={{ background: 'linear-gradient(135deg,#2a0a63 0%,#4c1d95 48%,#5b21b6 100%)' }}
    >
      {/* Fon bezaklari */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-32 -left-24 w-[460px] h-[460px] rounded-full opacity-25 blur-3xl"
        style={{ background: '#fdc700' }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-40 right-[-10%] w-[520px] h-[520px] rounded-full opacity-20 blur-3xl"
        style={{ background: '#7c3aed' }}
      />

      {/* Chap panel — faqat desktop */}
      <aside className="hidden lg:flex flex-col justify-between px-14 py-12 relative z-10">
        <div className="flex items-center gap-3">
          <Logo size={46} />
          <div>
            <div className="text-white text-xl font-extrabold tracking-tight leading-none">XOLT Games</div>
            <div className="text-white/50 text-[12px] font-semibold mt-1">{t('home.heroTitle')}</div>
          </div>
        </div>

        <div className="max-w-[520px]">
          <h2 className="text-white text-[40px] leading-[1.1] font-extrabold tracking-tight">
            {t('home.heroTitle')}
          </h2>
          <p className="text-white/60 text-[15px] mt-3 leading-relaxed">{t('home.heroSub')}</p>

          <div className="mt-9 space-y-3">
            {features.map((f) => (
              <div key={f.title} className="flex items-start gap-3.5 rounded-2xl border border-white/10 bg-white/8 px-4 py-3.5 backdrop-blur-sm">
                <div className="w-10 h-10 rounded-xl bg-[#fdc700] text-[#472692] flex items-center justify-center shrink-0">
                  <f.icon size={18} />
                </div>
                <div className="min-w-0">
                  <div className="text-white font-bold text-[14px]">{f.title}</div>
                  <div className="text-white/55 text-[12.5px] truncate">{f.desc}</div>
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

      {/* Forma paneli */}
      <main className="flex-1 flex items-center justify-center px-4 py-8 sm:px-8 relative z-10">
        <div className="w-full max-w-[460px]">
          {/* Mobil logotip + til */}
          <div className="flex items-center justify-between mb-6 lg:hidden">
            <div className="flex items-center gap-2.5">
              <Logo size={38} />
              <span className="text-white text-lg font-extrabold tracking-tight">XOLT Games</span>
            </div>
            <div className="rounded-xl bg-white/10 p-1 backdrop-blur">
              <LangSwitcher dark compact />
            </div>
          </div>

          <div className="rounded-3xl border border-white/15 bg-white/10 backdrop-blur-xl p-7 sm:p-8 shadow-[0_24px_60px_rgba(20,6,50,0.4)]">
            <div className="mb-6">
              <h1 className="text-[28px] font-extrabold text-white tracking-tight">
                {mode === 'login' ? t('auth.welcome') : t('auth.new_player')}
              </h1>
              <p className="text-white/55 mt-1.5 font-medium text-[13.5px]">
                {mode === 'login' ? t('auth.des') : t('auth.fill_all_fields')}
              </p>
            </div>

            <form onSubmit={mode === 'login' ? handleLogin : handleRegister} className="space-y-3.5">
              {mode === 'register' && (
                <>
                  <div className="relative">
                    <FaUser className="absolute left-4 top-1/2 -translate-y-1/2 text-white/55" />
                    <input
                      type="text"
                      placeholder={t('auth.full_name')}
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className={inputCls}
                    />
                  </div>
                  <div className="relative">
                    <FaAt className="absolute left-4 top-1/2 -translate-y-1/2 text-white/55" />
                    <input
                      type="text"
                      placeholder={t('profile.username')}
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className={inputCls}
                    />
                  </div>
                </>
              )}

              {/* Telefon — boshqa maydonlar bilan bir xil o'lcham va chekkalar */}
              <PhoneInput
                value={phone}
                onChange={setPhone}
                dark
                staticCountry
                inputProps={{ autoComplete: 'tel', placeholder: '+998 __ ___ __ __' }}
              />

              <div className="relative">
                <FaLock className="absolute left-4 top-1/2 -translate-y-1/2 text-white/55" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder={t('auth.password')}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`${inputCls} pr-12`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-white/55 hover:text-yellow-400 transition-colors"
                  aria-label={t('auth.password')}
                >
                  {showPassword ? <FaEyeSlash size={19} /> : <FaEye size={19} />}
                </button>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full h-14 rounded-2xl bg-gradient-to-r from-yellow-400 to-orange-500 hover:from-yellow-300 hover:to-orange-400 text-[#3b1185] font-extrabold text-[16px] transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60 disabled:hover:translate-y-0 flex items-center justify-center gap-2 shadow-[0_10px_28px_rgba(250,204,21,0.28)]"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    {t('common.loading')}
                  </span>
                ) : mode === 'login' ? (
                  <>
                    <FaSignInAlt /> {t('auth.loginBtn')}
                  </>
                ) : (
                  <>
                    <FaUserPlus /> {t('auth.register_btn')}
                  </>
                )}
              </button>
            </form>

            <div className="mt-5 text-center">
              <button
                type="button"
                onClick={switchMode}
                className="text-white/65 hover:text-yellow-400 font-semibold text-[13.5px] transition-colors duration-200 underline-offset-4 hover:underline"
              >
                {mode === 'login' ? t('auth.no_acc') : t('auth.has_acc')}
              </button>
            </div>

            {/* Demo hisoblar */}
            <div className="mt-6 pt-5 border-t border-white/12">
              <div className="text-[11px] font-bold uppercase tracking-wider text-white/45 text-center mb-3">
                {t('auth.demoAccounts')}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {DEMO.map((d) => (
                  <button
                    key={d.key}
                    type="button"
                    onClick={() => fillDemo(d)}
                    disabled={loading}
                    className="h-11 px-3 rounded-xl bg-white/10 hover:bg-white/18 border border-white/12 text-white text-[13px] font-bold transition-all duration-200 active:scale-[0.97] disabled:opacity-50"
                  >
                    {t(d.key)}
                  </button>
                ))}
              </div>
              <div className="text-[11px] text-white/40 text-center mt-3">{t('auth.demoHint')}</div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
