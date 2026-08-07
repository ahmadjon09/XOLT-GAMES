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
    <div className="page-staff" style={{ paddingTop: 14 }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 21, fontWeight: 900 }}>{t('staff.welcome')}, {user?.full_name?.split(' ')[0]}!</div>
        <div style={{ color: 'var(--muted)', fontSize: 13.5 }}>
          {t('staff.staffPanel')} — {t(`staff.role${role === 'ADMIN' ? 'Admin' : role === 'CASHIER' ? 'Cashier' : 'Teacher'}`)}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {sections.map((s) => (
          <Link key={s.to} to={s.to} style={{ textDecoration: 'none', color: 'inherit' }}>
            <Card tap style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 16 }}>
              <div style={{ width: 52, height: 52, borderRadius: 16, background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <s.icon size={24} color={s.color} className="icon-hover" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 15 }}>{s.title}</div>
                <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>{s.desc}</div>
              </div>
              <ChevronRight size={19} color="var(--muted)" />
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
