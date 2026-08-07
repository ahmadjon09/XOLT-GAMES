import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Home, Store, Trophy, User, LayoutDashboard, Users, CalendarCheck2, ListChecks,
  Wallet, LogOut, Wifi, WifiOff, Zap, Keyboard, Code2, ChevronLeft,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useSocket } from '../context/SocketContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { CoinBadge, ConfirmDialog } from '../components/ui.jsx';
import { Logo } from './Logo.jsx';
import { cx } from '../utils/format.js';

// ---------- TopBar ----------
export function TopBar({ title, right, back }) {
  const navigate = useNavigate();
  return (
    <div className="topbar">
      <div className="topbar-inner">
        {back && (
          <button onClick={() => navigate(-1)} className="btn ghost sm p-1.5">
            <ChevronLeft size={20} />
          </button>
        )}
        <div className="flex-1 min-w-0">
          <div className="font-extrabold text-[17px] truncate">{title}</div>
        </div>
        {right && <div className="flex items-center gap-1.5">{right}</div>}
      </div>
    </div>
  );
}

// ---------- BottomNav ----------
export function BottomNav({ items }) {
  return (
    <div className="bottomnav">
      <div className="bottomnav-inner">
        {items.map((it) => (
          <NavLink key={it.to} to={it.to} end={it.end}>
            {({ isActive }) => (
              <button className={isActive ? 'active' : ''} aria-current={isActive ? 'page' : undefined}>
                <span className="nav-ico">
                  <it.icon size={21} strokeWidth={isActive ? 2.5 : 2} />
                </span>
                {it.label}
                <span className="nav-dot" />
              </button>
            )}
          </NavLink>
        ))}
      </div>
    </div>
  );
}

