// Bu fayl faqat Swagger JSDoc izohlarini o'z ichiga oladi
// Kod yozilmaydi - faqat API hujjatlari

/**
 * @swagger
 * tags:
 *   - name: Auth
 *     description: Kirish va profil
 *   - name: Oquvchi
 *     description: O'quvchi paneli (shop, leaderboard, davomat, to'lovlar)
 *   - name: Xodim
 *     description: Teacher / Cashier / Admin paneli
 *   - name: Admin
 *     description: Admin boshqaruvi (statistika, xodimlar, shop)
 *   - name: Upload
 *     description: Fayl yuklash
 */

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Telefon va parol bilan kirish (o'quvchi yoki xodim)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [phone, password]
 *             properties:
 *               phone: { type: string, example: "+998901234567" }
 *               password: { type: string, example: "1234" }
 *     responses:
 *       200:
 *         description: Muvaffaqiyatli kirish
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token: { type: string }
 *                 profile: { type: object }
 *       401:
 *         description: Noto'g'ri telefon yoki parol
 */

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Joriy foydalanuvchi profili
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Profil ma'lumotlari
 */

/**
 * @swagger
 * /api/auth/change-password:
 *   post:
 *     tags: [Auth]
 *     summary: Parolni o'zgartirish
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               oldPassword: { type: string }
 *               newPassword: { type: string, minLength: 4 }
 *     responses:
 *       200:
 *         description: Parol o'zgartirildi
 */

/**
 * @swagger
 * /api/user/profile:
 *   get:
 *     tags: [Oquvchi]
 *     summary: To'liq profil (guruhlar, joriy frame/effect)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Profil
 */

/**
 * @swagger
 * /api/user/shop:
 *   get:
 *     tags: [Oquvchi]
 *     summary: Do'kon katalogi (frame va effectlar)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Katalog + egalik + coin balansi
 */

/**
 * @swagger
 * /api/user/shop/buy:
 *   post:
 *     tags: [Oquvchi]
 *     summary: Buyum sotib olish (coin bilan)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [type, itemId]
 *             properties:
 *               type: { type: string, enum: [frame, effect] }
 *               itemId: { type: string }
 *     responses:
 *       200:
 *         description: Sotib olindi
 *       400:
 *         description: Yetarli coin yo'q yoki allaqachon egalik
 */

/**
 * @swagger
 * /api/user/shop/equip:
 *   post:
 *     tags: [Oquvchi]
 *     summary: Buyumni kiyish yoki yechish (none bilan yechiladi)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Tanlandi
 */

/**
 * @swagger
 * /api/user/leaderboard:
 *   get:
 *     tags: [Oquvchi]
 *     summary: Reyting jadvali (all | week | month)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: period
 *         schema: { type: string, enum: [all, week, month] }
 *     responses:
 *       200:
 *         description: Top-50 o'yinchi + mening o'rnim
 */

/**
 * @swagger
 * /api/user/groups:
 *   get:
 *     tags: [Oquvchi]
 *     summary: Mening guruhlarim (davomat va to'lov holati bilan)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Guruhlar ro'yxati
 */

/**
 * @swagger
 * /api/user/attendance:
 *   get:
 *     tags: [Oquvchi]
 *     summary: Guruh bo'yicha davomat tarixi (oxirgi 30 kun)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: groupId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Davomat kundaligi + xulosa
 */

/**
 * @swagger
 * /api/user/payments:
 *   get:
 *     tags: [Oquvchi]
 *     summary: To'lov holatim
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: To'lovlar ro'yxati
 */

/**
 * @swagger
 * /api/staff/groups:
 *   get:
 *     tags: [Xodim]
 *     summary: Guruhlar (teacher o'zini, admin/cashier hammasini ko'radi)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Guruhlar ro'yxati
 *   post:
 *     tags: [Xodim]
 *     summary: Guruh yaratish (teacher/admin)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string, example: "Matematika 5-sinf A" }
 *               rank: { type: integer }
 *     responses:
 *       200:
 *         description: Yaratildi
 */

/**
 * @swagger
 * /api/staff/groups/{id}:
 *   get:
 *     tags: [Xodim]
 *     summary: Guruh a'zolari (profil buyumlari, davomat va to'lov qisqacha)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Guruh ma'lumotlari
 *   delete:
 *     tags: [Xodim]
 *     summary: Guruhni o'chirish
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: O'chirildi
 */

/**
 * @swagger
 * /api/staff/groups/{id}/members:
 *   post:
 *     tags: [Xodim]
 *     summary: O'quvchini guruhga qo'shish (telefon orqali yoki yangi yaratib)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               phone: { type: string, example: "+998901234567" }
 *               full_name: { type: string }
 *               password: { type: string }
 *     responses:
 *       200:
 *         description: Qo'shildi
 */

/**
 * @swagger
 * /api/staff/attendance:
 *   get:
 *     tags: [Xodim]
 *     summary: Ma'lum kundagi davomat holati
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: groupId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: date
 *         required: true
 *         schema: { type: string, format: date }
 *     responses:
 *       200:
 *         description: O'quvchilar ro'yxati holati bilan
 */

/**
 * @swagger
 * /api/staff/attendance/save:
 *   post:
 *     tags: [Xodim]
 *     summary: Davomatni saqlash (bir kunda bir nechta o'quvchi)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [groupId, date, items]
 *             properties:
 *               groupId: { type: string }
 *               date: { type: string, format: date }
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [userId, status]
 *                   properties:
 *                     userId: { type: string }
 *                     status: { type: string, enum: [present, absent, late] }
 *                     note: { type: string }
 *     responses:
 *       200:
 *         description: Saqlandi
 */

/**
 * @swagger
 * /api/staff/attendance/summary:
 *   get:
 *     tags: [Xodim]
 *     summary: Oy bo'yicha davomat statistikasi
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: groupId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: month
 *         schema: { type: string, example: "2026-08" }
 *     responses:
 *       200:
 *         description: Har bir o'quvchi uchun hisob
 */

/**
 * @swagger
 * /api/staff/quizzes:
 *   get:
 *     tags: [Xodim]
 *     summary: Viktorinalar ro'yxati
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Viktorinalar
 *   post:
 *     tags: [Xodim]
 *     summary: Viktorina yaratish (savollar bilan)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, questions]
 *             properties:
 *               name: { type: string }
 *               keywords: { type: array, items: { type: string } }
 *               questions:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [text, variants, answer]
 *                   properties:
 *                     text: { type: string }
 *                     variants: { type: array, items: { type: string } }
 *                     answer: { type: string }
 *                     image: { type: string }
 *                     timeLimit: { type: integer, example: 20 }
 *                     points: { type: integer, example: 1000 }
 *     responses:
 *       200:
 *         description: Yaratildi
 */

/**
 * @swagger
 * /api/staff/payments:
 *   get:
 *     tags: [Xodim]
 *     summary: Guruh bo'yicha to'lovlar (cashier/admin)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: groupId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: month
 *         schema: { type: string, example: "2026-08" }
 *     responses:
 *       200:
 *         description: O'quvchilar va ularning to'lovlari
 *   post:
 *     tags: [Xodim]
 *     summary: To'lov qo'shish yoki yangilash (upsert)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userId, groupId, amount, month]
 *             properties:
 *               userId: { type: string }
 *               groupId: { type: string }
 *               amount: { type: number }
 *               month: { type: string, example: "2026-08" }
 *               status: { type: string, enum: [paid, unpaid] }
 *               note: { type: string }
 *     responses:
 *       200:
 *         description: Saqlandi
 */

/**
 * @swagger
 * /api/staff/payments/overview:
 *   get:
 *     tags: [Xodim]
 *     summary: Oy bo'yicha guruhlar umumiy to'lov holati
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: month
 *         schema: { type: string, example: "2026-08" }
 *     responses:
 *       200:
 *         description: Guruhlar bo'yicha xulosa
 */

/**
 * @swagger
 * /api/staff/users:
 *   get:
 *     tags: [Admin]
 *     summary: O'quvchilar ro'yxati (qidiruv va guruh filtri bilan)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: groupId
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *       - in: query
 *         name: limit
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: O'quvchilar
 *   post:
 *     tags: [Admin]
 *     summary: O'quvchi yaratish (admin/cashier/teacher)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [full_name, phone, password]
 *             properties:
 *               full_name: { type: string }
 *               phone: { type: string }
 *               password: { type: string, minLength: 4 }
 *               username: { type: string }
 *               groupIds: { type: array, items: { type: string } }
 *     responses:
 *       200:
 *         description: Yaratildi
 */

/**
 * @swagger
 * /api/staff/users/{id}:
 *   get:
 *     tags: [Admin]
 *     summary: Bitta o'quvchining to'liq ma'lumotlari (profil, guruhlar, davomat, to'lovlar, o'yinlar, reyting)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: To'liq ma'lumotlar
 *       403:
 *         description: Teacher o'z guruhlaridan tashqari o'quvchini ko'ra olmaydi
 *   patch:
 *     tags: [Admin]
 *     summary: O'quvchini yangilash (guruhlar almashadi)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               full_name: { type: string }
 *               username: { type: string }
 *               password: { type: string }
 *               groupIds: { type: array, items: { type: string } }
 *     responses:
 *       200:
 *         description: Yangilandi
 *   delete:
 *     tags: [Admin]
 *     summary: O'quvchini o'chirish (faqat admin)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: O'chirildi
 */

/**
 * @swagger
 * /api/staff/staff:
 *   get:
 *     tags: [Admin]
 *     summary: Xodimlar ro'yxati (faqat admin)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Xodimlar
 *   post:
 *     tags: [Admin]
 *     summary: Xodim yaratish (faqat admin)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [full_name, phone, password, role]
 *             properties:
 *               full_name: { type: string }
 *               phone: { type: string }
 *               password: { type: string }
 *               role: { type: string, enum: [TEACHER, CASHIER, ADMIN] }
 *     responses:
 *       200:
 *         description: Yaratildi
 */

/**
 * @swagger
 * /api/staff/stats/overview:
 *   get:
 *     tags: [Admin]
 *     summary: Umumiy statistika (faqat admin)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Umumiy ko'rsatkichlar
 */

/**
 * @swagger
 * /api/staff/stats/charts:
 *   get:
 *     tags: [Admin]
 *     summary: Grafiklar uchun ma'lumotlar
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: days
 *         schema: { type: integer, default: 30 }
 *     responses:
 *       200:
 *         description: Ro'yxatga olish, o'yinlar, to'lovlar, top o'yinchilar
 */

/**
 * @swagger
 * /api/staff/shop/frames:
 *   post:
 *     tags: [Admin]
 *     summary: Frame yaratish (faqat admin)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, price]
 *             properties:
 *               id: { type: string }
 *               name: { type: string }
 *               image: { type: string }
 *               rarity: { type: string, enum: [common, uncommon, rare, epic, legendary] }
 *               price: { type: integer }
 *     responses:
 *       200:
 *         description: Yaratildi
 */

/**
 * @swagger
 * /api/staff/shop/effects:
 *   post:
 *     tags: [Admin]
 *     summary: Effect yaratish (faqat admin)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, type, price]
 *             properties:
 *               id: { type: string }
 *               name: { type: string }
 *               type: { type: string }
 *               price: { type: integer }
 *               config: { type: object }
 *     responses:
 *       200:
 *         description: Yaratildi
 */

/**
 * @swagger
 * /api/staff/coding-questions:
 *   get:
 *     tags: [Admin]
 *     summary: Coding savollar ro'yxati
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Savollar
 *   post:
 *     tags: [Admin]
 *     summary: Coding savol yaratish (teacher/admin)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, question_uz, question_ru, main, tests]
 *             properties:
 *               title: { type: string }
 *               question_uz: { type: string }
 *               question_ru: { type: string }
 *               difficulty: { type: string, enum: [easy, normal, hard, very_hard] }
 *               coin: { type: integer }
 *               timeLimit: { type: integer }
 *               memoryLimit: { type: integer }
 *               main: { type: object }
 *               tests: { type: array, items: { type: object } }
 *     responses:
 *       200:
 *         description: Yaratildi
 */

/**
 * @swagger
 * /api/upload:
 *   post:
 *     tags: [Upload]
 *     summary: Rasm fayl yuklash (form-data bilan)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file]
 *             properties:
 *               file: { type: string, format: binary }
 *               folder: { type: string, enum: [avatars, frames, questions, effects] }
 *     responses:
 *       200:
 *         description: Yuklandi (imgbb.com ga yoki lokalga)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 url: { type: string, example: "https://i.ibb.co/xxx/avatar.png" }
 *                 host: { type: string, enum: [imgbb, local], description: "imgbb kaliti o'rnatilgan bo'lsa imgbb" }
 */

export const swaggerDocs = {};

/**
 * @swagger
 * /api/staff/typing-texts:
 *   get:
 *     tags: [Xodim]
 *     summary: Type Racing matnlari (teacher o'zini, admin hammasini)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: lang
 *         schema: { type: string, enum: [uz, ru, en] }
 *     responses:
 *       200: { description: Matnlar }
 *   post:
 *     tags: [Xodim]
 *     summary: Matn qo'shish (teacher/admin)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, lang, content]
 *             properties:
 *               title: { type: string }
 *               lang: { type: string, enum: [uz, ru, en] }
 *               content: { type: string }
 *               difficulty: { type: string, enum: [easy, normal, hard] }
 *     responses:
 *       200: { description: Qo'shildi }
 */

/**
 * @swagger
 * /api/staff/code-questions:
 *   get:
 *     tags: [Xodim]
 *     summary: Code Battle savollari
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: category
 *         schema: { type: string, enum: [js, python, csharp, java, php, sql] }
 *     responses:
 *       200: { description: Savollar }
 *   post:
 *     tags: [Xodim]
 *     summary: Savol qo'shish (teacher/admin)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, category, code, answer]
 *             properties:
 *               title: { type: string }
 *               category: { type: string }
 *               code: { type: string }
 *               answer: { type: string }
 *               explanation: { type: string }
 *               timeLimit: { type: integer, default: 20 }
 *               points: { type: integer, default: 1000 }
 *     responses:
 *       200: { description: Qo'shildi }
 */

/**
 * @swagger
 * /api/user/typing/record:
 *   post:
 *     tags: [Oquvchi]
 *     summary: Solo yozish natijasi (coin/ball berilmaydi, WPM reytingga yoziladi)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [wpm, accuracy, duration]
 *             properties:
 *               wpm: { type: number }
 *               accuracy: { type: number }
 *               duration: { type: integer }
 *     responses:
 *       200: { description: Saqlandi }
 * /api/user/typing/leaderboard:
 *   get:
 *     tags: [Oquvchi]
 *     summary: Eng tez yozuvchilar (WPM)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Top + mening natijam }
 */

/**
 * @swagger
 * /api/user/code/practice:
 *   get:
 *     tags: [Oquvchi]
 *     summary: Random code savol (javobsiz, mashq uchun)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: category
 *         schema: { type: string, default: js }
 *     responses:
 *       200: { description: Savol }
 * /api/user/code/check:
 *   post:
 *     tags: [Oquvchi]
 *     summary: Javobni tekshirish (to'g'ri bo'lsa +3 coin)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [questionId, answer]
 *             properties:
 *               questionId: { type: string }
 *               answer: { type: string }
 *     responses:
 *       200: { description: Natija }
 */
