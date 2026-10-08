// XOLT Games seed: OAuth-provisioned admin, public game catalog and sample game content.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============ SVG FRAME GENERATOR ============
// Avatar ramkalari - markazi shaffof, chekkasi rangli SVG
function frameSvg(id, outer, inner, glow, width = 8) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
  <defs>
    <linearGradient id="g${id}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${outer}" />
      <stop offset="100%" stop-color="${inner}" />
    </linearGradient>
    <filter id="f${id}" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="6" result="blur" />
      <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
    </filter>
  </defs>
  <rect x="6" y="6" width="188" height="188" rx="36" fill="none" stroke="url(#g${id})" stroke-width="${width}" filter="url(#f${id})" />
</svg>`;
}

// ============ EFFECT KONFIGLARI ============
const EFFECTS = [
  {
    id: 'effect_glow',
    name: 'Oltin yoruglik',
    description: 'Ismingiz oltin rangda porlaydi',
    type: 'text',
    price: 300,
    config: {
      style: {
        color: '#f59e0b',
        textShadow: '0 0 6px rgba(245,158,11,.85), 0 0 22px rgba(245,158,11,.45)',
        animation: 'xoltGlow 2s ease-in-out infinite',
        fontWeight: '700',
      },
      keyframes: {
        xoltGlow: {
          '0%': { textShadow: '0 0 4px rgba(245,158,11,.6), 0 0 14px rgba(245,158,11,.3)' },
          '50%': { textShadow: '0 0 10px rgba(245,158,11,1), 0 0 30px rgba(245,158,11,.6)' },
          '100%': { textShadow: '0 0 4px rgba(245,158,11,.6), 0 0 14px rgba(245,158,11,.3)' },
        },
      },
    },
  },
  {
    id: 'effect_rainbow',
    name: 'Kamalak',
    description: 'Ismingiz kamalak ranglarida harakatlanadi',
    type: 'text',
    price: 500,
    config: {
      style: {
        background: 'linear-gradient(90deg,#f43f5e,#f59e0b,#10b981,#3b82f6,#8b5cf6,#f43f5e)',
        backgroundSize: '300% 100%',
        WebkitBackgroundClip: 'text',
        backgroundClip: 'text',
        color: 'transparent',
        fontWeight: '800',
        animation: 'xoltRainbow 4s linear infinite',
      },
      keyframes: {
        xoltRainbow: {
          '0%': { backgroundPosition: '0% 50%' },
          '100%': { backgroundPosition: '300% 50%' },
        },
      },
    },
  },
  {
    id: 'effect_shake',
    name: 'Titrash',
    description: 'Ismingiz jadal titraydi',
    type: 'text',
    price: 200,
    config: {
      style: {
        color: '#ef4444',
        fontWeight: '800',
        animation: 'xoltShake .4s ease-in-out infinite',
        display: 'inline-block',
      },
      keyframes: {
        xoltShake: {
          '0%': { transform: 'translateX(0)' },
          '25%': { transform: 'translateX(-2px) rotate(-1.5deg)' },
          '75%': { transform: 'translateX(2px) rotate(1.5deg)' },
          '100%': { transform: 'translateX(0)' },
        },
      },
    },
  },
  {
    id: 'effect_bounce',
    name: 'Sakrash',
    description: 'Ismingiz yuqoriga sakraydi',
    type: 'text',
    price: 250,
    config: {
      style: {
        color: '#3b82f6',
        fontWeight: '800',
        animation: 'xoltBounce 1s ease-in-out infinite',
        display: 'inline-block',
      },
      keyframes: {
        xoltBounce: {
          '0%': { transform: 'translateY(0)' },
          '40%': { transform: 'translateY(-5px)' },
          '70%': { transform: 'translateY(0)' },
          '100%': { transform: 'translateY(0)' },
        },
      },
    },
  },
  {
    id: 'effect_fire',
    name: 'Olov',
    description: 'Ismingiz olov rangida yonadi',
    type: 'text',
    price: 800,
    config: {
      style: {
        color: '#f97316',
        textShadow: '0 0 8px rgba(249,115,22,.9), 0 0 24px rgba(239,68,68,.6), 0 -2px 6px rgba(250,204,21,.8)',
        fontWeight: '900',
        animation: 'xoltFire 1.2s ease-in-out infinite',
      },
      keyframes: {
        xoltFire: {
          '0%': { textShadow: '0 0 6px rgba(249,115,22,.8), 0 0 18px rgba(239,68,68,.5), 0 -2px 4px rgba(250,204,21,.7)' },
          '50%': { textShadow: '0 0 14px rgba(249,115,22,1), 0 0 34px rgba(239,68,68,.8), 0 -4px 10px rgba(250,204,21,1)' },
          '100%': { textShadow: '0 0 6px rgba(249,115,22,.8), 0 0 18px rgba(239,68,68,.5), 0 -2px 4px rgba(250,204,21,.7)' },
        },
      },
    },
  },
  {
    id: 'effect_neon',
    name: 'Neon',
    description: 'Ismingiz neon chiroqday yonadi',
    type: 'text',
    price: 1000,
    config: {
      style: {
        color: '#a5b4fc',
        textShadow: '0 0 5px #6366f1, 0 0 12px #6366f1, 0 0 22px #8b5cf6, 0 0 40px #8b5cf6',
        fontWeight: '800',
        animation: 'xoltNeon 1.6s ease-in-out infinite',
      },
      keyframes: {
        xoltNeon: {
          '0%': { opacity: '.75' },
          '50%': { opacity: '1' },
          '100%': { opacity: '.75' },
        },
      },
    },
  },
];

async function main() {
  console.log('[seed] boshlanmoqda...');

  // The first allowlisted OAuth email becomes the seeded administrator.
  const adminEmail = String(
    process.env.ADMIN_OAUTH_EMAILS?.split(',')[0] || process.env.ADMIN_SEED_EMAIL || 'admin@example.com',
  ).trim().toLowerCase();
  const admin = await prisma.staff.upsert({
    where: { email: adminEmail },
    // Seeding must not reactivate an administrator disabled in the panel.
    update: { full_name: 'Bosh Administrator', role: 'ADMIN' },
    create: { full_name: 'Bosh Administrator', email: adminEmail, role: 'ADMIN', active: true },
  });

  const framesDir = path.join(__dirname, '..', 'uploads', 'frames');
  fs.mkdirSync(framesDir, { recursive: true });
  const frames = [
    { id: 'frame_classic', name: 'Klassik', price: 0, rarity: 'common', colors: ['#cbd5e1', '#64748b'], file: 'frame_classic.svg' },
    { id: 'frame_bronze', name: 'Bronza', price: 150, rarity: 'common', colors: ['#d97706', '#92400e'], file: 'frame_bronze.svg' },
    { id: 'frame_silver', name: 'Kumush', price: 400, rarity: 'uncommon', colors: ['#e2e8f0', '#94a3b8'], file: 'frame_silver.svg' },
    { id: 'frame_gold', name: 'Oltin', price: 1000, rarity: 'rare', colors: ['#fbbf24', '#b45309'], file: 'frame_gold.svg' },
    { id: 'frame_neon', name: 'Neon', price: 2500, rarity: 'epic', colors: ['#a78bfa', '#6366f1'], file: 'frame_neon.svg' },
    { id: 'frame_legend', name: 'Afsonaviy', price: 5000, rarity: 'legendary', colors: ['#f472b6', '#8b5cf6'], file: 'frame_legend.svg' },
  ];
  for (const [index, frame] of frames.entries()) {
    fs.writeFileSync(
      path.join(framesDir, frame.file),
      frameSvg(frame.id, frame.colors[0], frame.colors[1], '#000'),
    );
    await prisma.frame.upsert({
      where: { id: frame.id },
      update: { name: frame.name, price: frame.price, rarity: frame.rarity, image: `/uploads/frames/${frame.file}` },
      create: {
        id: frame.id,
        name: frame.name,
        price: frame.price,
        rarity: frame.rarity,
        image: `/uploads/frames/${frame.file}`,
        description: `"${frame.name}" avatar ramkasi`,
        sortOrder: index,
      },
    });
  }

  for (const [index, effect] of EFFECTS.entries()) {
    await prisma.effect.upsert({
      where: { id: effect.id },
      update: { name: effect.name, price: effect.price, config: effect.config },
      create: { ...effect, sortOrder: index },
    });
  }

  const games = [
    { id: 'math', sortOrder: 0 },
    { id: 'quiz', sortOrder: 1 },
    { id: 'tictactoe', sortOrder: 2 },
    { id: 'chess', sortOrder: 3 },
    { id: 'checkers', sortOrder: 4 },
    { id: 'typerace', sortOrder: 5 },
    { id: 'codebattle', sortOrder: 6 },
  ];
  for (const game of games) {
    await prisma.gameCatalog.upsert({
      where: { id: game.id },
      update: { sortOrder: game.sortOrder },
      create: { ...game, active: true },
    });
  }

  const quizName = 'Matematika asoslari';
  if (!(await prisma.quiz.findFirst({ where: { name: quizName } }))) {
    await prisma.quiz.create({
      data: {
        name: quizName,
        keywords: ['matematika', 'boshlangich'],
        createdById: admin.id,
        isPublic: true,
        active: true,
        questions: {
          create: [
            { text: '12 + 34 nechaga teng?', variants: ['44', '46', '48', '52'], answer: '46', timeLimit: 20, points: 1000, sortOrder: 0 },
            { text: '9 x 7 nechaga teng?', variants: ['56', '63', '72', '81'], answer: '63', timeLimit: 20, points: 1000, sortOrder: 1 },
            { text: '100 - 37 nechaga teng?', variants: ['63', '67', '73', '57'], answer: '63', timeLimit: 20, points: 1000, sortOrder: 2 },
            { text: '144 sonining kvadrat ildizi qancha?', variants: ['10', '11', '12', '14'], answer: '12', timeLimit: 30, points: 1500, sortOrder: 3 },
            { text: '3/4 kasrning o\'nli ko\'rinishi qaysi?', variants: ['0.25', '0.5', '0.75', '1.25'], answer: '0.75', timeLimit: 30, points: 1500, sortOrder: 4 },
          ],
        },
      },
    });
  }

  const typingTexts = [
    { title: 'Matematika haqida', lang: 'uz', difficulty: 'easy', content: "Matematika fanlar ichida eng qadimgi fanlardan biridir. U bizning kundalik hayotimizda juda muhim o'rin tutadi. Hisob-kitob qilish, o'lchash va solishtirish matematikaning asosiy vazifalaridir. Matematikani o'rganish orqali fikrlash qobiliyatimiz rivojlanadi." },
    { title: 'O\'zbekiston', lang: 'uz', difficulty: 'normal', content: "O'zbekiston Markaziy Osiyoda joylashgan go'zal davlatdir. Uning poytaxti Toshkent shahri bo'lib, bu yerda ko'plab tarixiy obidalar va zamonaviy binolar mavjud. O'zbek xalqi mehmondo'stligi bilan mashhur." },
    { title: 'Tabiatni asrang', lang: 'uz', difficulty: 'hard', content: 'Tabiat bizning eng katta boyligimizdir. Har bir inson atrof-muhitni asrashga hissa qo\'shishi kerak. Daraxt ekish, suvni tejash va chiqindilarni saralash orqali biz kelajak avlodlarga toza dunyo qoldiramiz.' },
    { title: 'О математике', lang: 'ru', difficulty: 'easy', content: 'Математика - одна из древнейших наук. Она занимает важное место в нашей повседневной жизни. Счёт, измерение и сравнение - основные задачи математики. Изучение математики развивает наше мышление.' },
    { title: 'Узбекистан', lang: 'ru', difficulty: 'normal', content: 'Узбекистан - прекрасная страна в Центральной Азии. Его столица - город Ташкент, где много исторических памятников и современных зданий. Узбекский народ славится своим гостеприимством.' },
    { title: 'Берегите природу', lang: 'ru', difficulty: 'hard', content: 'Природа - наше самое большое богатство. Каждый человек должен внести свой вклад в защиту окружающей среды. Сажая деревья, экономя воду и сортируя отходы, мы оставим чистый мир будущим поколениям.' },
    { title: 'About Mathematics', lang: 'en', difficulty: 'easy', content: 'Mathematics is one of the oldest sciences. It plays an important role in our everyday life. Counting, measuring and comparing are the main tasks of mathematics. Learning mathematics develops our thinking.' },
    { title: 'Uzbekistan', lang: 'en', difficulty: 'normal', content: 'Uzbekistan is a beautiful country in Central Asia. Its capital is the city of Tashkent, which has many historical monuments and modern buildings. Uzbek people are famous for their hospitality.' },
    { title: 'Protect Nature', lang: 'en', difficulty: 'hard', content: 'Nature is our greatest treasure. Every person should contribute to protecting the environment. By planting trees, saving water and sorting waste, we will leave a clean world for future generations.' },
  ];
  for (const text of typingTexts) {
    if (!(await prisma.typingText.findFirst({ where: { title: text.title, lang: text.lang } }))) {
      await prisma.typingText.create({ data: { ...text, createdById: admin.id } });
    }
  }

  const codeQuestions = [
    { title: 'console.log(Hello)', category: 'js', code: 'console.log("Hello World");', answer: 'Hello World', explanation: 'console.log() ekranga matn chiqaradi' },
    { title: 'JS summa', category: 'js', code: 'console.log(2 + 3 * 4);', answer: '14', explanation: "Ko'paytirish qo'shishdan oldin bajariladi: 3*4=12, 2+12=14" },
    { title: 'JS string', category: 'js', code: 'console.log("5" + 2);', answer: '52', explanation: 'String + son -> string birlashadi' },
    { title: 'Python print', category: 'python', code: 'print("Hello, Python!")', answer: 'Hello, Python!', explanation: 'print() funksiyasi ekranga chiqaradi' },
    { title: 'Python math', category: 'python', code: 'print(10 // 3)', answer: '3', explanation: 'Butun bo\'lish amali: 10//3 = 3' },
    { title: 'Python pow', category: 'python', code: 'print(2 ** 5)', answer: '32', explanation: 'Daraja amali: 2^5 = 32' },
    { title: 'C# Hello', category: 'csharp', code: 'Console.WriteLine("Hi");', answer: 'Hi', explanation: 'WriteLine ekranga chiqaradi' },
    { title: 'C# qoldiq', category: 'csharp', code: 'Console.WriteLine(7 % 3);', answer: '1', explanation: 'Qoldiq amali: 7 mod 3 = 1' },
    { title: 'C# bool', category: 'csharp', code: 'Console.WriteLine(5 > 3 && 2 < 4);', answer: 'True', explanation: 'Ikkala shart ham to\'g\'ri -> True' },
  ];
  for (const question of codeQuestions) {
    if (!(await prisma.codeQuestion.findFirst({ where: { title: question.title, category: question.category } }))) {
      await prisma.codeQuestion.create({ data: { ...question, createdById: admin.id } });
    }
  }

  console.log('[seed] tayyor!');
  console.log(`  Admin OAuth: ${adminEmail} (Google/GitHub allowlist) `);
  console.log('  Player accounts are created only through Google or GitHub OAuth.');
}

main()
  .catch((e) => {
    console.error('[seed] xato:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
