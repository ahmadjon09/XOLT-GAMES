// QuizEditor.jsx
import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, ImagePlus, X, Save, ListChecks } from 'lucide-react';
import { Fetch, errorMessage } from '../../api/fetcher.js';
import { useGet } from '../../api/hooks.js';
import { useToast } from '../../context/ToastContext.jsx';
import { Card, Button, Input, Field, Textarea, PageLoader, PageError, Select, PageHeader } from '../../components/ui.jsx';
import ImageCropper from '../../components/ImageCropper.jsx';
import { fileToDataUrl, validateImageFile } from '../../utils/cropImage.js';
import { fmtInt } from '../../utils/format.js';
import { TopBar } from '../../layouts/Layouts.jsx';

const EMPTY_QUESTION = () => ({
  text: '',
  variants: ['', '', '', ''],
  answerIndex: 0,
  image: null,
  timeLimit: 20,
  points: 1000,
});

export default function QuizEditor() {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [name, setName] = useState('');
  const [keywords, setKeywords] = useState('');
  const [questions, setQuestions] = useState([EMPTY_QUESTION()]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(!!id);
  const fileRef = useRef(null);
  const fileForRef = useRef(null);
  const [cropFor, setCropFor] = useState(null);

  const { data: quiz, isLoading: quizLoading, error: quizError } = useGet(id ? `/user/quizzes/${id}` : null);

  useEffect(() => {
    if (!id || !quiz) return;
    setName(quiz.name);
    setKeywords((quiz.keywords || []).join(', '));
    setQuestions(
      quiz.questions.map((qq) => ({
        text: qq.text,
        variants: qq.variants,
        answerIndex: qq.variants.indexOf(qq.answer),
        image: qq.image || null,
        timeLimit: qq.timeLimit || 20,
        points: qq.points || 1000,
      }))
    );
    setLoading(false);
  }, [id, quiz]);

  useEffect(() => {
    if (id && !quizLoading && quizError) setLoading(false);
  }, [id, quizLoading, quizError]);

  const updateQ = (qi, patch) => {
    setQuestions((qs) => qs.map((q, i) => (i === qi ? { ...q, ...patch } : q)));
  };

  const addQuestion = () => setQuestions((qs) => [...qs, EMPTY_QUESTION()]);
  const removeQuestion = (qi) => setQuestions((qs) => qs.filter((_, i) => i !== qi));
  const addVariant = (qi) => {
    if (questions[qi].variants.length >= 6) return;
    updateQ(qi, { variants: [...questions[qi].variants, ''] });
  };
  const removeVariant = (qi, vi) => {
    const variants = questions[qi].variants.filter((_, i) => i !== vi);
    updateQ(qi, { variants, answerIndex: Math.min(questions[qi].answerIndex, variants.length - 1) });
  };

  const onImagePick = async (qi, file) => {
    if (!file) return;
    const check = validateImageFile(file, 5);
    if (!check.ok) {
      toast.error(check.error === 'TOO_LARGE' ? t('crop.fileTooLarge', { mb: check.maxMb }) : t('crop.invalidType'));
      return;
    }
    try {
      const src = await fileToDataUrl(file);
      setCropFor({ qi, src });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const uploadImage = async (blob) => {
    const fd = new FormData();
    fd.append('file', blob, 'question.png');
    fd.append('folder', 'questions');
    try {
      const { url } = await Fetch.upload('/upload', fd);
      updateQ(cropFor.qi, { image: url });
      toast.success(t('common.done'));
    } catch (e) {
      toast.error(errorMessage(e));
    }
    setCropFor(null);
  };

  const save = async () => {
    if (!name.trim()) return toast.error(t('common.required'));
    const validQuestions = questions
      .filter((q) => q.text.trim() && q.variants.some((v) => v.trim()))
      .map((q) => ({
        text: q.text.trim(),
        variants: q.variants.map((v) => v.trim()).filter(Boolean),
        answer: q.variants[q.answerIndex]?.trim(),
        image: q.image,
        timeLimit: q.timeLimit,
        points: q.points,
      }));

    if (validQuestions.length === 0) return toast.error(t('quizzesP.minQuestions'));
    if (validQuestions.some((q) => !q.answer)) return toast.error(t('quizzesP.answerRequired'));

    setBusy(true);
    try {
      if (id) {
        await Fetch.patch(`/user/quizzes/${id}`, { name: name.trim(), keywords: keywords.split(',').map((k) => k.trim()).filter(Boolean), questions: validQuestions });
      } else {
        await Fetch.post('/user/quizzes', { name: name.trim(), keywords: keywords.split(',').map((k) => k.trim()).filter(Boolean), questions: validQuestions });
      }
      toast.success(t('quizzesP.saveSuccess'));
      navigate('/quizzes');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (loading || quizLoading) return <PageLoader />;
  if (id && quizError) {
    return <><TopBar title={t('quizzesP.title')} back /><div className="page-staff pt-4"><PageError onRetry={() => navigate('/quizzes')} /></div></>;
  }

  return (
    <>
      <TopBar title={t('quizzesP.title')} back />
      <div className="page-staff pt-4 space-y-3.5">
      {/* Header */}
      <PageHeader
        icon={ListChecks}
        title={id ? t('quizzesP.edit') : t('quizzesP.newQuiz')}
        back
        onBack={() => navigate('/quizzes')}
        actions={
          <Button variant="outline" size="sm" onClick={() => navigate('/quizzes')}>
            <X size={15} /> {t('common.cancel')}
          </Button>
        }
      />

      {/* Basic info */}
      <Card className="p-4 space-y-3">
        <Field label={t('quizzesP.quizName')}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Matematika bo'yicha test" disabled={busy} />
        </Field>
        <Field label={t('quizzesP.keywords')}>
          <Input value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="matematika, test" disabled={busy} />
        </Field>
      </Card>

      {/* Questions list */}
      <div className="flex items-center justify-between">
        <span className="font-bold">{t('quizzesP.questions')} ({questions.length})</span>
        <Button variant="soft" size="sm" onClick={addQuestion} disabled={busy}>
          <Plus size={15} className="mr-1" /> {t('quizzesP.addQuestion')}
        </Button>
      </div>

      {questions.map((q, qi) => (
        <Card key={qi} className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-bold">{t('quizzesP.questionNumber')} {qi + 1}</span>
            {questions.length > 1 && (
              <button className="text-danger hover:bg-danger-soft w-9 h-9 min-w-[36px] flex items-center justify-center rounded-[10px] shrink-0" onClick={() => removeQuestion(qi)} disabled={busy}>
                <Trash2 size={16} />
              </button>
            )}
          </div>

          <Field label={t('quizzesP.questionText')}>
            <Textarea value={q.text} onChange={(e) => updateQ(qi, { text: e.target.value })} placeholder={t('quizzesP.questionText')} disabled={busy} />
          </Field>

          {/* Image */}
          <div>
            {q.image ? (
              <div className="relative inline-block">
                <img src={q.image} alt="" className="h-24 rounded-xl border" />
                <button
                  className="absolute -top-2 -right-2 bg-danger text-white rounded-full w-6 h-6 flex items-center justify-center"
                  onClick={() => updateQ(qi, { image: null })}
                  disabled={busy}
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <Button variant="outline" size="sm" onClick={() => { fileForRef.current = qi; fileRef.current?.click(); }} disabled={busy}>
                <ImagePlus size={14} className="mr-1" /> {t('quizzesP.addImage')}
              </Button>
            )}
          </div>

          {/* Variants */}
          <div>
            <div className="text-sm font-semibold text-muted mb-2">{t('quizzesP.variants')} — {t('quizzesP.selectCorrect')}</div>
            {q.variants.map((v, vi) => (
              <div key={vi} className="flex gap-2 mb-2">
                <button
                  className={`w-10 h-10 rounded-xl font-bold flex-shrink-0 ${q.answerIndex === vi ? 'bg-success-soft text-success border-2 border-success' : 'bg-surface-2 text-muted border-2 border-transparent'}`}
                  onClick={() => updateQ(qi, { answerIndex: vi })}
                  disabled={busy}
                >
                  {String.fromCharCode(65 + vi)}
                </button>
                <Input
                  value={v}
                  onChange={(e) => updateQ(qi, { variants: q.variants.map((x, i) => (i === vi ? e.target.value : x)) })}
                  placeholder={`${t('quizzesP.variantPlaceholder')} ${String.fromCharCode(65 + vi)}`}
                  disabled={busy}
                />
                {q.variants.length > 2 && (
                  <button className="text-danger hover:bg-danger-soft w-9 h-9 min-w-[36px] flex items-center justify-center rounded-[10px] shrink-0" onClick={() => removeVariant(qi, vi)} disabled={busy}>
                    <X size={16} />
                  </button>
                )}
              </div>
            ))}
            {q.variants.length < 6 && (
              <Button variant="outline" size="sm" onClick={() => addVariant(qi)} disabled={busy}>
                <Plus size={14} className="mr-1" /> {t('quizzesP.addVariant')}
              </Button>
            )}
          </div>

          {/* Settings */}
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('quizzesP.timeLimit')}>
              <Select value={q.timeLimit} onChange={(e) => updateQ(qi, { timeLimit: parseInt(e.target.value) })} disabled={busy}>
                {[10, 15, 20, 30, 45, 60, 90, 120].map((s) => <option key={s} value={s}>{s} {t('quizzesP.seconds')}</option>)}
              </Select>
            </Field>
            <Field label={t('quizzesP.points')}>
              <Select value={q.points} onChange={(e) => updateQ(qi, { points: parseInt(e.target.value) })} disabled={busy}>
                {[500, 1000, 1500, 2000, 3000, 5000].map((p) => <option key={p} value={p}>{fmtInt(p)}</option>)}
              </Select>
            </Field>
          </div>
        </Card>
      ))}

      <Button variant="soft" className="w-full" onClick={addQuestion} disabled={busy}>
        <Plus size={16} className="mr-1.5" /> {t('quizzesP.addQuestion')}
      </Button>

      <Button className="w-full" size="lg" loading={busy} onClick={save}>
        <Save size={18} className="mr-1.5" /> {t('quizzesP.saveQuiz')}
      </Button>

      {/* Hidden file input */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const qi = fileForRef.current;
          fileForRef.current = null;
          if (e.target.files[0] && qi !== null) onImagePick(qi, e.target.files[0]);
          e.target.value = '';
        }}
      />

      <ImageCropper
        open={!!cropFor}
        imageSrc={cropFor?.src}
        onCancel={() => setCropFor(null)}
        onComplete={(blob) => uploadImage(blob)}
        aspect={16 / 9}
        outputSize={{ width: 960, height: 540 }}
        circular={false}
        label={t('crop.cropQuestion')}
      />
    </div>
    </>
  );
}