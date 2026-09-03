// ============================================================================
// race3d uchun IXTIYORIY bog'liqliklar (Prisma + umumiy socket yordamchilari)
//
// Nima uchun dinamik import:
//   Poyga serveri DB ga bog'liq EMAS — fizika, snapshot va natija hisoblash
//   to'liq server ichida. DB faqat statistika/mukofot uchun kerak.
//   Prisma client "generate" qilinmagan yoki DB ishlamayotgan bo'lsa
//   (masalan preview server, test muhiti) poyga BARIBIR ishlashi shart.
// ============================================================================

export const raceDeps = {
  prisma: null,
  shared: null,
  dbAvailable: false,
};

try {
  const prismaMod = await import('../prisma/client.js');
  raceDeps.prisma = prismaMod.prisma;
  raceDeps.shared = await import('./shared.js');
  raceDeps.dbAvailable = true;
} catch (err) {
  // Statistikasiz ishlash — bu xato emas, balki degradatsiya
  console.warn('[race3d] DB moduli yuklanmadi (statistika yozilmaydi):', err?.message || err);
}
