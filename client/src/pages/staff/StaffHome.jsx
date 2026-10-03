// Admin panel entry cards. Teacher/group management has been removed from the public platform.
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Store, Swords, Trophy, UserRound, Users } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { AutoGrid, Card } from '../../components/ui.jsx';
import { TopBar } from '../../layouts/Layouts.jsx';

export default function StaffHome() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const role = user?.role;
  const sections = [
    { to: '/staff/profile', icon: UserRound, color: '#0ea5e9', bg: '#e4f4fd', title: t('staff.myProfile'), desc: t('staffProfile.editProfileSub') },
    ...(role === 'ADMIN' ? [
      { to: '/staff/games', icon: Swords, color: '#5b1ea6', bg: '#efe7fb', title: t('adminGames.title'), desc: t('adminGames.description') },
      { to: '/staff/users', icon: Users, color: '#0ea5e9', bg: '#e4f4fd', title: t('usersP.title'), desc: t('usersP.searchUser') },
      { to: '/staff/shop', icon: Store, color: '#c78d00', bg: '#fff6d8', title: t('staff.shop'), desc: t('shopA.addFrame') },
      { to: '/staff/stats', icon: Trophy, color: '#ef4444', bg: '#fdeaea', title: t('staff.stats'), desc: t('statsP.overview') },
    ] : []),
  ];
  const roleLabel = t('staff.roleAdmin');

  return (
    <>
      <TopBar title={t('staff.title')} />
      <div className="page-staff pt-4 space-y-[var(--gap)]">
        <Card className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="text-[22px] font-extrabold tracking-tight truncate">{t('staff.welcome')}, {user?.full_name?.split(' ')[0]}!</div>
            <div className="text-[13.5px] text-muted font-semibold mt-1">{t('staff.staffPanel')} — {roleLabel}</div>
          </div>
          <span className="badge primary shrink-0">{sections.length}</span>
        </Card>
        <AutoGrid col={300}>
          {sections.map((section) => (
            <Link key={section.to} to={section.to} className="block h-full">
              <Card tap className="h-full flex flex-col gap-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="w-14 h-14 flex items-center justify-center shrink-0" style={{ background: section.bg, borderRadius: 'var(--r-md)' }}>
                    <section.icon size={26} color={section.color} className="icon-hover" />
                  </div>
                  <ChevronRight size={19} className="text-muted shrink-0" />
                </div>
                <div className="min-w-0">
                  <div className="font-extrabold text-[16px] tracking-tight">{section.title}</div>
                  <div className="text-[13px] text-muted mt-1 leading-snug">{section.desc}</div>
                </div>
              </Card>
            </Link>
          ))}
        </AutoGrid>
      </div>
    </>
  );
}
