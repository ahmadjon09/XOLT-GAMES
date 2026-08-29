# XOLT Games — Ta'lim o'yinlari platformasi

Node.js (Express + Socket.IO + Prisma) va React (Vite) asosida qurilgan ta'lim platformasi.
O'quvchilar, o'qituvchilar, kassirlar va adminlar uchun to'liq tizim: o'yinlar, viktorinalar,
davomat, to'lovlar, do'kon (frame/effect), reyting va statistika.

## Imkoniyatlar

### Rollar
| Rol | Imkoniyatlari |
|---|---|
| **O'quvchi** | O'yinlar (Math Duel, Tic-Tac-Toe, Viktorina), do'kon, reyting, profil (frame/effect), davomat va to'lov holatini ko'rish |
| **O'qituvchi** | Guruhlar boshqaruvi, davomat belgilash, viktorina yaratish (rasmli savollar bilan) va o'tkazish (Kahoot uslubida, QR/kod orqali) |
| **Kassir** | Barcha guruhlar o'quvchilariga to'lov qo'shish, to'langan/to'lanmagan holatini boshqarish, umumiy hisobot |
| **Admin** | Statistika (grafiklar), o'quvchilar va xodimlar yaratish, do'kon (frame/effect) boshqaruvi, coding savollar |

### O'yinlar (Socket.IO)
- **Math Duel (1v1)** — savollar serverda avtomatik generatsiya qilinadi (4 qiyinchilik darajasi),
  savollar **KaTeX (LaTeX)** bilan chiroyli render qilinadi, coin tikish, 5% komissiya, rematch, refresh bo'lganda o'yinga qaytish
- **Viktorina (Kahoot uslubi)** — o'qituvchi savollar tuzadi (matn + rasm), sessiya yaratadi,
  QR kod yoki 6 belgili kod orqali qo'shilish, tezlik bo'yicha ball, podium, top-3 ga coin
- **Tic-Tac-Toe (1v1, roundlar)** — 1-9 raundgacha o'ynash (har raund alohida board), raundlar
  hisobi, coin tikish, rematch
