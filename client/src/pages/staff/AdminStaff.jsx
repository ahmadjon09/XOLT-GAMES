// Admin: xodimlar boshqaruvi - teacher/cashier/admin yaratish
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { UserCog, Plus, Pencil, Trash2, Power } from 'lucide-react';
import { Fetch, errorMessage } from '../../api/fetcher.js';
import { useGet, useInvalidate } from '../../api/hooks.js';
import { useToast } from '../../context/ToastContext.jsx';
import { Card, Button, Input, Field, PageLoader, EmptyState, Select, Sheet, ConfirmDialog, Badge } from '../../components/ui.jsx';
import { TopBar } from '../../layouts/Layouts.jsx';
import { fmtDate } from '../../utils/format.js';

const ROLE_LABEL = { ADMIN: 'staff.roleAdmin', TEACHER: 'staff.roleTeacher', CASHIER: 'staff.roleCashier' };
const ROLE_COLOR = { ADMIN: 'danger', TEACHER: 'info', CASHIER: 'warn' };

export default function AdminStaff() {
  const { t } = useTranslation();
  const toast = useToast();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ full_name: '', phone: '', password: '', role: 'TEACHER' });
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  // SWR cache bilan
  const { data: staff } = useGet('/staff/staff');

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
    <>
      <TopBar
        title={t('staffP.title')}
        right={<Button className="sm primary" onClick={openCreate}><Plus size={15} /> {t('staffP.createStaff')}</Button>}
      />
      <div className="page-staff" style={{ paddingTop: 14 }}>
        {!staff ? (
          <PageLoader />
        ) : staff.length === 0 ? (
          <Card><EmptyState icon={UserCog} title={t('staffP.noStaff')} action={<Button onClick={openCreate}><Plus size={16} /> {t('staffP.createStaff')}</Button>} /></Card>
        ) : (
          <Card style={{ padding: '4px 14px' }}>
            {staff.map((s) => (
              <div key={s.id} className="row-item">
                <div style={{ width: 42, height: 42, borderRadius: 14, background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)', fontWeight: 800, fontSize: 15, flexShrink: 0 }}>
                  {s.full_name.slice(0, 1)}
                </div>
                <div className="grow">
                  <div className="title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {s.full_name}
                    {!s.active && <Badge color="danger">{t('common.inactive')}</Badge>}
                  </div>
                  <div className="sub">
                    {s.phone} • {t(`staffP.role${s.role === 'ADMIN' ? 'Admin' : s.role === 'CASHIER' ? 'Cashier' : 'Teacher'}`)}
                    {s.role === 'TEACHER' ? ` • ${t('staffP.groupsCount')}: ${s.groupsCount}` : ''}
                  </div>
                </div>
                <button className="btn ghost sm" onClick={() => toggleActive(s)} title={s.active ? t('staffP.deactivate') : t('staffP.activate')}>
                  <Power size={16} color={s.active ? 'var(--success)' : 'var(--muted)'} />
                </button>
                <button className="btn ghost sm" onClick={() => openEdit(s)}><Pencil size={15} /></button>
                <button className="btn ghost sm" style={{ color: 'var(--danger)' }} onClick={() => setDeleteTarget(s)}><Trash2 size={15} /></button>
              </div>
            ))}
          </Card>
        )}
      </div>

      <Sheet open={editorOpen} onClose={() => setEditorOpen(false)} title={editing ? t('staffP.editStaff') : t('staffP.createStaff')}>
        <Field label={t('staffP.fullName')}>
          <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
        </Field>
        <Field label={t('staffP.phone')}>
          <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+998901234567" disabled={!!editing} inputMode="tel" />
        </Field>
        <Field label={t('staffP.password')}>
          <Input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder={editing ? '••••' : ''} />
        </Field>
        <Field label={t('staffP.role')}>
          <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <option value="TEACHER">{t('staffP.roleTeacher')}</option>
            <option value="CASHIER">{t('staffP.roleCashier')}</option>
            <option value="ADMIN">{t('staffP.roleAdmin')}</option>
          </Select>
        </Field>
        <Button className="full" loading={busy} onClick={save}>{t('common.save')}</Button>
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
    </>
  );
}
