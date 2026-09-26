import type { CSSProperties, ReactNode } from "react";

/*
 * Decorative race map for the landing page. Pure SVG + CSS animation
 * (see .race-token in globals.css) — no client JavaScript.
 * Coordinates are in the 400×340 viewBox; the route passes through
 * every stop listed in STOPS, and the race-lap keyframes use the same points.
 */

const ROUTE =
  "M64 292C96 272 116 238 150 232C186 226 206 262 238 256C276 250 300 212 318 178" +
  "C334 146 290 122 258 104C232 88 280 56 340 58";

const STOPS = {
  start: { x: 64, y: 292 },
  quiz: { x: 150, y: 232 },
  code: { x: 238, y: 256 },
  typing: { x: 318, y: 178 },
  bonus: { x: 258, y: 104 },
  finish: { x: 340, y: 58 },
};

type Point = { x: number; y: number };

const TEAMS: {
  letter: string;
  name: string;
  color: string;
  points: number;
  at: Point;
  lap: CSSProperties;
}[] = [
  { letter: "Б", name: "Барс", color: "#21B8A6", points: 240, at: STOPS.bonus, lap: { animationDuration: "11s", animationDelay: "-7.7s" } },
  { letter: "А", name: "Альфа", color: "#635BFF", points: 215, at: STOPS.code, lap: { animationDuration: "13s", animationDelay: "-4.2s" } },
  { letter: "К", name: "Комета", color: "#FFB020", points: 190, at: STOPS.start, lap: { animationDuration: "15s", animationDelay: "0s" } },
];

function Checkpoint({ at, ring, children }: { at: Point; ring: string; children: ReactNode }) {
  return (
    <g transform={`translate(${at.x} ${at.y})`}>
      <circle r="18" fill="#fff" stroke={ring} strokeWidth="3" />
      {children}
    </g>
  );
}

function Glyph({ children, color, size }: { children: string; color: string; size: number }) {
  return (
    <text
      textAnchor="middle"
      dominantBaseline="central"
      fill={color}
      fontSize={size}
      fontWeight="800"
      className="font-display"
    >
      {children}
    </text>
  );
}

function TeamToken({ letter, color, at, lap }: (typeof TEAMS)[number]) {
  return (
    <g className="race-token" style={lap} transform={`translate(${at.x} ${at.y})`}>
      <path
        d="M0-3C-5-10-15-16-15-27A15 15 0 1 1 15-27C15-16 5-10 0-3Z"
        fill={color}
        stroke="#fff"
        strokeWidth="3"
      />
      <text
        y="-27"
        textAnchor="middle"
        dominantBaseline="central"
        fill="#fff"
        fontSize="13"
        fontWeight="800"
        className="font-display"
      >
        {letter}
      </text>
    </g>
  );
}

export function RaceMapPreview() {
  return (
    <figure className="relative mx-auto w-full max-w-xl rounded-card bg-surface p-3 shadow-lift ring-1 ring-line sm:p-4 lg:max-w-none">
      <figcaption className="sr-only">
        Пример карты гонки: три команды движутся от старта к финишу через испытания — вопрос,
        программирование, скоростную печать и бонус.
      </figcaption>

      <svg viewBox="0 0 400 340" aria-hidden="true" className="block h-auto w-full rounded-2xl">
        <defs>
          <pattern id="race-map-dots" width="18" height="18" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1.4" fill="#DDE1EC" />
          </pattern>
          <filter id="race-map-shadow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#202B46" floodOpacity="0.2" />
          </filter>
        </defs>

        <rect width="400" height="340" fill="#F7F8FC" />
        <rect width="400" height="340" fill="url(#race-map-dots)" />
        <circle cx="120" cy="96" r="78" fill="#E3F7F4" />
        <circle cx="352" cy="300" r="92" fill="#EEEDFF" />

        {/* Road: border, surface, dotted centre line */}
        <path d={ROUTE} fill="none" stroke="#E4E7F0" strokeWidth="30" strokeLinecap="round" />
        <path d={ROUTE} fill="none" stroke="#fff" strokeWidth="24" strokeLinecap="round" />
        <path
          d={ROUTE}
          fill="none"
          stroke="#635BFF"
          strokeOpacity="0.35"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray="0 11"
        />

        {/* Start */}
        <g transform={`translate(${STOPS.start.x} ${STOPS.start.y})`}>
          <circle r="11" fill="#E3F7F4" stroke="#21B8A6" strokeWidth="3" />
          <text y="30" textAnchor="middle" fill="#5A6480" fontSize="10" fontWeight="800" letterSpacing="1.5" className="font-display">
            СТАРТ
          </text>
        </g>

        <Checkpoint at={STOPS.quiz} ring="#635BFF">
          <Glyph color="#635BFF" size={17}>?</Glyph>
        </Checkpoint>
        <Checkpoint at={STOPS.code} ring="#21B8A6">
          <Glyph color="#0E7A6D" size={11}>{"</>"}</Glyph>
        </Checkpoint>
        <Checkpoint at={STOPS.typing} ring="#202B46">
          <Glyph color="#202B46" size={12}>Aa</Glyph>
        </Checkpoint>
        <Checkpoint at={STOPS.bonus} ring="#FFB020">
          <path
            d="M0-8L2-2.75 7.61-2.47 3.23 1.05 4.7 6.47 0 3.4-4.7 6.47-3.23 1.05-7.61-2.47-2-2.75Z"
            fill="#FFB020"
          />
        </Checkpoint>

        {/* Finish */}
        <circle cx={STOPS.finish.x} cy={STOPS.finish.y} r="12" fill="#21B8A6" className="race-pulse" />
        <circle cx={STOPS.finish.x} cy={STOPS.finish.y} r="9" fill="#fff" stroke="#21B8A6" strokeWidth="3" />
        <g transform="translate(356 18)">
          <line x1="0" y1="0" x2="0" y2="46" stroke="#202B46" strokeWidth="3" strokeLinecap="round" />
          <rect x="0" y="0" width="30" height="20" fill="#fff" stroke="#202B46" strokeWidth="1.5" />
          <path d="M0 0h10v10H0zM20 0h10v10H20zM10 10h10v10H10z" fill="#202B46" />
          <text x="0" y="62" textAnchor="middle" fill="#5A6480" fontSize="10" fontWeight="800" letterSpacing="1.5" className="font-display">
            ФИНИШ
          </text>
        </g>

        <g filter="url(#race-map-shadow)">
          {TEAMS.map((team) => (
            <TeamToken key={team.letter} {...team} />
          ))}
        </g>
      </svg>

      {/* Sample leaderboard overlay (illustrative data) */}
      <div
        aria-hidden="true"
        className="absolute top-5 left-5 w-36 rounded-2xl bg-surface/95 p-2.5 shadow-card ring-1 ring-line backdrop-blur sm:top-7 sm:left-7 sm:w-44 sm:p-3"
      >
        <p className="px-1 text-[10px] font-extrabold tracking-widest text-ink-muted uppercase sm:text-[11px]">
          Лидеры · пример
        </p>
        <ol className="mt-1.5 space-y-1">
          {TEAMS.map((team, index) => (
            <li key={team.letter} className="flex items-center gap-2 rounded-lg px-1 py-0.5 text-xs font-bold sm:text-sm">
              <span className="w-3 text-ink-muted tabular-nums">{index + 1}</span>
              <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: team.color }} />
              <span className="truncate">{team.name}</span>
              <span className="ml-auto text-ink-muted tabular-nums">{team.points}</span>
            </li>
          ))}
        </ol>
      </div>
    </figure>
  );
}
