import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2, UserMinus, UserPlus, Users, X } from 'lucide-react';
import { useGet, useInvalidate } from '../../api/hooks.js';
import { Fetch, errorMessage } from '../../api/fetcher.js';
import { useToast } from '../../context/ToastContext.jsx';
import { AnimatedName, Avatar, Button, Card, ConfirmDialog, EmptyState, SkeletonRow } from '../../components/ui.jsx';
import OnlineActivity from '../../components/OnlineActivity.jsx';
import { TopBar } from '../../layouts/Layouts.jsx';
import { fmtDate, fmtDateTime, fmtDuration, fmtNum } from '../../utils/format.js';

function PresenceLabel({ profile, t }) {
  if (profile.online) {
    return (
      <span className="inline-flex items-center gap-2 text-success font-bold text-sm">
        <span className="w-2.5 h-2.5 rounded-full bg-success animate-pulse" />
        {t('publicProfile.onlineFor', { duration: fmtDuration(profile.currentOnlineSeconds) })}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2 text-muted font-semibold text-sm">
      <span className="w-2.5 h-2.5 rounded-full bg-slate-300" />
      {profile.lastSeenAt
        ? t('publicProfile.lastSeen', { time: fmtDateTime(profile.lastSeenAt) })
        : t('friends.offline')}
    </span>
  );
}

export default function PublicProfile() {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const invalidate = useInvalidate();
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const { data: profile, isLoading, error, mutate } = useGet(`/user/players/${id}`, {
    fallbackData: null,
    refreshInterval: 30_000,
  });

  const sendRequest = async () => {
    setBusy(true);
    try {
      await Fetch.post('/user/friends/requests', { userId: id });
      toast.success(t('friends.requestSent'));
      await mutate();
      invalidate('/user/friends');
    } catch (requestError) {
      toast.error(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  };

  const acceptRequest = async () => {
    if (!profile?.friendRequestId) return;
    setBusy(true);
    try {
      await Fetch.post(`/user/friends/requests/${profile.friendRequestId}/respond`, { accept: true });
      toast.success(t('friends.accept'));
      await mutate();
      invalidate('/user/friends');
    } catch (requestError) {
      toast.error(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  };

  const removeFriend = async () => {
    setBusy(true);
    try {
      await Fetch.del(`/user/friends/${id}`);
      setConfirmRemove(false);
      toast.success(t('common.done'));
      await mutate();
      invalidate('/user/friends');
    } catch (requestError) {
      toast.error(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  };

  if (isLoading && !profile) {
    return (
      <>
        <TopBar title={t('publicProfile.title')} back />
        <div className="page pt-4 space-y-[var(--gap)]">
          <div className="skeleton h-48 rounded-2xl" />
          <Card><SkeletonRow /><SkeletonRow /><SkeletonRow /></Card>
        </div>
      </>
    );
  }

  if (!profile || error) {
    return (
      <>
        <TopBar title={t('publicProfile.title')} back />
        <div className="page pt-4"><Card><EmptyState icon={X} title={t('publicProfile.notFound')} action={<Button onClick={() => navigate('/friends')}>{t('common.back')}</Button>} /></Card></div>
      </>
    );
  }

  const friendAction = profile.relation === 'self' ? (
    <Link to="/profile"><Button variant="soft">{t('publicProfile.editOwnProfile')}</Button></Link>
  ) : profile.relation === 'none' ? (
    <Button onClick={sendRequest} loading={busy}><UserPlus size={16} /> {t('friends.addFriend')}</Button>
  ) : profile.relation === 'incoming' ? (
    <Button onClick={acceptRequest} loading={busy}><UserPlus size={16} /> {t('friends.accept')}</Button>
  ) : profile.relation === 'outgoing' ? (
    <Button variant="soft" disabled><Loader2 size={15} /> {t('publicProfile.requestPending')}</Button>
  ) : (
    <Button variant="outline" onClick={() => setConfirmRemove(true)} disabled={busy}><UserMinus size={16} /> {t('friends.remove')}</Button>
  );

  return (
    <>
      <TopBar title={profile.full_name} back />
      <div className="page pt-4 space-y-[var(--gap)]">
        <Card className="p-0 overflow-hidden">
          <div className="relative h-36 sm:h-48 bg-gradient-to-r from-violet-700 via-primary to-indigo-600">
            {profile.coverImage && <img src={profile.coverImage} alt="" className="absolute inset-0 w-full h-full object-cover" />}
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/10 to-transparent" />
          </div>
          <div className="relative px-4 sm:px-6 pb-5 -mt-12 sm:-mt-14">
            <div className="flex flex-col sm:flex-row sm:items-end gap-3 sm:gap-4">
              <Avatar w={104} avatar={profile.avatar} frame={profile.currentFrame} />
              <div className="min-w-0 flex-1 sm:pb-1">
                <div className="text-[22px] sm:text-[27px] leading-tight font-extrabold tracking-tight">
                  <AnimatedName config={profile.currentEffect?.config}>{profile.full_name}</AnimatedName>
                </div>
                <div className="text-muted text-sm mt-1">{profile.username ? `@${profile.username}` : ''}</div>
                <div className="mt-2"><PresenceLabel profile={profile} t={t} /></div>
              </div>
              <div className="sm:pb-1">{friendAction}</div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-5">
              {[
                { label: t('publicProfile.score'), value: fmtNum(profile.score) },
                { label: t('publicProfile.rank'), value: `#${fmtNum(profile.rank)}` },
                { label: t('publicProfile.friends'), value: fmtNum(profile.friendsCount) },
                { label: t('publicProfile.memberSince'), value: fmtDate(profile.createdAt) },
              ].map((stat) => (
                <div key={stat.label} className="rounded-xl bg-surface-2 px-3 py-3 min-w-0">
                  <div className="font-extrabold text-[16px] truncate">{stat.value}</div>
                  <div className="text-[11px] text-muted mt-0.5 truncate">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </Card>

        <OnlineActivity activity={profile.activity} />

        <div className="flex flex-wrap gap-2">
          <Link to="/friends" className="inline-flex items-center gap-2 text-sm font-bold text-primary hover:underline">
            <Users size={16} /> {t('friends.title')}
          </Link>
        </div>
      </div>

      <ConfirmDialog
        open={confirmRemove}
        title={t('friends.remove')}
        message={t('publicProfile.removeConfirm', { name: profile.full_name })}
        danger
        onClose={() => setConfirmRemove(false)}
        onConfirm={removeFriend}
        loading={busy}
      />
    </>
  );
}
