"use client";

import { useId, useSyncExternalStore } from "react";
import { useI18n } from "@/components/i18n/i18n-provider";
import { teamColor, type LobbyTeam, type RoutePoint } from "@/lib/race/lobby";
import { pointLabel } from "@/lib/race/route";
import { fanOffsets, layoutTrack } from "@/lib/race/track";

const NARROW = "(max-width: 640px)";

function useNarrow() {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia(NARROW);
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => window.matchMedia(NARROW).matches,
    () => false,
  );
}

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/** Two letters for the token: "Бүркүт" → "Бү", "Red Team" → "RT". */
function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return (words[0] ?? "?").slice(0, 2);
}

/**
 * The live race track: a winding road from START to FINISH with every team as a
 * token on its point. A move makes the token hop to the next point, the road
 * behind the viewer's team (or the leader) lights up, the leader wears a crown.
 * `dark` is for the projector's night stage.
 */
export function RaceTrack({
  route,
  teams,
  ownTeamId = null,
  perRow = 4,
  dark = false,
  showTitles = true,
}: {
  route: RoutePoint[];
  teams: LobbyTeam[];
  ownTeamId?: string | null;
  perRow?: number;
  dark?: boolean;
  showTitles?: boolean;
}) {
  const { m } = useI18n();
  const narrow = useNarrow();
  const glow = `glow-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const layout = narrow ? layoutTrack(route.length, 3, 620) : layoutTrack(route.length, perRow);
  const own = teams.find((team) => team.id === ownTeamId) ?? null;
  const leaders = teams.filter((team) => team.place === 1 && team.score > 0);
  const crowned = leaders.length === 1 ? leaders[0].id : null;
  // Whose road is lit: the viewer's team, or the team furthest along.
  const lit = own ?? [...teams].sort((a, b) => b.position - a.position)[0] ?? null;
  const litColor = lit ? (teamColor(teams, lit.id) ?? "#E0162B") : "#E0162B";
  const litPos = lit?.position ?? 0;
  const last = route.length - 1;

  const byPoint = new Map<number, LobbyTeam[]>();
  for (const team of teams) {
    const list = byPoint.get(team.position) ?? [];
    list.push(team);
    byPoint.set(team.position, list);
  }

  const road = dark ? "rgb(255 255 255 / 0.14)" : "#E4E7F0";
  const centre = dark ? "rgb(255 255 255 / 0.55)" : "#ffffff";
  const label = dark ? "rgb(255 255 255 / 0.78)" : "#5A6480";

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        className="block h-auto w-full overflow-visible"
        role="img"
        aria-label={m.live.trackAria}
      >
        <defs>
          <filter id={glow} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="9" />
          </filter>
        </defs>

        {/* Road */}
        <path d={layout.path} fill="none" stroke={road} strokeWidth={46} strokeLinecap="round" strokeLinejoin="round" />
        <path
          d={layout.path}
          fill="none"
          stroke={centre}
          strokeWidth={4}
          strokeDasharray="2 18"
          strokeLinecap="round"
          opacity={dark ? 1 : 0.9}
        />

        {/* Lit road behind the viewer's team: older segments still, the newest one draws itself */}
        {layout.segments.slice(0, litPos).map((d, i) => (
          <g key={`seg-${i}`}>
            <path d={d} fill="none" stroke={litColor} strokeWidth={30} strokeLinecap="round" opacity={0.35} filter={`url(#${glow})`} />
            <path
              d={d}
              fill="none"
              stroke={litColor}
              strokeWidth={14}
              strokeLinecap="round"
              pathLength={1}
              className={i === litPos - 1 ? "track-draw" : undefined}
            />
          </g>
        ))}

        {/* Points */}
        {route.map((point, i) => {
          const p = layout.points[i];
          if (!p) return null;
          const passed = own ? point.position < own.position : false;
          const next = own ? point.position === own.position + 1 : false;
          const finish = point.type === "finish";
          const start = point.type === "start";
          const fill = finish ? "#202B46" : start ? "#0FA595" : passed ? "#0FA595" : dark ? "#1B1446" : "#FFFFFF";
          const stroke = finish ? "#FFB547" : start ? "#E3F7F4" : passed ? "#E3F7F4" : next ? "#E0162B" : dark ? "rgb(255 255 255 / 0.6)" : "#E0162B";
          const text = finish || start || passed || dark ? "#FFFFFF" : "#B50E20";
          return (
            <g key={point.position} transform={`translate(${p.x} ${p.y})`}>
              {next && <circle r={34} fill="none" stroke="#E0162B" strokeWidth={4} className="track-ping" />}
              <circle r={finish ? 36 : 30} fill={fill} stroke={stroke} strokeWidth={5} />
              {finish ? (
                <g transform="translate(-12 -16)">
                  <path d="M3 32V2" stroke="#FFB547" strokeWidth={4} strokeLinecap="round" />
                  <path d="M5 3h8v6H5zm8 6h8v6h-8zM5 15h8v-6H5zm16-12h-8v6h8z" fill="#FFFFFF" />
                </g>
              ) : (
                <text textAnchor="middle" dy={9} fontSize={26} fontWeight={800} fill={text}>
                  {start ? m.common.startLetter : passed ? "✓" : point.position}
                </text>
              )}
              {showTitles && point.type === "checkpoint" && point.title && (
                <text textAnchor="middle" y={62} fontSize={22} fontWeight={700} fill={label}>
                  {clip(point.title, narrow ? 11 : 18)}
                </text>
              )}
              {showTitles && finish && (
                <text textAnchor="middle" y={68} fontSize={22} fontWeight={800} fill={dark ? "#FFB547" : "#202B46"}>
                  {m.common.finish}
                </text>
              )}
            </g>
          );
        })}

        {/* Team tokens: keyed by team, so a move animates (CSS transition) instead of jumping */}
        {teams.map((team) => {
          const group = byPoint.get(team.position) ?? [team];
          const offset = fanOffsets(group.length)[group.findIndex((t) => t.id === team.id)] ?? { x: 0, y: 0 };
          const p = layout.points[Math.min(team.position, last)] ?? layout.points[0];
          if (!p) return null;
          const color = teamColor(teams, team.id) ?? "#E0162B";
          const mine = team.id === ownTeamId;
          return (
            <g
              key={team.id}
              className="track-token"
              style={{ transform: `translate(${p.x + offset.x}px, ${p.y + offset.y - 46}px)` }}
            >
              <g key={team.position} className="track-hop">
                {mine && <circle r={30} fill="none" stroke={color} strokeWidth={4} className="track-ping" />}
                <ellipse cx={0} cy={30} rx={16} ry={5} fill="rgb(0 0 0 / 0.25)" />
                <circle r={22} fill={color} stroke="#FFFFFF" strokeWidth={mine ? 6 : 4} />
                <text textAnchor="middle" dy={7} fontSize={18} fontWeight={900} fill="#FFFFFF">
                  {initials(team.name)}
                </text>
                {team.id === crowned && (
                  <path d="M-14 -24l5-14 9 9 9-9 5 14z" fill="#FFB547" stroke="#FFFFFF" strokeWidth={2.5} strokeLinejoin="round" />
                )}
              </g>
            </g>
          );
        })}
      </svg>
      {/* The same picture in words for screen readers */}
      <figcaption className="sr-only">
        <ul>
          {teams.map((team) => {
            const point = route[Math.min(team.position, last)];
            return <li key={team.id}>{m.live.teamAt(team.name, point ? pointLabel(point, m) : "—")}</li>;
          })}
        </ul>
      </figcaption>
    </figure>
  );
}
