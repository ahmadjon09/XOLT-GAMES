import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Home, Store, Trophy, User, LayoutDashboard, Users, CalendarCheck2, ListChecks,
  Wallet, LogOut, Wifi, WifiOff, Zap, Keyboard, Code2, ChevronLeft, Swords, UserRound,
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
          <button onClick={() => navigate(-1)} className="btn ico ghost" aria-label="back">
            <ChevronLeft size={20} />
          </button>
        )}
        <div className="flex-1 min-w-0">
          <div className="font-extrabold text-[17px] truncate tracking-tight">{title}</div>
        </div>
        {right && <div className="flex items-center gap-2 shrink-0">{right}</div>}
      </div>
    </div>
  );
}

// ---------- BottomNav (markazlashgan suzuvchi panel) ----------
export function BottomNav({ items }) {
  return (
    <nav className="bottomnav" aria-label="navigation">
      <div className="bottomnav-inner">
        {items.map((it) => (
          <NavLink key={it.to} to={it.to} end={it.end}>
            {({ isActive }) => (
              <button className={isActive ? 'active' : ''} aria-current={isActive ? 'page' : undefined}>
                <span className="nav-ico">
                  <it.icon size={20} strokeWidth={isActive ? 2.5 : 2} />
                </span>
                <span className="truncate max-w-full px-1">{it.label}</span>
                <span className="nav-dot" />
              </button>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
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
    <div className="flex rounded-xl bg-black/25 p-1">
      {langs.map((l) => (
        <button
          key={l.code}
          onClick={() => i18n.changeLanguage(l.code)}
          className={cx(
            'flex-1 rounded-lg px-3 py-1.5 text-xs font-bold transition-all',
            i18n.language === l.code ? 'bg-[#fdc700] text-[#472692]' : 'text-white/70 hover:text-white'
          )}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}

// ---------- Sidebar (desktop uchun yagona yon panel) ----------
function Sidebar({ items, title, sub, footer }) {
  const { connected } = useSocket();
  return (
    <aside
      className="sidebar hidden lg:flex fixed inset-y-0 left-0 z-40 flex-col"
      style={{ background: 'var(--grad-sidebar)' }}
    >
      <div className="flex items-center gap-3 px-6 pt-7 pb-6">
        <div className="relative">
          <Logo size={42} />
          <span
            className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-black text-white"
            style={{ background: 'var(--grad-gold)', boxShadow: 'var(--glow-gold)' }}
          >
            <Zap size={9} strokeWidth={3} />
          </span>
        </div>
        <div className="min-w-0">
          <div className="text-lg font-extrabold leading-tight tracking-tight text-white truncate">{title}</div>
          <div className="text-[11px] font-semibold text-white/55 truncate">{sub}</div>
        </div>
      </div>

      <nav className="mt-1 flex-1 space-y-1 overflow-y-auto px-3 pb-4">
        {items.map((it) => (
          <NavLink key={it.to} to={it.to} end={it.end}>
            {({ isActive }) => (
              <span
                className={cx(
                  'group flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-[13.5px] font-semibold transition-all relative',
                  isActive ? 'bg-white/14 text-white' : 'text-white/60 hover:bg-white/8 hover:text-white'
                )}
              >
                {isActive && (
                  <span
                    className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-1 rounded-r-full"
                    style={{ background: 'var(--grad-gold)' }}
                  />
                )}
                <it.icon
                  size={19}
                  strokeWidth={isActive ? 2.5 : 2}
                  className={isActive ? 'text-[#fbbf24]' : 'text-white/55 group-hover:text-[#fbbf24] transition-colors'}
                />
                <span className="truncate">{it.label}</span>
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="space-y-3 px-4 pb-5">
        {footer}
        <div className="flex items-center justify-between rounded-2xl bg-black/20 px-3 py-2.5">
          <span className="flex items-center gap-2 text-xs font-bold text-white/65">
            {connected ? <Wifi size={14} className="text-emerald-300" /> : <WifiOff size={14} className="text-red-300" />}
          </span>
          <SidebarLang />
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
    { to: '/lobby', icon: Swords, label: t('nav.lobby') },
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
            <Link to="/" className="flex items-center gap-2 min-w-0">
              <Logo size={30} />
              <span className="brand truncate">{t('common.appName')}</span>
            </Link>
            <div className="flex-1" />
            <div className="flex items-center gap-2 shrink-0">
              {connected ? <Wifi size={15} className="text-success" /> : <WifiOff size={15} className="text-danger" />}
              <CoinBadge value={user?.coin ?? 0} />
              <button
                onClick={() => setLogoutOpen(true)}
                className="btn ico ghost"
                aria-label={t('nav.logout')}
              >
                <LogOut size={18} />
              </button>
            </div>
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

      <main className="lg:ml-[var(--sidebar-w)]">
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
    { to: '/staff/profile', icon: UserRound, label: t('staff.myProfile'), roles: ['ADMIN', 'TEACHER', 'CASHIER'] },
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
            <div className="text-[11.5px] font-bold text-primary truncate">{roleLabel}</div>
          </div>
          <button className="btn ico ghost" onClick={() => navigate('/staff/profile')} title={t('staff.myProfile')}>
            <UserRound size={18} />
          </button>
          <button className="btn ico ghost" onClick={() => setLogoutOpen(true)} title={t('nav.logout')}>
            <LogOut size={18} />
          </button>
        </div>
      </div>

      {/* Mobil bo'limlar paneli — topbar ostida yopishqoq */}
      <div className="lg:hidden sticky top-[var(--topbar-h)] z-[35] bg-[rgba(246,244,252,0.92)] backdrop-blur-md px-3 py-2.5 border-b border-border">
        <div className="segment scroll w-full">
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
            <Link to="/staff/profile" className="flex items-center gap-3 group">
              <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-[#fdc700] text-base font-black text-[#472692] overflow-hidden shrink-0">
                {user?.avatar ? (
                  <img src={user.avatar} alt="" className="absolute inset-0 w-full h-full object-cover" />
                ) : (
                  user?.full_name?.slice(0, 1) || 'X'
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold text-white group-hover:text-[#fbbf24] transition-colors">{user?.full_name}</div>
                <div className="text-[11px] font-semibold text-white/55">{roleLabel}</div>
              </div>
            </Link>
            <button
              onClick={() => setLogoutOpen(true)}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-white/10 py-2 text-xs font-bold text-white/80 transition hover:bg-white/20 hover:text-white"
            >
              <LogOut size={14} /> {t('nav.logout')}
            </button>
          </div>
        }
      />

      <main className="lg:ml-[var(--sidebar-w)]">
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
