import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Store, Frame as FrameIcon, Sparkles, Check } from 'lucide-react';
import { Fetch, errorMessage } from '../../api/fetcher.js';
import { useGet, useInvalidate } from '../../api/hooks.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { Card, Button, EmptyState, CoinBadge, CoinIcon, Avatar, AnimatedName, Segmented, ConfirmDialog, SkeletonGrid, AutoGrid } from '../../components/ui.jsx';
import { TopBar } from '../../layouts/Layouts.jsx';
import { sounds } from '../../utils/sound.js';

const rarityColors = {
  common: '#64748b',
  uncommon: '#0ea5e9',
  rare: '#8b5cf6',
  epic: '#e34c6b',
  legendary: '#f59e0b',
};

export default function Shop() {
  const { t } = useTranslation();
  const toast = useToast();
  const { user, refresh } = useAuth();
  const [tab, setTab] = useState('frames');
  const [buying, setBuying] = useState(null);
  const [equipping, setEquipping] = useState(null); // itemId or 'none'
  const [confirmItem, setConfirmItem] = useState(null);
  const invalidate = useInvalidate();

  const { data } = useGet('/user/shop');

  if (!data) return (
    <>
      <TopBar title={t('shop.title')} right={<CoinBadge value={user?.coin} />} />
      <div className="page pt-4 space-y-[var(--gap)]">
        <div className="skeleton h-[54px]" style={{ borderRadius: 'var(--r-sm)' }} />
        <SkeletonGrid count={6} col={200} h={230} />
      </div>
    </>
  );

  const isFrame = tab === 'frames';
  const items = isFrame ? data.frames : data.effects;
  const owned = isFrame ? data.ownedFrameIds : data.ownedEffectIds;
  const current = isFrame ? data.currentFrame : data.currentEffect;

  // any operation in progress?
  const anyLoading = buying !== null || equipping !== null;

  const buy = async (item) => {
    setBuying(item.id);
    try {
      await Fetch.post('/user/shop/buy', { type: isFrame ? 'frame' : 'effect', itemId: item.id });
      sounds.correct();
      toast.success(t('shop.buySuccess'));
      await refresh();
      invalidate('/user/shop');
    } catch (e) {
      sounds.wrong();
      toast.error(errorMessage(e));
    } finally {
      setBuying(null);
    }
  };

  const equip = async (itemId) => {
    setEquipping(itemId);
    try {
      await Fetch.post('/user/shop/equip', { type: isFrame ? 'frame' : 'effect', itemId });
      sounds.click();
      await refresh();
      invalidate('/user/shop');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setEquipping(null);
    }
  };

  return (
    <>
      <TopBar title={t('shop.title')} />
      <div className="page pt-4 space-y-[var(--gap)]">
        <div className="lg:max-w-[520px]">
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { value: 'frames', label: `${t('shop.frames')} (${data.frames.length})` },
              { value: 'effects', label: `${t('shop.effects')} (${data.effects.length})` },
            ]}
          />
        </div>

        {items.length === 0 ? (
          <Card><EmptyState icon={isFrame ? FrameIcon : Sparkles} title={isFrame ? t('shop.noFrames') : t('shop.noEffects')} /></Card>
        ) : (
          <AutoGrid col={200}>
            {items.map((item) => {
              const isOwned = owned.includes(item.id);
              const isCurrent = current?.id === item.id;
              return (
                <Card key={item.id} className="h-full flex flex-col gap-3">
                  <div className="flex items-center justify-center py-2.5 min-h-[104px] bg-surface-2" style={{ borderRadius: 'var(--r-md)' }}>
                    {isFrame ? (
                      <Avatar w={84} avatar={user?.avatar} frame={item.image} />
                    ) : (
                      <div className="text-center">
                        <AnimatedName config={item.config}><span className="text-[17px] font-extrabold">{user?.full_name?.split(' ')[0] || 'Name'}</span></AnimatedName>
                        <div className="text-[11px] text-muted mt-1.5">{t('shop.effectDesc')}</div>
                      </div>
                    )}
                  </div>

                  <div className="text-center">
                    <div className="font-extrabold text-[14px]">{item.name}</div>
                    <div className="text-[11.5px] font-bold" style={{ color: rarityColors[item.rarity] || 'var(--color-muted)' }}>
                      {t(`shop.rarity_${item.rarity || 'common'}`)}
                    </div>
                  </div>

                  {isCurrent ? (
                    <Button
                      variant="success-soft"
                      className="w-full"
                      size="sm"
                      loading={equipping === 'none'}
                      disabled={anyLoading && equipping !== 'none'}
                      onClick={() => equip('none')}
                    >
                      <Check size={15} /> {t('shop.equipped')}
                    </Button>
                  ) : isOwned ? (
                    <Button
                      variant="soft"
                      className="w-full"
                      size="sm"
                      loading={equipping === item.id}
                      disabled={anyLoading && equipping !== item.id}
                      onClick={() => equip(item.id)}
                    >
                      {t('shop.equip')}
                    </Button>
                  ) : (
                    <Button
                      variant={item.price === 0 ? 'success' : 'primary'}
                      className="w-full"
                      size="sm"
                      loading={buying === item.id}
                      disabled={anyLoading && buying !== item.id}
                      onClick={() => (item.price === 0 ? buy(item) : setConfirmItem(item))}
                    >
                      <CoinIcon size={15} /> {item.price === 0 ? t('common.free') : item.price}
                    </Button>
                  )}
                </Card>
              );
            })}
          </AutoGrid>
        )}
      </div>

      <ConfirmDialog
        open={!!confirmItem}
        title={t('shop.buyConfirm')}
        message={`${confirmItem?.name} — ${confirmItem?.price} ${t('common.coins')}`}
        onClose={() => setConfirmItem(null)}
        onConfirm={() => {
          const item = confirmItem;
          setConfirmItem(null);
          buy(item);
        }}
        confirmText={t('shop.buy')}
      />
    </>
  );
}