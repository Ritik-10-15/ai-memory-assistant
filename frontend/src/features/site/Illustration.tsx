import { useId } from "react";

/**
 * Original illustrations for the public homepage. Deliberately drawn, not
 * photographed: a face-recognition demo shouldn't put real people's faces
 * on a public page.
 */

type Figure = "daniel" | "stranger" | "nana";

function Person({ figure, x, y, scale = 1 }: { figure: Figure; x: number; y: number; scale?: number }) {
  const look = {
    daniel: { skin: "#B37A55", ear: "#A86F4C", hair: "#2B211C", top: "#E2A34A", collar: "#C98B34", mouth: "smile" },
    stranger: { skin: "#E9C2A0", ear: "#DDB28E", hair: "#C9A27E", top: "#3E6A8A", collar: "#2F5675", mouth: "flat" },
    nana: { skin: "#EAC3A3", ear: "#DDB291", hair: "#D9D4CF", top: "#A04CA0", collar: "#8A3A8A", mouth: "smile" },
  }[figure];

  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      {/* shoulders */}
      <rect x="-70" y="55" width="140" height="150" rx="62" fill={look.top} />
      <path d="M-22 58 L0 84 L22 58 Z" fill={look.collar} />
      {/* neck */}
      <rect x="-14" y="30" width="28" height="32" rx="10" fill={look.ear} />
      {/* ears + head */}
      <circle cx="-40" cy="5" r="8" fill={look.ear} />
      <circle cx="40" cy="5" r="8" fill={look.ear} />
      {figure === "nana" && <ellipse cx="0" cy="-8" rx="50" ry="52" fill={look.hair} />}
      {figure === "nana" && <circle cx="0" cy="-62" r="15" fill={look.hair} />}
      <ellipse cx="0" cy="0" rx="40" ry="46" fill={look.skin} />
      {figure === "daniel" && (
        <path d="M-40 -10 C-40 -52 -15 -62 3 -60 C27 -60 43 -42 41 -10 C35 -28 17 -36 0 -34 C-17 -32 -31 -24 -40 -10 Z" fill={look.hair} />
      )}
      {figure === "stranger" && (
        <>
          <path d="M-40 -8 C-40 -40 -18 -50 0 -50 C22 -50 40 -38 40 -8 C30 -24 14 -28 0 -28 C-14 -28 -30 -22 -40 -8 Z" fill={look.hair} />
          <path d="M-44 -18 C-42 -52 -18 -60 2 -60 C26 -60 44 -48 44 -20 Z" fill="#2F5675" />
          <rect x="-6" y="-26" width="62" height="10" rx="5" fill="#2F5675" />
        </>
      )}
      {figure === "nana" && (
        <>
          <path d="M-40 -6 C-34 -34 -14 -40 0 -40 C16 -40 36 -32 40 -6 C28 -20 14 -24 0 -24 C-14 -24 -28 -18 -40 -6 Z" fill={look.hair} />
          <circle cx="-14" cy="0" r="10" fill="none" stroke="#5C6E65" strokeWidth="3" />
          <circle cx="14" cy="0" r="10" fill="none" stroke="#5C6E65" strokeWidth="3" />
          <path d="M-4 0 H4" stroke="#5C6E65" strokeWidth="3" />
        </>
      )}
      {/* eyes */}
      <circle cx="-14" cy="0" r="3.4" fill="#2B211C" />
      <circle cx="14" cy="0" r="3.4" fill="#2B211C" />
      <path d="M-20 -12 Q-14 -15 -8 -12" stroke="#2B211C" strokeWidth="2.4" fill="none" strokeLinecap="round" opacity="0.7" />
      <path d="M8 -12 Q14 -15 20 -12" stroke="#2B211C" strokeWidth="2.4" fill="none" strokeLinecap="round" opacity="0.7" />
      {/* cheeks + mouth */}
      <circle cx="-22" cy="14" r="6" fill="#E07A6A" opacity="0.22" />
      <circle cx="22" cy="14" r="6" fill="#E07A6A" opacity="0.22" />
      {look.mouth === "smile" ? (
        <path d="M-12 20 Q0 31 12 20" stroke="#6B3F2A" strokeWidth="3" fill="none" strokeLinecap="round" />
      ) : (
        <path d="M-9 24 H9" stroke="#6B3F2A" strokeWidth="3" fill="none" strokeLinecap="round" />
      )}
    </g>
  );
}

const BOX = { known: "#FFFFFF", uncertain: "#F2C14E", unknown: "#E9E4DC" } as const;

