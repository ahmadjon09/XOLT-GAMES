// XOLT Games - seed: demo ma'lumotlar yaratish
// Admin, teacher, cashier, o'quvchilar, guruhlar, frame (SVG ramkalar),
// effect konfiguratsiyalari, namuna viktorina, davomat va to'lovlar
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const hash = (p) => bcrypt.hash(p, 10);

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

  // ===== XODIMLAR =====
  const admin = await prisma.staff.upsert({
    where: { phone: '+998901234567' },
    update: {},
    create: { full_name: 'Bosh Administrator', phone: '+998901234567', password: await hash('admin123'), role: 'ADMIN' },
  });
  const cashier = await prisma.staff.upsert({
    where: { phone: '+998901234568' },
    update: {},
    create: { full_name: 'Malika Kassir', phone: '+998901234568', password: await hash('cashier123'), role: 'CASHIER', createdById: admin.id },
  });
  const teacher = await prisma.staff.upsert({
    where: { phone: '+998901234569' },
    update: {},
    create: { full_name: 'Aziz O\'qituvchi', phone: '+998901234569', password: await hash('teacher123'), role: 'TEACHER', createdById: admin.id },
  });

  // ===== GURUHLAR =====
  const g1 = await prisma.group.upsert({
    where: { id: 'group_math_5a' },
    update: { teacherId: teacher.id, monthlyFee: 200000 },
    create: { id: 'group_math_5a', name: 'Matematika 5-A', monthlyFee: 200000, teacherId: teacher.id },
  });
  const g2 = await prisma.group.upsert({
    where: { id: 'group_eng_5b' },
    update: { teacherId: teacher.id, monthlyFee: 250000 },
    create: { id: 'group_eng_5b', name: 'Ingliz tili 5-B', monthlyFee: 250000, teacherId: teacher.id },
  });

  // ===== O'QUVCHILAR (ba'zilari ikkala guruhda) =====
  const students = [
    { full_name: 'Ali Valiyev', phone: '+998900000001', username: 'ali_vali', groups: [g1.id, g2.id], coin: 500, score: 120 },
    { full_name: 'Zarina Karimova', phone: '+998900000002', username: 'zarina_k', groups: [g1.id], coin: 800, score: 340 },
    { full_name: 'Jasur Toshpulatov', phone: '+998900000003', username: 'jasur_t', groups: [g1.id, g2.id], coin: 120, score: 60 },
    { full_name: 'Nilufar Rahimova', phone: '+998900000004', username: 'nilu_r', groups: [g2.id], coin: 2000, score: 510 },
    { full_name: 'Bekzod Ergashev', phone: '+998900000005', username: 'bekzod_e', groups: [g1.id], coin: 60, score: 25 },
  ];

  for (const s of students) {
    const exists = await prisma.user.findUnique({ where: { phone: s.phone } });
    if (exists) {
      // Guruh a'zoligini kafolatlash
      for (const gid of s.groups) {
        await prisma.groupMember.upsert({
          where: { userId_groupId: { userId: exists.id, groupId: gid } },
          update: {},
          create: { userId: exists.id, groupId: gid },
        });
      }
      continue;
    }
    await prisma.user.create({
      data: {
        full_name: s.full_name,
        phone: s.phone,
        username: s.username,
        password: await hash('1234'),
        coin: s.coin,
        score: s.score,
        week_score: Math.floor(s.score * 0.4),
        month_score: Math.floor(s.score * 0.7),
        createdById: admin.id,
        groupMembers: { create: s.groups.map((gid) => ({ groupId: gid })) },
      },
    });
  }

  // ===== FRAMELAR (SVG ramkalar yaratiladi) =====
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

  for (const f of frames) {
    const filePath = path.join(framesDir, f.file);
    fs.writeFileSync(filePath, frameSvg(f.id, f.colors[0], f.colors[1], '#000'));
    await prisma.frame.upsert({
      where: { id: f.id },
      update: { name: f.name, price: f.price, rarity: f.rarity, image: `/uploads/frames/${f.file}` },
      create: {
        id: f.id,
        name: f.name,
        price: f.price,
        rarity: f.rarity,
        image: `/uploads/frames/${f.file}`,
        description: `"${f.name}" avatar ramkasi`,
        sortOrder: frames.indexOf(f),
      },
    });
  }

  // ===== EFFECTLAR =====
  for (const e of EFFECTS) {
    await prisma.effect.upsert({
      where: { id: e.id },
      update: { name: e.name, price: e.price, config: e.config },
      create: {
        id: e.id,
        name: e.name,
        description: e.description,
        type: e.type,
        price: e.price,
        config: e.config,
        sortOrder: EFFECTS.indexOf(e),
      },
    });
  }

  // ===== NAMUNA VIKTORINA =====
  const quizName = 'Matematika asoslari';
  const existingQuiz = await prisma.quiz.findFirst({ where: { name: quizName } });
  if (!existingQuiz) {
    await prisma.quiz.create({
      data: {
        name: quizName,
        keywords: ['matematika', 'boshlangich'],
        createdById: teacher.id,
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


  // ===== TYPE RACING MATNLARI (uz/ru/en) =====
  const typingTexts = [
    { title: "Matematika haqida", lang: 'uz', difficulty: 'easy', content: "Matematika fanlar ichida eng qadimgi fanlardan biridir. U bizning kundalik hayotimizda juda muhim o'rin tutadi. Hisob-kitob qilish, o'lchash va solishtirish matematikaning asosiy vazifalaridir. Matematikani o'rganish orqali fikrlash qobiliyatimiz rivojlanadi." },
    { title: "O'zbekiston", lang: 'uz', difficulty: 'normal', content: "O'zbekiston Markaziy Osiyoda joylashgan go'zal davlatdir. Uning poytaxti Toshkent shahri bo'lib, bu yerda ko'plab tarixiy obidalar va zamonaviy binolar mavjud. O'zbek xalqi mehmondo'stligi bilan mashhur." },
    { title: "Tabiatni asrang", lang: 'uz', difficulty: 'hard', content: "Tabiat bizning eng katta boyligimizdir. Har bir inson atrof-muhitni asrashga hissa qo'shishi kerak. Daraxt ekish, suvni tejash va chiqindilarni saralash orqali biz kelajak avlodlarga toza dunyo qoldiramiz." },
    { title: "О математике", lang: 'ru', difficulty: 'easy', content: "Математика - одна из древнейших наук. Она занимает важное место в нашей повседневной жизни. Счёт, измерение и сравнение - основные задачи математики. Изучение математики развивает наше мышление." },
    { title: "Узбекистан", lang: 'ru', difficulty: 'normal', content: "Узбекистан - прекрасная страна в Центральной Азии. Его столица - город Ташкент, где много исторических памятников и современных зданий. Узбекский народ славится своим гостеприимством." },
    { title: "Берегите природу", lang: 'ru', difficulty: 'hard', content: "Природа - наше самое большое богатство. Каждый человек должен внести свой вклад в защиту окружающей среды. Сажая деревья, экономя воду и сортируя отходы, мы оставим чистый мир будущим поколениям." },
    { title: "About Mathematics", lang: 'en', difficulty: 'easy', content: "Mathematics is one of the oldest sciences. It plays an important role in our everyday life. Counting, measuring and comparing are the main tasks of mathematics. Learning mathematics develops our thinking." },
    { title: "Uzbekistan", lang: 'en', difficulty: 'normal', content: "Uzbekistan is a beautiful country in Central Asia. Its capital is the city of Tashkent, which has many historical monuments and modern buildings. Uzbek people are famous for their hospitality." },
    { title: "Protect Nature", lang: 'en', difficulty: 'hard', content: "Nature is our greatest treasure. Every person should contribute to protecting the environment. By planting trees, saving water and sorting waste, we will leave a clean world for future generations." },
  ];
  for (const tx of typingTexts) {
    await prisma.typingText.create({ data: { ...tx, createdById: teacher.id } });
  }

  // ===== CODE BATTLE SAVOLLARI (output topish) =====
  const codeQuestions = [
    { title: "console.log(Hello)", category: "js", code: 'console.log("Hello World");', answer: "Hello World", explanation: "console.log() ekranga matn chiqaradi" },
    { title: "JS summa", category: "js", code: "console.log(2 + 3 * 4);", answer: "14", explanation: "Ko'paytirish qo'shishdan oldin bajariladi: 3*4=12, 2+12=14" },
    { title: "JS string", category: "js", code: 'console.log("5" + 2);', answer: "52", explanation: "String + son -> string birlashadi" },
    { title: "Python print", category: "python", code: 'print("Hello, Python!")', answer: "Hello, Python!", explanation: "print() funksiyasi ekranga chiqaradi" },
    { title: "Python math", category: "python", code: "print(10 // 3)", answer: "3", explanation: "// butun bo'lish amali: 10//3 = 3" },
    { title: "Python pow", category: "python", code: "print(2 ** 5)", answer: "32", explanation: "** daraja amali: 2^5 = 32" },
    { title: "C# Hello", category: "csharp", code: 'Console.WriteLine("Hi");', answer: "Hi", explanation: "WriteLine ekranga chiqaradi" },
    { title: "C# qoldiq", category: "csharp", code: "Console.WriteLine(7 % 3);", answer: "1", explanation: "% qoldiq amali: 7 mod 3 = 1" },
    { title: "C# bool", category: "csharp", code: "Console.WriteLine(5 > 3 && 2 < 4);", answer: "True", explanation: "Ikkala shart ham to'g'ri -> True" },
  ];
  for (const cq of codeQuestions) {
    await prisma.codeQuestion.create({ data: { ...cq, createdById: teacher.id } });
  }

  // ===== DAVOMAT (oxirgi 3 kun) =====
  const members = await prisma.user.findMany({ include: { groupMembers: true } });
  const statuses = ['present', 'present', 'late', 'absent'];
  for (let i = 1; i <= 3; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    for (const m of members) {
      for (const gm of m.groupMembers) {
        await prisma.attendance.upsert({
          where: { userId_groupId_date: { userId: m.id, groupId: gm.groupId, date: d } },
          update: {},
          create: { userId: m.id, groupId: gm.groupId, date: d, status: statuses[(m.id.length + i) % statuses.length], staffId: teacher.id },
        });
      }
    }
  }

  // ===== TO'LOVLAR (joriy oy) =====
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  for (const m of members) {
    for (const gm of m.groupMembers) {
      // Jasur: chala to'lagan (oylik 200k, atigi 80k bergan)
      let payAmount = 200000;
      let payStatus = 'paid';
      if (m.username === 'jasur_t') { payAmount = 80000; payStatus = 'partial'; }
      if (m.username === 'bekzod_e') { payStatus = 'unpaid'; }
      await prisma.payment.upsert({
        where: { userId_groupId_month: { userId: m.id, groupId: gm.groupId, month } },
        update: {
          amount: payAmount,
          status: payStatus,
          paidAt: payStatus === 'paid' ? new Date(now.getFullYear(), now.getMonth(), Math.max(1, now.getDate() - 5)) : null,
        },
        create: {
          userId: m.id,
          groupId: gm.groupId,
          amount: payAmount,
          month,
          status: payStatus,
          paidAt: payStatus === 'paid' ? new Date(now.getFullYear(), now.getMonth(), Math.max(1, now.getDate() - 5)) : null,
          createdById: cashier.id,
        },
      });
    }
  }

  console.log('[seed] tayyor!');
  console.log('  Admin:   +998901234567 / admin123');
  console.log('  Kassir:  +998901234568 / cashier123');
  console.log('  Teacher: +998901234569 / teacher123');
  console.log('  O\'quvchi:+998900000001 / 1234');
}

main()
  .catch((e) => {
    console.error('[seed] xato:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
