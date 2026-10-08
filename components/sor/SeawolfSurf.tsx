/**
 * A seawolf pup surfing while a pathway draft is written. Original drawing,
 * not the school's mascot artwork; brand colors only. Still for anyone who
 * prefers reduced motion.
 */
export function SeawolfSurf({ size = 72 }: { size?: number }) {
  return (
    <svg
      className="sw"
      width={size}
      height={size * (80 / 120)}
      viewBox="0 0 120 80"
      role="img"
      aria-label="A seawolf pup surfing while the draft is written"
    >
      <style>{`
        .sw { flex: none; overflow: hidden; }
        .sw .sw-back { fill: var(--color-pacific, #8fb3d9); opacity: .45; animation: sw-roll 3.2s linear infinite; }
        .sw .sw-front { fill: var(--color-pacific, #8fb3d9); animation: sw-roll 2s linear infinite; }
        .sw .sw-crest { animation: sw-roll 2s linear infinite; }
        .sw .sw-rider { transform-box: view-box; transform-origin: 60px 54px; animation: sw-bob 1.8s ease-in-out infinite; }
        .sw .sw-tail { transform-box: view-box; transform-origin: 45px 38px; animation: sw-wag .6s ease-in-out infinite alternate; }
        .sw .sw-ear { transform-box: view-box; transform-origin: 74px 21px; animation: sw-ear 1.8s ease-in-out infinite; }
        .sw .sw-drop { fill: var(--color-pacific, #8fb3d9); opacity: 0; animation: sw-spray 1.8s ease-out infinite; }
        .sw .sw-drop:nth-of-type(2) { animation-delay: .25s; }
        .sw .sw-drop:nth-of-type(3) { animation-delay: .5s; }
        @keyframes sw-roll { to { transform: translateX(-40px); } }
        @keyframes sw-bob {
          0%, 100% { transform: translateY(0) rotate(-4deg); }
          50% { transform: translateY(-4px) rotate(4deg); }
        }
        @keyframes sw-wag { from { transform: rotate(-10deg); } to { transform: rotate(14deg); } }
        @keyframes sw-ear { 0%, 70%, 100% { transform: rotate(0); } 80% { transform: rotate(-12deg); } 90% { transform: rotate(6deg); } }
        @keyframes sw-spray {
          0% { opacity: 0; transform: translate(0, 0); }
          20% { opacity: .9; }
          100% { opacity: 0; transform: translate(-14px, -12px); }
        }
        @media (prefers-reduced-motion: reduce) {
          .sw .sw-back, .sw .sw-front, .sw .sw-crest, .sw .sw-rider, .sw .sw-tail, .sw .sw-ear, .sw .sw-drop { animation: none; }
        }
      `}</style>

      {/* the swell behind */}
      <path className="sw-back" d="M0 52 q10 -7 20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 L160 80 L0 80 Z" />

      <g className="sw-rider">
        {/* spray off the tail of the board */}
        <circle className="sw-drop" cx="34" cy="52" r="1.6" />
        <circle className="sw-drop" cx="31" cy="50" r="1.2" />
        <circle className="sw-drop" cx="36" cy="49" r="1" />

        {/* surfboard */}
        <ellipse cx="60" cy="55" rx="31" ry="4.2" fill="var(--color-gold, #c9a24b)" />
        <path d="M33 55 H87" stroke="#fff" strokeWidth="1" strokeLinecap="round" opacity=".7" />

        {/* tail */}
        <path className="sw-tail" d="M46 38 Q35 37 33 25 Q37 27 39 26 Q41 32 48 34 Z" fill="var(--color-navy, #16324f)" />

        {/* body and legs */}
        <ellipse cx="57" cy="41" rx="14" ry="9.5" fill="var(--color-navy, #16324f)" />
        <rect x="47" y="44" width="5" height="10" rx="2.5" fill="var(--color-navy, #16324f)" />
        <rect x="63" y="43" width="5" height="11" rx="2.5" fill="var(--color-navy, #16324f)" />
        <path d="M62 36 Q69 39 67 47 Q62 46 60 41 Z" fill="#e8eef5" />

        {/* head */}
        <g className="sw-ear">
          <path d="M71 21 L74 9 L78 20 Z" fill="var(--color-navy, #16324f)" />
        </g>
        <path d="M64 22 L65 11 L70 19 Z" fill="var(--color-navy, #16324f)" />
        <circle cx="70" cy="28" r="9" fill="var(--color-navy, #16324f)" />
        <path d="M75 25 Q86 25 88 30 Q85 34 75 33 Z" fill="#e8eef5" />
        <circle cx="87.5" cy="29" r="1.8" fill="var(--color-navy-ink, #0d2236)" />
        <path d="M80 32 Q83 33.5 85.5 32" stroke="var(--color-navy-ink, #0d2236)" strokeWidth=".9" fill="none" strokeLinecap="round" />
        <circle cx="73.5" cy="25.5" r="1.5" fill="var(--color-gold, #c9a24b)" />
        <circle cx="73.9" cy="25.1" r=".5" fill="#fff" />
      </g>

      {/* the wave in front */}
      <path className="sw-front" d="M0 60 q10 -6 20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 L160 80 L0 80 Z" />
      <path className="sw-crest" d="M0 60 q10 -6 20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0" fill="none" stroke="#fff" strokeWidth="1.2" opacity=".8" />
    </svg>
  );
}
