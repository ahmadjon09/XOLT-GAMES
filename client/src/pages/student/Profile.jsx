import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Globe, ImagePlus, Loader2, ListChecks, Pencil, Settings, Store, Upload, Users, Volume2 } from 'lucide-react';
import { Fetch, errorMessage } from '../../api/fetcher.js';
import { useGet, useInvalidate } from '../../api/hooks.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { Avatar, AnimatedName, Button, Input, Field, CoinBadge, Sheet, Toggle, LangSwitcher, AutoGrid, Card } from '../../components/ui.jsx';
import ImageCropper from '../../components/ImageCropper.jsx';
import OnlineActivity from '../../components/OnlineActivity.jsx';
import { TopBar } from '../../layouts/Layouts.jsx';
import { fmtNum, fmtDate } from '../../utils/format.js';
import { isSoundEnabled, setSoundEnabled } from '../../utils/sound.js';
import { fileToDataUrl, validateImageFile } from '../../utils/cropImage.js';

export default function Profile() {
  const { t } = useTranslation();
  const toast = useToast();
  const { user, refresh } = useAuth();
  const invalidate = useInvalidate();
  const [editOpen, setEditOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sound, setSound] = useState(isSoundEnabled());
  const fileRef = useRef(null);
  const coverRef = useRef(null);
  const [avatarCrop, setAvatarCrop] = useState(null);
  const [coverCrop, setCoverCrop] = useState(null);
  const [form, setForm] = useState({ username: '', full_name: '' });
  const [busy, setBusy] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [coverUploading, setCoverUploading] = useState(false);
  const { data: profile, isLoading } = useGet('/user/profile', { refreshInterval: 30_000 });

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
      toast.success(t('profile.avatarChanged'));
      await refresh();
      invalidate('/user/profile');
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setAvatarUploading(false);
    }
  };

  const onCoverPick = async (file) => {
    if (!file) return;
    const check = validateImageFile(file, 5);
    if (!check.ok) {
      toast.error(check.error === 'TOO_LARGE' ? t('crop.fileTooLarge', { mb: check.maxMb }) : t('crop.invalidType'));
      return;
    }
    try {
      setCoverCrop({ src: await fileToDataUrl(file) });
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const uploadCover = async (blob) => {
    setCoverUploading(true);
    const formData = new FormData();
    formData.append('file', blob, 'profile-cover.png');
    formData.append('folder', 'covers');
    try {
      await Fetch.upload('/upload', formData);
      toast.success(t('profile.coverChanged'));
      await refresh();
      invalidate('/user/profile');
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setCoverUploading(false);
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
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  if (isLoading && !profile) {
    return (
      <>
        <TopBar title={t('profile.title')} />
        <div className="page pt-4 space-y-[var(--gap)]">
          <div className="grid lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)] gap-[var(--gap)] items-start">
            <div className="space-y-[var(--gap)]">
              <Card className="flex flex-col items-center gap-3">
                <div className="skeleton w-[104px] h-[104px] rounded-full" />
                <div className="skeleton h-6 w-40" />
                <div className="skeleton h-4 w-52" />
              </Card>
              <AutoGrid col={150}>{[...Array(3)].map((_, i) => <div key={i} className="skeleton h-[96px]" style={{ borderRadius: 'var(--r-md)' }} />)}</AutoGrid>
            </div>
            <div className="skeleton h-[260px]" style={{ borderRadius: 'var(--r-lg)' }} />
          </div>
        </div>
      </>
    );
  }

  const currentProfile = profile || user || {};
  return (
    <>
      <TopBar
        title={t('profile.title')}
        right={<button className="btn ico ghost" onClick={() => setSettingsOpen(true)} title={t('common.settings')} aria-label={t('common.settings')}><Settings size={18} /></button>}
      />
      <div className="page pt-4">
        <div className="grid lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)] gap-[var(--gap)] items-start">
          <div className="space-y-[var(--gap)]">
            <Card className="p-0 overflow-hidden text-center">
              <div className="relative h-32 sm:h-40 bg-gradient-to-r from-violet-700 via-primary to-indigo-600">
                {currentProfile.coverImage && <img src={currentProfile.coverImage} alt="" className="absolute inset-0 w-full h-full object-cover" />}
                <div className="absolute inset-0 bg-gradient-to-t from-black/25 to-transparent" />
                <button
                  type="button"
                  onClick={() => coverRef.current?.click()}
                  disabled={coverUploading}
                  className="absolute top-3 right-3 z-10 inline-flex items-center gap-2 rounded-xl bg-black/45 px-3 py-2 text-xs font-bold text-white backdrop-blur hover:bg-black/60 disabled:opacity-50"
                  aria-label={t('profile.changeCover')}
                >
                  {coverUploading ? <Loader2 size={15} className="animate-spin" /> : <ImagePlus size={15} />}
                  <span>{t('profile.changeCover')}</span>
                </button>
                <input ref={coverRef} type="file" accept="image/*" hidden onChange={(event) => { onCoverPick(event.target.files[0]); event.target.value = ''; }} />
              </div>
              <div className="relative -mt-14 px-4 pb-5">
                <div className="relative inline-block">
                  <Avatar w={112} avatar={currentProfile.avatar} frame={currentProfile.currentFrame} />
                  <button
                    onClick={() => fileRef.current?.click()}
                    disabled={avatarUploading}
                    className="absolute -right-1 -bottom-1 w-9 h-9 rounded-full bg-primary text-white flex items-center justify-center shadow-[0_4px_12px_rgba(91,30,166,0.45)] hover:scale-110 transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
                    aria-label={t('profile.changeAvatar')}
                  >
                    {avatarUploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                  </button>
                  <input ref={fileRef} type="file" accept="image/*" hidden onChange={(event) => { onAvatarPick(event.target.files[0]); event.target.value = ''; }} />
                </div>
                <div className="mt-3.5 text-[21px] font-extrabold tracking-tight">
                  <AnimatedName config={currentProfile.currentEffect?.config}>{currentProfile.full_name}</AnimatedName>
                </div>
                <div className="text-muted text-[13px] mt-0.5">
                  {currentProfile.username ? `@${currentProfile.username}` : currentProfile.email || ''}
                </div>
                <div className="flex justify-center gap-2 mt-3.5 flex-wrap">
                  <CoinBadge value={currentProfile.coin ?? 0} />
                  {currentProfile.createdAt && <span className="badge neutral">{t('profile.memberSince')}: {fmtDate(currentProfile.createdAt)}</span>}
                </div>
                <Button variant="soft" size="sm" className="mt-4" onClick={() => { setForm({ username: currentProfile.username || '', full_name: currentProfile.full_name || '' }); setEditOpen(true); }}>
                  <Pencil size={15} /> {t('profile.edit')}
                </Button>
              </div>
            </Card>

            <AutoGrid col={150}>
              {[
                { label: t('profile.score'), value: fmtNum(currentProfile.score ?? 0) },
                { label: t('profile.weekScore'), value: fmtNum(currentProfile.week_score ?? 0) },
                { label: t('profile.monthScore'), value: fmtNum(currentProfile.month_score ?? 0) },
              ].map((stat) => (
                <div key={stat.label} className="tile"><div className="tile-v">{stat.value}</div><div className="tile-l">{stat.label}</div></div>
              ))}
            </AutoGrid>
            <OnlineActivity activity={currentProfile.activity} />
          </div>

          <section>
            <div className="section-title"><div className="t">{t('profile.shortcuts')}</div></div>
            <Card flush>
              {[
                { to: '/friends', icon: Users, title: t('nav.friends'), sub: t('friends.inviteHint'), color: 'var(--color-primary)', bg: 'var(--color-primary-soft)' },
                { to: '/quizzes', icon: ListChecks, title: t('quizzesP.title'), sub: t('quizzesP.createQuiz'), color: '#e34c6b', bg: '#fdeef1' },
                { to: '/shop', icon: Store, title: t('nav.shop'), sub: t('shop.desc'), color: '#9a6d00', bg: 'var(--color-accent-soft)' },
              ].map((item) => (
                <Link key={item.to} to={item.to} className="block">
                  <div className="list-row tap">
                    <div className="w-11 h-11 flex items-center justify-center shrink-0" style={{ borderRadius: 'var(--r-sm)', background: item.bg, color: item.color }}><item.icon size={20} /></div>
                    <div className="grow min-w-0"><div className="title">{item.title}</div><div className="sub truncate">{item.sub}</div></div>
                    <span className="text-muted">›</span>
                  </div>
                </Link>
              ))}
            </Card>
          </section>
        </div>
      </div>

      <Sheet open={editOpen} onClose={() => setEditOpen(false)} title={t('profile.editProfile')}>
        <Field label={t('common.name')}><Input value={form.full_name} onChange={(event) => setForm({ ...form, full_name: event.target.value })} /></Field>
        <Field label={t('profile.username')}><Input value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} placeholder="@username" /></Field>
        <Button className="w-full" loading={busy} onClick={saveProfile}>{t('common.save')}</Button>
      </Sheet>

      <Sheet open={settingsOpen} onClose={() => setSettingsOpen(false)} title={t('profile.settings')}>
        <div className="flex items-center gap-3 py-3 border-b border-border">
          <Volume2 size={19} className="text-primary" />
          <div className="flex-1 min-w-0"><div className="font-bold text-[14.5px]">{t('profile.soundEnabled')}</div></div>
          <Toggle checked={sound} onChange={(enabled) => { setSound(enabled); setSoundEnabled(enabled); }} />
        </div>
        <div className="flex items-center gap-3 py-3">
          <Globe size={19} className="text-primary" />
          <div className="flex-1 min-w-0"><div className="font-bold text-[14.5px]">{t('profile.language')}</div></div>
          <LangSwitcher />
        </div>
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
      <ImageCropper
        open={!!coverCrop}
        imageSrc={coverCrop?.src}
        onCancel={() => setCoverCrop(null)}
        onComplete={(blob) => { setCoverCrop(null); uploadCover(blob); }}
        aspect={3.2}
        outputSize={{ width: 1600, height: 500 }}
        label={t('profile.changeCover')}
      />
    </>
  );
}
