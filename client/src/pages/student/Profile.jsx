import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Pencil, Upload, Settings, ChevronRight, CalendarCheck2, Wallet, LogOut, Volume2, Globe, Loader2 } from 'lucide-react';
import { Fetch, errorMessage } from '../../api/fetcher.js';
import { useGet, useInvalidate } from '../../api/hooks.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { Avatar, AnimatedName, Button, Input, Field, CoinBadge, Sheet, Toggle, LangSwitcher, ConfirmDialog } from '../../components/ui.jsx';
import ImageCropper from '../../components/ImageCropper.jsx';
import { TopBar } from '../../layouts/Layouts.jsx';
import { fmtNum, fmtDate, fmtPhone } from '../../utils/format.js';
import { isSoundEnabled, setSoundEnabled } from '../../utils/sound.js';
import { fileToDataUrl, validateImageFile } from '../../utils/cropImage.js';

export default function Profile() {
  const { t } = useTranslation();
  const toast = useToast();
  const { user, refresh, logout } = useAuth();
  const invalidate = useInvalidate();
  const [editOpen, setEditOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [passOpen, setPassOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [sound, setSound] = useState(isSoundEnabled());
  const fileRef = useRef(null);
  const [avatarCrop, setAvatarCrop] = useState(null);

  const [form, setForm] = useState({ username: '', full_name: '' });
  const [passForm, setPassForm] = useState({ oldPassword: '', newPassword: '', newPassword2: '' });
  const [busy, setBusy] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const { data: profile, isLoading } = useGet('/user/profile');

  const onAvatarPick = async (file) => {
    if (!file) return;
    const check = validateImageFile(file, 5);
    if (!check.ok) {
      toast.error(check.error === 'TOO_LARGE' ? t('crop.fileTooLarge', { mb: check.maxMb }) : t('crop.invalidType'));
      return;
    }
    try {
      const src = await fileToDataUrl(file);
      setAvatarCrop({ src });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const uploadAvatar = async (blob) => {
    setAvatarUploading(true);
    const fd = new FormData();
    fd.append('file', blob, 'avatar.png');
    fd.append('folder', 'avatars');
    try {
      await Fetch.upload('/upload', fd);
      toast.success(t('profile.avatarChanged'));
      await refresh();
      invalidate('/user/profile');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setAvatarUploading(false);
    }
  };

  const saveProfile = async () => {
    setBusy(true);
    try {
      await Fetch.patch('/user/profile', { username: form.username, full_name: form.full_name });
      toast.success(t('profile.saved'));
      setEditOpen(false);
      await refresh();
      invalidate('/user/profile');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const changePassword = async () => {
    if (passForm.newPassword !== passForm.newPassword2) {
      toast.error(t('auth.passwordsNotMatch'));
      return;
    }
    setBusy(true);
    try {
      await Fetch.post('/auth/change-password', { oldPassword: passForm.oldPassword, newPassword: passForm.newPassword });
      toast.success(t('auth.passwordChanged'));
      setPassOpen(false);
      setPassForm({ oldPassword: '', newPassword: '', newPassword2: '' });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      setLoggingOut(false);
    }
  };

  if (isLoading && !profile) {
    return (
      <>
        <TopBar title={t('profile.title')} />
        <div className="page pt-3.5">
          <div className="bg-surface border border-border rounded-[18px] p-5 shadow-card">
            <div className="flex flex-col items-center gap-3">
              <div className="w-[104px] h-[104px] rounded-full bg-surface-3 animate-pulse" />
              <div className="h-6 w-40 bg-surface-3 animate-pulse rounded-lg" />
              <div className="h-4 w-52 bg-surface-3 animate-pulse rounded-lg" />
            </div>
          </div>
          <div className="grid grid-cols-4 gap-2 mt-3">
            {[...Array(4)].map((_, i) => <div key={i} className="h-[70px] bg-surface-3 animate-pulse rounded-[18px]" />)}
          </div>
          <div className="h-6 w-32 bg-surface-3 animate-pulse rounded-lg mt-4 mb-2.5" />
          <div className="h-[160px] bg-surface-3 animate-pulse rounded-[18px]" />
        </div>
      </>
    );
  }

  const attendanceTotal = profile.groups.reduce((s, g) => s + g.attendance.present + g.attendance.absent + g.attendance.late, 0);
  const absenceTotal = profile.groups.reduce((s, g) => s + g.attendance.absent, 0);

  return (
    <>
      <TopBar
        title={t('profile.title')}
        right={
          <div className="flex gap-1.5">
            <button className="btn ghost sm" onClick={() => setSettingsOpen(true)}><Settings size={17} /></button>
            <button className="btn ghost sm" onClick={() => setLogoutOpen(true)}><LogOut size={17} /></button>
          </div>
        }
      />
      <div className="page pt-3.5">
        <div className="bg-surface border border-border rounded-[18px] p-5 shadow-card text-center">
          <div className="relative inline-block">
            <Avatar w={104} avatar={profile.avatar} frame={profile.currentFrame} />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={avatarUploading}
              className="absolute -right-1 -bottom-1 w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center shadow-[0_4px_12px_rgba(91,30,166,0.45)] hover:scale-110 transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {avatarUploading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
            </button>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { onAvatarPick(e.target.files[0]); e.target.value = ''; }} />
          </div>
          <div className="mt-3 text-[20px] font-black">
            <AnimatedName config={profile.currentEffect?.config}>{profile.full_name}</AnimatedName>
          </div>
          <div className="text-muted text-[13px] tabular-nums">
            {fmtPhone(profile.phone)} {profile.username ? `@${profile.username}` : ''}
          </div>
          <div className="flex justify-center gap-2 mt-3 flex-wrap">
            <CoinBadge value={profile.coin} />
            <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full bg-surface-3 text-muted">{t('profile.memberSince')}: {fmtDate(profile.createdAt)}</span>
          </div>
          <Button variant="soft" size="sm" className="mt-3.5" onClick={() => { setForm({ username: profile.username || '', full_name: profile.full_name }); setEditOpen(true); }}>
            <Pencil size={14} /> {t('profile.edit')}
          </Button>
        </div>

        <div className="grid grid-cols-4 gap-2 mt-3">
          {[
            { label: t('profile.score'), value: fmtNum(profile.score) },
            { label: t('profile.weekScore'), value: fmtNum(profile.week_score) },
            { label: t('profile.monthScore'), value: fmtNum(profile.month_score) },
            { label: t('profile.groups'), value: profile.groups.length },
          ].map((s) => (
            <div key={s.label} className="bg-surface border border-border rounded-[18px] py-3 px-2 shadow-card text-center">
              <div className="font-black text-[17px]">{s.value}</div>
              <div className="text-[10.5px] text-muted font-semibold">{s.label}</div>
            </div>
          ))}
        </div>

        <div className="text-base font-extrabold mt-4 mb-2.5">{t('profile.myGroups')}</div>
        <div className="bg-surface border border-border rounded-[18px] p-3.5 shadow-card">
          {profile.groups.length === 0 ? (
            <div className="text-center text-muted py-4 text-[13.5px]">{t('profile.noGroups')}</div>
          ) : (
            profile.groups.map((g) => (
              <div key={g.id} className="flex items-center gap-3 py-3 border-b border-border last:border-b-0">
                <div className="w-10 h-10 rounded-[13px] bg-surface-2 flex items-center justify-center font-extrabold text-primary shrink-0">
                  {g.name.slice(0, 1)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-[14.5px] truncate">{g.name}</div>
                  <div className="text-[12px] text-muted">{g.teacher ? g.teacher.full_name : ''}</div>
                </div>
                <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full bg-success-soft text-success whitespace-nowrap">{t('attendance.present')}: {g.attendance.present}</span>
                {g.attendance.absent > 0 && (
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full bg-danger-soft text-danger whitespace-nowrap">{t('attendance.absent')}: {g.attendance.absent}</span>
                )}
              </div>
            ))
          )}
        </div>

        <div className="bg-surface border border-border rounded-[18px] p-3.5 shadow-card mt-3">
          <Link to="/attendance" className="block">
            <div className="flex items-center gap-3 py-3 border-b border-border">
              <CalendarCheck2 size={19} className="text-success" />
              <div className="flex-1 min-w-0"><div className="font-bold text-[14.5px]">{t('attendance.title')}</div><div className="text-[12.5px] text-muted">{t('attendance.totalDays')}: {attendanceTotal} / {t('attendance.absent')}: {absenceTotal}</div></div>
              <ChevronRight size={17} className="text-muted" />
            </div>
          </Link>
          <Link to="/payments" className="block">
            <div className="flex items-center gap-3 py-3">
              <Wallet size={19} className="text-[#9a6d00]" />
              <div className="flex-1 min-w-0"><div className="font-bold text-[14.5px]">{t('payments.title')}</div><div className="text-[12.5px] text-muted">{t('payments.status')}</div></div>
              <ChevronRight size={17} className="text-muted" />
            </div>
          </Link>
        </div>
      </div>

      <Sheet open={editOpen} onClose={() => setEditOpen(false)} title={t('profile.editProfile')}>
        <Field label={t('common.name')}>
          <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
        </Field>
        <Field label={t('profile.username')}>
          <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="@username" />
        </Field>
        <Button className="w-full" loading={busy} onClick={saveProfile}>{t('common.save')}</Button>
      </Sheet>

      <Sheet open={settingsOpen} onClose={() => setSettingsOpen(false)} title={t('profile.settings')}>
        <div className="flex items-center gap-3 py-3 border-b border-border">
          <Volume2 size={19} className="text-primary" />
          <div className="flex-1 min-w-0"><div className="font-bold text-[14.5px]">{t('profile.soundEnabled')}</div></div>
          <Toggle checked={sound} onChange={(v) => { setSound(v); setSoundEnabled(v); }} />
        </div>
        <div className="flex items-center gap-3 py-3 border-b border-border">
          <Globe size={19} className="text-primary" />
          <div className="flex-1 min-w-0"><div className="font-bold text-[14.5px]">{t('profile.language')}</div></div>
          <LangSwitcher />
        </div>
        <Button variant="outline" className="w-full mt-2.5" onClick={() => { setSettingsOpen(false); setPassOpen(true); }}>
          {t('profile.changePassword')}
        </Button>
      </Sheet>

      <Sheet open={passOpen} onClose={() => setPassOpen(false)} title={t('auth.changePassword')}>
        <Field label={t('auth.oldPassword')}>
          <Input type="password" value={passForm.oldPassword} onChange={(e) => setPassForm({ ...passForm, oldPassword: e.target.value })} />
        </Field>
        <Field label={t('auth.newPassword')}>
          <Input type="password" value={passForm.newPassword} onChange={(e) => setPassForm({ ...passForm, newPassword: e.target.value })} />
        </Field>
        <Field label={t('auth.newPassword2')}>
          <Input type="password" value={passForm.newPassword2} onChange={(e) => setPassForm({ ...passForm, newPassword2: e.target.value })} />
        </Field>
        <Button className="w-full" loading={busy} onClick={changePassword}>{t('common.save')}</Button>
      </Sheet>

      <ConfirmDialog
        open={logoutOpen}
        title={t('auth.logoutConfirm')}
        onClose={() => setLogoutOpen(false)}
        onConfirm={handleLogout}
        confirmText={t('common.yesSure')}
        loading={loggingOut}
      />

      <ImageCropper
        open={!!avatarCrop}
        imageSrc={avatarCrop?.src}
        onCancel={() => setAvatarCrop(null)}
        onComplete={(blob) => {
          setAvatarCrop(null);
          uploadAvatar(blob);
        }}
        aspect={1}
        outputSize={{ width: 512, height: 512 }}
        circular
        label={t('crop.cropAvatar')}
      />
    </>
  );
}