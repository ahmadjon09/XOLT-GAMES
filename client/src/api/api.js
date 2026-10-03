// API manzili (proxy ishlatilmaydi — client API bilan to'g'ridan-to'g'ri gaplashadi):
// - Dev: .env.development'dagi VITE_API_URL ishlatiladi.
// - Production (Cloudflare Workers): VITE_API_URL=https://api.v2.xolt.uz
//   (deploy: `VITE_API_URL=https://api.v2.xolt.uz npm run deploy`)
// - '' (bo'sh satr) ham to'g'ri qiymat — shu domain (same-origin, masalan nginx
//   bitta domenda /api'ni ham bergan holat); shuning uchun `||` emas `??`.
// Auth token OAuth callback'da #token= fragment orqali olinadi va har so'rovga
// Authorization: Bearer sifatida qo'shiladi (qarang: http.js) — shuning uchun
// cross-origin'da ham cookie shart emas.
export const api = import.meta.env.VITE_API_URL ?? '';
