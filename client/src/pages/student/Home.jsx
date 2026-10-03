import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Calculator, ListChecks, Grid3x3, Keyboard, Code2, Trophy,
  ChevronRight, QrCode, KeyRound, Users, Swords, Coins, Disc3, ServerCrash,
} from 'lucide-react';
import { useGet } from '../../api/hooks.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useServerStatus } from '../../context/ServerStatusContext.jsx';
import { AutoGrid, Card, CoinBadge, EmptyState } from '../../components/ui.jsx';
import { TopBar } from '../../layouts/Layouts.jsx';
import { fmtNum } from '../../utils/format.js';

const gameMeta = {
  math: { color: '#5b21b6', bg: '#f0eafd' },
  quiz: { color: '#e34c6b', bg: '#fdeef1' },
  chess: { color: '#b45309', bg: '#fdf3d7' },
  checkers: { color: '#dc2626', bg: '#fdeaea' },
  typerace: { color: '#0284c7', bg: '#e4f4fd' },
  codebattle: { color: '#7c3aed', bg: '#f3eefe' },
  tictactoe: { color: '#16a34a', bg: '#e6f7ec' },
};

export default function Home() {
  const { t } = useTranslation();
  const { user } = useAuth();
  // Server load state blocks new rooms when the service is saturated.
  const server = useServerStatus();
  const { data: gameCatalog } = useGet('/games/catalog', { fallbackData: null, dedupingInterval: 30_000 });

  const games = [
    { key: 'math', to: '/game/math', icon: Calculator, title: t('home.mathTitle'), desc: t('home.mathDesc'), tag: '1v1' },
    { key: 'chess', to: '/game/chess', icon: Swords, title: t('home.chessTitle'), desc: t('home.chessDesc'), tag: '1v1' },
    { key: 'checkers', to: '/game/checkers', icon: Disc3, title: t('home.checkersTitle'), desc: t('home.checkersDesc'), tag: '1v1' },
    { key: 'quiz', to: '/quiz/play', icon: ListChecks, title: t('home.quizTitle'), desc: t('home.quizDesc'), tag: 'LIVE' },
    { key: 'typerace', to: '/game/typerace', icon: Keyboard, title: t('home.typingTitle'), desc: t('home.typingDesc'), tag: '10P' },
    { key: 'codebattle', to: '/game/codebattle', icon: Code2, title: t('home.codeTitle'), desc: t('home.codeDesc'), tag: '10P' },
    { key: 'tictactoe', to: '/game/ttt', icon: Grid3x3, title: t('home.tttTitle'), desc: t('home.tttDesc'), tag: '1v1' },
  ];

  const stats = [
    { label: t('home.myCoins'), value: fmtNum(user?.coin ?? 0), color: '#9a6d00', bg: 'var(--color-accent-soft)', icon: Coins },
    { label: t('home.myScore'), value: fmtNum(user?.score ?? 0), color: 'var(--color-primary)', bg: 'var(--color-primary-soft)', icon: Trophy },
    { label: t('home.weekScore'), value: fmtNum(user?.week_score ?? 0), color: '#0284c7', bg: 'var(--color-info-soft)', icon: Trophy },
    { label: t('home.monthScore'), value: fmtNum(user?.month_score ?? 0), color: 'var(--color-ink)', bg: 'var(--color-surface-2)', icon: Trophy },
  ];

  const quick = [
    { to: '/friends', icon: Users, label: t('nav.friends'), color: 'var(--color-primary)' },
    { to: '/quizzes', icon: ListChecks, label: t('quizzesP.title'), color: '#e34c6b' },
    { to: '/quiz/play', icon: QrCode, label: t('home.scanQr'), color: 'var(--color-primary)' },
    { to: '/lobby', icon: KeyRound, label: t('nav.lobby'), color: 'var(--color-success)' },
  ];
  const activeGameIds = gameCatalog ? new Set(gameCatalog.map((game) => game.id)) : null;
  const visibleGames = activeGameIds ? games.filter((game) => activeGameIds.has(game.key)) : games;

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
      {server.busy ? (
        <Card className="flex items-start gap-3" style={{ borderColor: 'rgba(234,179,8,.4)', background: 'rgba(234,179,8,.08)' }}>
          <ServerCrash size={20} className="mt-0.5 shrink-0" style={{ color: '#b45309' }} />
          <div className="min-w-0">
            <div className="font-extrabold text-[15px]">{t('server.busyTitle', 'Server band')}</div>
            <div className="text-[13px] text-muted mt-0.5">
              {t('server.busyDesc', 'Hozir yangi o‘yin ochib bo‘lmaydi. Bir necha daqiqadan so‘ng qayta urinib ko‘ring.')}
              {server.memoryPct ? ` — RAM ${server.memoryPct}%` : ''}
            </div>
          </div>
        </Card>
      ) : null}

      <section>
        <div className="section-title">
          <div className="t">{t('home.gamesTitle')}</div>
        </div>
        <AutoGrid col={260}>
          {visibleGames.map((g) => {
            // Fallback: yangi o'yin qo'shilganda meta yo'q bo'lsa app'ni tushirmaslik
            const meta = gameMeta[g.key] || { color: 'var(--color-primary)', bg: 'var(--color-primary-soft)' };
            // A busy server temporarily blocks the creation of any new game room.
            const blocked = server.busy;

            const body = (
              <Card tap={!blocked} className={`h-full flex flex-col gap-3.5${blocked ? ' opacity-60' : ''}`}>
                <div className="flex items-start justify-between gap-2">
                  <div
                    className="w-14 h-14 flex items-center justify-center shrink-0"
                    style={{ background: meta.bg, borderRadius: 'var(--r-md)' }}
                  >
                    <g.icon size={27} color={meta.color} strokeWidth={2.1} />
                  </div>
                  <span className={`badge ${blocked ? 'warn' : 'primary'}`}>
                    {blocked ? t('server.busyBadge', 'Server band') : g.tag}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-extrabold text-[16px] tracking-tight truncate">{g.title}</div>
                  <div className="text-[13px] text-muted mt-1 leading-snug">{g.desc}</div>
                </div>
                <div className={`flex items-center gap-1 text-[13px] font-bold ${blocked ? 'text-muted' : 'text-primary'}`}>
                  {blocked ? t('server.tryLater', 'Keyinroq urinib ko‘ring') : t('home.playNow')}
                  {blocked ? null : <ChevronRight size={16} />}
                </div>
              </Card>
            );

            // Bloklangan o'yin ochilmaydi: Link o'rniga oddiy div (bosilmaydi)
            if (blocked) {
              return (
                <div key={g.key} className="block h-full cursor-not-allowed" aria-disabled="true">
                  {body}
                </div>
              );
            }

            return (
              <Link key={g.key} to={g.to} className="block h-full">
                {body}
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
