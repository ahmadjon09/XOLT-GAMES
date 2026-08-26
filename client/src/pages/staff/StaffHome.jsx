// Xodim bosh sahifasi - rolga qarab bo'limlar
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Users, CalendarCheck2, ListChecks, Wallet, Store, Trophy, User as UserIcon, Keyboard, Code2, ChevronRight } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { Card } from '../../components/ui.jsx';

export default function StaffHome() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const role = user?.role;

  const sections = [
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
    <div className="page-staff pt-3.5">
      <div className="mb-4">
        <div className="text-[21px] font-extrabold tracking-tight">{t('staff.welcome')}, {user?.full_name?.split(' ')[0]}!</div>
        <div className="text-[13.5px] text-muted font-semibold mt-0.5">
          {t('staff.staffPanel')} — {t(`staff.role${role === 'ADMIN' ? 'Admin' : role === 'CASHIER' ? 'Cashier' : 'Teacher'}`)}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {sections.map((s) => (
          <Link key={s.to} to={s.to} className="block">
            <Card tap className="p-4 flex items-center gap-3.5">
              <div className="w-[52px] h-[52px] rounded-[16px] flex items-center justify-center shrink-0" style={{ background: s.bg }}>
                <s.icon size={24} color={s.color} className="icon-hover" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-extrabold text-[15px]">{s.title}</div>
                <div className="text-[12.5px] text-muted mt-0.5">{s.desc}</div>
              </div>
              <ChevronRight size={19} className="text-muted shrink-0" />
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
