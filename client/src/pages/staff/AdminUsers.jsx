// Admin: review OAuth-created players, edit public profile details, and manage coins.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Users, Pencil, Trash2, RefreshCw, ChevronRight } from 'lucide-react';
import { Fetch, errorMessage } from '../../api/fetcher.js';
import { useGetMeta, useInvalidate } from '../../api/hooks.js';
import { useToast } from '../../context/ToastContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import {
  Card, Button, Input, Field, EmptyState, Avatar, AnimatedName, Sheet, ConfirmDialog,
  PageHeader, IconButton, SearchInput, Pagination, SkeletonRow,
} from '../../components/ui.jsx';
import CoinSheet, { CoinButton } from '../../components/CoinSheet.jsx';
import { fmtNum } from '../../utils/format.js';
import { TopBar } from '../../layouts/Layouts.jsx';

export default function AdminUsers() {
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const invalidate = useInvalidate();
  const { user: me } = useAuth();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ full_name: '', username: '' });
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [coinTarget, setCoinTarget] = useState(null);
  const [busy, setBusy] = useState(false);
  const cacheKey = `/staff/users?search=${encodeURIComponent(search)}&page=${page}&limit=20`;
  const { data: result, isLoading, error } = useGetMeta(cacheKey);
  const users = result?.data || [];
  const total = result?.meta?.total || 0;
  const isAdmin = me?.role === 'ADMIN';

  const refresh = () => invalidate(cacheKey);
  const openEdit = (player) => {
    setEditing(player);
    setForm({ full_name: player.full_name || '', username: player.username || '' });
    setEditOpen(true);
  };

  const save = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      await Fetch.patch(`/staff/users/${editing.id}`, {
        full_name: form.full_name.trim(),
        username: form.username.trim() || null,
      });
      toast.success(t('usersP.userUpdated'));
      setEditOpen(false);
      invalidate(cacheKey);
      invalidate(`/staff/users/${editing.id}`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await Fetch.del(`/staff/users/${deleteTarget.id}`);
      toast.success(t('usersP.userDeleted'));
      setDeleteTarget(null);
      invalidate(cacheKey);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <TopBar title={t('usersP.title')} back />
      <div className="page-staff pt-4">
        <PageHeader
          icon={Users}
          title={t('usersP.title')}
          count={total}
          actions={<IconButton icon={RefreshCw} label={t('common.refresh')} onClick={refresh} loading={busy} />}
        />
        <SearchInput
          placeholder={t('usersP.searchUser')}
          value={search}
          onChange={(event) => { setSearch(event.target.value); setPage(1); }}
          disabled={busy}
          className="mb-3.5"
        />

        {isLoading && !result ? (
          <Card className="p-0 -my-1.5">{[1, 2, 3, 4].map((i) => <SkeletonRow key={i} />)}</Card>
        ) : error ? (
          <Card className="p-8 text-center text-danger">
            <p>{t('common.serverError')}</p>
            <Button variant="soft" className="mt-4" onClick={refresh}>{t('common.retry')}</Button>
          </Card>
        ) : users.length === 0 ? (
          <Card><EmptyState icon={Users} title={t('usersP.noUsers')} /></Card>
        ) : (
          <Card className="p-0 -my-1.5">
            {users.map((player) => (
              <div
                key={player.id}
                onClick={() => navigate(`/staff/users/${player.id}`)}
                className="flex items-center gap-3.5 px-4 py-3.5 hover:bg-surface-2/60 transition-colors cursor-pointer border-b border-border last:border-b-0"
              >
                <Avatar w={46} avatar={player.avatar} frame={player.currentFrame} />
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-[14.5px] truncate"><AnimatedName config={player.currentEffect?.config}>{player.full_name}</AnimatedName></div>
                  <div className="text-[12.5px] text-muted truncate">
                    {player.username ? `@${player.username}` : player.email || player.phone || '—'}
                  </div>
                </div>
                <span className="hidden sm:inline text-xs text-muted tabular-nums">{fmtNum(player.score)} {t('common.score')}</span>
                <div className="flex items-center gap-1 shrink-0">
                  <span className="badge warn">{fmtNum(player.coin)}</span>
                  <CoinButton title={t('coins.manage')} onClick={(event) => { event.stopPropagation(); setCoinTarget(player); }} disabled={busy} />
                  <IconButton icon={Pencil} label={t('common.edit')} onClick={(event) => { event.stopPropagation(); openEdit(player); }} disabled={busy} />
                  {isAdmin && <IconButton icon={Trash2} label={t('common.delete')} danger onClick={(event) => { event.stopPropagation(); setDeleteTarget(player); }} disabled={busy} />}
                  <ChevronRight size={18} className="text-muted shrink-0" />
                </div>
              </div>
            ))}
          </Card>
        )}

        <Pagination page={page} total={total} pageSize={20} onChange={setPage} />

        <Sheet open={editOpen} onClose={() => setEditOpen(false)} title={t('usersP.editPlayer')}>
          <Field label={t('common.name')}>
            <Input value={form.full_name} onChange={(event) => setForm({ ...form, full_name: event.target.value })} disabled={busy} />
          </Field>
          <Field label={t('profile.username')}>
            <Input value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} placeholder="username" disabled={busy} />
          </Field>
          <p className="text-xs text-muted">{t('auth.oauthPrivacy')}</p>
          <Button className="w-full" loading={busy} onClick={save}>{t('common.save')}</Button>
        </Sheet>

        <CoinSheet open={!!coinTarget} user={coinTarget} canTake onClose={() => setCoinTarget(null)} onDone={refresh} />
        <ConfirmDialog
          open={!!deleteTarget}
          title={t('usersP.deletePlayer')}
          message={`${deleteTarget?.full_name} — ${t('usersP.confirmDeleteUser')}`}
          danger
          onClose={() => setDeleteTarget(null)}
          onConfirm={remove}
          loading={busy}
        />
      </div>
    </>
  );
}
