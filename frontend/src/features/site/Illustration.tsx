import { useId } from "react";

/**
 * Original illustrations for the public homepage. Deliberately drawn, not
 * photographed: a face-recognition demo shouldn't put real people's faces
 * on a public page. All people shown are fictional.
 */

export type Figure = "daniel" | "ruth" | "stranger" | "nana";

const LOOKS: Record<Figure, { skin: string; ear: string; hair: string; top: string; collar: string; mouth: "smile" | "flat" }> = {
  daniel: { skin: "#B37A55", ear: "#A86F4C", hair: "#2B211C", top: "#E2A34A", collar: "#C98B34", mouth: "smile" },
  ruth: { skin: "#9A6444", ear: "#8C583A", hair: "#3A2A20", top: "#4E7A5F", collar: "#3E6650", mouth: "smile" },
  stranger: { skin: "#E9C2A0", ear: "#DDB28E", hair: "#C9A27E", top: "#3E6A8A", collar: "#2F5675", mouth: "flat" },
  nana: { skin: "#EAC3A3", ear: "#DDB291", hair: "#D9D4CF", top: "#A04CA0", collar: "#8A3A8A", mouth: "smile" },
};

export function Person({ figure, x, y, scale = 1, turn = 0 }: { figure: Figure; x: number; y: number; scale?: number; turn?: number }) {
  const look = LOOKS[figure];
  // `turn` nudges the face sideways to suggest a head turned away.
  const fx = turn * 10;
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      {/* shoulders */}
      <rect x="-70" y="55" width="140" height="150" rx="62" fill={look.top} />
      <path d="M-22 58 L0 84 L22 58 Z" fill={look.collar} />
      {/* neck */}
      <rect x="-14" y="30" width="28" height="32" rx="10" fill={look.ear} />
      {/* back hair volume */}
      {figure === "nana" && <ellipse cx="0" cy="-8" rx="50" ry="52" fill={look.hair} />}
      {figure === "nana" && <circle cx="0" cy="-62" r="15" fill={look.hair} />}
      {figure === "ruth" && (
        <g fill={look.hair}>
          {[[-44, -10], [-48, 14], [-40, 36], [44, -10], [48, 14], [40, 36], [-30, -42], [0, -54], [30, -42]].map(([cx, cy]) => (
            <circle key={`${cx}${cy}`} cx={cx} cy={cy} r="20" />
          ))}
        </g>
      )}
      {/* ears + head */}
      <circle cx="-40" cy="5" r="8" fill={look.ear} />
      <circle cx="40" cy="5" r="8" fill={look.ear} />
      {figure === "ruth" && (
        <>
          <circle cx="-41" cy="17" r="4" fill="#F2C14E" />
          <circle cx="41" cy="17" r="4" fill="#F2C14E" />
        </>
      )}
      <ellipse cx="0" cy="0" rx="40" ry="46" fill={look.skin} />
      {figure === "daniel" && (
        <path d="M-40 -10 C-40 -52 -15 -62 3 -60 C27 -60 43 -42 41 -10 C35 -28 17 -36 0 -34 C-17 -32 -31 -24 -40 -10 Z" fill={look.hair} />
      )}
      {figure === "ruth" && (
        <path d="M-40 -8 C-38 -44 -12 -52 2 -50 C26 -50 42 -36 40 -8 C30 -26 14 -30 -2 -30 C-18 -28 -32 -20 -40 -8 Z" fill={look.hair} />
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
      <g transform={`translate(${fx} 0)`}>
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
    </g>
  );
}

export type BoxStyle = "known" | "uncertain" | "unknown" | "detecting" | "holding";

const BOX: Record<BoxStyle, { stroke: string; dash?: string; chip: string }> = {
  known: { stroke: "#FFFFFF", chip: "#285744" },
  holding: { stroke: "#FFFFFF", dash: "10 8", chip: "#285744" },
  uncertain: { stroke: "#F2C14E", chip: "#7A5300" },
  unknown: { stroke: "#E9E4DC", chip: "#4A5650" },
  detecting: { stroke: "#FFFFFF", dash: "6 7", chip: "#4A5650" },
};

/** A living room as seen by the camera, optionally with a face box and label. */
export function CameraScene({
  visitor,
  box,
  label,
  title,
  leaving = false,
  dim = false,
}: {
  visitor: Figure | null;
  box?: BoxStyle;
  label?: string;
  title: string;
  /** Visitor stepping out of the frame. */
  leaving?: boolean;
  /** Poor light and a turned head. */
  dim?: boolean;
}) {
  const id = useId();
  const labelWidth = label ? label.length * 9.2 + 28 : 0;
  const px = leaving ? 404 : 250;
  const style = box ? BOX[box] : null;
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
      {visitor && <Person figure={visitor} x={px} y={168} turn={dim ? 1 : leaving ? 1.4 : 0} />}
      {dim && <rect width="480" height="360" fill="#172721" opacity="0.28" />}
      {visitor && style && (
        <g>
          <rect
            x={px - 52}
            y="106"
            width="104"
            height="122"
            rx="16"
            fill="none"
            stroke={style.stroke}
            strokeWidth="4"
            strokeDasharray={style.dash}
          />
          {label && (
            <g>
              <rect x={px - 52} y="70" width={labelWidth} height="28" rx="14" fill={style.chip} />
              <text x={px - 52 + 14} y="89" fill="#FFFFFF" fontSize="15" fontWeight="600" fontFamily="Inter Variable, Inter, system-ui, sans-serif">
                {label}
              </text>
            </g>
          )}
        </g>
      )}
    </svg>
  );
}

