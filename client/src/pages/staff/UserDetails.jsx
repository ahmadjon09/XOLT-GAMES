// Admin view of a single OAuth player account (no group, attendance, or payment data).
import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Pencil, Trash2, Trophy, Gamepad2, Coins } from 'lucide-react';
import { Fetch, errorMessage } from '../../api/fetcher.js';
import { useGet, useInvalidate } from '../../api/hooks.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { Avatar, AnimatedName, Button, Card, CoinBadge, ConfirmDialog, Field, Input, Sheet } from '../../components/ui.jsx';
import CoinSheet from '../../components/CoinSheet.jsx';
import { fmtDate, fmtNum } from '../../utils/format.js';
import { TopBar } from '../../layouts/Layouts.jsx';

export default function UserDetails() {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const invalidate = useInvalidate();
  const { user: me } = useAuth();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [coinOpen, setCoinOpen] = useState(false);
  const [form, setForm] = useState({ full_name: '', username: '' });
  const [busy, setBusy] = useState(false);
  const { data } = useGet(`/staff/users/${id}`, {
    onError: (requestError) => {
      toast.error(errorMessage(requestError));
      navigate('/staff/users');
    },
  });
  const isAdmin = me?.role === 'ADMIN';

  const openEdit = () => {
    setForm({ full_name: data.full_name || '', username: data.username || '' });
    setEditOpen(true);
  };

  const saveEdit = async () => {
    setBusy(true);
    try {
      await Fetch.patch(`/staff/users/${id}`, {
        full_name: form.full_name.trim(),
        username: form.username.trim() || null,
      });
      toast.success(t('usersP.userUpdated'));
      setEditOpen(false);
      invalidate(`/staff/users/${id}`);
      invalidate('/staff/users');
    } catch (requestError) {
      toast.error(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await Fetch.del(`/staff/users/${id}`);
      toast.success(t('usersP.userDeleted'));
      invalidate('/staff/users');
      navigate('/staff/users');
    } catch (requestError) {
      toast.error(errorMessage(requestError));
      setBusy(false);
    }
  };

  if (!data) {
    return (
      <>
        <TopBar title={t('userDetail.title')} back />
        <div className="page-staff pt-4">
          <Card className="space-y-3">
            <div className="skeleton h-20 w-20 rounded-full mx-auto" />
            <div className="skeleton h-5 w-40 mx-auto" />
            <div className="skeleton h-4 w-56 mx-auto" />
          </Card>
        </div>
      </>
    );
  }

  return (
    <>
      <TopBar
        title={t('userDetail.title')}
        back
        right={(
          <div className="flex gap-1.5">
            <button className="btn ghost sm" onClick={() => setCoinOpen(true)} title={t('coins.manage')}><Coins size={17} /></button>
            <button className="btn ghost sm" onClick={openEdit} title={t('common.edit')}><Pencil size={17} /></button>
            {isAdmin && <button className="btn ghost sm text-danger" onClick={() => setDeleteOpen(true)} title={t('common.delete')}><Trash2 size={17} /></button>}
          </div>
        )}
      />
      <div className="page-staff pt-4 space-y-[var(--gap)]">
        <Card className="text-center">
          <Avatar w={104} avatar={data.avatar} frame={data.currentFrame} />
          <div className="mt-3 text-xl font-black"><AnimatedName config={data.currentEffect?.config}>{data.full_name}</AnimatedName></div>
          <div className="text-sm text-muted mt-1">{data.username ? `@${data.username}` : data.email || data.phone || '—'}</div>
          <div className="flex justify-center gap-2 mt-3 flex-wrap">
            <span className="badge primary"><Trophy size={13} /> #{data.rank}</span>
            <CoinBadge value={data.coin} />
            <span className="badge neutral">{t('userDetail.memberSince')}: {fmtDate(data.createdAt)}</span>
          </div>
        </Card>

        <div className="grid-fit" style={{ '--col': '170px' }}>
          <Card className="text-center"><div className="text-2xl font-black">{fmtNum(data.score)}</div><div className="text-xs text-muted mt-1">{t('common.score')}</div></Card>
          <Card className="text-center"><div className="text-2xl font-black">{fmtNum(data.week_score)}</div><div className="text-xs text-muted mt-1">{t('lb.week')}</div></Card>
          <Card className="text-center"><div className="text-2xl font-black">{fmtNum(data.month_score)}</div><div className="text-xs text-muted mt-1">{t('lb.month')}</div></Card>
        </div>

        <section>
          <div className="section-title"><div className="t">{t('userDetail.games')}</div><span className="badge neutral">{data.games.length}</span></div>
          {data.games.length === 0 ? (
            <Card className="text-sm text-muted text-center py-6">{t('common.noData')}</Card>
          ) : (
            <Card flush>
              {data.games.map((game) => (
                <div key={game.id} className="flex items-center gap-3 px-4 py-3.5 border-b border-border last:border-0">
                  <div className="w-10 h-10 rounded-xl bg-primary-soft text-primary flex items-center justify-center"><Gamepad2 size={19} /></div>
                  <div className="flex-1 min-w-0"><div className="font-bold">{t(`gameTypes.${game.type}`, { defaultValue: game.type })}</div><div className="text-xs text-muted">{fmtDate(game.createdAt)}</div></div>
                  {game.roomCode && <span className="text-xs text-muted">{game.roomCode}</span>}
                </div>
              ))}
            </Card>
          )}
        </section>

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={() => setCoinOpen(true)}><Coins size={16} /> {t('coins.manage')}</Button>
          <Button variant="outline" className="flex-1" onClick={openEdit}><Pencil size={16} /> {t('common.edit')}</Button>
        </div>
      </div>

      <Sheet open={editOpen} onClose={() => setEditOpen(false)} title={t('usersP.editPlayer')}>
        <Field label={t('common.name')}><Input value={form.full_name} onChange={(event) => setForm({ ...form, full_name: event.target.value })} disabled={busy} /></Field>
        <Field label={t('profile.username')}><Input value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} disabled={busy} /></Field>
        <Button className="w-full" loading={busy} onClick={saveEdit}>{t('common.save')}</Button>
      </Sheet>
      <CoinSheet open={coinOpen} user={data} canTake onClose={() => setCoinOpen(false)} onDone={() => invalidate(`/staff/users/${id}`)} />
      <ConfirmDialog
        open={deleteOpen}
        title={t('usersP.deletePlayer')}
        message={`${data.full_name} — ${t('usersP.confirmDeleteUser')}`}
        danger
        onClose={() => setDeleteOpen(false)}
        onConfirm={remove}
        loading={busy}
      />
    </>
  );
}
