import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FaTrophy, FaCalendarWeek, FaCalendarAlt, FaInfinity, FaExclamationTriangle } from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';
import { useGet } from '../../api/hooks.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { Avatar, AnimatedName, Pagination } from '../../components/ui.jsx';
import { TopBar } from '../../layouts/Layouts.jsx';
import { fmtNum } from '../../utils/format.js';
import gg1 from '../../assets/gg1.png';
import gg2 from '../../assets/gg2.png';
import gg3 from '../../assets/gg3.png';
import ggTop from '../../assets/gg-top.png';
import "../../styles/leaderboard.css"
import { Trophy } from 'lucide-react';
const PERIODS = [
  { key: 'week', labelKey: 'lb.week', icon: FaCalendarWeek },
  { key: 'month', labelKey: 'lb.month', icon: FaCalendarAlt },
  { key: 'all', labelKey: 'lb.overall', icon: FaInfinity },
];

const scoreOf = (u, period) => (period === 'week' ? u.week_score : period === 'month' ? u.month_score : u.score);

const rankColors = {
  1: 'text-yellow-500 bg-yellow-50',
  2: 'text-gray-500 bg-gray-50',
  3: 'text-amber-600 bg-amber-50',
};

const medalImg = { 1: gg1, 2: gg2, 3: gg3 };
const medalGrad = {
  1: 'from-yellow-300 via-yellow-300 to-yellow-100 border-yellow-400 shadow-yellow-400/50',
  2: 'from-gray-400 via-gray-300 to-gray-100 border-gray-300 shadow-gray-400/50',
  3: 'from-amber-500 via-amber-400 to-amber-200 border-amber-400 shadow-amber-400/50',
};

