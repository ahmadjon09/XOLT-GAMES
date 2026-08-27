// Admin: o'quvchilar boshqaruvi - yaratish, tahrirlash, o'chirish, guruhlar
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Users, Plus, Pencil, Trash2, ChevronRight, RefreshCw } from 'lucide-react';
import { Fetch, errorMessage } from '../../api/fetcher.js';
import { useGetMeta, useGet, useInvalidate } from '../../api/hooks.js';
import { useToast } from '../../context/ToastContext.jsx';
import {
  Card, Button, Input, Field, EmptyState, Avatar, AnimatedName,
  Sheet, ConfirmDialog, Badge, PageHeader, IconButton, SearchInput, PhoneInput, Pagination, SkeletonRow,
} from '../../components/ui.jsx';
import { fmtNum, fmtPhone } from '../../utils/format.js';

export default function AdminUsers() {
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const invalidate = useInvalidate();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ full_name: '', phone: '', password: '', username: '', groupIds: [] });
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  // SWR cache (search/page o'zgarsa yangi key)
  const { data: userPage, isLoading, error } = useGetMeta(
    `/staff/users?search=${encodeURIComponent(search)}&page=${page}&limit=20`
  );
  const users = userPage?.data;
  const meta = userPage?.meta || { total: 0 };

  const { data: groups } = useGet('/staff/groups', { fallbackData: [] });

  const refresh = () => {
    invalidate(`/staff/users?search=${encodeURIComponent(search)}&page=${page}&limit=20`);
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ full_name: '', phone: '', password: '', username: '', groupIds: [] });
    setEditorOpen(true);
  };

  const openEdit = (u) => {
    setEditing(u);
    setForm({ full_name: u.full_name, phone: u.phone, password: '', username: u.username || '', groupIds: u.groups.map((g) => g.id) });
    setEditorOpen(true);
  };

  const save = async () => {
    setBusy(true);
    try {
      if (editing) {
        await Fetch.patch(`/staff/users/${editing.id}`, {
          full_name: form.full_name,
          username: form.username || null,
          password: form.password || undefined,
          groupIds: form.groupIds,
        });
        toast.success(t('usersP.userUpdated'));
      } else {
        await Fetch.post('/staff/users', {
          full_name: form.full_name,
          phone: form.phone,
          password: form.password,
          username: form.username || null,
          groupIds: form.groupIds,
        });
        toast.success(t('usersP.userCreated'));
      }
      setEditorOpen(false);
      refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await Fetch.del(`/staff/users/${deleteTarget.id}`);
      toast.success(t('usersP.userDeleted'));
      setDeleteTarget(null);
      refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const toggleGroup = (gid) => {
    setForm((f) => ({
      ...f,
      groupIds: f.groupIds.includes(gid) ? f.groupIds.filter((x) => x !== gid) : [...f.groupIds, gid],
    }));
  };

  return (
    <div className="page-staff pt-4">
      {/* Header */}
      <PageHeader
        icon={Users}
        title={t('usersP.title')}
        count={meta.total}
        actions={
          <>
            <IconButton icon={RefreshCw} label={t('common.refresh')} onClick={refresh} loading={busy} />
            <Button size="sm" onClick={openCreate} disabled={busy}>
              <Plus size={16} /> {t('usersP.createStudent')}
            </Button>
          </>
        }
      />

      {/* Qidiruv */}
      <SearchInput
        placeholder={t('usersP.searchUser')}
        value={search}
        onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        disabled={busy}
        className="mb-3.5"
      />

      {/* Content */}
      {isLoading && !users ? (
        <Card className="p-0 -my-1.5">
          {[1, 2, 3, 4].map((i) => <SkeletonRow key={i} />)}
        </Card>
      ) : error ? (
        <Card className="p-8 text-center text-danger">
          <p>{t('common.serverError')}</p>
          <Button variant="soft" className="mt-4" onClick={refresh}>{t('common.retry')}</Button>
        </Card>
      ) : users?.length === 0 ? (
        <Card>
          <EmptyState
            icon={Users}
            title={t('usersP.noUsers')}
            action={<Button onClick={openCreate} disabled={busy}><Plus size={16} /> {t('usersP.createStudent')}</Button>}
          />
        </Card>
      ) : (
        <Card className="p-0 -my-1.5">
          {users.map((u) => (
            <div
              key={u.id}
              onClick={() => navigate(`/staff/users/${u.id}`)}
              className="flex items-center gap-3.5 px-4 py-3.5 hover:bg-surface-2/60 transition-colors cursor-pointer border-b border-border last:border-b-0"
            >
              <Avatar w={46} avatar={u.avatar} frame={u.currentFrame} />
              <div className="flex-1 min-w-0">
                <div className="font-bold text-[14.5px] truncate">
                  <AnimatedName config={u.currentEffect?.config}>{u.full_name}</AnimatedName>
                </div>
                <div className="text-[12.5px] text-muted truncate flex items-center gap-1.5 flex-wrap">
                  <span className="tabular-nums">{fmtPhone(u.phone)}</span>
                  {u.username && <span>@{u.username}</span>}
                  {u.groups.length > 0 && (
                    <>
                      <span className="text-surface-3">•</span>
                      <span className="truncate">{u.groups.map((g) => g.name).join(', ')}</span>
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Badge color="neutral">{fmtNum(u.coin)}</Badge>
                <IconButton icon={Pencil} label={t('common.edit')} onClick={() => openEdit(u)} disabled={busy} />
                <IconButton icon={Trash2} label={t('common.delete')} danger onClick={() => setDeleteTarget(u)} disabled={busy} />
                <ChevronRight size={18} className="text-muted shrink-0" />
              </div>
            </div>
          ))}
        </Card>
      )}

      {/* Pagination */}
      <Pagination page={page} total={meta.total} pageSize={20} onChange={(p) => setPage(p)} />

      {/* Sheet – create / edit */}
      <Sheet
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        title={editing ? t('usersP.editStudent') : t('usersP.createStudent')}
      >
        <Field label={t('common.name')}>
          <Input
            value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            disabled={busy}
          />
        </Field>
        <Field label={t('common.phone')}>
          <PhoneInput
            value={form.phone}
            onChange={(v) => setForm({ ...form, phone: v })}
            disabled={!!editing || busy}
          />
        </Field>
        <Field label={t('usersP.password')} hint={t('usersP.loginInfo')}>
          <Input
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            placeholder={editing ? '••••' : '1234'}
            disabled={busy}
          />
        </Field>
        <Field label={t('profile.username')}>
          <Input
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            placeholder="@username"
            disabled={busy}
          />
        </Field>
        <Field label={t('usersP.assignGroups')}>
          <div className="flex flex-wrap gap-2">
            {groups.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => toggleGroup(g.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all border-2 ${
                  form.groupIds.includes(g.id)
                    ? 'bg-primary-soft text-primary border-primary'
                    : 'bg-surface-2 text-muted border-transparent hover:bg-surface-3'
                } ${busy ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                disabled={busy}
              >
                {g.name}
              </button>
            ))}
          </div>
        </Field>
        <Button className="w-full" loading={busy} onClick={save} disabled={busy}>
          {t('common.save')}
        </Button>
      </Sheet>

      <ConfirmDialog
        open={!!deleteTarget}
        title={t('usersP.deleteStudent')}
        message={`${deleteTarget?.full_name} — ${t('usersP.confirmDeleteUser')}`}
        danger
        onClose={() => setDeleteTarget(null)}
        onConfirm={remove}
        loading={busy}
      />
    </div>
  );
}
