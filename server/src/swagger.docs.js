// Bu fayl faqat Swagger JSDoc izohlarini o'z ichiga oladi
// Kod yozilmaydi - faqat API hujjatlari

/**
 * @swagger
 * tags:
 *   - name: Auth
 *     description: Kirish va profil
 *   - name: Player
 *     description: Public player profiles, friends, shop, games, and leaderboard
 *   - name: Xodim
 *     description: Admin panel
 *   - name: Admin
 *     description: Admin boshqaruvi (foydalanuvchilar, o'yinlar, shop)
 *   - name: Upload
 *     description: Fayl yuklash
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
 * /api/user/profile:
 *   get:
 *     tags: [Player]
 *     summary: Shaxsiy profil, score va tanlangan frame/effectlar
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Profil
 */

/**
 * @swagger
 * /api/user/shop:
 *   get:
 *     tags: [Player]
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
 *     tags: [Player]
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
 *     tags: [Player]
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
 *     tags: [Player]
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
 * /api/staff/users:
 *   get:
 *     tags: [Admin]
 *     summary: OAuth orqali ro'yxatdan o'tgan foydalanuvchilar ro'yxati
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *       - in: query
 *         name: limit
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Players
 *   post:
 *     tags: [Admin]
 *     summary: Yopilgan — foydalanuvchilar OAuth orqali ro'yxatdan o'tadi
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: Player accounts are created with Google or GitHub OAuth; this endpoint returns 410.
 *     responses:
 *       410:
 *         description: Public accounts must use OAuth
 */

/**
 * @swagger
 * /api/staff/users/{id}:
 *   get:
 *     tags: [Admin]
 *     summary: Player profile, score, rank, and recent game wins
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: To'liq ma'lumotlar
 *   patch:
 *     tags: [Admin]
 *     summary: Player display name and username
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
 *     responses:
 *       200:
 *         description: Yangilandi
 *   delete:
 *     tags: [Admin]
 *     summary: Player deletion (admin only)
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
 *         description: Registrations, games, and top players
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
 *     summary: Coding savol yaratish (faqat admin)
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
 *     summary: Type Racing matnlari (faqat admin)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: lang
 *         schema: { type: string, enum: [uz, ru, en] }
 *     responses:
 *       200: { description: Matnlar }
 *   post:
 *     tags: [Xodim]
 *     summary: Matn qo'shish (faqat admin)
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
 *     summary: Savol qo'shish (faqat admin)
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
 *     tags: [Player]
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
 *     tags: [Player]
 *     summary: Eng tez yozuvchilar (WPM)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Top + mening natijam }
 */

/**
 * @swagger
 * /api/user/code/practice:
 *   get:
 *     tags: [Player]
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
 *     tags: [Player]
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
