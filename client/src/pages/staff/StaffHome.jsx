// Xodim bosh sahifasi - rolga qarab bo'limlar
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Users, CalendarCheck2, ListChecks, Wallet, Store, Trophy, User as UserIcon, UserRound, Keyboard, Code2, ChevronRight } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { AutoGrid, Card } from '../../components/ui.jsx';
import { TopBar } from '../../layouts/Layouts.jsx';

export default function StaffHome() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const role = user?.role;

  const sections = [
    { to: '/staff/profile', icon: UserRound, color: '#0ea5e9', bg: '#e4f4fd', title: t('staff.myProfile'), desc: t('staffProfile.editProfileSub'), roles: ['ADMIN', 'TEACHER', 'CASHIER'] },
    { to: '/staff/groups', icon: Users, color: '#5b1ea6', bg: '#efe7fb', title: t('staff.groups'), desc: t('staff.teacherDesc'), roles: ['ADMIN', 'TEACHER'] },
    { to: '/staff/attendance', icon: CalendarCheck2, color: '#16a34a', bg: '#e6f7ec', title: t('staff.attendance'), desc: t('attMark.selectDate'), roles: ['ADMIN', 'TEACHER'] },
    { to: '/staff/quizzes', icon: ListChecks, color: '#e34c6b', bg: '#fdeef1', title: t('staff.quizzes'), desc: t('hostP.selectQuiz'), roles: ['ADMIN', 'TEACHER'] },
    { to: '/staff/payments', icon: Wallet, color: '#9a6d00', bg: '#fff6d8', title: t('staff.payments'), desc: t('cashP.selectGroup'), roles: ['ADMIN', 'CASHIER'] },
    { to: '/staff/users', icon: Users, color: '#0ea5e9', bg: '#e4f4fd', title: t('staff.users'), desc: t('usersP.createStudent'), roles: ['ADMIN', 'CASHIER', 'TEACHER'] },
    { to: '/staff/staff', icon: UserIcon, color: '#8b5cf6', bg: '#f1ebfe', title: t('staff.staff'), desc: t('staffP.createStaff'), roles: ['ADMIN'] },
    { to: '/staff/shop', icon: Store, color: '#c78d00', bg: '#fff6d8', title: t('staff.shop'), desc: t('shopA.addFrame'), roles: ['ADMIN'] },
    { to: '/staff/typing-texts', icon: Keyboard, color: '#0ea5e9', bg: '#e4f4fd', title: t('typing.manageTexts'), desc: t('typing.manageTextsDesc'), roles: ['ADMIN', 'TEACHER'] },
    { to: '/staff/code-questions', icon: Code2, color: '#8b5cf6', bg: '#f1ebfe', title: t('code.manageQuestions'), desc: t('code.manageDesc'), roles: ['ADMIN', 'TEACHER'] },
    { to: '/staff/stats', icon: Trophy, color: '#ef4444', bg: '#fdeaea', title: t('staff.stats'), desc: t('statsP.overview'), roles: ['ADMIN'] },
  ].filter((s) => s.roles.includes(role));

  return (
    <>
      <TopBar title={t('staff.title')} />
      <div className="page-staff pt-4 space-y-[var(--gap)]">
      <Card className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="text-[22px] font-extrabold tracking-tight truncate">
            {t('staff.welcome')}, {user?.full_name?.split(' ')[0]}!
          </div>
          <div className="text-[13.5px] text-muted font-semibold mt-1">
            {t('staff.staffPanel')} — {t(`staff.role${role === 'ADMIN' ? 'Admin' : role === 'CASHIER' ? 'Cashier' : 'Teacher'}`)}
          </div>
        </div>
        <span className="badge primary shrink-0">{sections.length}</span>
      </Card>

      <AutoGrid col={300}>
        {sections.map((s) => (
          <Link key={s.to} to={s.to} className="block h-full">
            <Card tap className="h-full flex flex-col gap-3.5">
              <div className="flex items-start justify-between gap-2">
                <div
                  className="w-14 h-14 flex items-center justify-center shrink-0"
                  style={{ background: s.bg, borderRadius: 'var(--r-md)' }}
                >
                  <s.icon size={26} color={s.color} className="icon-hover" />
                </div>
                <ChevronRight size={19} className="text-muted shrink-0" />
              </div>
              <div className="min-w-0">
                <div className="font-extrabold text-[16px] tracking-tight">{s.title}</div>
                <div className="text-[13px] text-muted mt-1 leading-snug">{s.desc}</div>
              </div>
            </Card>
          </Link>
        ))}
      </AutoGrid>
    </div>
    </>
  );
}
