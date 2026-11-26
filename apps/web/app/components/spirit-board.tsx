import { hauntingLevel } from "@/lib/haunting";

/** Five level names on a talking-board arc, with the planchette on the building's level (haunted-design v2 A). */
const NAMES = ["Peaceful", "Restless", "Haunted", "Possessed", "Cursed"] as const;
const CX = 280;
const CY = 268;
const R = 196;
// Left to right across the top of the arc, from 160° to 20°.
const angleOf = (i: number) => 160 - i * 35;
const rad = (deg: number) => (deg * Math.PI) / 180;
const at = (deg: number, r: number) => ({ x: CX + r * Math.cos(rad(deg)), y: CY - r * Math.sin(rad(deg)) });

export function SpiritBoard({ moreHauntedThan, score }: { moreHauntedThan: number; score: number }) {
  const h = hauntingLevel(moreHauntedThan, score);
  const target = angleOf(h.level);
  // The planchette is drawn pointing straight up (90°); rotate it to the level, settling from the left.
  const to = 90 - target;
  const from = to - 30;
  const arcStart = at(170, R);
  const arcEnd = at(10, R);
  return (
    <figure className="board" role="img" aria-label={`Haunting level: ${h.name}, ${h.level + 1} of 5. This building is ${h.meaning}.`}>
      <svg viewBox="0 0 560 300" aria-hidden>
        <path className="arc" d={`M ${arcStart.x} ${arcStart.y} A ${R} ${R} 0 0 1 ${arcEnd.x} ${arcEnd.y}`} />
        {NAMES.map((name, i) => {
          const a = angleOf(i);
          const p = at(a, R + 16);
          const t1 = at(a, R - 6);
          const t2 = at(a, R + 6);
          const here = i === h.level;
          return (
            <g key={name}>
              <line className="tick" x1={t1.x} y1={t1.y} x2={t2.x} y2={t2.y} />
              <text
                className={`word${here ? ` here l${i}` : ""}`}
                x={p.x}
                y={p.y}
                textAnchor="middle"
                transform={`rotate(${90 - a} ${p.x} ${p.y})`}
              >
                {name}
              </text>
            </g>
          );
        })}
        {/* Sun and moon, as on a talking board */}
        <circle className="sun" cx={58} cy={262} r={13} />
        {Array.from({ length: 8 }, (_, k) => {
          const a = (k * Math.PI) / 4;
          return <line key={k} className="sun" x1={58 + 17 * Math.cos(a)} y1={262 + 17 * Math.sin(a)} x2={58 + 23 * Math.cos(a)} y2={262 + 23 * Math.sin(a)} />;
        })}
        <path className="moon" d="M 507 249 a 14 14 0 1 0 8 24 a 11 11 0 1 1 -8 -24 z" />
        <g className="planchette" style={{ ["--from" as string]: `${from}deg`, ["--to" as string]: `${to}deg`, transform: `rotate(${to}deg)` }}>
          {/* Teardrop between radii R-34 (tip) and R-112 (base), drawn pointing straight up. */}
          <path d={`M ${CX} ${CY - R + 34} C ${CX + 22} ${CY - R + 64} ${CX + 34} ${CY - R + 92} ${CX + 26} ${CY - R + 112} L ${CX - 26} ${CY - R + 112} C ${CX - 34} ${CY - R + 92} ${CX - 22} ${CY - R + 64} ${CX} ${CY - R + 34} Z`} />
          <circle cx={CX} cy={CY - R + 84} r={9} />
        </g>
      </svg>
    </figure>
  );
}
