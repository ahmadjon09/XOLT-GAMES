// Logo komponenti
// atirgich (wrapper) — mobil topbar'da barmoq bilan bosish uchun yetarli
// kenglik/tegish maydoni (kamida 40x40) bo'lishini ta'minlaydi
export function Logo({ size = 34 }) {
  return (
    <span
      className="flex items-center justify-center shrink-0"
      style={{ width: Math.max(size, 40), height: Math.max(size, 40) }}
    >
      <img width={size} src="/logo.png" alt="XOLT" />
    </span>
  );
}
