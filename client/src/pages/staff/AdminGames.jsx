import { useState } from 'react';
import {
  Calculator, Code2, Disc3, Grid3x3, Keyboard, ListChecks, RefreshCw, Swords,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Fetch, errorMessage } from '../../api/fetcher.js';
import { useGet, useInvalidate } from '../../api/hooks.js';
import { useToast } from '../../context/ToastContext.jsx';
import { Card, PageHeader, Toggle, SkeletonRow, PageError } from '../../components/ui.jsx';
import { TopBar } from '../../layouts/Layouts.jsx';

const GAME_META = {
  math: { icon: Calculator, color: '#5b21b6', bg: '#f0eafd' },
  quiz: { icon: ListChecks, color: '#e34c6b', bg: '#fdeef1' },
  tictactoe: { icon: Grid3x3, color: '#16a34a', bg: '#e6f7ec' },
  chess: { icon: Swords, color: '#b45309', bg: '#fdf3d7' },
  checkers: { icon: Disc3, color: '#dc2626', bg: '#fdeaea' },
  typerace: { icon: Keyboard, color: '#0284c7', bg: '#e4f4fd' },
  codebattle: { icon: Code2, color: '#7c3aed', bg: '#f3eefe' },
};

export default function AdminGames() {
  const { t } = useTranslation();
  const toast = useToast();
  const invalidate = useInvalidate();
  const [saving, setSaving] = useState('');
  const { data: games, isLoading, error, mutate } = useGet('/staff/games', { fallbackData: [] });

  const toggleGame = async (game) => {
    setSaving(game.id);
    try {
      await Fetch.patch(`/staff/games/${game.id}`, { active: !game.active });
      toast.success(t('adminGames.saved'));
      await Promise.all([mutate(), invalidate('/games/catalog')]);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving('');
    }
  };

  return (
    <>
      <TopBar title={t('adminGames.title')} back />
      <div className="page-staff pt-4 space-y-3.5">
        <PageHeader icon={ListChecks} title={t('adminGames.title')} sub={t('adminGames.description')} />
        {isLoading && !games?.length ? (
          <Card className="p-0 -my-1.5">{[1, 2, 3, 4].map((i) => <SkeletonRow key={i} />)}</Card>
        ) : error ? (
          <PageError onRetry={() => mutate()} />
        ) : !games?.length ? (
          <Card className="text-center text-muted">{t('adminGames.empty')}</Card>
        ) : (
          <Card className="p-0 -my-1.5">
            {games.map((game) => {
              const meta = GAME_META[game.id] || GAME_META.math;
              const Icon = meta.icon;
              return (
                <div key={game.id} className="flex items-center gap-3.5 px-4 py-3.5 border-b border-border last:border-b-0">
                  <div className="w-11 h-11 rounded-[14px] flex items-center justify-center shrink-0" style={{ color: meta.color, background: meta.bg }}>
                    <Icon size={22} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-[14.5px] truncate">{t(`gameTypes.${game.id}`)}</div>
                    <div className={`text-[12px] font-semibold mt-0.5 ${game.active ? 'text-success' : 'text-muted'}`}>
                      {game.active ? t('adminGames.active') : t('adminGames.inactive')}
                    </div>
                  </div>
                  <Toggle checked={game.active} onChange={() => toggleGame(game)} disabled={saving === game.id} />
                </div>
              );
            })}
          </Card>
        )}
        <div className="flex justify-end">
          <button className="btn soft sm" onClick={() => mutate()} disabled={Boolean(saving)}>
            <RefreshCw size={15} /> {t('common.refresh')}
          </button>
        </div>
      </div>
    </>
  );
}