/** Head-and-shoulders portrait on a soft background — the "profile photo". */
export function Portrait({ figure, title }: { figure: Figure; title: string }) {
  const id = useId();
  const bg = { daniel: ["#FBE3C4", "#F4CFA0"], ruth: ["#DCEFE0", "#BFDCC6"], stranger: ["#E3ECF3", "#C9D9E6"], nana: ["#F3E2F2", "#E5C8E4"] }[figure];
  return (
    <svg viewBox="0 0 200 200" role="img" aria-labelledby={`${id}-t`} className="block h-full w-full">
      <title id={`${id}-t`}>{title}</title>
      <defs>
        <radialGradient id={`${id}-bg`} cx="0.35" cy="0.3" r="0.9">
          <stop offset="0" stopColor={bg[0]} />
          <stop offset="1" stopColor={bg[1]} />
        </radialGradient>
      </defs>
      <rect width="200" height="200" fill={`url(#${id}-bg)`} />
      <Person figure={figure} x={100} y={98} scale={1.25} />
    </svg>
  );
}

/** A remembered day: the patient with a loved one, in the garden or the kitchen. */
export function MemoryScene({
  title,
  scene = "garden",
  companion = "daniel",
}: {
  title: string;
  scene?: "garden" | "kitchen";
  companion?: "daniel" | "ruth";
}) {
  const id = useId();
  return (
    <svg viewBox="0 0 480 300" role="img" aria-labelledby={`${id}-t`} className="block h-full w-full">
      <title id={`${id}-t`}>{title}</title>
      <defs>
        <linearGradient id={`${id}-bg`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={scene === "garden" ? "#F9E3C9" : "#F6EBDD"} />
          <stop offset="1" stopColor={scene === "garden" ? "#F4EFE2" : "#EFDCC6"} />
        </linearGradient>
      </defs>
      <rect width="480" height="300" fill={`url(#${id}-bg)`} />
      {scene === "garden" ? (
        <>
          <circle cx="390" cy="70" r="32" fill="#F2C14E" opacity="0.85" />
          <path d="M0 200 Q120 150 240 190 T480 170 V300 H0 Z" fill="#9CC5A1" />
          <path d="M0 240 Q140 200 260 236 T480 220 V300 H0 Z" fill="#6E9F7C" />
          {[40, 70, 420, 452].map((cx, i) => (
            <g key={cx}>
              <circle cx={cx} cy={250 - (i % 2) * 14} r="9" fill="#E07A6A" />
              <circle cx={cx} cy={250 - (i % 2) * 14} r="3.5" fill="#F9E3C9" />
            </g>
          ))}
        </>
      ) : (
        <>
          {/* tiled splashback, shelf with jars, window light */}
          <rect x="0" y="0" width="480" height="150" fill="#F1E4D2" />
          {[0, 60, 120, 180, 240, 300, 360, 420].map((x) => (
            <path key={x} d={`M${x} 0 V150`} stroke="#E6D5BE" strokeWidth="2" />
          ))}
          <rect x="40" y="60" width="130" height="8" rx="4" fill="#B98A5E" />
          <rect x="52" y="34" width="22" height="26" rx="5" fill="#E2A34A" />
          <rect x="84" y="28" width="26" height="32" rx="6" fill="#9CC5A1" />
          <rect x="120" y="38" width="20" height="22" rx="5" fill="#E07A6A" />
          <circle cx="400" cy="64" r="34" fill="#FFFCF6" opacity="0.7" />
        </>
      )}
      <Person figure="nana" x={170} y={170} scale={0.92} />
      <Person figure={companion} x={300} y={164} scale={0.92} />
      {scene === "kitchen" && (
        <>
          <rect x="60" y="248" width="360" height="52" rx="6" fill="#C9A27E" />
          <ellipse cx="240" cy="246" rx="46" ry="12" fill="#FFFCF6" />
          <path d="M206 244 Q240 214 274 244 Z" fill="#F2C14E" />
          <path d="M214 232 Q240 222 266 232" stroke="#FFFCF6" strokeWidth="4" fill="none" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}
