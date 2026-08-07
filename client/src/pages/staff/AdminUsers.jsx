// Admin: o'quvchilar boshqaruvi - yaratish, tahrirlash, o'chirish, guruhlar
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Users, Plus, Pencil, Trash2, Search, ChevronRight, RefreshCw, Loader2 } from 'lucide-react';
import { Fetch, errorMessage } from '../../api/fetcher.js';
import { useGetMeta, useGet, useInvalidate } from '../../api/hooks.js';
import { useToast } from '../../context/ToastContext.jsx';
import { Card, Button, Input, Field, PageLoader, EmptyState, Avatar, AnimatedName, Sheet, ConfirmDialog, Badge } from '../../components/ui.jsx';
import { fmtNum } from '../../utils/format.js';

export default function AdminUsers() {
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const invalidate = useInvalidate();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ full_name: '', phone: '', password: '', username: '', discount: 0, groupIds: [] });
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
    setForm({ full_name: '', phone: '', password: '', username: '', discount: 0, groupIds: [] });
    setEditorOpen(true);
  };

  const openEdit = (u) => {
    setEditing(u);
    setForm({ full_name: u.full_name, phone: u.phone, password: '', username: u.username || '', discount: u.discount || 0, groupIds: u.groups.map((g) => g.id) });
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
          discount: form.discount,
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
    <div className="page pt-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">
          {t('usersP.title')} <span className="text-base font-normal text-muted">({fmtNum(meta.total)})</span>
        </h1>
        <div className="flex items-center gap-2">
          <button
            onClick={refresh}
            className="p-2 rounded-full hover:bg-slate-100 transition-colors disabled:opacity-50"
            disabled={busy}
            aria-label={t('common.refresh')}
          >
            {busy ? <Loader2 size={20} className="animate-spin text-slate-600" /> : <RefreshCw size={20} className="text-slate-600" />}
          </button>
          <Button className="primary" onClick={openCreate} disabled={busy}>
            <Plus size={16} className="mr-1.5" /> {t('usersP.createStudent')}
          </Button>
        </div>
      </div>

      {/* Qidiruv */}
      <div className="relative">
        <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
        <Input
          placeholder={t('usersP.searchUser')}
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="pl-11"
          disabled={busy}
        />
      </div>

      {/* Content */}
      {isLoading && !users ? (
        <PageLoader />
      ) : error ? (
        <Card className="p-8 text-center text-danger">
          <p>{t('common.serverError')}</p>
          <Button variant="soft" className="mt-4" onClick={refresh}>
            <RefreshCw size={16} className="mr-2" /> {t('common.retry')}
          </Button>
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
        <Card className="p-0 divide-y divide-slate-100">
          {users.map((u) => (
            <div
              key={u.id}
              onClick={() => navigate(`/staff/users/${u.id}`)}
              className="flex items-center gap-4 p-4 hover:bg-slate-50/50 transition-colors cursor-pointer"
            >
              <Avatar w={48} avatar={u.avatar} frame={u.currentFrame} />
              <div className="flex-1 min-w-0">
                <div className="font-bold text-slate-800 truncate">
                  <AnimatedName config={u.currentEffect?.config}>{u.full_name}</AnimatedName>
                </div>
                <div className="text-sm text-slate-500 truncate flex items-center gap-1 flex-wrap">
                  <span>{u.phone}</span>
                  {u.username && <span>@{u.username}</span>}
                  {u.groups.length > 0 && (
                    <>
                      <span className="text-slate-300">•</span>
                      <span>{u.groups.map((g) => g.name).join(', ')}</span>
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {u.discount > 0 && (
                  <Badge color="warn" className="text-xs">{t('payments.discount')}: {u.discount}%</Badge>
                )}
                <Badge color="neutral" className="text-xs">{fmtNum(u.coin)}</Badge>
                <button
                  className="p-2 rounded-xl hover:bg-slate-100 transition-colors disabled:opacity-50"
                  onClick={(e) => { e.stopPropagation(); openEdit(u); }}
                  disabled={busy}
                  title={t('common.edit')}
                >
                  {busy ? <Loader2 size={16} className="animate-spin" /> : <Pencil size={16} />}
                </button>
                <button
                  className="p-2 rounded-xl text-danger hover:bg-danger-soft transition-colors disabled:opacity-50"
                  onClick={(e) => { e.stopPropagation(); setDeleteTarget(u); }}
                  disabled={busy}
                  title={t('common.delete')}
                >
                  {busy ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                </button>
                <ChevronRight size={18} className="text-muted shrink-0" />
              </div>
            </div>
          ))}
        </Card>
      )}

      {/* Pagination */}
      {meta.total > 20 && (
        <div className="flex items-center justify-center gap-4">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1 || busy}
            onClick={() => setPage((p) => p - 1)}
          >
            ←
          </Button>
          <span className="text-sm font-bold text-slate-600">
            {page} / {Math.ceil(meta.total / 20)}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page * 20 >= meta.total || busy}
            onClick={() => setPage((p) => p + 1)}
          >
            →
          </Button>
        </div>
      )}

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
          <Input
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            placeholder="+998901234567"
            disabled={!!editing || busy}
            inputMode="tel"
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
        <Field label={t('payments.discount')} hint={t('payments.discountHint')}>
          <Input
            type="number"
            min={0}
            max={100}
            value={form.discount}
            onChange={(e) => setForm({ ...form, discount: Math.min(100, Math.max(0, parseInt(e.target.value || '0'))) })}
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
                className={`
                  px-3 py-1.5 rounded-full text-xs font-bold transition-all
                  ${form.groupIds.includes(g.id)
                    ? 'bg-primary-soft text-primary border-2 border-primary'
                    : 'bg-slate-100 text-slate-500 border-2 border-transparent hover:bg-slate-200'
                  }
                  ${busy ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                `}
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