import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FaUserPlus, FaSignInAlt, FaEye, FaEyeSlash, FaLock, FaUser, FaAt } from 'react-icons/fa';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { errorMessage } from '../api/fetcher.js';
import { LangSwitcher } from '../components/ui.jsx';
import { initAudio, sounds } from '../utils/sound.js';

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

  const inputCls =
    'w-full h-14 pl-12 pr-4 rounded-2xl bg-white/20 backdrop-blur-sm border border-white/30 text-white placeholder-indigo-200 outline-none focus:border-yellow-400 transition-all duration-300 focus:ring-2 focus:ring-yellow-400/50';

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-800 to-indigo-900 flex items-center justify-center px-4 relative overflow-hidden">
      <div className="absolute top-4 right-4 z-20">
        <div className="bg-white/10 backdrop-blur rounded-xl p-1">
          <LangSwitcher dark compact />
        </div>
      </div>
      <div className="w-full max-w-md relative z-10 animate-[fadeIn_.4s_ease]">
        <div className="bg-white/10 backdrop-blur-lg rounded-3xl shadow-2xl p-8 border border-white/20">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-black text-white drop-shadow-lg tracking-tight">
              {mode === 'login' ? t('auth.welcome') : t('auth.new_player')}
            </h1>
            <p className="text-indigo-200 mt-2 font-medium">
              {mode === 'login' ? t('auth.des') : ''}
            </p>
          </div>

          <form onSubmit={mode === 'login' ? handleLogin : handleRegister} className="space-y-5">
            {mode === 'register' && (
              <>
                <div className="relative">
                  <FaUser className="absolute left-4 top-1/2 -translate-y-1/2 text-indigo-300" />
                  <input
                    type="text"
                    placeholder={t('auth.full_name')}
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div className="relative">
                  <FaAt className="absolute left-4 top-1/2 -translate-y-1/2 text-indigo-300" />
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

            <div className="relative">
              <FaUser className="absolute left-4 top-1/2 -translate-y-1/2 text-indigo-300" />
              <input
                type="tel"
                placeholder="+998 90 123 45 55"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className={inputCls}
                inputMode="tel"
              />
            </div>

            <div className="relative">
              <FaLock className="absolute left-4 top-1/2 -translate-y-1/2 text-indigo-300" />
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
                className="absolute right-4 top-1/2 -translate-y-1/2 text-indigo-300 hover:text-yellow-400 transition-colors"
              >
                {showPassword ? <FaEyeSlash size={20} /> : <FaEye size={20} />}
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-14 rounded-2xl bg-gradient-to-r from-yellow-400 to-orange-500 hover:from-yellow-500 hover:to-orange-600 text-gray-900 font-bold text-lg transition-all duration-300 transform hover:scale-[1.02] disabled:opacity-60 disabled:hover:scale-100 flex items-center justify-center gap-2 shadow-lg shadow-yellow-500/30"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-5 w-5 text-gray-900" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
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

          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={switchMode}
              className="text-indigo-200 hover:text-yellow-400 font-medium transition-colors duration-300 underline-offset-2 hover:underline"
            >
              {mode === 'login' ? t('auth.no_acc') : t('auth.has_acc')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
