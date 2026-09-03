/**
 * HUD — poyga paytida ekrandagi ma'lumot va sensor tugmalari.
 *
 * Muhim: HUD har kadr React state orqali YANGILANMAYDI (60 FPS da
 * setState = qayta render = oqim). Imperativ API (`update`) to'g'ridan
 * to'g'ri DOM'ga yozadi — bu 10 barobar tezroq va kadr o'tkazib
 * yuborilishining oldini oladi.
 */
import { forwardRef, useImperativeHandle, useRef } from 'react';

const TouchButton = ({ label, sub, active, onDown, onUp, className = '' }) => (
  <button
    type="button"
    className={`select-none touch-none rounded-2xl border border-white/20 bg-white/10 backdrop-blur
      text-white font-semibold flex items-center justify-center active:scale-95 transition-transform ${className}`}
    onPointerDown={(e) => { e.preventDefault(); onDown?.(); }}
    onPointerUp={(e) => { e.preventDefault(); onUp?.(); }}
    onPointerLeave={() => onUp?.()}
    onPointerCancel={() => onUp?.()}
    onContextMenu={(e) => e.preventDefault()}
  >
    {sub ? <span className="text-[10px] leading-none opacity-80">{sub}</span> : label}
  </button>
);

export const RaceHud = forwardRef(function RaceHud(
  { t, onTouch, showTouch, quality, onQualityChange, onRespawn, onLeave },
  ref,
) {
  const speedRef = useRef(null);
  const lapRef = useRef(null);
  const posRef = useRef(null);
  const timeRef = useRef(null);
  const boostRef = useRef(null);
  const boostBoxRef = useRef(null);
  const coinRef = useRef(null);
  const countdownRef = useRef(null);
  const warnRef = useRef(null);
  const netRef = useRef(null);

  useImperativeHandle(ref, () => ({
    /**
     * @param {object} d { speedKmh, lap, laps, position, total, timeMs,
     *                     boost, coins, countdown, wrongWay, finished,
     *                     pingMs, lossPct, error }
     */
    update(d) {
      if (speedRef.current) speedRef.current.textContent = String(Math.round(d.speedKmh || 0));
      if (lapRef.current) lapRef.current.textContent = `${d.lap || 1}/${d.laps || 2}`;
      if (posRef.current) posRef.current.textContent = `${d.position || 1}/${d.total || 1}`;
      if (timeRef.current) timeRef.current.textContent = formatTime(d.timeMs || 0);
      if (coinRef.current) coinRef.current.textContent = String(d.coins || 0);
      if (boostRef.current && boostBoxRef.current) {
        const p = Math.max(0, Math.min(1, d.boost || 0));
        boostRef.current.style.transform = `scaleX(${p})`;
        boostBoxRef.current.style.opacity = p > 0.02 ? '1' : '0.45';
      }
      if (countdownRef.current) {
        if (d.countdown) {
          countdownRef.current.textContent = d.countdown;
          countdownRef.current.style.display = 'flex';
        } else {
          countdownRef.current.style.display = 'none';
        }
      }
      if (warnRef.current) {
        if (d.wrongWay) {
          warnRef.current.textContent = t('race.wrongWay', "Noto'g'ri yo'nalish!");
          warnRef.current.style.display = 'block';
        } else if (d.finished) {
          warnRef.current.textContent = t('race.finished', 'Finish!');
          warnRef.current.style.display = 'block';
        } else {
          warnRef.current.style.display = 'none';
        }
      }
      if (netRef.current) {
        netRef.current.textContent = `${Math.round(d.pingMs || 0)}ms${d.lossPct ? ` • -${Math.round(d.lossPct)}%` : ''}`;
      }
    },
  }));

  return (
    <div className="pointer-events-none absolute inset-0 z-10 select-none">
      {/* ---- Yuqori chap: lap / pozitsiya ---- */}
      <div className="absolute left-3 top-3 flex gap-2">
        <Stat label={t('race.lap', 'Lap')} valueRef={lapRef} />
        <Stat label={t('race.place', 'O‘rin')} valueRef={posRef} />
        <Stat label={t('race.time', 'Vaqt')} valueRef={timeRef} />
      </div>

      {/* ---- Yuqori o‘ng: tarmoq + sifat + chiqish ---- */}
      <div className="pointer-events-auto absolute right-3 top-3 flex items-center gap-2">
        <div className="rounded-lg bg-black/40 px-2 py-1 text-[11px] font-medium text-white/80 backdrop-blur">
          <span ref={netRef}>0ms</span>
        </div>
        {onQualityChange ? (
          <select
            value={quality}
            onChange={(e) => onQualityChange(e.target.value)}
            className="rounded-lg border border-white/20 bg-black/40 px-2 py-1 text-[11px] text-white backdrop-blur"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        ) : null}
        {onRespawn ? (
          <button
            type="button"
            onClick={onRespawn}
            className="rounded-lg border border-white/20 bg-black/40 px-2 py-1 text-[11px] text-white backdrop-blur"
          >
            ⟳
          </button>
        ) : null}
        {onLeave ? (
          <button
            type="button"
            onClick={onLeave}
            className="rounded-lg border border-white/20 bg-black/40 px-2 py-1 text-[11px] text-white backdrop-blur"
          >
            ✕
          </button>
        ) : null}
      </div>

      {/* ---- Coin ---- */}
      <div className="absolute left-3 top-20 flex items-center gap-1 rounded-lg bg-black/40 px-2 py-1 backdrop-blur">
        <span className="text-sm">🪙</span>
        <span ref={coinRef} className="text-sm font-semibold text-amber-300">0</span>
      </div>

      {/* ---- Past o‘ng: tezlik ---- */}
      <div className="absolute bottom-4 right-4 flex items-end gap-1">
        <span ref={speedRef} className="text-4xl font-black tabular-nums text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.8)]">0</span>
        <span className="mb-1 text-xs font-semibold text-white/70">km/h</span>
      </div>

      {/* ---- Past chap: minimap ---- */}
      <div className="absolute bottom-4 left-4">
        <canvas
          id="race3d-minimap"
          className="h-28 w-28 rounded-xl border border-white/20 bg-black/35 backdrop-blur"
        />
      </div>

      {/* ---- Boost (nitro) paneli ---- */}
      <div
        ref={boostBoxRef}
        className="absolute bottom-24 left-1/2 h-2 w-40 -translate-x-1/2 overflow-hidden rounded-full border border-white/20 bg-black/40"
      >
        <div
          ref={boostRef}
          className="h-full w-full origin-left rounded-full bg-gradient-to-r from-sky-400 to-cyan-200"
          style={{ transform: 'scaleX(0)' }}
        />
      </div>

      {/* ---- Countdown ---- */}
      <div
        ref={countdownRef}
        className="absolute inset-0 hidden items-center justify-center text-7xl font-black text-white drop-shadow-[0_4px_16px_rgba(0,0,0,0.9)]"
      >
        3
      </div>

      {/* ---- Ogohlantirish ---- */}
      <div
        ref={warnRef}
        className="absolute left-1/2 top-24 hidden -translate-x-1/2 rounded-xl bg-red-600/85 px-4 py-2 text-lg font-bold text-white shadow-lg"
      />

      {/* ---- Sensor tugmalari ---- */}
      {showTouch ? (
        <div className="pointer-events-auto absolute inset-x-0 bottom-0 flex items-end justify-between p-4 pb-6">
          <div className="flex gap-3">
            <TouchButton label="◀" className="h-16 w-16 text-2xl"
              onDown={() => onTouch?.('left', true)} onUp={() => onTouch?.('left', false)} />
            <TouchButton label="▶" className="h-16 w-16 text-2xl"
              onDown={() => onTouch?.('right', true)} onUp={() => onTouch?.('right', false)} />
          </div>
          <div className="flex items-end gap-3">
            <TouchButton sub="NITRO" className="h-14 w-14 text-xs"
              onDown={() => onTouch?.('boost', true)} onUp={() => onTouch?.('boost', false)} />
            <TouchButton sub="DRIFT" className="h-14 w-14 text-xs"
              onDown={() => onTouch?.('drift', true)} onUp={() => onTouch?.('drift', false)} />
            <TouchButton sub="BRAKE" className="h-16 w-16 text-xs"
              onDown={() => onTouch?.('down', true)} onUp={() => onTouch?.('down', false)} />
            <TouchButton sub="GAS" className="h-20 w-20 text-sm"
              onDown={() => onTouch?.('up', true)} onUp={() => onTouch?.('up', false)} />
          </div>
        </div>
      ) : null}
    </div>
  );
});

function Stat({ label, valueRef }) {
  return (
    <div className="rounded-lg bg-black/40 px-2.5 py-1 text-center backdrop-blur">
      <div className="text-[9px] font-medium uppercase tracking-wide text-white/60">{label}</div>
      <div ref={valueRef} className="text-base font-bold leading-tight text-white">1/2</div>
    </div>
  );
}

function formatTime(ms) {
  const s = ms / 1000;
  const m = Math.floor(s / 60);
  const rest = s - m * 60;
  return `${m}:${rest < 10 ? '0' : ''}${rest.toFixed(1)}`;
}
