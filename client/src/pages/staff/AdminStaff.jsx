// Admin: xodimlar boshqaruvi - teacher/cashier/admin yaratish
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { UserCog, Plus, Pencil, Trash2, Power } from 'lucide-react';
import { Fetch, errorMessage } from '../../api/fetcher.js';
import { useGet, useInvalidate } from '../../api/hooks.js';
import { useToast } from '../../context/ToastContext.jsx';
import {
  Card, Button, Input, Field, PageLoader, EmptyState, Select, Sheet, ConfirmDialog,
  Badge, PageHeader, IconButton, PhoneInput,
} from '../../components/ui.jsx';
import { fmtDate, fmtPhone } from '../../utils/format.js';

const ROLE_LABEL = { ADMIN: 'staff.roleAdmin', TEACHER: 'staff.roleTeacher', CASHIER: 'staff.roleCashier' };
const ROLE_COLOR = { ADMIN: 'danger', TEACHER: 'info', CASHIER: 'warn' };

export default function AdminStaff() {
  const { t } = useTranslation();
  const toast = useToast();
  const invalidate = useInvalidate();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ full_name: '', phone: '', password: '', role: 'TEACHER' });
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  // SWR cache bilan
  const { data: staff, isLoading } = useGet('/staff/staff');

  const openCreate = () => {
    setEditing(null);
    setForm({ full_name: '', phone: '', password: '', role: 'TEACHER' });
    setEditorOpen(true);
  };

  const openEdit = (s) => {
    setEditing(s);
    setForm({ full_name: s.full_name, phone: s.phone, password: '', role: s.role });
    setEditorOpen(true);
  };

  const save = async () => {
    setBusy(true);
    try {
      if (editing) {
        await Fetch.patch(`/staff/staff/${editing.id}`, {
          full_name: form.full_name,
          password: form.password || undefined,
          role: form.role,
        });
        toast.success(t('staffP.staffUpdated'));
      } else {
        await Fetch.post('/staff/staff', form);
        toast.success(t('staffP.staffCreated'));
      }
      setEditorOpen(false);
      invalidate('/staff/staff');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (s) => {
    try {
      await Fetch.patch(`/staff/staff/${s.id}`, { active: !s.active });
      toast.success(s.active ? t('staffP.deactivated') : t('staffP.activated'));
      invalidate('/staff/staff');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await Fetch.del(`/staff/staff/${deleteTarget.id}`);
      toast.success(t('staffP.staffDeleted'));
      setDeleteTarget(null);
      invalidate('/staff/staff');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page-staff pt-3.5">
      <PageHeader
        icon={UserCog}
        title={t('staffP.title')}
        count={staff?.length}
        actions={
          <Button size="sm" onClick={openCreate} disabled={busy}>
            <Plus size={16} /> {t('staffP.createStaff')}
          </Button>
        }
      />

      {isLoading && !staff ? (
        <PageLoader />
      ) : staff?.length === 0 ? (
        <Card>
          <EmptyState icon={UserCog} title={t('staffP.noStaff')} action={<Button onClick={openCreate}><Plus size={16} /> {t('staffP.createStaff')}</Button>} />
        </Card>
      ) : (
        <Card className="p-0 -my-1.5">
          {staff.map((s) => (
            <div key={s.id} className="flex items-center gap-3.5 px-4 py-3.5 border-b border-border last:border-b-0">
              <div className="w-[42px] h-[42px] rounded-[14px] bg-primary-soft text-primary flex items-center justify-center font-extrabold text-[15px] shrink-0">
                {s.full_name.slice(0, 1)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-[14.5px] flex items-center gap-2 flex-wrap">
                  <span className="truncate">{s.full_name}</span>
                  <Badge color={ROLE_COLOR[s.role] || 'neutral'}>{t(ROLE_LABEL[s.role] || 'staff.roleTeacher')}</Badge>
                  {!s.active && <Badge color="danger">{t('common.inactive')}</Badge>}
                </div>
                <div className="text-[12.5px] text-muted mt-0.5">
                  <span className="tabular-nums">{fmtPhone(s.phone)}</span>
                  {s.role === 'TEACHER' && ` • ${t('staffP.groupsCount')}: ${s.groupsCount}`}
                  {` • ${fmtDate(s.createdAt)}`}
                </div>
              </div>
              <div className="flex items-center shrink-0">
                <IconButton
                  icon={Power}
                  label={s.active ? t('staffP.deactivate') : t('staffP.activate')}
                  onClick={() => toggleActive(s)}
                  className={s.active ? '!text-success' : ''}
                />
                <IconButton icon={Pencil} label={t('common.edit')} onClick={() => openEdit(s)} disabled={busy} />
                <IconButton icon={Trash2} label={t('common.delete')} danger onClick={() => setDeleteTarget(s)} disabled={busy} />
              </div>
            </div>
          ))}
        </Card>
      )}

      <Sheet open={editorOpen} onClose={() => setEditorOpen(false)} title={editing ? t('staffP.editStaff') : t('staffP.createStaff')}>
        <Field label={t('staffP.fullName')}>
          <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
        </Field>
        <Field label={t('staffP.phone')}>
          <PhoneInput value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} disabled={!!editing || busy} />
        </Field>
        <Field label={t('staffP.password')} hint={editing ? t('usersP.loginInfo') : undefined}>
          <Input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder={editing ? '••••' : ''} />
        </Field>
        <Field label={t('staffP.role')}>
          <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <option value="TEACHER">{t('staffP.roleTeacher')}</option>
            <option value="CASHIER">{t('staffP.roleCashier')}</option>
            <option value="ADMIN">{t('staffP.roleAdmin')}</option>
          </Select>
        </Field>
        <Button className="w-full" loading={busy} onClick={save}>{t('common.save')}</Button>
      </Sheet>

      <ConfirmDialog
        open={!!deleteTarget}
        title={t('staffP.deleteStaff')}
        message={`${deleteTarget?.full_name} — ${t('staffP.confirmDeleteStaff')}`}
        danger
        onClose={() => setDeleteTarget(null)}
        onConfirm={remove}
        loading={busy}
      />
    </div>
  );
}
