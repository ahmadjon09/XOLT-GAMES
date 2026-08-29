// QuickPlay — "TEZ O'YIN" tugmasi: bitta bosishda raqib topish
// Ochiq (public, bet-siz) kutayotgan o'yin bo'lsa — unga qo'shiladi,
// bo'lmasa — yangi ochiq o'yin yaratadi. Bolalar uchun o'yin boshlash
// ni bitta tugmaga aylantiradi.
import { useTranslation } from 'react-i18next';
import { Zap } from 'lucide-react';
import { useGet } from '../api/hooks.js';
import { useAuth } from '../context/AuthContext.jsx';
import { initAudio, sounds } from '../utils/sound.js';

export default function QuickPlay({ type, onQuickJoin, onQuickCreate }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data: rooms } = useGet('/games/lobby', { fallbackData: [], refreshInterval: 8000 });

  const list = Array.isArray(rooms) ? rooms : [];
  // o'zimiz yaratgan o'yinlarimizga qo'shila olmaymiz — o'tkazib yuboramiz
  const openRoom = list.find(
    (r) => r.type === type && !r.bet && r.host?.id && r.host.id !== user?.id
  );

  const go = () => {
    initAudio();
    sounds.opponentFound();
    if (openRoom) onQuickJoin(openRoom.gameId);
    else onQuickCreate();
  };

  return (
    <button
      onClick={go}
      className="w-full rounded-[18px] px-4 py-3.5 flex items-center gap-3.5 text-white font-extrabold active:scale-[.98] transition-transform"
      style={{ background: 'var(--grad-primary)', boxShadow: 'var(--glow-primary)' }}
    >
      <span
        className="w-11 h-11 rounded-[14px] bg-white/20 flex items-center justify-center shrink-0"
        style={{ backdropFilter: 'blur(4px)' }}
      >
        <Zap size={22} strokeWidth={2.4} />
      </span>
      <span className="text-left min-w-0 flex-1">
        <span className="block text-[15.5px] tracking-tight">{t('game.quickPlay')}</span>
        <span className="block text-[11.5px] font-semibold text-white/80 leading-snug mt-0.5">
          {openRoom ? t('game.quickJoinHint') : t('game.quickCreateHint')}
        </span>
      </span>
    </button>
  );
}
