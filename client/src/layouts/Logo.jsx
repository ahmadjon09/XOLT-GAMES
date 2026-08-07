// Logo komponenti
export function Logo({ size = 34 }) {
  return (
    <div
      className="brand-logo"
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.32,
        background: 'linear-gradient(135deg, #641ca8, #472692)',
      }}
    >
      <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 19V5l7 8 7-8v14" />
      </svg>
    </div>
  );
}
