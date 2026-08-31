// API manzili:
// - bo'sh qiymat (default) = shu domain (vite dev proxy yoki nginx orqali)
// - kerak bo'lsa build qilishda VITE_API_URL orqali aniq URL beriladi (masalan https://api.xolt.uz)
// '' (bo'sh satr) ham to'g'ri qiymat — shu domain (same-origin) degani.
// shuning uchun `||` emas `??` ishlatiladi (aks holda bo'sh satr e'tiborga olinmaydi).
export const api = import.meta.env.VITE_API_URL ?? 'https://api.v2.xolt.uz';
