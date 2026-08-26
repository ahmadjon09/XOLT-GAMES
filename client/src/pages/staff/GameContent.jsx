// TEACHER: Type Racing matnlari CRUD (uz/ru/en) va Code Battle savollari CRUD
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, Plus, Trash2, Pencil, Code2 } from 'lucide-react';
import { Fetch, errorMessage } from '../../api/fetcher.js';
import { useGet, useInvalidate } from '../../api/hooks.js';
import { useToast } from '../../context/ToastContext.jsx';
import { Card, Button, Input, Field, PageLoader, EmptyState, Select, Textarea, Sheet, ConfirmDialog, Segmented } from '../../components/ui.jsx';
import { TopBar } from '../../layouts/Layouts.jsx';
import { fmtInt } from '../../utils/format.js';

const CATEGORIES = ['js', 'python', 'csharp', 'java', 'php', 'sql'];
const LANGS = ['uz', 'ru', 'en'];

// ================= TYPE RACING MATNLARI =================
export function TypingTexts() {
  const { t } = useTranslation();
  const toast = useToast();
  const invalidate = useInvalidate();
  const [langFilter, setLangFilter] = useState('all');
  const { data: texts, isLoading: textsLoading } = useGet(
    `/staff/typing-texts${langFilter !== 'all' ? `?lang=${langFilter}` : ''}`,
    { fallbackData: [] }
  );
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ title: '', lang: 'uz', content: '', difficulty: 'easy' });
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const openCreate = () => {
    setEditing(null);
    setForm({ title: '', lang: 'uz', content: '', difficulty: 'easy' });
    setEditorOpen(true);
  };
  const openEdit = (tx) => {
    setEditing(tx);
    setForm({ title: tx.title, lang: tx.lang, content: tx.content, difficulty: tx.difficulty });
    setEditorOpen(true);
  };

  const save = async () => {
    setBusy(true);
    try {
      if (editing) {
        await Fetch.patch(`/staff/typing-texts/${editing.id}`, form);
        toast.success(t('typing.updated'));
      } else {
        await Fetch.post('/staff/typing-texts', form);
        toast.success(t('typing.added'));
      }
      setEditorOpen(false);
      invalidate('/staff/typing-texts');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await Fetch.del(`/staff/typing-texts/${deleteTarget.id}`);
      toast.success(t('common.deleted'));
      setDeleteTarget(null);
      invalidate('/staff/typing-texts');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <TopBar
        title={t('typing.manageTexts')}
        back
        right={<Button className="sm primary" onClick={openCreate}><Plus size={15} /> {t('typing.addText')}</Button>}
      />
      <div className="page-staff pt-3.5">
        <div style={{ marginBottom: 12 }}>
          <Segmented
            value={langFilter}
            onChange={setLangFilter}
            options={[
              { value: 'all', label: t('common.all') },
              { value: 'uz', label: "O'z" },
              { value: 'ru', label: 'Рус' },
              { value: 'en', label: 'En' },
            ]}
          />
        </div>

        {textsLoading && !texts.length ? (
          <PageLoader />
        ) : texts.length === 0 ? (
          <Card><EmptyState icon={Keyboard} title={t('typing.noTexts')} action={<Button onClick={openCreate}><Plus size={16} /> {t('typing.addText')}</Button>} /></Card>
        ) : (
          <Card style={{ padding: '4px 14px' }}>
            {texts.map((tx) => (
              <div key={tx.id} className="row-item">
                <div style={{ width: 40, height: 40, borderRadius: 13, background: 'var(--primary-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, color: 'var(--primary)', flexShrink: 0, textTransform: 'uppercase' }}>
                  {tx.lang}
                </div>
                <div className="grow">
                  <div className="title">{tx.title}</div>
                  <div className="sub" style={{ maxWidth: 420, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {tx.content}
                  </div>
                </div>
                <span className="badge neutral">{tx.difficulty}</span>
                <button className="btn ghost sm" onClick={() => openEdit(tx)}><Pencil size={15} /></button>
                <button className="btn ghost sm" style={{ color: 'var(--danger)' }} onClick={() => setDeleteTarget(tx)}><Trash2 size={15} /></button>
              </div>
            ))}
          </Card>
        )}
      </div>

      <Sheet open={editorOpen} onClose={() => setEditorOpen(false)} title={editing ? t('typing.editText') : t('typing.addText')}>
        <Field label={t('typing.title')}>
          <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={t('typing.titlePlaceholder')} />
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label={t('typing.lang')}>
            <Select value={form.lang} onChange={(e) => setForm({ ...form, lang: e.target.value })}>
              {LANGS.map((l) => <option key={l} value={l}>{l === 'uz' ? "O'zbek" : l === 'ru' ? 'Русский' : 'English'}</option>)}
            </Select>
          </Field>
          <Field label={t('typing.difficulty')}>
            <Select value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value })}>
              {['easy', 'normal', 'hard'].map((d) => <option key={d} value={d}>{t(`math.difficulty${d === 'easy' ? 'Easy' : d === 'normal' ? 'Normal' : 'Hard'}`)}</option>)}
            </Select>
          </Field>
        </div>
        <Field label={t('typing.content')} hint={t('typing.contentHint')}>
          <Textarea value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} style={{ minHeight: 140 }} />
        </Field>
        <Button className="full" loading={busy} onClick={save}>{t('common.save')}</Button>
      </Sheet>

      <ConfirmDialog
        open={!!deleteTarget}
        title={t('common.delete')}
        message={t('common.confirmDelete')}
        danger
        onClose={() => setDeleteTarget(null)}
        onConfirm={remove}
        loading={busy}
      />
    </>
  );
}