// ---------- SidebarLang ----------
function SidebarLang() {
  const { i18n } = useTranslation();
  const langs = [
    { code: 'uz', label: "O'z" },
    { code: 'ru', label: 'Рус' },
    { code: 'en', label: 'En' },
  ];
  return (
    <div className="flex rounded-xl bg-black/20 p-1">
      {langs.map((l) => (
        <button
          key={l.code}
          onClick={() => i18n.changeLanguage(l.code)}
          className={cx(
            'flex-1 rounded-lg px-3 py-1.5 text-xs font-bold transition',
            i18n.language === l.code ? 'bg-[#fdc700] text-[#472692]' : 'text-white/70 hover:text-white'
          )}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}

// ---------- Sidebar (single definition) ----------
function Sidebar({ items, title, sub, footer }) {
  const { t } = useTranslation();
  const { connected } = useSocket();
  return (
    <aside className="hidden lg:flex fixed inset-y-0 left-0 w-64 z-40 flex-col">
      <div className="flex h-full w-full flex-col" style={{ background: 'linear-gradient(180deg,#641ca8 0%,#472692 60%,#3b2180 100%)' }}>
        <div className="flex items-center gap-3 px-6 pt-7 pb-5">
          <div className="relative">
            <Logo size={40} />
            <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#fdc700] text-[9px] font-black text-[#472692]">
              <Zap size={9} strokeWidth={3} />
            </span>
          </div>
          <div>
            <div className="text-lg font-extrabold leading-tight tracking-tight text-white">{title}</div>
            <div className="text-[11px] font-semibold text-white/60">{sub}</div>
          </div>
        </div>

        <nav className="mt-2 flex-1 space-y-1 overflow-y-auto px-3 pb-4">
          {items.map((it) => (
            <NavLink key={it.to} to={it.to} end={it.end}>
              {({ isActive }) => (
                <span
                  className={cx(
                    'group flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all',
                    isActive ? 'bg-white/15 text-white shadow-inner' : 'text-white/65 hover:bg-white/10 hover:text-white'
                  )}
                >
                  <it.icon
                    size={19}
                    strokeWidth={isActive ? 2.5 : 2}
                    className={isActive ? 'text-[#fdc700]' : 'text-white/60 group-hover:text-[#fdc700] transition-colors'}
                  />
                  {it.label}
                  {isActive && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[#fdc700]" />}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="space-y-3 px-5 pb-6">
          {footer}
          <div className="flex items-center justify-between rounded-2xl bg-black/15 px-4 py-3">
            <span className="flex items-center gap-2 text-xs font-bold text-white/70">
              {connected ? <Wifi size={14} className="text-emerald-300" /> : <WifiOff size={14} className="text-red-300" />}
            </span>
            <SidebarLang />
          </div>
        </div>
      </div>
    </aside>
  );
}

// ---------- StudentLayout ----------
export function StudentLayout() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const { connected } = useSocket();
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const [logoutOpen, setLogoutOpen] = useState(false);
  const hideTopbar = location.pathname === '/leaderboard';

  const navItems = [
    { to: '/', end: true, icon: Home, label: t('nav.home') },
    { to: '/shop', icon: Store, label: t('nav.shop') },
    { to: '/leaderboard', icon: Trophy, label: t('nav.leaderboard') },
    { to: '/profile', icon: User, label: t('nav.profile') },
  ];

  const handleLogout = () => {
    logout();
    toast.success(t('common.done'));
    navigate('/login');
  };

  return (
    <>
      {!hideTopbar && (
        <div className="topbar lg:hidden">
          <div className="topbar-inner">
            <Link to="/" className="flex items-center gap-2">
              <Logo size={30} />
              <span className="brand">{t('common.appName')}</span>
            </Link>
            <div className="flex-1" />
            {connected ? <Wifi size={15} className="text-success" /> : <WifiOff size={15} className="text-danger" />}
            <CoinBadge value={user?.coin ?? 0} />
            <button
              onClick={() => setLogoutOpen(true)}
              className="ml-1 p-1.5 rounded-lg hover:bg-black/5 transition-colors"
              aria-label={t('nav.logout')}
            >
              <LogOut size={18} className="text-muted" />
            </button>
          </div>
        </div>
      )}

      <Sidebar
        title="XOLT Games"
        sub={t('home.heroSub')}
        items={navItems}
        footer={
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/10 px-4 py-3 backdrop-blur">
              <span className="text-xs font-bold text-white/70">{t('home.myCoins')}</span>
              <CoinBadge value={user?.coin ?? 0} />
            </div>
            <button
              onClick={() => setLogoutOpen(true)}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-white/10 py-2.5 text-xs font-bold text-white/80 transition hover:bg-white/20 hover:text-white"
            >
              <LogOut size={14} /> {t('nav.logout')}
            </button>
          </div>
        }
      />

      <main className="lg:ml-64">
        <Outlet />
      </main>

      <div className="lg:hidden">
        <BottomNav items={navItems} />
      </div>

      <ConfirmDialog
        open={logoutOpen}
        title={t('auth.logoutConfirm')}
        onClose={() => setLogoutOpen(false)}
        onConfirm={handleLogout}
        confirmText={t('common.yesSure')}
      />
    </>
  );
}

// ---------- StaffLayout ----------
export function StaffLayout() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [logoutOpen, setLogoutOpen] = useState(false);

  const role = user?.role;
  const menu = [
    { to: '/staff', end: true, icon: LayoutDashboard, label: t('staff.dashboard'), roles: ['ADMIN', 'TEACHER', 'CASHIER'] },
    { to: '/staff/groups', icon: Users, label: t('staff.groups'), roles: ['ADMIN', 'TEACHER'] },
    { to: '/staff/attendance', icon: CalendarCheck2, label: t('staff.attendance'), roles: ['ADMIN', 'TEACHER'] },
    { to: '/staff/quizzes', icon: ListChecks, label: t('staff.quizzes'), roles: ['ADMIN', 'TEACHER'] },
    { to: '/staff/payments', icon: Wallet, label: t('staff.payments'), roles: ['ADMIN', 'CASHIER'] },
    { to: '/staff/users', icon: Users, label: t('staff.users'), roles: ['ADMIN', 'CASHIER', 'TEACHER'] },
    { to: '/staff/staff', icon: User, label: t('staff.staff'), roles: ['ADMIN'] },
    { to: '/staff/shop', icon: Store, label: t('staff.shop'), roles: ['ADMIN'] },
    { to: '/staff/typing-texts', icon: Keyboard, label: t('typing.manageTexts'), roles: ['ADMIN', 'TEACHER'] },
    { to: '/staff/code-questions', icon: Code2, label: t('code.manageQuestions'), roles: ['ADMIN', 'TEACHER'] },
    { to: '/staff/stats', icon: Trophy, label: t('staff.stats'), roles: ['ADMIN'] },
  ].filter((m) => m.roles.includes(role));

  const roleLabel = {
    TEACHER: t('staff.roleTeacher'),
    CASHIER: t('staff.roleCashier'),
    ADMIN: t('staff.roleAdmin'),
  }[role];

  return (
    <>
      <div className="topbar lg:hidden">
        <div className="topbar-inner">
          <Logo size={30} />
          <div className="flex-1 min-w-0">
            <div className="font-extrabold text-[15px] truncate">{user?.full_name}</div>
            <div className="text-[11.5px] font-bold text-primary">{roleLabel}</div>
          </div>
          <button className="btn ghost sm" onClick={() => setLogoutOpen(true)} title={t('nav.logout')}>
            <LogOut size={17} />
          </button>
        </div>
      </div>

      <div className="lg:hidden sticky top-[55px] z-[35] bg-[#f6f4fb] px-3 py-2 border-b border-border">
        <div className="segment scroll max-w-[760px] mx-auto">
          {menu.map((m) => (
            <NavLink key={m.to} to={m.to} end={m.end}>
              {({ isActive }) => (
                <button className={isActive ? 'active' : ''}>
                  <m.icon size={15} />
                  {m.label}
                </button>
              )}
            </NavLink>
          ))}
        </div>
      </div>

      <Sidebar
        title="XOLT"
        sub={roleLabel}
        items={menu}
        footer={
          <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#fdc700] text-base font-black text-[#472692]">
                {user?.full_name?.slice(0, 1) || 'X'}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold text-white">{user?.full_name}</div>
                <div className="text-[11px] font-semibold text-white/60">{roleLabel}</div>
              </div>
            </div>
            <button
              onClick={() => setLogoutOpen(true)}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-white/10 py-2 text-xs font-bold text-white/80 transition hover:bg-white/20 hover:text-white"
            >
              <LogOut size={14} /> {t('nav.logout')}
            </button>
          </div>
        }
      />

      <main className="lg:ml-64">
        <Outlet />
      </main>

      <ConfirmDialog
        open={logoutOpen}
        title={t('auth.logoutConfirm')}
        onClose={() => setLogoutOpen(false)}
        onConfirm={() => {
          logout();
          toast.success(t('common.done'));
          navigate('/login');
        }}
        confirmText={t('common.yesSure')}
      />
    </>
  );
}