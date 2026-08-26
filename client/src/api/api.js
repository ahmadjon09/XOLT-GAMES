// API manzili:
// - bo'sh qiymat (default) = shu domain (vite dev proxy yoki nginx orqali)
// - kerak bo'lsa build qilishda VITE_API_URL orqali aniq URL beriladi (masalan https://api.xolt.uz)
export const api = import.meta.env.VITE_API_URL || '';