// ================= CODE BATTLE SAVOLLARI =================
export function CodeQuestions() {
  const { t } = useTranslation();
  const toast = useToast();
  const invalidate = useInvalidate();
  const [catFilter, setCatFilter] = useState('all');
  const { data: questions, isLoading: qLoading } = useGet(
    `/staff/code-questions${catFilter !== 'all' ? `?category=${catFilter}` : ''}`,
    { fallbackData: [] }
  );
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ title: '', category: 'js', code: '', answer: '', explanation: '', timeLimit: 20, points: 1000 });
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const openCreate = () => {
    setEditing(null);
    setForm({ title: '', category: 'js', code: '', answer: '', explanation: '', timeLimit: 20, points: 1000 });
    setEditorOpen(true);
  };
  const openEdit = (q) => {
    setEditing(q);
    setForm({ title: q.title, category: q.category, code: q.code, answer: q.answer, explanation: q.explanation || '', timeLimit: q.timeLimit, points: q.points });
    setEditorOpen(true);
  };

  const save = async () => {
    setBusy(true);
    try {
      if (editing) {
        await Fetch.patch(`/staff/code-questions/${editing.id}`, form);
        toast.success(t('code.updated'));
      } else {
        await Fetch.post('/staff/code-questions', form);
        toast.success(t('code.added'));
      }
      setEditorOpen(false);
      invalidate('/staff/code-questions');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await Fetch.del(`/staff/code-questions/${deleteTarget.id}`);
      toast.success(t('common.deleted'));
      setDeleteTarget(null);
      invalidate('/staff/code-questions');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <TopBar
        title={t('code.manageQuestions')}
        back
        right={<Button className="sm primary" onClick={openCreate}><Plus size={15} /> {t('code.addQuestion')}</Button>}
      />
      <div className="page-staff pt-3.5">
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button
              onClick={() => setCatFilter('all')}
              className="badge"
              style={{ cursor: 'pointer', background: catFilter === 'all' ? 'var(--primary-soft)' : 'var(--surface-2)', color: catFilter === 'all' ? 'var(--primary)' : 'var(--muted)', padding: '8px 14px', border: catFilter === 'all' ? '1.5px solid var(--primary)' : '1.5px solid transparent' }}
            >
              {t('common.all')}
            </button>
            {CATEGORIES.map((c) => (
              <button
                key={c}
                onClick={() => setCatFilter(c)}
                className="badge"
                style={{ cursor: 'pointer', background: catFilter === c ? 'var(--primary-soft)' : 'var(--surface-2)', color: catFilter === c ? 'var(--primary)' : 'var(--muted)', padding: '8px 14px', fontSize: 12.5, textTransform: 'uppercase', border: catFilter === c ? '1.5px solid var(--primary)' : '1.5px solid transparent' }}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {qLoading && !questions.length ? (
          <PageLoader />
        ) : questions.length === 0 ? (
          <Card><EmptyState icon={Code2} title={t('code.noQuestions')} action={<Button onClick={openCreate}><Plus size={16} /> {t('code.addQuestion')}</Button>} /></Card>
        ) : (
          <Card style={{ padding: '4px 14px' }}>
            {questions.map((q) => (
              <div key={q.id} className="row-item">
                <div style={{ width: 40, height: 40, borderRadius: 13, background: '#f1ebfe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, color: '#8b5cf6', flexShrink: 0, textTransform: 'uppercase', fontSize: 11 }}>
                  {q.category}
                </div>
                <div className="grow">
                  <div className="title">{q.title}</div>
                  <div className="sub" style={{ maxWidth: 420, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>
                    {q.code}
                  </div>
                </div>
                <span className="badge success">→ {q.answer}</span>
                <button className="btn ghost sm" onClick={() => openEdit(q)}><Pencil size={15} /></button>
                <button className="btn ghost sm" style={{ color: 'var(--danger)' }} onClick={() => setDeleteTarget(q)}><Trash2 size={15} /></button>
              </div>
            ))}
          </Card>
        )}
      </div>

      <Sheet open={editorOpen} onClose={() => setEditorOpen(false)} title={editing ? t('code.editQuestion') : t('code.addQuestion')}>
        <Field label={t('code.title')}>
          <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="console.log(2+2)" />
        </Field>
        <Field label={t('code.category')}>
          <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c.toUpperCase()}</option>)}
          </Select>
        </Field>
        <Field label={t('code.code')} hint={t('code.codeHint')}>
          <Textarea value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} style={{ fontFamily: 'monospace', fontSize: 13, minHeight: 120 }} />
        </Field>
        <Field label={t('code.correctOutput')}>
          <Input value={form.answer} onChange={(e) => setForm({ ...form, answer: e.target.value })} placeholder="4" />
        </Field>
        <Field label={t('code.explanation')}>
          <Textarea value={form.explanation} onChange={(e) => setForm({ ...form, explanation: e.target.value })} style={{ minHeight: 60 }} />
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label={t('quizzesP.timeLimit')}>
            <Select value={form.timeLimit} onChange={(e) => setForm({ ...form, timeLimit: Number(e.target.value) })}>
              {[10, 15, 20, 30, 45, 60].map((s) => <option key={s} value={s}>{s} {t('quizzesP.seconds')}</option>)}
            </Select>
          </Field>
          <Field label={t('quizzesP.points')}>
            <Select value={form.points} onChange={(e) => setForm({ ...form, points: Number(e.target.value) })}>
              {[500, 1000, 1500, 2000].map((p) => <option key={p} value={p}>{fmtInt(p)}</option>)}
            </Select>
          </Field>
        </div>
        <Button className="full" loading={busy} onClick={save}>{t('common.save')}</Button>
      </Sheet>

      <ConfirmDialog
        open={!!deleteTarget}
        title={t('common.delete')}
        message={t('common.confirmDelete')}
        danger
        onClose={() => setDeleteTarget(null)}
        onConfirm={remove}
        loading={busy}
      />
    </>
  );
}
