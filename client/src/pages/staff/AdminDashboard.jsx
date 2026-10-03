// Admin analytics for the public player platform.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Users, UserCog, ListChecks, Trophy, Activity, Gamepad2 } from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { useGet } from '../../api/hooks.js';
import { Card, StatCard, Segmented, PageHeader } from '../../components/ui.jsx';
import { fmtNum } from '../../utils/format.js';
import { TopBar } from '../../layouts/Layouts.jsx';

const PIE_COLORS = ['#5b1ea6', '#fdc700'];

export default function AdminDashboard() {
  const { t } = useTranslation();
  const [days, setDays] = useState(30);
  const { data: overview } = useGet('/staff/stats/overview');
  const { data: charts } = useGet(`/staff/stats/charts?days=${days}`);

  if (!overview) {
    return (
      <>
        <TopBar title={t('statsP.title')} back />
        <div className="page-staff pt-4">
          <PageHeader icon={Activity} title={t('statsP.title')} />
          <div className="grid-fit mb-[var(--gap)]" style={{ '--col': '210px' }}>
            {[1, 2, 3, 4, 5, 6].map((i) => <div key={i} className="skeleton h-[76px]" />)}
          </div>
          <Card className="mb-3.5 p-4"><div className="skeleton h-[180px]" /></Card>
          <Card className="p-4"><div className="skeleton h-[180px]" /></Card>
        </div>
      </>
    );
  }

  const roleLabels = { ADMIN: t('staff.roleAdmin') };

  return (
    <>
      <TopBar title={t('statsP.title')} back />
      <div className="page-staff pt-4">
        <PageHeader icon={Activity} title={t('statsP.title')} sub={t('statsP.overview')} />
        <div className="grid-fit mb-[var(--gap)]" style={{ '--col': '210px' }}>
          <StatCard icon={Users} label={t('statsP.totalUsers')} value={fmtNum(overview.usersCount)} sub={`${t('statsP.activeToday')}: ${overview.activeToday}`} color="var(--primary)" />
          <StatCard icon={UserCog} label={t('statsP.totalStaff')} value={fmtNum(overview.staffCount)} color="var(--info)" />
          <StatCard icon={ListChecks} label={t('statsP.totalQuizzes')} value={fmtNum(overview.quizzesCount)} sub={`${fmtNum(overview.questionsCount)} ${t('statsP.questions')}`} color="#e34c6b" />
          <StatCard icon={Trophy} label={t('statsP.gamesPlayed')} value={fmtNum(overview.gamesCount)} color="var(--primary)" />
          <StatCard icon={Activity} label={t('statsP.coinsInCirculation')} value={fmtNum(overview.coinsInCirculation)} color="#f59e0b" />
          <StatCard icon={Gamepad2} label={t('statsP.activeGames')} value={fmtNum(overview.activeGamesCount)} color="#8b5cf6" />
        </div>

        <div className="mb-3">
          <Segmented
            value={String(days)}
            onChange={(value) => setDays(Number(value))}
            options={['7', '14', '30', '60', '90'].map((value) => ({ value, label: value }))}
          />
        </div>

        {charts && (
          <>
            <Card className="mb-3.5">
              <div className="font-extrabold text-[14.5px] mb-2">{t('statsP.usersChart')}</div>
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={charts.registrations}>
                  <defs><linearGradient id="gUsers" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#5b1ea6" stopOpacity={0.35} /><stop offset="100%" stopColor="#5b1ea6" stopOpacity={0.02} /></linearGradient></defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e3e7f2" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--color-muted)' }} tickFormatter={(date) => date.slice(8)} interval="preserveStartEnd" />
                  <YAxis width={26} tick={{ fontSize: 10, fill: 'var(--color-muted)' }} allowDecimals={false} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid var(--border)', fontSize: 12 }} />
                  <Area type="monotone" dataKey="count" stroke="#5b1ea6" strokeWidth={2.5} fill="url(#gUsers)" name={t('statsP.totalUsers')} />
                </AreaChart>
              </ResponsiveContainer>
            </Card>

            <Card className="mb-3.5">
              <div className="font-extrabold text-[14.5px] mb-2">{t('statsP.gamesChart')}</div>
              <ResponsiveContainer width="100%" height={190}>
                <BarChart data={charts.gamesByDay}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e3e7f2" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--color-muted)' }} tickFormatter={(date) => date.slice(8)} interval="preserveStartEnd" />
                  <YAxis width={26} tick={{ fontSize: 10, fill: 'var(--color-muted)' }} allowDecimals={false} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid var(--border)', fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="math" stackId="a" fill="#5b1ea6" name={t('statsP.math')} />
                  <Bar dataKey="quiz" stackId="a" fill="#e34c6b" name={t('statsP.quiz')} />
                  <Bar dataKey="tictactoe" stackId="a" fill="#0ea5e9" name={t('statsP.tictactoe')} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>

            <div className="grid-fit" style={{ '--col': '460px' }}>
              <Card>
                <div className="font-extrabold text-[14.5px] mb-2">{t('statsP.roleDistribution')}</div>
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie data={charts.roleStaff} dataKey="count" nameKey="role" innerRadius={40} outerRadius={62} paddingAngle={4}>
                      {charts.roleStaff.map((row, index) => <Cell key={row.role} fill={PIE_COLORS[index % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid var(--border)', fontSize: 12 }} formatter={(value, name) => [value, roleLabels[name] || name]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-col gap-1 text-[11.5px]">
                  {charts.roleStaff.map((row, index) => (
                    <div key={row.role} className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-sm" style={{ background: PIE_COLORS[index % PIE_COLORS.length] }} />
                      {roleLabels[row.role] || row.role}: <b>{row.count}</b>
                    </div>
                  ))}
                </div>
              </Card>

              <Card>
                <div className="font-extrabold text-[14.5px] mb-2">{t('statsP.topUsers')}</div>
                <div className="flex flex-col gap-2">
                  {charts.topUsers.map((player, index) => (
                    <div key={player.id} className="flex items-center gap-2 text-xs">
                      <div className={`w-5 text-center font-black ${index < 3 ? 'text-[#b45309]' : 'text-muted'}`}>{index + 1}</div>
                      <div className="flex-1 font-bold truncate">{player.full_name}</div>
                      <b>{fmtNum(player.score)}</b>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </>
        )}
      </div>
    </>
  );
}
