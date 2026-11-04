/** Pip, the mascot. `fill` (0–1) fills him with liquid like a daily-goal meter. */
export function Pip({ size = 76, fill = 0 }: { size?: number; fill?: number }) {
  const level = Math.min(1, Math.max(0, fill));
  const y = Math.round(48 - level * 58); // body spans y=20..78
  return (
    <svg aria-hidden="true" width={size} height={size * 1.08} viewBox="0 0 80 86" className="kl-bob">
      <defs>
        <clipPath id="pip-body">
          <rect x="10" y="20" width="60" height="58" rx="20" />
        </clipPath>
      </defs>
      <path d="M40 8v10" stroke="#ffc23d" strokeWidth="4" strokeLinecap="round" />
      <circle cx="40" cy="7" r="5" fill="#ffc23d" />
      <rect x="10" y="20" width="60" height="58" rx="20" fill={fill ? "var(--panel-2)" : "#4f9dff"} stroke="#4f9dff" strokeWidth="3" />
      {fill > 0 && (
        <g clipPath="url(#pip-body)">
          <g style={{ transform: `translateY(${y}px)`, transition: "transform 1s cubic-bezier(.22,1,.36,1)" }}>
            <path className="kl-wave" d="M-40 30 q10 -6 20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 V90 H-40z" fill="#4f9dff" />
          </g>
        </g>
      )}
      <g className="kl-eyes">
        <circle cx="30" cy="44" r="6.5" fill="#fff" />
        <circle cx="50" cy="44" r="6.5" fill="#fff" />
        <circle cx="31.5" cy="45" r="3.2" fill="#0e0f12" />
        <circle cx="51.5" cy="45" r="3.2" fill="#0e0f12" />
      </g>
      <path d="M34 56q6 5 12 0" stroke="#0e0f12" strokeWidth="3" fill="none" strokeLinecap="round" />
    </svg>
  );
}
