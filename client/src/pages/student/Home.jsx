import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Calculator, ListChecks, Grid3x3, Keyboard, Code2, Trophy,
  CalendarCheck2, Wallet, ChevronRight, QrCode, KeyRound, User, Swords
} from 'lucide-react';
import { useGet } from '../../api/hooks.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { Card, CoinBadge, EmptyState } from '../../components/ui.jsx';
import { fmtNum } from '../../utils/format.js';

const gameMeta = {
  math: { color: '#5b21b6', bg: '#f0eafd' },
  quiz: { color: '#e34c6b', bg: '#fdeef1' },
  chess: { color: '#b45309', bg: '#fdf3d7' },
  typerace: { color: '#0284c7', bg: '#e4f4fd' },
  code: { color: '#7c3aed', bg: '#f3eefe' },
  ttt: { color: '#16a34a', bg: '#e6f7ec' },
};

export default function Home() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data: groups } = useGet('/user/groups', { fallbackData: null });

  const games = [
    { key: 'math', to: '/game/math', icon: Calculator, title: t('home.mathTitle'), desc: t('home.mathDesc'), tag: '1v1' },
    { key: 'chess', to: '/game/chess', icon: Swords, title: t('home.chessTitle'), desc: t('home.chessDesc'), tag: '1v1' },
    { key: 'quiz', to: '/quiz/join', icon: ListChecks, title: t('home.quizTitle'), desc: t('home.quizDesc'), tag: 'LIVE' },
    { key: 'typerace', to: '/game/typerace', icon: Keyboard, title: t('home.typingTitle'), desc: t('home.typingDesc'), tag: '10P' },
    { key: 'code', to: '/game/codebattle', icon: Code2, title: t('home.codeTitle'), desc: t('home.codeDesc'), tag: '10P' },
    { key: 'ttt', to: '/game/ttt', icon: Grid3x3, title: t('home.tttTitle'), desc: t('home.tttDesc'), tag: '1v1' },
  ];

  return (
    <div className="page pt-3.5 space-y-4">
      {/* Welcome */}
      <Card className="p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[19px] font-extrabold tracking-tight truncate">
              {t('auth.welcome')}, {user?.full_name?.split(' ')[0]}!
            </div>
            <div className="text-[13px] text-muted font-semibold mt-0.5">{t('home.heroSub')}</div>
          </div>
          <CoinBadge value={user?.coin ?? 0} size={16} />
        </div>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2.5">
        {[
          { label: t('home.myCoins'), value: fmtNum(user?.coin ?? 0), color: '#9a6d00', bg: 'var(--color-accent-soft)' },
          { label: t('home.myScore'), value: fmtNum(user?.score ?? 0), color: 'var(--color-primary)', bg: 'var(--color-primary-soft)' },
          { label: t('home.groupsCount'), value: groups ? groups.length : '…', color: 'var(--color-ink)', bg: 'var(--color-surface-2)' },
        ].map((s) => (
          <div key={s.label} className="bg-surface border border-border rounded-[16px] p-3 shadow-card text-center">
            <div className="text-[19px] font-extrabold tabular-nums truncate" style={{ color: s.color }}>{s.value}</div>
            <div className="text-[10.5px] text-muted font-bold uppercase tracking-wide truncate">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Games */}
      <div>
        <div className="text-[15px] font-extrabold mb-2.5">{t('home.gamesTitle')}</div>
        <div className="flex flex-col gap-2.5">
          {games.map((g) => {
            const meta = gameMeta[g.key];
            return (
              <Link key={g.key} to={g.to} className="block">
                <Card tap className="p-4 flex items-center gap-3.5">
                  <div className="w-[52px] h-[52px] rounded-[16px] flex items-center justify-center shrink-0" style={{ background: meta.bg }}>
                    <g.icon size={26} color={meta.color} strokeWidth={2.2} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-extrabold text-[15px]">{g.title}</span>
                      <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-primary-soft text-primary">{g.tag}</span>
                    </div>
                    <div className="text-[12.5px] text-muted mt-0.5">{g.desc}</div>
                  </div>
                  <ChevronRight size={19} className="text-muted shrink-0" />
                </Card>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-2.5">
        <Link to="/quiz/join" className="block">
          <Card tap className="p-4 flex items-center gap-3">
            <QrCode size={22} className="text-primary shrink-0" />
            <span className="font-bold text-[13.5px] truncate">{t('home.scanQr')}</span>
          </Card>
        </Link>
        <Link to="/game/math" className="block">
          <Card tap className="p-4 flex items-center gap-3">
            <KeyRound size={22} className="text-primary shrink-0" />
            <span className="font-bold text-[13.5px] truncate">{t('home.joinWithCode')}</span>
          </Card>
        </Link>
        <Link to="/attendance" className="block">
          <Card tap className="p-4 flex items-center gap-3">
            <CalendarCheck2 size={22} className="text-success shrink-0" />
            <span className="font-bold text-[13.5px] truncate">{t('home.attendanceShort')}</span>
          </Card>
        </Link>
        <Link to="/payments" className="block">
          <Card tap className="p-4 flex items-center gap-3">
            <Wallet size={22} className="text-[#9a6d00] shrink-0" />
            <span className="font-bold text-[13.5px] truncate">{t('home.paymentsShort')}</span>
          </Card>
        </Link>
      </div>

      {/* Groups */}
      {groups !== null && (
        <div>
          <div className="text-[15px] font-extrabold mb-2.5">{t('profile.myGroups')}</div>
          {groups.length === 0 ? (
            <Card>
              <EmptyState icon={User} title={t('profile.noGroups')} />
            </Card>
          ) : (
            <Card className="p-0 -my-1.5">
              {groups.slice(0, 3).map((g) => (
                <Link key={g.id} to="/attendance" className="block">
                  <div className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-b-0 hover:bg-surface-2/60 transition-colors">
                    <div className="w-[44px] h-[44px] rounded-[14px] bg-primary-soft text-primary flex items-center justify-center font-extrabold text-[16px] shrink-0">
                      {g.name.slice(0, 1)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-[14.5px] truncate">{g.name}</div>
                      <div className="text-[12px] text-muted">
                        {t('attendance.present')}: {g.attendance.present} • {t('attendance.absent')}: {g.attendance.absent}
                      </div>
                    </div>
                    <CalendarCheck2 size={18} className="text-muted shrink-0" />
                  </div>
                </Link>
              ))}
            </Card>
          )}
        </div>
      )}

      {/* Leaderboard teaser */}
      <div className="text-center pt-1">
        <Link
          to="/leaderboard"
          className="inline-flex items-center gap-2 text-[13.5px] font-bold text-primary hover:underline underline-offset-2 transition-colors"
        >
          <Trophy size={17} />
          {t('home.myRank')}
        </Link>
      </div>
    </div>
  );
}