export default function Leaderboard() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [period, setPeriod] = useState('all');
  const [page, setPage] = useState(1);
  const limit = 20;

  const { data, isLoading } = useGet(`/user/leaderboard?period=${period}&page=${page}&limit=${limit}`);

  if (isLoading && !data) {
    return (
      <>
        <TopBar title={t('lb.title')} />
        <div className="page pt-4 space-y-[var(--gap)]">
          <div className="card h-[88px]">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-surface-2 animate-pulse" />
            <div className="space-y-2 flex-1">
              <div className="h-[16px] w-1/3 rounded-md bg-surface-2 animate-pulse" />
              <div className="h-[12px] w-1/2 rounded-md bg-surface-2 animate-pulse" />
            </div>
          </div>
        </div>
        <div className="relative overflow-hidden rounded-3xl p-6 bg-surface border border-border shadow-card">
          <div className="grid grid-cols-3 items-end max-w-3xl mx-auto pt-14 gap-3">
            <div className="h-[180px] rounded-2xl bg-surface-2 animate-pulse" />
            <div className="h-[220px] rounded-2xl bg-surface-2 animate-pulse" />
            <div className="h-[150px] rounded-2xl bg-surface-2 animate-pulse" />
          </div>
        </div>
        <div className="bg-surface rounded-2xl border border-border shadow-card overflow-hidden divide-y divide-border">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-4 p-4">
              <div className="w-10 h-10 rounded-full bg-surface-2 animate-pulse shrink-0" />
              <div className="w-12 h-12 rounded-full bg-surface-2 animate-pulse shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-[13px] w-1/3 rounded-md bg-surface-2 animate-pulse" />
                <div className="h-[11px] w-1/2 rounded-md bg-surface-2 animate-pulse" />
              </div>
              <div className="h-[16px] w-12 rounded-md bg-surface-2 animate-pulse" />
            </div>
          ))}
        </div>
        </div>
      </>
    );
  }

  if (!data) {
    return (
      <>
        <TopBar title={t('lb.title')} />
        <div className="w-full flex items-center min-h-screen justify-center text-red-400 p-8">
          <div className="text-center">
            <FaExclamationTriangle className="text-5xl mx-auto mb-4" />
            <p>{t('common.serverError')}</p>
          </div>
        </div>
      </>
    );
  }

  const leaderboard = data.leaderboard || [];
  const currentUser = data.currentUser || null;
  const totalPages = data.pages || 1;
  const topThree = leaderboard.slice(0, 3);
  const rest = leaderboard.slice(3);

  const PodiumCard = ({ item, rank, size = 'md' }) => {
    const big = size === 'lg';
    return (
      <div
        onClick={() => item?.id && navigate(item.id === user?.id ? '/profile' : `/players/${item.id}`)}
        role={item?.id ? 'link' : undefined}
        tabIndex={item?.id ? 0 : undefined}
        onKeyDown={(event) => { if (item?.id && (event.key === 'Enter' || event.key === ' ')) navigate(item.id === user?.id ? '/profile' : `/players/${item.id}`); }}
        className={`flex flex-col cursor-pointer items-center w-full min-w-0 ${rank === 1 ? 'z-10' : ''}`}
      >
        <div
          className={`relative w-full min-w-0 bg-white rounded-2xl border-2 p-2.5 sm:p-4 flex flex-col items-center shadow-xl transform transition-all duration-300 hover:scale-105 hover:shadow-2xl bg-gradient-to-br ${medalGrad[rank]}`}
        >
          {/* Bezak lentasi — kenglik kartaga nisbatan, mobilda ham sig'adi */}
          <div
            aria-hidden="true"
            className="absolute -top-7 sm:-top-10 left-1/2 -translate-x-1/2 w-[150%] max-w-[320px] h-[70px] sm:h-[100px] pointer-events-none bg-contain bg-center bg-no-repeat"
            style={{ backgroundImage: `url(${ggTop})` }}
          />
          <div className="mt-6 sm:mt-8 mb-1.5 sm:mb-2">
            {item?.currentFrame || item?.avatar ? (
              <>
                <span className="block sm:hidden"><Avatar w={big ? 64 : 52} frame={item.currentFrame} avatar={item.avatar} /></span>
                <span className="hidden sm:block"><Avatar w={big ? 100 : 78} frame={item.currentFrame} avatar={item.avatar} /></span>
              </>
            ) : (
              <div className="w-[52px] h-[52px] sm:w-[78px] sm:h-[78px] rounded-xl bg-surface-3 flex items-center justify-center text-3xl">?</div>
            )}
          </div>
          <p className={`font-bold text-gray-800 ${big ? 'text-[15px] sm:text-2xl' : 'text-[13px] sm:text-xl'} mt-1.5 sm:mt-2 text-center truncate w-full`}>
            {item ? <AnimatedName config={item.currentEffect?.config}>{item.full_name}</AnimatedName> : '...'}
          </p>
          {item?.username && (
            <p className="hidden sm:block text-gray-400 text-xs text-center truncate w-full mt-1">@{item.username}</p>
          )}
          <div className="mt-2 sm:mt-3 bg-gradient-to-r from-yellow-50 to-amber-50 px-2 sm:px-4 py-1.5 sm:py-2 rounded-full border border-yellow-200 w-full">
            <p className="text-[11px] sm:text-sm text-gray-800 font-bold flex items-center justify-center gap-1 truncate">
              <FaTrophy className="text-yellow-500 shrink-0" size={big ? 14 : 12} /> {fmtNum(scoreOf(item, period))}
              <span className="hidden sm:inline">{t('lb.points')}</span>
            </p>
          </div>
          <div className="relative w-full flex justify-center mt-1.5 sm:mt-2">
            <h1 className="font-black text-gray-800 text-[28px] sm:text-5xl absolute text-center drop-shadow-lg">{rank}</h1>
            <div className="relative top-1 sm:top-2 w-[105%] sm:w-[130%] max-w-[280px] h-[40px] sm:h-[64px] bg-contain bg-center bg-no-repeat" style={{ backgroundImage: `url(${medalImg[rank]})` }} />
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <TopBar title={t('lb.title')} />
      <div className="page pt-4 space-y-[var(--gap)]">
        <div className="card">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 text-yellow-400 flex items-center justify-center">
              <Trophy />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-ink">{t('lb.title')}</h1>
              <p className="text-sm text-muted">{t('lb.top')}</p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full sm:w-auto flex-wrap min-w-0">
            <div className="segment scroll min-w-0 max-w-full">
              {PERIODS.map(({ key, labelKey, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => {
                    setPeriod(key);
                    setPage(1);
                  }}
                  className={period === key ? 'active' : ''}
                  aria-label={t(labelKey)}
                >
                  <Icon size={16} />
                  <span className="hidden sm:inline">{t(labelKey)}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <>
          {/* ===== UMUMIY REYTING ===== */}
          {topThree.length > 0 && (
            <div className="card relative overflow-hidden p-3 sm:p-6 md:p-8 shadow-card-lg">
              <div className="grid grid-cols-3 items-end gap-1.5 sm:gap-3 max-w-3xl mx-auto pt-9 sm:pt-14 md:pt-16">
                <div className="flex justify-center order-1 min-w-0">{topThree[1] && <PodiumCard item={topThree[1]} rank={2} />}</div>
                <div className="-mt-4 sm:-mt-10 md:-mt-14 flex justify-center z-10 order-2 min-w-0">
                  {topThree[0] && <PodiumCard item={topThree[0]} rank={1} size="lg" />}
                </div>
                <div className="flex justify-center order-3 min-w-0">{topThree[2] && <PodiumCard item={topThree[2]} rank={3} />}</div>
              </div>
            </div>
          )}

          {currentUser && (
            <div className="card border-primary/25" style={{ background: 'var(--grad-primary-soft)' }}>
              <div className="flex items-center gap-4 flex-wrap">
                <div className="relative">
                  <Avatar w={60} frame={currentUser.currentFrame} avatar={currentUser.avatar} />
                  <div className="absolute -bottom-1 -right-1 bg-gradient-to-br from-yellow-400 to-amber-500 text-white text-xs font-bold rounded-full w-7 h-7 flex items-center justify-center shadow-lg border-2 border-white">
                    {currentUser.rank}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-800 text-lg truncate">
                    <AnimatedName config={currentUser.currentEffect?.config}>{currentUser.full_name}</AnimatedName>
                  </p>
                  {currentUser.username && <p className="text-sm text-gray-500">@{currentUser.username}</p>}
                </div>
                <div className="ml-auto flex items-center gap-5 sm:gap-8">
                  <div className="text-center">
                    <p className="text-xs text-gray-500 uppercase tracking-wide">{t('lb.myRank')}</p>
                    <p className="text-2xl font-bold text-primary">#{currentUser.rank}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-gray-500 uppercase tracking-wide">{t('lb.points')}</p>
                    <p className="text-2xl font-bold text-gray-800">{fmtNum(scoreOf(currentUser, period))}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="card flush">
            {rest.length === 0 && topThree.length === 0 ? (
              <div className="p-12 text-center">
                <FaTrophy className="text-5xl mx-auto mb-4 text-gray-300" />
                <p className="text-gray-500 text-lg">{t('lb.noData')}</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {rest.map((player) => (
                  <div
                    key={player.id}
                    onClick={() => navigate(player.id === user?.id ? '/profile' : `/players/${player.id}`)}
                    className="list-row tap gap-4 py-4"
                    role="row"
                  >
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${rankColors[player.rank] || 'text-gray-500 bg-gray-50'}`}>
                      #{player.rank}
                    </div>
                    <Avatar w={48} frame={player.currentFrame} avatar={player.avatar} />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-800 truncate text-base">
                        <AnimatedName config={player.currentEffect?.config}>{player.full_name}</AnimatedName>
                      </p>
                      <div className="flex items-center gap-2 text-sm text-gray-500 mt-0.5">
                        {player.username && <span>@{player.username}</span>}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="font-bold text-gray-800 text-lg">{fmtNum(scoreOf(player, period))}</p>
                      <p className="text-xs text-gray-400">{t('lb.points')}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {totalPages > 1 && (
            <Pagination page={page} total={totalPages} pageSize={1} onChange={setPage} />
          )}
      </>
      </div>
    </>
  );
}
