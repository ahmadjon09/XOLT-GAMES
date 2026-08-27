import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Home, Store, Trophy, User, LayoutDashboard, Users, CalendarCheck2, ListChecks,
  Wallet, LogOut, Wifi, WifiOff, Zap, Keyboard, Code2, ChevronLeft, Swords, UserRound,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useSocket } from '../context/SocketContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { CoinBadge, ConfirmDialog, LangSwitcher } from '../components/ui.jsx';
import { Logo } from './Logo.jsx';
import { cx } from '../utils/format.js';

// =========================================================================
// YAGONA NAVBAR TIZIMI
// Barcha sahifalar (student, o'yin, xodim) bir xil TopBar'dan foydalanadi:
//   [ orqaga|logo ]      [ sarlavha — markazda ]      [ til + tugmalar ]
// Mobil: yopishqoq (sticky), desktop: statik sarlavha qatori.
// =========================================================================

// Chiqish tugmasi — o'z tasdiq modaliga ega (har joyda bir xil)
function LogoutButton({ className, children }) {
  const { t } = useTranslation();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [open, setOpen] = useState(false);

  const handle = () => {
    setOpen(false);
    logout();
    toast.success(t('common.done'));
    navigate('/login');
  };

  return (
    <>
      <button className={className} onClick={() => setOpen(true)}>
        {children}
      </button>
      <ConfirmDialog
        open={open}
        title={t('auth.logoutConfirm')}
        onClose={() => setOpen(false)}
        onConfirm={handle}
        confirmText={t('common.yesSure')}
      />
    </>
  );
}

// TopBar o'ng tomonidagi yagona boshqaruvlar: til + rolni tugmalari
// Barcha sahifalarda aynan shu blok — navbar har doim bir xil bo'ladi
function TopControls() {
  const { t } = useTranslation();
  const { user } = useAuth();
  if (!user) return null;
  const isStaff = user.kind === 'staff';

  return (
    <>
      {/* Til — mobil: flaglar, desktop: to'liq nomlar */}
      <div className="lg:hidden shrink-0"><LangSwitcher compact /></div>
      <div className="hidden lg:flex shrink-0"><LangSwitcher /></div>
      {/* Coin — kichik ekranda joy tejarasi uchun yashiriladi (sahifa ichida ko'rinadi) */}
      {!isStaff && <span className="hidden sm:inline-flex shrink-0"><CoinBadge value={user?.coin ?? 0} /></span>}
      {isStaff && (
        <Link
          to="/staff/profile"
          className="btn ico ghost shrink-0"
          aria-label={t('staff.myProfile')}
          title={t('staff.myProfile')}
        >
          <UserRound size={18} />
        </Link>
      )}
      <LogoutButton
        className="btn ico ghost shrink-0"
      >
        <span className="sr-only">{t('nav.logout')}</span>
        <LogOut size={18} />
      </LogoutButton>
    </>
  );
}

// Yagona yuqori panel — barcha sahifalarda bir xil, simetrik
// back: orqaga tugma (yo'q bo'lsa logo ko'rinadi)
// onBack: orqaga tugma boshqa ish holatida (masalan o'yindan chiqish)
export function TopBar({ title, right, back, onBack, withStaffMenu = true }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const homeTo = user?.kind === 'staff' ? '/staff' : '/';
  const menu = useStaffMenu();

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <div className="topbar-left">
            {back ? (
              <button
                className="btn ico ghost shrink-0"
                onClick={onBack || (() => navigate(-1))}
                aria-label={t('common.back')}
                title={t('common.back')}
              >
                <ChevronLeft size={20} />
              </button>
            ) : (
              <Link to={homeTo} className="flex items-center gap-2.5 min-w-0" aria-label={t('common.appName')}>
                <Logo size={30} />
                <span className="brand hidden xl:inline truncate">{t('common.appName')}</span>
              </Link>
            )}
          </div>

          <div className="topbar-title">
            <div className="t truncate">{title}</div>
          </div>

          <div className="topbar-right">
            {right && <div className="flex items-center gap-2 shrink-0">{right}</div>}
            <TopControls />
          </div>
        </div>
      </header>
      {user?.kind === 'staff' && withStaffMenu && <StaffSectionNav menu={menu} />}
    </>
  );
}

// Xodim sahifalari uchun bo'limlar menyu — TopBar ostida yopishqoq (faqat mobil)
function StaffSectionNav({ menu }) {
  return (
    <nav className="staffmenu lg:hidden" aria-label="staff">
      <div className="segment scroll w-full">
        {menu.map((m) => (
          <NavLink key={m.to} to={m.to} end={m.end}>
            {({ isActive }) => (
              <button className={isActive ? 'active' : ''} aria-current={isActive ? 'page' : undefined}>
                <m.icon size={15} />
                {m.label}
              </button>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

// Xodim menyu ro'yxati (rolga qarab) — Sidebar va mobil menyu uchun yagona manba
function useStaffMenu() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const role = user?.role;
  return [
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
// Navbar'lar TopBar ichida — layout faqat sidebar (desktop) va pastki nav (mobil)
export function StudentLayout() {
  const { t } = useTranslation();
  const { user } = useAuth();

  const navItems = [
    { to: '/', end: true, icon: Home, label: t('nav.home') },
    { to: '/lobby', icon: Swords, label: t('nav.lobby') },
    { to: '/shop', icon: Store, label: t('nav.shop') },
    { to: '/leaderboard', icon: Trophy, label: t('nav.leaderboard') },
    { to: '/profile', icon: User, label: t('nav.profile') },
  ];

  return (
    <>
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
            <LogoutButton className="flex w-full items-center justify-center gap-2 rounded-xl bg-white/10 py-2.5 text-xs font-bold text-white/80 transition hover:bg-white/20 hover:text-white">
              <LogOut size={14} /> {t('nav.logout')}
            </LogoutButton>
          </div>
        }
      />

      <main className="lg:ml-[var(--sidebar-w)]">
        <Outlet />
      </main>

      <div className="lg:hidden">
        <BottomNav items={navItems} />
      </div>
    </>
  );
}

// ---------- StaffLayout ----------
// Navbar'lar TopBar ichida — layout faqat sidebar (desktop)
// Mobil bo'limlar menyusi TopBar ostida chiqadi (StaffSectionNav)
export function StaffLayout() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const menu = useStaffMenu();

  const roleLabel = {
    TEACHER: t('staff.roleTeacher'),
    CASHIER: t('staff.roleCashier'),
    ADMIN: t('staff.roleAdmin'),
  }[user?.role];

  return (
    <>
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
            <LogoutButton className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-white/10 py-2 text-xs font-bold text-white/80 transition hover:bg-white/20 hover:text-white">
              <LogOut size={14} /> {t('nav.logout')}
            </LogoutButton>
          </div>
        }
      />

      <main className="lg:ml-[var(--sidebar-w)]">
        <Outlet />
      </main>
    </>
  );
}
