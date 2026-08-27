import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Store, Plus, Pencil, Trash2, Upload, RefreshCw } from 'lucide-react';
import { Fetch, errorMessage } from '../../api/fetcher.js';
import { useGet, useInvalidate } from '../../api/hooks.js';
import { useToast } from '../../context/ToastContext.jsx';
import {
  Card, Button, Input, Field, EmptyState, Select, Sheet, ConfirmDialog,
  Segmented, Avatar, AnimatedName, CoinIcon, Textarea,
  PageHeader, IconButton, NumberInput, PageError, SkeletonGrid,
} from '../../components/ui.jsx';
import { fmtNum } from '../../utils/format.js';
import { TopBar } from '../../layouts/Layouts.jsx';

const EMPTY_FRAME = { id: '', name: '', price: 0, rarity: 'common', image: '', animation: '' };
const EMPTY_EFFECT = { id: '', name: '', price: 0, type: 'text', config: '' };

export default function AdminShop() {
  const { t } = useTranslation();
  const toast = useToast();
  const invalidate = useInvalidate();
  const [tab, setTab] = useState('frames');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FRAME);
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const { data, isLoading, error } = useGet('/staff/shop', { fallbackData: { frames: [], effects: [] } });

  const refresh = () => {
    invalidate('/staff/shop');
  };

  const items = data ? (tab === 'frames' ? data.frames : data.effects) : null;

  const openCreate = () => {
    setEditing(null);
    setForm(tab === 'frames' ? { ...EMPTY_FRAME } : { ...EMPTY_EFFECT });
    setEditorOpen(true);
  };

  const openEdit = (item) => {
    setEditing(item);
    if (tab === 'frames') {
      setForm({ id: item.id, name: item.name, price: item.price, rarity: item.rarity, image: item.image || '', animation: item.animation || '' });
    } else {
      setForm({ id: item.id, name: item.name, price: item.price, type: item.type, config: JSON.stringify(item.config || {}, null, 2) });
    }
    setEditorOpen(true);
  };

  const save = async () => {
    setBusy(true);
    try {
      if (tab === 'frames') {
        const body = {
          id: form.id || undefined,
          name: form.name,
          price: Number(form.price),
          rarity: form.rarity,
          image: form.image || null,
          animation: form.animation || null,
        };
        if (editing) {
          await Fetch.patch(`/staff/shop/frames/${editing.id}`, body);
        } else {
          await Fetch.post('/staff/shop/frames', body);
        }
      } else {
        let config = {};
        try {
          config = form.config ? JSON.parse(form.config) : {};
        } catch (e) {
          toast.error("JSON noto'g'ri");
          setBusy(false);
          return;
        }
        const body = {
          id: form.id || undefined,
          name: form.name,
          price: Number(form.price),
          type: form.type,
          config,
        };
        if (editing) {
          await Fetch.patch(`/staff/shop/effects/${editing.id}`, body);
        } else {
          await Fetch.post('/staff/shop/effects', body);
        }
      }
      toast.success(editing ? t('shopA.updated') : t('shopA.created'));
      setEditorOpen(false);
      invalidate('/staff/shop');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const uploadImage = async (file) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('folder', 'frames');
    try {
      const { url } = await Fetch.upload('/upload', fd);
      setForm((f) => ({ ...f, image: url }));
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const toggleActive = async (item) => {
    try {
      if (tab === 'frames') {
        await Fetch.patch(`/staff/shop/frames/${item.id}`, { active: !item.active });
      } else {
        await Fetch.patch(`/staff/shop/effects/${item.id}`, { active: !item.active });
      }
      invalidate('/staff/shop');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      if (tab === 'frames') {
        await Fetch.del(`/staff/shop/frames/${deleteTarget.id}`);
      } else {
        await Fetch.del(`/staff/shop/effects/${deleteTarget.id}`);
      }
      toast.success(t('shopA.deleted'));
      setDeleteTarget(null);
      invalidate('/staff/shop');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <TopBar title={t('shopA.title')} back />
      <div className="page-staff pt-4">
      {/* Header */}
      <PageHeader
        icon={Store}
        title={t('shopA.title')}
        count={items?.length}
        actions={
          <>
            <IconButton icon={RefreshCw} label={t('common.refresh')} onClick={refresh} />
            <Button size="sm" onClick={openCreate} disabled={busy}>
              <Plus size={16} /> {tab === 'frames' ? t('shopA.addFrame') : t('shopA.addEffect')}
            </Button>
          </>
        }
      />

      {/* Segmented control */}
      <Segmented
        value={tab}
        onChange={setTab}
        className="mb-3.5"
        options={[
          { value: 'frames', label: `${t('shopA.tabsFrames')} (${data?.frames.length || 0})` },
          { value: 'effects', label: `${t('shopA.tabsEffects')} (${data?.effects.length || 0})` },
        ]}
      />

      {/* Content */}
      {isLoading && !items?.length ? (
        <SkeletonGrid count={6} />
      ) : error ? (
        <PageError onRetry={refresh} />
      ) : items?.length === 0 ? (
        <Card>
          <EmptyState
            icon={Store}
            title={tab === 'frames' ? t('shopA.noFrames') : t('shopA.noEffects')}
            action={<Button onClick={openCreate}><Plus size={16} /> {t('common.add')}</Button>}
          />
        </Card>
      ) : (
        <div className="grid-auto" style={{ '--col': '260px' }}>
          {items.map((item) => (
            <Card key={item.id} className="p-4 flex flex-col">
              <div className="flex items-center justify-center min-h-[80px] mb-3">
                {tab === 'frames' ? (
                  <Avatar w={72} frame={item.image} />
                ) : (
                  <AnimatedName config={item.config}>
                    <span className="text-lg font-extrabold text-center">{item.name}</span>
                  </AnimatedName>
                )}
              </div>
              <div className="text-center font-extrabold text-[15px]">{item.name}</div>
              <div className="text-[12.5px] text-muted text-center mb-3 flex items-center justify-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1 tabular-nums"><CoinIcon size={14} /> {fmtNum(item.price)}</span>
                <span className="w-1 h-1 bg-surface-3 rounded-full" />
                <span>{t('shopA.usersCount')}: {fmtNum(item.usersCount || 0)}</span>
                {!item.active && (
                  <>
                    <span className="w-1 h-1 bg-surface-3 rounded-full" />
                    <span className="text-danger text-[11.5px] font-bold">{t('common.inactive')}</span>
                  </>
                )}
              </div>
              <div className="flex gap-2 mt-auto">
                <Button variant="outline" className="flex-1" size="sm" onClick={() => openEdit(item)}>
                  <Pencil size={14} /> {t('common.edit')}
                </Button>
                <Button
                  variant={item.active ? 'soft' : 'success-soft'}
                  size="sm"
                  onClick={() => toggleActive(item)}
                >
                  {item.active ? t('common.inactive') : t('common.active')}
                </Button>
                <button
                  className="w-[38px] h-[38px] rounded-[13px] flex items-center justify-center text-danger hover:bg-danger-soft transition-all shrink-0"
                  onClick={() => setDeleteTarget(item)}
                  title={t('common.delete')}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Sheet editor */}
      <Sheet open={editorOpen} onClose={() => setEditorOpen(false)} title={editing ? t('shopA.editItem') : tab === 'frames' ? t('shopA.addFrame') : t('shopA.addEffect')}>
        <Field label={t('shopA.itemId')}>
          <Input value={form.id} onChange={(e) => setForm({ ...form, id: e.target.value })} placeholder="frame_gold" disabled={!!editing} />
        </Field>
        <Field label={t('shopA.name')}>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label={t('shopA.price')}>
          <NumberInput value={form.price} min={0} onChange={(v) => setForm({ ...form, price: v })} />
        </Field>

        {tab === 'frames' ? (
          <>
            <Field label={t('shopA.rarity')}>
              <Select value={form.rarity} onChange={(e) => setForm({ ...form, rarity: e.target.value })}>
                {['common', 'uncommon', 'rare', 'epic', 'legendary'].map((r) => <option key={r} value={r}>{t(`shop.rarity_${r}`)}</option>)}
              </Select>
            </Field>
            <Field label={t('shopA.frameImage')}>
              <div className="flex gap-2 items-center">
                <Input value={form.image} onChange={(e) => setForm({ ...form, image: e.target.value })} placeholder="/uploads/frames/..." />
                <label className="cursor-pointer" title={t('shopA.uploadImage')}>
                  <span className="btn outline sm flex"><Upload size={14} /></span>
                  <input type="file" accept="image/*" hidden onChange={(e) => e.target.files[0] && uploadImage(e.target.files[0])} />
                </label>
              </div>
            </Field>
            <Field label={t('shopA.animation')}>
              <Input value={form.animation} onChange={(e) => setForm({ ...form, animation: e.target.value })} />
            </Field>
          </>
        ) : (
          <>
            <Field label={t('shopA.type')}>
              <Input value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} placeholder="text" />
            </Field>
            <Field label={t('shopA.effectConfig')} hint={t('shopA.configJson')}>
              <Textarea value={form.config} onChange={(e) => setForm({ ...form, config: e.target.value })} style={{ fontFamily: 'monospace', fontSize: 12.5, minHeight: 140 }} />
            </Field>
          </>
        )}

        <Button className="w-full" loading={busy} onClick={save}>{t('shopA.saveItem')}</Button>
      </Sheet>

      <ConfirmDialog
        open={!!deleteTarget}
        title={t('common.delete')}
        message={`${deleteTarget?.name} — ${t('common.confirmDelete')}`}
        danger
        onClose={() => setDeleteTarget(null)}
        onConfirm={remove}
        loading={busy}
      />
    </div>
    </>
  );
}
