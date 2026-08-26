// Admin statistika - recharts grafiklar bilan
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Users, UserCog, Layers, ListChecks, HelpCircle, Wallet, Trophy, Gamepad2, Activity,
} from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell, Legend,
} from 'recharts';
import { useGet } from '../../api/hooks.js';
import { Card, StatCard, Segmented, PageHeader, MiniStat } from '../../components/ui.jsx';

import { fmtNum } from '../../utils/format.js';

const PIE_COLORS = ['#5b1ea6', '#fdc700', '#ef4444'];

export default function AdminDashboard() {
  const { t } = useTranslation();
  const [days, setDays] = useState(30);

  // SWR cache bilan
  const { data: overview } = useGet('/staff/stats/overview');
  const { data: charts } = useGet(`/staff/stats/charts?days=${days}`);

  if (!overview) return (
    <div className="page-staff pt-4">
      <PageHeader icon={Activity} title={t('statsP.title')} />
      <div className="grid-fit mb-[var(--gap)]" style={{ '--col': '210px' }}>
        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <div key={i} className="bg-surface border border-border rounded-[18px] p-3.5 shadow-card flex items-center gap-3">
            <div className="w-[42px] h-[42px] rounded-[14px] bg-surface-2 animate-pulse shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-[11px] w-3/4 rounded-md bg-surface-2 animate-pulse" />
              <div className="h-[16px] w-1/2 rounded-md bg-surface-2 animate-pulse" />
            </div>
          </div>
        ))}
      </div>
      <Card className="mb-3.5 p-4">
        <div className="h-[150px] rounded-[14px] bg-surface-2 animate-pulse" />
      </Card>
      <Card className="p-4">
        <div className="h-[150px] rounded-[14px] bg-surface-2 animate-pulse" />
      </Card>
    </div>
  );

  const roleLabels = { ADMIN: t('staff.roleAdmin'), TEACHER: t('staff.roleTeacher'), CASHIER: t('staff.roleCashier') };

  return (
    <>
      <div className="page-staff pt-4">
        <PageHeader icon={Activity} title={t('statsP.title')} sub={t('statsP.overview')} />
        {/* Umumiy ko'rsatkichlar */}
        <div className="grid-fit mb-[var(--gap)]" style={{ '--col': '210px' }}>
          <StatCard icon={Users} label={t('statsP.totalUsers')} value={fmtNum(overview.usersCount)} sub={`${t('statsP.activeToday')}: ${overview.activeToday}`} color="var(--primary)" />
          <StatCard icon={UserCog} label={t('statsP.totalStaff')} value={fmtNum(overview.staffCount)} color="var(--info)" />
          <StatCard icon={Layers} label={t('statsP.totalGroups')} value={fmtNum(overview.groupsCount)} color="var(--success)" />
          <StatCard icon={ListChecks} label={t('statsP.totalQuizzes')} value={fmtNum(overview.quizzesCount)} sub={`${fmtNum(overview.questionsCount)} ${t('statsP.questions')}`} color="#e34c6b" />
          <StatCard icon={Wallet} label={t('statsP.totalPayments')} value={fmtNum(overview.paymentsCount)} sub={`${fmtNum(overview.paidPaymentsSum)} so'm`} color="#b45309" />
          <StatCard icon={Trophy} label={t('statsP.gamesPlayed')} value={fmtNum(overview.gamesCount)} color="var(--primary)" />
          <StatCard icon={Activity} label={t('statsP.coinsInCirculation')} value={fmtNum(overview.coinsInCirculation)} color="#f59e0b" />
          <StatCard icon={Gamepad2} label={t('home.gamesTitle')} value="3" sub="Math • Quiz • X-O" color="#8b5cf6" />
        </div>

        {/* Davr tanlash */}
        <div style={{ marginBottom: 12 }}>
          <Segmented
            value={String(days)}
            onChange={(v) => setDays(Number(v))}
            options={[
              { value: '7', label: '7' },
              { value: '14', label: '14' },
              { value: '30', label: '30' },
              { value: '60', label: '60' },
              { value: '90', label: '90' },
            ]}
          />
        </div>

        {charts && (
          <>
            {/* Yangi o'quvchilar */}
            <Card className="mb-3.5">
              <div className="font-extrabold text-[14.5px] mb-2">{t('statsP.usersChart')}</div>
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={charts.registrations}>
                  <defs>
                    <linearGradient id="gUsers" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#5b1ea6" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#5b1ea6" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e3e7f2" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--color-muted)' }} tickFormatter={(d) => d.slice(8)} interval="preserveStartEnd" />
                  <YAxis width={26} tick={{ fontSize: 10, fill: 'var(--color-muted)' }} allowDecimals={false} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid var(--border)', fontSize: 12 }} labelFormatter={(d) => d} />
                  <Area type="monotone" dataKey="count" stroke="#5b1ea6" strokeWidth={2.5} fill="url(#gUsers)" name={t('statsP.totalUsers')} />
                </AreaChart>
              </ResponsiveContainer>
            </Card>

            {/* O'yinlar */}
            <Card className="mb-3.5">
              <div className="font-extrabold text-[14.5px] mb-2">{t('statsP.gamesChart')}</div>
              <ResponsiveContainer width="100%" height={190}>
                <BarChart data={charts.gamesByDay}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e3e7f2" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--color-muted)' }} tickFormatter={(d) => d.slice(8)} interval="preserveStartEnd" />
                  <YAxis width={26} tick={{ fontSize: 10, fill: 'var(--color-muted)' }} allowDecimals={false} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid var(--border)', fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="math" stackId="a" fill="#5b1ea6" name={t('statsP.math')} radius={[0, 0, 0, 0]} />
                  <Bar dataKey="quiz" stackId="a" fill="#e34c6b" name={t('statsP.quiz')} />
                  <Bar dataKey="tictactoe" stackId="a" fill="#0ea5e9" name={t('statsP.tictactoe')} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>

            {/* To'lovlar */}
            <Card className="mb-3.5">
              <div className="font-extrabold text-[14.5px] mb-2">{t('statsP.paymentsByMonth')}</div>
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={charts.paymentsByMonth}>
                  <defs>
                    <linearGradient id="gPay" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#fdc700" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#fdc700" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e3e7f2" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'var(--color-muted)' }} />
                  <YAxis width={40} tick={{ fontSize: 10, fill: 'var(--color-muted)' }} tickFormatter={(v) => fmtNum(v)} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid var(--border)', fontSize: 12 }} formatter={(v) => [`${fmtNum(v)} so'm`, t('cashP.amount')]} />
                  <Area type="monotone" dataKey="amount" stroke="#fdc700" strokeWidth={2.5} fill="url(#gPay)" />
                </AreaChart>
              </ResponsiveContainer>
            </Card>

            <div className="grid-fit" style={{ '--col': '460px' }}>
              {/* Xodimlar rollari */}
              <Card>
                <div className="font-extrabold text-[14.5px] mb-2">{t('statsP.roleDistribution')}</div>
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie data={charts.roleStaff} dataKey="count" nameKey="role" innerRadius={40} outerRadius={62} paddingAngle={4}>
                      {charts.roleStaff.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid var(--border)', fontSize: 12 }} formatter={(v, n) => [v, roleLabels[n] || n]} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11.5 }}>
                  {charts.roleStaff.map((r, i) => (
                    <div key={r.role} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 3, background: PIE_COLORS[i % PIE_COLORS.length] }} />
                      {roleLabels[r.role]}: <b>{r.count}</b>
                    </div>
                  ))}
                </div>
              </Card>

              {/* Top o'quvchilar */}
              <Card>
                <div className="font-extrabold text-[14.5px] mb-2">{t('statsP.topUsers')}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {charts.topUsers.map((u, i) => (
                    <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                      <div style={{ width: 20, textAlign: 'center', fontWeight: 900, color: i < 3 ? '#b45309' : 'var(--muted)' }}>{i + 1}</div>
                      <div style={{ flex: 1, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.full_name}</div>
                      <b>{fmtNum(u.score)}</b>
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
