import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Calculator, ListChecks, Grid3x3, Keyboard, Code2, Trophy,
  CalendarCheck2, Wallet, ChevronRight, QrCode, KeyRound, User, Users, Swords, Coins, Disc3, Car,
} from 'lucide-react';
import { useGet } from '../../api/hooks.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { AutoGrid, Card, CoinBadge, EmptyState } from '../../components/ui.jsx';
import { TopBar } from '../../layouts/Layouts.jsx';
import { fmtNum } from '../../utils/format.js';

const gameMeta = {
  math: { color: '#5b21b6', bg: '#f0eafd' },
  quiz: { color: '#e34c6b', bg: '#fdeef1' },
  chess: { color: '#b45309', bg: '#fdf3d7' },
  checkers: { color: '#dc2626', bg: '#fdeaea' },
  race: { color: '#0d9488', bg: '#d9f4f0' },
  typerace: { color: '#0284c7', bg: '#e4f4fd' },
  code: { color: '#7c3aed', bg: '#f3eefe' },
  ttt: { color: '#16a34a', bg: '#e6f7ec' },
};

export default function Home() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data: groups } = useGet('/user/groups', { fallbackData: null });
  // Guruh ichidagi reytingim (birinchi guruh bo'yicha)
  const { data: groupRank } = useGet('/user/group-ranking', { fallbackData: [] });
  const myGroup = (groupRank || [])[0] || null;

  const games = [
    { key: 'math', to: '/game/math', icon: Calculator, title: t('home.mathTitle'), desc: t('home.mathDesc'), tag: '1v1' },
    { key: 'chess', to: '/game/chess', icon: Swords, title: t('home.chessTitle'), desc: t('home.chessDesc'), tag: '1v1' },
    { key: 'checkers', to: '/game/checkers', icon: Disc3, title: t('home.checkersTitle'), desc: t('home.checkersDesc'), tag: '1v1' },
    { key: 'race', to: '/game/race', icon: Car, title: t('home.raceTitle'), desc: t('home.raceDesc'), tag: '4P' },
    { key: 'race3d', to: '/game/race3d', icon: Car, title: t('home.race3dTitle'), desc: t('home.race3dDesc'), tag: '3D' },
    { key: 'quiz', to: '/quiz/join', icon: ListChecks, title: t('home.quizTitle'), desc: t('home.quizDesc'), tag: 'LIVE' },
    { key: 'typerace', to: '/game/typerace', icon: Keyboard, title: t('home.typingTitle'), desc: t('home.typingDesc'), tag: '10P' },
    { key: 'code', to: '/game/codebattle', icon: Code2, title: t('home.codeTitle'), desc: t('home.codeDesc'), tag: '10P' },
    { key: 'ttt', to: '/game/ttt', icon: Grid3x3, title: t('home.tttTitle'), desc: t('home.tttDesc'), tag: '1v1' },
  ];

  const stats = [
    { label: t('home.myCoins'), value: fmtNum(user?.coin ?? 0), color: '#9a6d00', bg: 'var(--color-accent-soft)', icon: Coins },
    { label: t('home.myScore'), value: fmtNum(user?.score ?? 0), color: 'var(--color-primary)', bg: 'var(--color-primary-soft)', icon: Trophy },
    { label: t('home.myGroupRank'), value: myGroup ? `#${myGroup.myRank}/${myGroup.membersCount}` : '—', color: '#0284c7', bg: 'var(--color-info-soft)', icon: User },
    { label: t('home.groupsCount'), value: groups ? groups.length : '…', color: 'var(--color-ink)', bg: 'var(--color-surface-2)', icon: Users },
  ];

  const quick = [
    { to: '/quiz/join', icon: QrCode, label: t('home.scanQr'), color: 'var(--color-primary)' },
    { to: '/game/math', icon: KeyRound, label: t('home.joinWithCode'), color: 'var(--color-primary)' },
    { to: '/attendance', icon: CalendarCheck2, label: t('home.attendanceShort'), color: 'var(--color-success)' },
    { to: '/payments', icon: Wallet, label: t('home.paymentsShort'), color: '#9a6d00' },
  ];

  return (
    <>
      <TopBar title={t('nav.home')} />
      <div className="page pt-4 space-y-[var(--gap)]">
        {/* Salomlashuv */}
        <Card className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="text-[22px] font-extrabold tracking-tight truncate">
            {t('auth.welcome')}, {user?.full_name?.split(' ')[0]}!
          </div>
          <div className="text-[13.5px] text-muted font-semibold mt-1">{t('home.heroSub')}</div>
        </div>
        <div className="shrink-0">
          <CoinBadge value={user?.coin ?? 0} size={17} />
        </div>
      </Card>

      {/* Statistika — barcha plitalar teng */}
      <AutoGrid col={150}>
        {stats.map((s) => (
          <div key={s.label} className="tile">
            <div
              className="w-10 h-10 flex items-center justify-center mb-2"
              style={{ background: s.bg, color: s.color, borderRadius: 'var(--r-sm)' }}
            >
              <s.icon size={19} strokeWidth={2.2} />
            </div>
            <div className="tile-v" style={{ color: s.color }}>{s.value}</div>
            <div className="tile-l">{s.label}</div>
          </div>
        ))}
      </AutoGrid>

      {/* O'yinlar */}
      <section>
        <div className="section-title">
          <div className="t">{t('home.gamesTitle')}</div>
        </div>
        <AutoGrid col={260}>
          {games.map((g) => {
            const meta = gameMeta[g.key];
            return (
              <Link key={g.key} to={g.to} className="block h-full">
                <Card tap className="h-full flex flex-col gap-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <div
                      className="w-14 h-14 flex items-center justify-center shrink-0"
                      style={{ background: meta.bg, borderRadius: 'var(--r-md)' }}
                    >
                      <g.icon size={27} color={meta.color} strokeWidth={2.1} />
                    </div>
                    <span className="badge primary">{g.tag}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-extrabold text-[16px] tracking-tight truncate">{g.title}</div>
                    <div className="text-[13px] text-muted mt-1 leading-snug">{g.desc}</div>
                  </div>
                  <div className="flex items-center gap-1 text-[13px] font-bold text-primary">
                    {t('home.playNow')}
                    <ChevronRight size={16} />
                  </div>
                </Card>
              </Link>
            );
          })}
        </AutoGrid>
      </section>

      {/* Tezkor amallar */}
      <section>
        <AutoGrid col={220}>
          {quick.map((q) => (
            <Link key={q.to + q.label} to={q.to} className="block h-full">
              <Card tap className="h-full flex items-center gap-3.5">
                <div
                  className="w-11 h-11 flex items-center justify-center shrink-0 bg-surface-2"
                  style={{ color: q.color, borderRadius: 'var(--r-sm)' }}
                >
                  <q.icon size={21} />
                </div>
                <span className="font-bold text-[14px] truncate">{q.label}</span>
                <ChevronRight size={17} className="text-muted shrink-0 ml-auto" />
              </Card>
            </Link>
          ))}
        </AutoGrid>
      </section>

      {/* Guruhlar */}
      {groups !== null && (
        <section>
          <div className="section-title">
            <div className="t">{t('profile.myGroups')}</div>
            {groups.length > 0 && <span className="badge neutral">{groups.length}</span>}
          </div>
          {groups.length === 0 ? (
            <Card>
              <EmptyState icon={User} title={t('profile.noGroups')} />
            </Card>
          ) : (
            <AutoGrid col={300}>
              {groups.slice(0, 6).map((g) => (
                <Link key={g.id} to="/attendance" className="block h-full">
                  <Card tap className="h-full flex items-center gap-3.5">
                    <div
                      className="w-12 h-12 bg-primary-soft text-primary flex items-center justify-center font-extrabold text-[17px] shrink-0"
                      style={{ borderRadius: 'var(--r-sm)' }}
                    >
                      {g.name.slice(0, 1)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-[14.5px] truncate">{g.name}</div>
                      <div className="text-[12px] text-muted mt-0.5">
                        {t('attendance.present')}: {g.attendance.present} • {t('attendance.absent')}: {g.attendance.absent}
                      </div>
                    </div>
                    <CalendarCheck2 size={18} className="text-muted shrink-0" />
                  </Card>
                </Link>
              ))}
            </AutoGrid>
          )}
        </section>
      )}

      {/* Reyting */}
      <div className="text-center pt-2 pb-1">
        <Link
          to="/leaderboard"
          className="inline-flex items-center justify-center gap-2 min-h-[40px] px-2 text-[13.5px] font-bold text-primary hover:underline underline-offset-4 transition-colors"
        >
          <Trophy size={17} />
          {t('home.myRank')}
        </Link>
      </div>
      </div>
    </>
  );
}
