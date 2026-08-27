// Xodim: o'z profilini ko'rish va tahrirlash (barcha rollar uchun)
import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Pencil, Upload, ChevronRight, Loader2, KeyRound, ShieldCheck, CalendarCheck2, ListChecks, Users } from 'lucide-react';
import { Fetch, errorMessage } from '../../api/fetcher.js';
import { useGet, useInvalidate } from '../../api/hooks.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { Avatar, Button, Input, Field, Badge, Sheet, PhoneInput, ConfirmDialog, AutoGrid, Card } from '../../components/ui.jsx';
import ImageCropper from '../../components/ImageCropper.jsx';
import { TopBar } from '../../layouts/Layouts.jsx';
import { fmtDate, fmtPhone } from '../../utils/format.js';
import { fileToDataUrl, validateImageFile } from '../../utils/cropImage.js';

const ROLE_LABEL = { ADMIN: 'staff.roleAdmin', TEACHER: 'staff.roleTeacher', CASHIER: 'staff.roleCashier' };
const ROLE_COLOR = { ADMIN: 'danger', TEACHER: 'info', CASHIER: 'warn' };

export default function StaffProfile() {
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const { user, refresh, logout } = useAuth();
  const invalidate = useInvalidate();

  const [editOpen, setEditOpen] = useState(false);
  const [passOpen, setPassOpen] = useState(false);
  const fileRef = useRef(null);
  const [avatarCrop, setAvatarCrop] = useState(null);

  const [form, setForm] = useState({ full_name: '', phone: '' });
  const [passForm, setPassForm] = useState({ oldPassword: '', newPassword: '', newPassword2: '' });
  const [busy, setBusy] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);

  const { data: profile, isLoading } = useGet('/staff/profile');

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
      toast.success(t('staffProfile.avatarChanged'));
      await refresh();
      invalidate('/staff/profile');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setAvatarUploading(false);
    }
  };

  const saveProfile = async () => {
    if (!form.full_name || form.full_name.trim().length < 3) {
      toast.error(t('staffProfile.nameTooShort'));
      return;
    }
    setBusy(true);
    try {
      await Fetch.patch('/staff/profile', {
        full_name: form.full_name.trim(),
        phone: form.phone || undefined,
      });
      toast.success(t('staffProfile.saved'));
      setEditOpen(false);
      await refresh();
      invalidate('/staff/profile');
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

  if (isLoading && !profile) {
    return (
      <>
        <TopBar title={t('staffProfile.title')} back />
        <div className="page-staff pt-4">
          <div className="grid lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)] gap-[var(--gap)] items-start">
            <Card className="flex flex-col items-center gap-3">
              <div className="skeleton w-[104px] h-[104px] rounded-full" />
              <div className="skeleton h-6 w-40" />
              <div className="skeleton h-4 w-52" />
            </Card>
            <div className="skeleton h-[200px]" style={{ borderRadius: 'var(--r-lg)' }} />
          </div>
        </div>
      </>
    );
  }

  const role = profile?.role || user?.role;
  const isTeacher = role === 'TEACHER';

  return (
    <>
      <TopBar
        title={t('staffProfile.title')}
        back
        right={
          <button className="btn ico ghost" onClick={() => setPassOpen(true)} title={t('staffProfile.changePassword')} aria-label={t('staffProfile.changePassword')}>
            <KeyRound size={18} />
          </button>
        }
      />
      <div className="page-staff pt-4">
        <div className="grid lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)] gap-[var(--gap)] items-start">
          {/* Chap ustun: profil kartochkasi */}
          <div className="space-y-[var(--gap)]">
            <Card className="text-center">
              <div className="relative inline-block">
                <Avatar w={112} avatar={profile?.avatar} />
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={avatarUploading}
                  className="absolute -right-1 -bottom-1 w-9 h-9 rounded-full bg-primary text-white flex items-center justify-center shadow-[0_4px_12px_rgba(91,30,166,0.45)] hover:scale-110 transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {avatarUploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                </button>
                <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { onAvatarPick(e.target.files[0]); e.target.value = ''; }} />
              </div>
              <div className="mt-3.5 text-[21px] font-extrabold tracking-tight">{profile?.full_name}</div>
              <div className="text-muted text-[13px] tabular-nums mt-0.5">{fmtPhone(profile?.phone)}</div>
              <div className="flex justify-center gap-2 mt-3.5 flex-wrap">
                <Badge color={ROLE_COLOR[role] || 'neutral'}>{t(ROLE_LABEL[role] || 'staff.roleTeacher')}</Badge>
                <span className="badge neutral">{t('staffProfile.memberSince')}: {fmtDate(profile?.createdAt)}</span>
              </div>
              <Button
                variant="soft"
                size="sm"
                className="mt-4"
                onClick={() => {
                  setForm({ full_name: profile?.full_name || '', phone: profile?.phone || '' });
                  setEditOpen(true);
                }}
              >
                <Pencil size={15} /> {t('staffProfile.editProfile')}
              </Button>
            </Card>

            <AutoGrid col={150}>
              {isTeacher && (
                <div className="tile">
                  <div className="tile-v">{profile?.groupsCount ?? 0}</div>
                  <div className="tile-l">{t('staffProfile.groups')}</div>
                </div>
              )}
              {(isTeacher || role === 'ADMIN') && (
                <div className="tile">
                  <div className="tile-v">{profile?.quizzesCount ?? 0}</div>
                  <div className="tile-l">{t('staffProfile.quizzes')}</div>
                </div>
              )}
              <div className="tile">
                <div className="tile-v">{fmtDate(profile?.createdAt).slice(-4) || '—'}</div>
                <div className="tile-l">{t('staffProfile.sinceYear')}</div>
              </div>
            </AutoGrid>
          </div>

          {/* O'ng ustun: tezkor havolalar */}
          <div className="space-y-[var(--gap)]">
            <section>
              <Card flush>
                <button type="button" className="block w-full text-left" onClick={() => setEditOpen(true)}>
                  <div className="list-row tap">
                    <div className="w-11 h-11 bg-primary-soft text-primary flex items-center justify-center shrink-0" style={{ borderRadius: 'var(--r-sm)' }}>
                      <Pencil size={20} />
                    </div>
                    <div className="grow">
                      <div className="title">{t('staffProfile.editProfile')}</div>
                      <div className="sub">{t('staffProfile.editProfileSub')}</div>
                    </div>
                    <ChevronRight size={18} className="text-muted shrink-0" />
                  </div>
                </button>
                <button type="button" className="block w-full text-left" onClick={() => setPassOpen(true)}>
                  <div className="list-row tap">
                    <div className="w-11 h-11 bg-accent-soft text-[#9a6d00] flex items-center justify-center shrink-0" style={{ borderRadius: 'var(--r-sm)' }}>
                      <KeyRound size={20} />
                    </div>
                    <div className="grow">
                      <div className="title">{t('staffProfile.changePassword')}</div>
                      <div className="sub">{t('staffProfile.changePasswordSub')}</div>
                    </div>
                    <ChevronRight size={18} className="text-muted shrink-0" />
                  </div>
                </button>
              </Card>
            </section>

            {isTeacher && (
              <section>
                <Card flush>
                  <button type="button" className="block w-full text-left" onClick={() => navigate('/staff/groups')}>
                    <div className="list-row tap">
                      <div className="w-11 h-11 bg-success-soft text-success flex items-center justify-center shrink-0" style={{ borderRadius: 'var(--r-sm)' }}>
                        <Users size={20} />
                      </div>
                      <div className="grow">
                        <div className="title">{t('staff.groups')}</div>
                        <div className="sub">{t('staffProfile.groupsCountSub')}: {profile?.groupsCount ?? 0}</div>
                      </div>
                      <ChevronRight size={18} className="text-muted shrink-0" />
                    </div>
                  </button>
                  <button type="button" className="block w-full text-left" onClick={() => navigate('/staff/attendance')}>
                    <div className="list-row tap">
                      <div className="w-11 h-11 bg-danger-soft text-danger flex items-center justify-center shrink-0" style={{ borderRadius: 'var(--r-sm)' }}>
                        <CalendarCheck2 size={20} />
                      </div>
                      <div className="grow">
                        <div className="title">{t('staff.attendance')}</div>
                        <div className="sub">{t('attMark.selectDate')}</div>
                      </div>
                      <ChevronRight size={18} className="text-muted shrink-0" />
                    </div>
                  </button>
                  <button type="button" className="block w-full text-left" onClick={() => navigate('/staff/quizzes')}>
                    <div className="list-row tap">
                      <div className="w-11 h-11 bg-info-soft text-info flex items-center justify-center shrink-0" style={{ borderRadius: 'var(--r-sm)' }}>
                        <ListChecks size={20} />
                      </div>
                      <div className="grow">
                        <div className="title">{t('staff.quizzes')}</div>
                        <div className="sub">{t('staffProfile.quizzesCountSub')}: {profile?.quizzesCount ?? 0}</div>
                      </div>
                      <ChevronRight size={18} className="text-muted shrink-0" />
                    </div>
                  </button>
                </Card>
              </section>
            )}

            <section>
              <Card flush>
                <div className="list-row">
                  <div className="w-11 h-11 bg-surface-2 text-muted flex items-center justify-center shrink-0" style={{ borderRadius: 'var(--r-sm)' }}>
                    <ShieldCheck size={20} />
                  </div>
                  <div className="grow">
                    <div className="title">{t('staffProfile.role')}</div>
                    <div className="sub">{t('staffProfile.roleNote')}</div>
                  </div>
                  <Badge color={ROLE_COLOR[role] || 'neutral'}>{t(ROLE_LABEL[role] || 'staff.roleTeacher')}</Badge>
                </div>
              </Card>
            </section>
          </div>
        </div>
      </div>

      {/* Profilni tahrirlash */}
      <Sheet open={editOpen} onClose={() => setEditOpen(false)} title={t('staffProfile.editProfile')}>
        <Field label={t('staffP.fullName')}>
          <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
        </Field>
        <Field label={t('staffP.phone')} hint={t('staffProfile.loginInfo')}>
          <PhoneInput value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} staticCountry />
        </Field>
        <Button className="w-full" loading={busy} onClick={saveProfile}>{t('common.save')}</Button>
      </Sheet>

      {/* Parolni o'zgartirish */}
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
