// O'YIN LOBBI — ochiq (public) o'yinlar ro'yxati, bitta bosishda qo'shilish
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Calculator, Grid3x3, Swords, Keyboard, Code2, Users, RefreshCw, Radio,
} from 'lucide-react';
import { useGet } from '../../api/hooks.js';
import { useToast } from '../../context/ToastContext.jsx';
import {
  Card, Button, EmptyState, Segmented, Avatar, CoinBadge, SkeletonRow,
} from '../../components/ui.jsx';
import { TopBar } from '../../layouts/Layouts.jsx';
import { fmtInt } from '../../utils/format.js';
import { initAudio, sounds } from '../../utils/sound.js';

const TYPE_META = {
  math: { icon: Calculator, color: '#5b21b6', bg: '#f0eafd', key: 'lobby.math' },
  tictactoe: { icon: Grid3x3, color: '#16a34a', bg: '#e6f7ec', key: 'lobby.tictactoe' },
  chess: { icon: Swords, color: '#b45309', bg: '#fdf3d7', key: 'lobby.chess' },
  typerace: { icon: Keyboard, color: '#0284c7', bg: '#e4f4fd', key: 'lobby.typerace' },
  codebattle: { icon: Code2, color: '#7c3aed', bg: '#f3eefe', key: 'lobby.codebattle' },
};

const JOIN_ROUTE = {
  math: '/game/math?join=',
  tictactoe: '/game/ttt?join=',
  chess: '/game/chess?join=',
  typerace: '/game/typerace?code=',
  codebattle: '/game/codebattle?code=',
};

export default function Lobby() {
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const [filter, setFilter] = useState('all');

  const { data: rooms, isLoading, mutate } = useGet('/games/lobby', {
    fallbackData: null,
    refreshInterval: 5000, // har 5 soniyada yangilash
  });

  const join = (room) => {
    initAudio();
    sounds.select();
    navigate(`${JOIN_ROUTE[room.type]}${room.gameId}`);
  };

  const metaLine = (room) => {
    const parts = [];
    if (room.type === 'math') {
      parts.push(t(`math.difficulty${room.difficulty === 'easy' ? 'Easy' : room.difficulty === 'normal' ? 'Normal' : room.difficulty === 'hard' ? 'Hard' : 'VeryHard'}`));
      parts.push(`${room.rounds}x`);
    }
    if (room.type === 'tictactoe') parts.push(`${room.rounds}x`);
    if (room.type === 'chess') parts.push(room.timeControl > 0 ? `${room.timeControl}s` : t('lobby.noTime'));
    if (room.type === 'typerace') parts.push(room.lang?.toUpperCase());
    if (room.type === 'codebattle') parts.push(room.category?.toUpperCase());
    if (room.players !== undefined) parts.push(`${room.players}${room.maxPlayers ? `/${room.maxPlayers}` : ''}`);
    return parts.join(' • ');
  };

  const shown = (rooms || []).filter((r) => filter === 'all' || r.type === filter);

  return (
    <>
      <TopBar
        title={t('lobby.title')}
        right={
          <button
            className="btn ghost sm"
            onClick={() => { sounds.click(); mutate(); }}
            aria-label={t('common.refresh')}
          >
            <RefreshCw size={16} />
          </button>
        }
      />
      <div className="page pt-3.5">
        {/* Jonli ko'rsatkich */}
        <div className="flex items-center gap-2 mb-3">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-60" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-success" />
          </span>
          <span className="text-[12.5px] font-bold text-muted">
            {t('lobby.live')} • {shown.length} {t('lobby.roomsOpen')}
          </span>
        </div>

        {/* Filtr */}
        <Segmented
          value={filter}
          onChange={(v) => { sounds.click(); setFilter(v); }}
          scroll
          className="mb-3.5"
          options={[
            { value: 'all', label: t('common.all') },
            { value: 'math', label: t('lobby.math') },
            { value: 'tictactoe', label: t('lobby.tictactoe') },
            { value: 'chess', label: t('lobby.chess') },
            { value: 'typerace', label: t('lobby.typerace') },
            { value: 'codebattle', label: t('lobby.codebattle') },
          ]}
        />

        {isLoading ? (
          <Card className="p-0 -my-1.5">
            {[1, 2, 3].map((i) => <SkeletonRow key={i} />)}
          </Card>
        ) : shown.length === 0 ? (
          <Card>
            <EmptyState
              icon={Radio}
              title={t('lobby.empty')}
              sub={t('lobby.emptyHint')}
            />
          </Card>
        ) : (
          <div className="flex flex-col gap-2.5">
            {shown.map((room) => {
              const meta = TYPE_META[room.type] || TYPE_META.math;
              const Icon = meta.icon;
              return (
                <Card key={`${room.type}-${room.gameId}`} className="p-3.5 flex items-center gap-3">
                  <div className="w-[50px] h-[50px] rounded-[16px] flex items-center justify-center shrink-0" style={{ background: meta.bg }}>
                    <Icon size={24} color={meta.color} strokeWidth={2.2} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-extrabold text-[14.5px]">{t(meta.key)}</span>
                      {room.bet > 0 && <CoinBadge value={fmtInt(room.bet)} size={12} />}
                    </div>
                    <div className="text-[12px] text-muted mt-0.5 truncate flex items-center gap-1.5">
                      <Avatar w={16} avatar={room.host?.avatar} frame={room.host?.currentFrame} />
                      <span className="truncate">{room.host?.full_name || '—'}</span>
                      <span>•</span>
                      <span className="truncate">{metaLine(room)}</span>
                    </div>
                  </div>
                  <Button size="sm" onClick={() => join(room)}>
                    <Users size={14} /> {t('lobby.join')}
                  </Button>
                </Card>
              );
            })}
          </div>
        )}

        <div className="text-center mt-4">
          <div className="text-[12px] text-muted font-semibold">
            {t('lobby.createHint')}
          </div>
        </div>
      </div>
    </>
  );
}
