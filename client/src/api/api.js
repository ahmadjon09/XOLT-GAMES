// API manzili:
// - default (bo'sh) = shu domain (same-origin): vite dev proxy, preview server
//   yoki nginx orqali /api/* — hech qanday qo'shimcha sozlamasiz ishlaydi.
// - Kerak bo'lsa build qilishda VITE_API_URL orqali aniq URL beriladi:
//   - Production (Cloudflare Workers): VITE_API_URL=https://api.v2.xolt.uz
//     (deploy: `VITE_API_URL=https://api.v2.xolt.uz npm run deploy`)
// '' (bo'sh satr) ham to'g'ri qiymat — shu domain (same-origin) degani.
// shuning uchun `||` emas `??` ishlatiladi (aks holda bo'sh satr e'tiborga olinmaydi).
// Eslatma: doimiy tashqi domain default QILINMASLIGI KERAK — preview/dev'da
// sahifa "loading"da qoladi, chunki so'rovlar shu serverga (proxy'ga) bormaydi.
export const api = import.meta.env.VITE_API_URL ?? '';
