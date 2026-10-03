// OAuth-backed staff profile: identity, avatar, and display name.
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pencil, Upload, Loader2, ShieldCheck } from 'lucide-react';
import { Fetch, errorMessage } from '../../api/fetcher.js';
import { useGet, useInvalidate } from '../../api/hooks.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { Avatar, Button, Input, Field, Badge, Sheet, Card } from '../../components/ui.jsx';
import ImageCropper from '../../components/ImageCropper.jsx';
import { TopBar } from '../../layouts/Layouts.jsx';
import { fmtDate } from '../../utils/format.js';
import { fileToDataUrl, validateImageFile } from '../../utils/cropImage.js';

export default function StaffProfile() {
  const { t } = useTranslation();
  const toast = useToast();
  const { user, refresh } = useAuth();
  const invalidate = useInvalidate();
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState({ full_name: '' });
  const [busy, setBusy] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarCrop, setAvatarCrop] = useState(null);
  const fileRef = useRef(null);
  const { data: profile, isLoading } = useGet('/staff/profile');
  const role = profile?.role || user?.role;
  const roleKey = 'staff.roleAdmin';

  const onAvatarPick = async (file) => {
    if (!file) return;
    const check = validateImageFile(file, 5);
    if (!check.ok) {
      toast.error(check.error === 'TOO_LARGE' ? t('crop.fileTooLarge', { mb: check.maxMb }) : t('crop.invalidType'));
      return;
    }
    try {
      setAvatarCrop({ src: await fileToDataUrl(file) });
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const uploadAvatar = async (blob) => {
    setAvatarUploading(true);
    const formData = new FormData();
    formData.append('file', blob, 'avatar.png');
    formData.append('folder', 'avatars');
    try {
      await Fetch.upload('/upload', formData);
      toast.success(t('staffProfile.avatarChanged'));
      await refresh();
      invalidate('/staff/profile');
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setAvatarUploading(false);
    }
  };

  const saveProfile = async () => {
    const fullName = form.full_name.trim();
    if (fullName.length < 3) return toast.error(t('staffProfile.nameTooShort'));
    setBusy(true);
    try {
      await Fetch.patch('/staff/profile', { full_name: fullName });
      toast.success(t('staffProfile.saved'));
      setEditOpen(false);
      await refresh();
      invalidate('/staff/profile');
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const currentProfile = profile || user || {};
  return (
    <>
      <TopBar title={t('staffProfile.title')} back />
      <div className="page-staff pt-4">
        {isLoading && !profile ? (
          <div className="grid lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)] gap-[var(--gap)] items-start">
            <Card className="flex flex-col items-center gap-3"><div className="skeleton w-[104px] h-[104px] rounded-full" /><div className="skeleton h-6 w-40" /><div className="skeleton h-4 w-52" /></Card>
            <div className="skeleton h-[200px]" style={{ borderRadius: 'var(--r-lg)' }} />
          </div>
        ) : (
          <div className="grid lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)] gap-[var(--gap)] items-start">
            <Card className="text-center">
              <div className="relative inline-block">
                <Avatar w={112} avatar={currentProfile.avatar} />
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={avatarUploading}
                  className="absolute -right-1 -bottom-1 w-9 h-9 rounded-full bg-primary text-white flex items-center justify-center shadow-lg hover:scale-110 transition-transform disabled:opacity-50"
                  aria-label={t('staffProfile.editProfile')}
                >
                  {avatarUploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                </button>
                <input ref={fileRef} type="file" accept="image/*" hidden onChange={(event) => { onAvatarPick(event.target.files[0]); event.target.value = ''; }} />
              </div>
              <div className="mt-3.5 text-[21px] font-extrabold">{currentProfile.full_name}</div>
              <div className="text-muted text-[13px] mt-0.5 break-all">{currentProfile.email || ''}</div>
              <div className="flex justify-center gap-2 mt-3.5 flex-wrap">
                <Badge color="danger">{t(roleKey)}</Badge>
                {currentProfile.createdAt && <span className="badge neutral">{t('staffProfile.memberSince')}: {fmtDate(currentProfile.createdAt)}</span>}
              </div>
              <Button variant="soft" size="sm" className="mt-4" onClick={() => { setForm({ full_name: currentProfile.full_name || '' }); setEditOpen(true); }}>
                <Pencil size={15} /> {t('staffProfile.editProfile')}
              </Button>
            </Card>

            <Card>
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-primary-soft text-primary flex items-center justify-center shrink-0"><ShieldCheck size={20} /></div>
                <div className="min-w-0 flex-1"><div className="font-extrabold">{t('staffProfile.role')}</div><div className="text-sm text-muted">{t('auth.oauthPrivacy')}</div></div>
                <Badge color="danger">{t(roleKey)}</Badge>
              </div>
              <div className="border-t border-border mt-4 pt-4 flex items-center justify-between gap-3">
                <div><div className="font-bold">{t('staffProfile.editProfile')}</div><div className="text-xs text-muted">{t('staffProfile.editProfileSub')}</div></div>
                <Button variant="outline" size="sm" onClick={() => { setForm({ full_name: currentProfile.full_name || '' }); setEditOpen(true); }}><Pencil size={15} /> {t('common.edit')}</Button>
              </div>
            </Card>
          </div>
        )}
      </div>

      <Sheet open={editOpen} onClose={() => setEditOpen(false)} title={t('staffProfile.editProfile')}>
        <Field label={t('staffProfile.fullName')}><Input value={form.full_name} onChange={(event) => setForm({ full_name: event.target.value })} disabled={busy} /></Field>
        <Button className="w-full" loading={busy} onClick={saveProfile}>{t('common.save')}</Button>
      </Sheet>

      <ImageCropper
        open={!!avatarCrop}
        imageSrc={avatarCrop?.src}
        onCancel={() => setAvatarCrop(null)}
        onComplete={(blob) => { setAvatarCrop(null); uploadAvatar(blob); }}
        aspect={1}
        outputSize={{ width: 512, height: 512 }}
        circular
        label={t('crop.cropAvatar')}
      />
    </>
  );
}