- **Type Racing (10 o'yinchi)** — tez yozish poygasi; o'yin yaratgan odamning tili bo'yicha
  matnlar (uz/ru/en); o'qituvchi matnlarni boshqaradi; **solo rejim** — coin/ball bermaydi,
  lekin WPM eslab qolinadi va alohida reytingda ko'rinadi
- **Code Battle (10 o'yinchi)** — kod ko'rsatiladi, output nima chiqishini topish; o'qituvchi
  savollar tuzadi (kategoriyalar: js, python, csharp, java, php, sql); solo mashq rejimi ham bor
  (to'g'ri javobga coin)
- **Shashka / Checkers (1v1)** — klassik 8x8 shashka: olish majburiy, zanjirli olishlar
  (avtomatik davom ettirish), damka (uchuvchi), oxirgi qatorga yetganda damka bo'lish, timer,
  coin tikish, rematch, refresh bo'lganda o'yinga qaytish; zanjirli olish yozuvi `c3:e5:g7`

### Oson chiqish va tez o'yin (UX)
- **Yagona chiqish tizimi (`useGameExit`)** — barcha o'yinlarda: TopBar "orqaga" tugmasi
  aktiv o'yinda tasdiq so'raydi va o'yindan chiqaradi; brauzer/Android **back** (router -1)
  bosilganda o'yin ushlanadi (tasodifiy yutqazishdan saqlaydi); sahifadan har qanday yo'l bilan
  ketilganda serverga avtomatik `leave` yuboriladi — "Siz allaqachon aktiv o'yindasiz" xatosi
  endi chiqmaydi
- **TEZ O'YIN tugmasi (`QuickPlay`)** — Math/TTT/Shaxmat/Shashka sahifalarida bitta bosish:
  ochiq (public, bet-siz) o'yin bo'lsa unga qo'shiladi, bo'lmasa yangi ochiq o'yin yaratadi

### Boshqa
- **O'quvchi detallari** — har bir o'quvchi uchun to'liq sahifa: profil, reyting o'rni, guruhlar (davomat darajasi + to'lov holati), davomat tarixi (oy kalendari bilan), to'lov tarixi va yutilgan o'yinlar — tab'lar bilan (`/staff/users/:id`)
- **Axios + SWR** — barcha ma'lumotlar SWR hook'lari orqali (useGet/useMutate), xotira cache bilan: sahifa almashganda qayta yuklanmaydi, deduping (20s) — serverga ortiqcha so'rov yuborilmaydi (localStorage'ga hech narsa saqlanmaydi)
- **Redis cache** — serverda Redis (shop katalogi 60s, leaderboard 30s, stats 60s) — DB so'rovlari keskin kamayadi; Redis yo'q bo'lsa avtomatik xotira rejimi
- **Role access himoyasi** — user tokeni bilan faqat o'z ma'lumotlari; teacher faqat o'z guruhlari; cashier faqat to'lovlar; admin hamma narsa (test qilingan)
- **Tailwind CSS v4** — butun dizayn Tailwind utility klasslarida (bitta @theme: ranglar, soyalar, animatsiyalar), custom CSS deyarli yo'q; xolt.uz palitrasida (binafsha #472692/#641ca8 + sariq #fdc700)
- **Leaderboard** — podium kartalar (gg1/gg2/gg3/gg-top rasmlar bilan), davr filtri (hafta/oy/hamma), **joriy foydalanuvchi kartasi** (rank badge, ball), pagination (20/sahifa), o'z header'i (TopBar'siz)
- **Login** — gradient (indigo-purple) glassmorphism dizayn, login/register rejimi, ko'z bilan parol, demo hisoblar, flag'li til tanlash
- **404 sahifa** — animatsiyali (framer-motion) not found sahifa
- **To'liq responsive**: mobil (pastki nav) + desktop (chap binafsha sidebar, keng kontent)
- 3 til: o'zbek, rus, ingliz (to'liq tarjima)
- Faqat light mode, mobile-first + desktop dizayn
- QR kod generatsiya (o'yinlarga qo'shilish) va skanerlash
- Ovozlar (Web Audio API, faylsiz)
- Rate limiting, DDoS himoya, strict CORS, JWT auth
- Swagger hujjatlar: `/api-docs`
- Frame (avatar ramkalari) va effect (nom animatsiyalari) tizimi
- Davomat har guruh uchun alohida (kunlik, oylik statistika)
- To'lovlar oy bo'yicha (paid/unpaid)

## Struktura

```
xolt-games/
├── server/                 # Node.js backend (Express + Prisma + Socket.IO)
│   ├── prisma/
│   │   ├── schema.prisma   # DB sxemasi
│   │   └── seed.js         # Demo ma'lumotlar
│   ├── src/
│   │   ├── index.js        # Kirish nuqtasi
│   │   ├── config/         # Atrof-muhit sozlamalari
│   │   ├── middleware/     # Auth, rate limit, upload, xatolar
│   │   ├── routes/         # Auth, User, Staff, Admin, Upload
│   │   ├── socket/         # mathGame, quizGame, tictactoe
│   │   ├── swagger.js      # API hujjatlar
│   │   └── prisma/client.js
│   └── scripts/            # Avtomatik testlar
├── client/                 # React Vite frontend
│   └── src/
│       ├── i18n/           # uz/ru/en lug'atlar
│       ├── components/     # UI kutubxonasi
│       ├── context/        # Auth, Socket, Toast
│       ├── layouts/        # Student/Staff layoutlari
│       └── pages/          # Barcha sahifalar
├── nginx/                  # nginx konfiguratsiyasi
└── README.md
```

## O'rnatish (lokal)

### Talablar
- Node.js 20+
- PostgreSQL 15+

### 1. Backend

```bash
cd server
cp .env.example .env       # DATABASE_URL va JWT_SECRET ni sozlang
npm install
npx prisma migrate dev     # jadval yaratish
npm run db:seed            # demo ma'lumotlar
npm run dev                # http://localhost:4000
```

### 2. Frontend

```bash
cd client
npm install
npm run dev                # http://localhost:5173
```

Frontend `/api`, `/uploads` va `/socket.io` ni backendga proxy qiladi (vite.config.js).

### 3. Production build

```bash
cd client && npm run build   # dist/ papkasiga
# nginx konfig: nginx/xolt-games.conf ni moslang va ulang
```

## Demo hisoblar

| Rol | Telefon | Parol |
|---|---|---|
| Admin | +998901234567 | admin123 |
| O'qituvchi | +998901234569 | teacher123 |
| Kassir | +998901234568 | cashier123 |
| O'quvchi | +998900000001 | 1234 |

## Testlar

Socket o'yinlari avtomatik test qilingan (`scripts/test-games.mjs`, `scripts/test-reconnect.mjs`):

```bash
cd server && node scripts/test-games.mjs
```

## Xavfsizlik

- JWT auth (30 kun), bcrypt parollar
- Strict CORS (faqat ruxsat etilgan originlar)
- `express-rate-limit`: umumiy 500/15min, auth 20/15min, upload 30/10min
- Socket.IO: ulanish 15/min/IP, event 300/10s
- helmet security headerlar
- Fayl yuklashda ruxsat etilgan turlar va hajm cheklovi (5MB)
- Rasmlar imgbb.com ga yuklanadi (IMGBB_API_KEY o'rnatilgan bo'lsa), bevosita URL qaytariladi
- Avatar va savol rasmlari react-easy-crop bilan kesiladi (doira/kvadrat, zoom)
- Zod validatsiya barcha kirishlarda

## Muhim env o'zgaruvchilari

| O'zgaruvchi | Tavsif |
|---|---|
| `DATABASE_URL` | PostgreSQL ulanish satri |
| `JWT_SECRET` | JWT imzo kaliti (albatta almashtiring) |
| `PORT` | Server porti (default 4000) |
| `FRONTEND_URL` | Frontend manzili (QR kodlar uchun) |
| `CORS_ORIGINS` | Ruxsat etilgan originlar (vergul bilan) |
| `UPLOAD_DIR` | Yuklangan fayllar papkasi (lokal fallback) |
| `MAX_UPLOAD_MB` | Maksimal fayl hajmi (default 5MB) |
| `IMGBB_API_KEY` | imgbb.com API kaliti — o'rnatilsa barcha rasmlar (avatar, savol rasmlari) imgbb.com ga yuklanadi, aks holda lokal saqlanadi |
| `FRONTEND_URL` | QR kodlarda ishlatiladigan frontend manzili |
