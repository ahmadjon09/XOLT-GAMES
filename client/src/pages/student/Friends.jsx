import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Check, Gamepad2, Search, UserPlus, Users, X } from 'lucide-react';
import { Fetch, errorMessage } from '../../api/fetcher.js';
import { useGet, useInvalidate } from '../../api/hooks.js';
import { useSocket } from '../../context/SocketContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { Avatar, Button, Card, EmptyState, Select, SkeletonRow, ConfirmDialog } from '../../components/ui.jsx';
import { TopBar } from '../../layouts/Layouts.jsx';
import { fmtDuration } from '../../utils/format.js';

const GAME_ROUTES = {
  math: '/game/math',
  quiz: '/quiz/host',
  tictactoe: '/game/ttt',
  chess: '/game/chess',
  checkers: '/game/checkers',
  typerace: '/game/typerace',
  codebattle: '/game/codebattle',
};

function PlayerStatus({ online, currentOnlineSeconds = 0, t }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold ${online ? 'text-success' : 'text-muted'}`}>
      <span className={`w-2 h-2 rounded-full ${online ? 'bg-success' : 'bg-slate-300'}`} />
      {online ? t('friends.onlineFor', { duration: fmtDuration(currentOnlineSeconds) }) : t('friends.offline')}
    </span>
  );
}

export default function Friends() {
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const invalidate = useInvalidate();
  const { socket } = useSocket();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedGame, setSelectedGame] = useState('');
  const [incomingInvite, setIncomingInvite] = useState(null);
  const [removeTarget, setRemoveTarget] = useState(null);
  const [busyId, setBusyId] = useState('');
  const [removing, setRemoving] = useState(false);

  const { data, isLoading, mutate } = useGet('/user/friends', { fallbackData: null, refreshInterval: 60_000 });
  const { data: gameCatalog } = useGet('/games/catalog', { fallbackData: [], dedupingInterval: 30_000 });
  const { data: searchResults, isLoading: searching } = useGet(
    debouncedSearch.length >= 2 ? `/user/players/search?q=${encodeURIComponent(debouncedSearch)}` : null,
    { fallbackData: [], dedupingInterval: 3_000 },
  );

  const activeGames = useMemo(() => gameCatalog || [], [gameCatalog]);
  const friends = data?.friends || [];
  const incomingRequests = data?.incomingRequests || [];
  const outgoingRequests = data?.outgoingRequests || [];
  const pendingInvites = data?.incomingGameInvites || [];

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!selectedGame || !activeGames.some((game) => game.id === selectedGame && game.active)) {
      setSelectedGame(activeGames.find((game) => game.active)?.id || '');
    }
  }, [activeGames, selectedGame]);

  useEffect(() => {
    if (!socket) return undefined;
    const onPresence = ({ userId, online }) => {
      mutate((current) => current ? {
        ...current,
        friends: current.friends.map((friend) => friend.id === userId ? { ...friend, online, onlineSince: online ? new Date().toISOString() : null, currentOnlineSeconds: 0 } : friend),
      } : current, false);
    };
    const onInvite = (invite) => {
      setIncomingInvite(invite);
      mutate();
    };
    const onRequest = () => mutate();
    const onRequestAccepted = () => {
      toast.success(t('friends.requestSent'));
      mutate();
      invalidate('/user/players/search');
    };
    const onInviteResponse = ({ status, gameType }) => {
      if (status === 'accepted') {
        toast.success(t('friends.inviteAccepted'));
        const route = GAME_ROUTES[gameType];
        if (route) navigate(route);
      } else if (status === 'declined') {
        toast.info(t('friends.inviteDeclined'));
      }
    };
    socket.on('friend:presence', onPresence);
    socket.on('friend:game_invite', onInvite);
    socket.on('friend:request', onRequest);
    socket.on('friend:request_accepted', onRequestAccepted);
    socket.on('friend:invite_response', onInviteResponse);
    return () => {
      socket.off('friend:presence', onPresence);
      socket.off('friend:game_invite', onInvite);
      socket.off('friend:request', onRequest);
      socket.off('friend:request_accepted', onRequestAccepted);
      socket.off('friend:invite_response', onInviteResponse);
    };
  }, [socket, mutate, toast, t, navigate, invalidate]);

  useEffect(() => {
    if (pendingInvites.length && !incomingInvite) setIncomingInvite(pendingInvites[0]);
  }, [pendingInvites, incomingInvite]);

  const refreshAll = async () => {
    await mutate();
    await invalidate(debouncedSearch.length >= 2 ? `/user/players/search?q=${encodeURIComponent(debouncedSearch)}` : null);
  };

  const sendRequest = async (friend) => {
    setBusyId(friend.id);
    try {
      await Fetch.post('/user/friends/requests', { userId: friend.id });
      toast.success(t('friends.requestSent'));
      await refreshAll();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusyId('');
    }
  };

  const respondRequest = async (request, accept) => {
    setBusyId(request.id);
    try {
      await Fetch.post(`/user/friends/requests/${request.id}/respond`, { accept });
      if (accept) toast.success(t('friends.accept'));
      await refreshAll();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusyId('');
    }
  };

  const sendInvite = async (friend) => {
    if (!selectedGame) return;
    setBusyId(friend.id);
    try {
      await Fetch.post(`/user/friends/${friend.id}/invites`, { gameType: selectedGame });
      toast.success(t('friends.inviteSent'));
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusyId('');
    }
  };

  const respondInvite = async (invite, accept) => {
    setBusyId(invite.id);
    try {
      await Fetch.post(`/user/friends/invites/${invite.id}/respond`, { accept });
      setIncomingInvite(null);
      await mutate();
      if (accept) {
        toast.success(t('friends.inviteAccepted'));
        navigate(GAME_ROUTES[invite.gameType] || '/lobby');
      }
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusyId('');
    }
  };

  const removeFriend = async () => {
    if (!removeTarget) return;
    setRemoving(true);
    try {
      await Fetch.del(`/user/friends/${removeTarget.id}`);
      toast.success(t('common.done'));
      setRemoveTarget(null);
      await refreshAll();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setRemoving(false);
    }
  };

  return (
    <>
      <TopBar title={t('friends.title')} />
      <div className="page pt-4 space-y-[var(--gap)]">
        <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-primary-soft text-primary flex items-center justify-center shrink-0"><Users size={21} /></div>
            <div className="min-w-0"><div className="font-extrabold text-[15px]">{t('friends.title')}</div><div className="text-[12.5px] text-muted">{t('friends.subtitle')}</div></div>
          </div>
          <div className="w-full sm:w-[220px] shrink-0">
            <Select value={selectedGame} onChange={(event) => setSelectedGame(event.target.value)} disabled={!activeGames.length}>
              {activeGames.filter((game) => game.active).map((game) => <option key={game.id} value={game.id}>{t(`gameTypes.${game.id}`)}</option>)}
            </Select>
          </div>
        </Card>

        {incomingInvite && (
          <Card className="border-primary/25 bg-primary-soft/40">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <Avatar w={42} avatar={incomingInvite.from?.avatar} frame={incomingInvite.from?.currentFrame} />
                <div className="min-w-0"><div className="font-extrabold">{incomingInvite.from?.full_name || t('friends.title')}</div><div className="text-sm text-muted">{t('friends.incomingInvite')}: {t(`gameTypes.${incomingInvite.gameType}`)}</div></div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => respondInvite(incomingInvite, true)} loading={busyId === incomingInvite.id}><Check size={15} /> {t('friends.acceptInvite')}</Button>
                <Button size="sm" variant="outline" onClick={() => respondInvite(incomingInvite, false)} disabled={busyId === incomingInvite.id}><X size={15} /> {t('friends.declineInvite')}</Button>
              </div>
            </div>
          </Card>
        )}

        <section>
          <div className="section-title"><div className="t">{t('friends.searchTitle')}</div></div>
          <Card className="space-y-3">
            <label className="flex items-center gap-2 rounded-xl border border-border bg-surface-2 px-3.5 h-12">
              <Search size={17} className="text-muted shrink-0" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('friends.searchPlaceholder')} className="w-full bg-transparent outline-none text-[14px]" />
            </label>
            {debouncedSearch.length < 2 ? (
              <div className="text-sm text-muted px-1">{t('friends.emptySearch')}</div>
            ) : searching && !searchResults?.length ? (
              <div className="divide-y divide-border">{[1, 2].map((row) => <SkeletonRow key={row} />)}</div>
            ) : !searchResults?.length ? (
              <EmptyState icon={Search} title={t('friends.noSearchResults')} />
            ) : (
              <div className="divide-y divide-border">
                {searchResults.map((person) => (
                  <div key={person.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                    <Link to={`/players/${person.id}`} aria-label={t('publicProfile.viewProfile', { name: person.full_name })}><Avatar w={42} avatar={person.avatar} frame={person.currentFrame} /></Link>
                    <div className="min-w-0 flex-1"><Link to={`/players/${person.id}`} className="font-bold truncate hover:text-primary">{person.full_name}</Link><div className="flex items-center gap-2">{person.username && <span className="text-xs text-muted">@{person.username}</span>}<PlayerStatus online={person.online} currentOnlineSeconds={person.currentOnlineSeconds} t={t} /></div></div>
                    {person.relation === 'none' ? <Button size="sm" variant="soft" onClick={() => sendRequest(person)} loading={busyId === person.id}><UserPlus size={15} /> {t('friends.addFriend')}</Button> : (
                      <span className="badge neutral">{person.relation === 'friends' ? t('nav.friends') : person.relation === 'incoming' ? t('friends.incomingRequests') : t('friends.outgoingRequests')}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </section>

        <section>
          <div className="section-title"><div className="t">{t('friends.incomingRequests')}</div>{incomingRequests.length > 0 && <span className="badge neutral">{incomingRequests.length}</span>}</div>
          <Card flush>
            {incomingRequests.length === 0 ? <div className="text-center text-muted py-5 text-sm">{t('friends.noIncoming')}</div> : incomingRequests.map((request) => (
              <div key={request.id} className="flex items-center gap-3 px-4 py-3.5 border-b border-border last:border-0">
                <Link to={`/players/${request.user.id}`} aria-label={t('publicProfile.viewProfile', { name: request.user.full_name })}><Avatar w={42} avatar={request.user.avatar} frame={request.user.currentFrame} /></Link>
                <div className="min-w-0 flex-1"><Link to={`/players/${request.user.id}`} className="font-bold truncate hover:text-primary">{request.user.full_name}</Link><div className="text-xs text-muted">{request.user.username ? `@${request.user.username}` : ''}</div></div>
                <Button size="sm" onClick={() => respondRequest(request, true)} loading={busyId === request.id}><Check size={15} /> {t('friends.accept')}</Button>
                <Button size="sm" variant="outline" onClick={() => respondRequest(request, false)} disabled={busyId === request.id}><X size={15} /> {t('friends.decline')}</Button>
              </div>
            ))}
          </Card>
        </section>

        <section>
          <div className="section-title"><div className="t">{t('friends.title')}</div><span className="badge neutral">{friends.length}</span></div>
          {isLoading && !data ? (
            <Card flush>{[1, 2, 3].map((row) => <SkeletonRow key={row} />)}</Card>
          ) : friends.length === 0 ? (
            <Card><EmptyState icon={Users} title={t('friends.noFriends')} sub={t('friends.searchHint')} /></Card>
          ) : (
            <Card flush>
              {friends.map((friend) => (
                <div key={friend.id} className="flex flex-wrap items-center gap-3 px-4 py-3.5 border-b border-border last:border-0">
                  <Link to={`/players/${friend.id}`} aria-label={t('publicProfile.viewProfile', { name: friend.full_name })}><Avatar w={44} avatar={friend.avatar} frame={friend.currentFrame} /></Link>
                  <div className="min-w-0 flex-1"><Link to={`/players/${friend.id}`} className="font-bold truncate hover:text-primary">{friend.full_name}</Link><div className="flex items-center gap-2">{friend.username && <span className="text-xs text-muted">@{friend.username}</span>}<PlayerStatus online={friend.online} currentOnlineSeconds={friend.currentOnlineSeconds} t={t} /></div></div>
                  <Button size="sm" disabled={!friend.online || !selectedGame || busyId === friend.id} loading={busyId === friend.id} title={!friend.online ? t('friends.onlyOnline') : t('friends.invite')} onClick={() => sendInvite(friend)}><Gamepad2 size={15} /> {t('friends.invite')}</Button>
                  <Button size="sm" variant="ghost" onClick={() => setRemoveTarget(friend)} title={t('friends.remove')}><X size={16} /></Button>
                </div>
              ))}
            </Card>
          )}
        </section>

        {outgoingRequests.length > 0 && (
          <section>
            <div className="section-title"><div className="t">{t('friends.outgoingRequests')}</div><span className="badge neutral">{outgoingRequests.length}</span></div>
            <Card flush>{outgoingRequests.map((request) => <div key={request.id} className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-0"><Avatar w={38} avatar={request.user.avatar} /><div className="font-bold flex-1 truncate">{request.user.full_name}</div><span className="badge neutral">{t('friends.outgoingRequests')}</span></div>)}</Card>
          </section>
        )}
      </div>
      <ConfirmDialog open={!!removeTarget} title={t('friends.remove')} message={removeTarget?.full_name} danger onClose={() => setRemoveTarget(null)} onConfirm={removeFriend} loading={removing} />
    </>
  );
}
