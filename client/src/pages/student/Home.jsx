import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Calculator, ListChecks, Grid3x3, Keyboard, Code2, Trophy,
  CalendarCheck2, Wallet, ChevronRight, QrCode, KeyRound
} from 'lucide-react';
import { useGet } from '../../api/hooks.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { Card, CoinBadge } from '../../components/ui.jsx';
import { fmtNum } from '../../utils/format.js';

const gameMeta = {
  math: { color: '#5b1ea6', bg: '#efe7fb' },
  quiz: { color: '#e34c6b', bg: '#fdeef1' },
  typerace: { color: '#0ea5e9', bg: '#e4f4fd' },
  code: { color: '#8b5cf6', bg: '#f1ebfe' },
  ttt: { color: '#16a34a', bg: '#e6f7ec' },
};

export default function Home() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data: groups } = useGet('/user/groups', { fallbackData: null });

  const games = [
    { key: 'math', to: '/game/math', icon: Calculator, title: t('home.mathTitle'), desc: t('home.mathDesc'), tag: '1v1' },
    { key: 'quiz', to: '/quiz/join', icon: ListChecks, title: t('home.quizTitle'), desc: t('home.quizDesc'), tag: 'LIVE' },
    { key: 'typerace', to: '/game/typerace', icon: Keyboard, title: t('home.typingTitle'), desc: t('home.typingDesc'), tag: '10P' },
    { key: 'code', to: '/game/codebattle', icon: Code2, title: t('home.codeTitle'), desc: t('home.codeDesc'), tag: '10P' },
    { key: 'ttt', to: '/game/ttt', icon: Grid3x3, title: t('home.tttTitle'), desc: t('home.tttDesc'), tag: '1v1' },
  ];

  return (
    <div className="mx-auto space-y-5 p-4 pt-6">
      {/* Welcome & hero */}
      <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-slate-200 shadow-lg px-6 py-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <div className="text-2xl font-bold text-slate-800">
              {t('auth.welcome')}, {user?.full_name?.split(' ')[0]}!
            </div>
            <div className="text-sm text-slate-500">{t('home.heroSub')}</div>
          </div>
          {/* Optional quick stats could go here */}
        </div>
      </div>

      {/* Stats cards (coins, score, groups) */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-slate-200 shadow-lg p-4 text-center">
          <div className="text-2xl font-black text-amber-600">{fmtNum(user?.coin ?? 0)}</div>
          <div className="text-xs text-slate-500 font-semibold uppercase tracking-wide">{t('home.myCoins')}</div>
        </div>
        <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-slate-200 shadow-lg p-4 text-center">
          <div className="text-2xl font-black text-indigo-600">{fmtNum(user?.score ?? 0)}</div>
          <div className="text-xs text-slate-500 font-semibold uppercase tracking-wide">{t('home.myScore')}</div>
        </div>
        <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-slate-200 shadow-lg p-4 text-center">
          <div className="text-2xl font-black text-slate-800">{groups ? groups.length : '…'}</div>
          <div className="text-xs text-slate-500 font-semibold uppercase tracking-wide">{t('home.groupsCount')}</div>
        </div>
      </div>

      {/* Games section */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-extrabold text-slate-800">{t('home.gamesTitle')}</h2>
        </div>
        <div className="flex flex-col gap-3">
          {games.map((g) => {
            const meta = gameMeta[g.key];
            return (
              <Link key={g.key} to={g.to} className="block">
                <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-slate-200 shadow-lg p-4 flex items-center gap-4 transition-all duration-200 hover:shadow-xl hover:-translate-y-0.5 active:scale-[0.98]">
                  <div
                    className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0"
                    style={{ background: meta.bg }}
                  >
                    <g.icon size={28} color={meta.color} strokeWidth={2} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-extrabold text-slate-800 text-base">{g.title}</span>
                      <span className="inline-block text-xs font-bold px-3 py-1 rounded-full bg-indigo-100 text-indigo-700">
                        {g.tag}
                      </span>
                    </div>
                    <div className="text-sm text-slate-500">{g.desc}</div>
                  </div>
                  <ChevronRight size={20} className="text-slate-400 shrink-0" />
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Quick actions: QR & code */}
      <div className="grid grid-cols-2 gap-3">
        <Link to="/quiz/join">
          <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-slate-200 shadow-lg p-4 flex items-center gap-3 transition-all duration-200 hover:shadow-xl hover:-translate-y-0.5 active:scale-[0.98]">
            <QrCode size={22} className="text-indigo-500" />
            <span className="font-bold text-slate-800 text-sm">{t('home.scanQr')}</span>
          </div>
        </Link>
        <Link to="/game/math">
          <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-slate-200 shadow-lg p-4 flex items-center gap-3 transition-all duration-200 hover:shadow-xl hover:-translate-y-0.5 active:scale-[0.98]">
            <KeyRound size={22} className="text-indigo-500" />
            <span className="font-bold text-slate-800 text-sm">{t('home.joinWithCode')}</span>
          </div>
        </Link>
      </div>

      {/* Groups preview */}
      {groups !== null && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-extrabold text-slate-800">{t('profile.myGroups')}</h2>
          </div>
          {groups.length === 0 ? (
            <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-slate-200 shadow-lg p-8 text-center">
              <div className="flex flex-col items-center gap-3 text-slate-500">
                <CalendarCheck2 size={36} className="text-indigo-300" strokeWidth={1.5} />
                <div className="font-semibold">{t('profile.noGroups')}</div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {groups.slice(0, 3).map((g) => (
                <Link key={g.id} to="/attendance" className="block">
                  <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-slate-200 shadow-lg p-4 flex items-center gap-4 transition-all duration-200 hover:shadow-xl hover:-translate-y-0.5 active:scale-[0.98]">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 font-extrabold text-lg shrink-0">
                      {g.name.slice(0, 1)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-slate-800 truncate">{g.name}</div>
                      <div className="text-sm text-slate-500">
                        {t('attendance.present')}: {g.attendance.present} / {t('attendance.absent')}: {g.attendance.absent}
                      </div>
                    </div>
                    <CalendarCheck2 size={18} className="text-slate-400 shrink-0" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Additional shortcuts: Attendance & Payments */}
      <div className="grid grid-cols-2 gap-3">
        <Link to="/attendance">
          <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-slate-200 shadow-lg p-4 flex items-center gap-3 transition-all duration-200 hover:shadow-xl hover:-translate-y-0.5 active:scale-[0.98]">
            <CalendarCheck2 size={22} className="text-emerald-500" />
            <span className="font-bold text-slate-800 text-sm">{t('home.attendanceShort')}</span>
          </div>
        </Link>
        <Link to="/payments">
          <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-slate-200 shadow-lg p-4 flex items-center gap-3 transition-all duration-200 hover:shadow-xl hover:-translate-y-0.5 active:scale-[0.98]">
            <Wallet size={22} className="text-amber-500" />
            <span className="font-bold text-slate-800 text-sm">{t('home.paymentsShort')}</span>
          </div>
        </Link>
      </div>

      {/* Leaderboard teaser */}
      <div className="text-center pt-2">
        <Link
          to="/leaderboard"
          className="inline-flex items-center gap-2 text-sm font-bold text-indigo-600 hover:text-indigo-800 transition-colors"
        >
          <Trophy size={18} />
          {t('home.myRank')} →
        </Link>
      </div>
    </div>
  );
}