/** A living room as seen by the camera, optionally with a face box and label. */
export function CameraScene({
  visitor,
  box,
  label,
  title,
}: {
  visitor: "daniel" | "stranger" | null;
  box?: keyof typeof BOX;
  label?: string;
  title: string;
}) {
  const id = useId();
  const labelWidth = label ? label.length * 9.2 + 28 : 0;
  return (
    <svg viewBox="0 0 480 360" role="img" aria-labelledby={`${id}-t`} className="block h-full w-full">
      <title id={`${id}-t`}>{title}</title>
      <defs>
        <linearGradient id={`${id}-wall`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#F7EDE0" />
          <stop offset="1" stopColor="#F1E2D0" />
        </linearGradient>
        <linearGradient id={`${id}-sky`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#CFE6F2" />
          <stop offset="1" stopColor="#E9F4EA" />
        </linearGradient>
      </defs>
      <rect width="480" height="360" fill={`url(#${id}-wall)`} />
      {/* window with garden view */}
      <rect x="330" y="36" width="116" height="150" rx="10" fill={`url(#${id}-sky)`} stroke="#FFFCF6" strokeWidth="8" />
      <path d="M334 150 Q370 126 404 142 T442 136 V182 H334 Z" fill="#9CC5A1" />
      <path d="M388 40 V182 M334 110 H442" stroke="#FFFCF6" strokeWidth="5" />
      {/* framed picture */}
      <rect x="44" y="52" width="76" height="60" rx="4" fill="#E3F0DF" stroke="#C9A27E" strokeWidth="5" />
      <path d="M50 104 L72 80 L86 94 L98 84 L114 104 Z" fill="#7FA88A" />
      <circle cx="102" cy="68" r="6" fill="#F2C14E" />
      {/* plant */}
      <ellipse cx="66" cy="244" rx="10" ry="34" fill="#4E7A5F" transform="rotate(-24 66 244)" />
      <ellipse cx="82" cy="236" rx="10" ry="38" fill="#5E8C6E" transform="rotate(14 82 236)" />
      <ellipse cx="72" cy="226" rx="9" ry="36" fill="#41694F" />
      <rect x="50" y="268" width="46" height="44" rx="8" fill="#C46A4A" />
      {/* sofa + floor */}
      <rect x="112" y="226" width="290" height="104" rx="30" fill="#285744" />
      <rect x="0" y="322" width="480" height="38" fill="#E7D2BB" />
      {visitor && <Person figure={visitor} x={250} y={168} />}
      {visitor && box && (
        <g>
          <rect x="198" y="106" width="104" height="122" rx="16" fill="none" stroke={BOX[box]} strokeWidth="4" />
          {label && (
            <g>
              <rect x="198" y="70" width={labelWidth} height="28" rx="14" fill={box === "known" ? "#285744" : box === "uncertain" ? "#7A5300" : "#4A5650"} />
              <text x={198 + 14} y="89" fill="#FFFFFF" fontSize="15" fontWeight="600" fontFamily="Inter Variable, Inter, system-ui, sans-serif">
                {label}
              </text>
            </g>
          )}
        </g>
      )}
    </svg>
  );
}

/** A remembered day out: grandmother and grandson in the garden. */
export function MemoryScene({ title }: { title: string }) {
  const id = useId();
  return (
    <svg viewBox="0 0 480 300" role="img" aria-labelledby={`${id}-t`} className="block h-full w-full">
      <title id={`${id}-t`}>{title}</title>
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#F9E3C9" />
          <stop offset="1" stopColor="#F4EFE2" />
        </linearGradient>
      </defs>
      <rect width="480" height="300" fill={`url(#${id}-sky)`} />
      <circle cx="390" cy="70" r="32" fill="#F2C14E" opacity="0.85" />
      <path d="M0 200 Q120 150 240 190 T480 170 V300 H0 Z" fill="#9CC5A1" />
      <path d="M0 240 Q140 200 260 236 T480 220 V300 H0 Z" fill="#6E9F7C" />
      {[40, 70, 420, 452].map((cx, i) => (
        <g key={cx}>
          <circle cx={cx} cy={250 - (i % 2) * 14} r="9" fill="#E07A9A" />
          <circle cx={cx} cy={250 - (i % 2) * 14} r="3.5" fill="#F9E3C9" />
        </g>
      ))}
      <Person figure="nana" x={190} y={170} scale={0.92} />
      <Person figure="daniel" x={300} y={164} scale={0.92} />
    </svg>
  );
}
