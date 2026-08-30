"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import {
  filterPlayers,
  headshotUrl,
  positionCounts,
  type RankedPlayer,
} from "@/lib/players/rankings";
import { positionColor } from "@/components/ui/position-tag";

/**
 * The player rankings board — every player the value feed covers, in rank
 * order, searchable and filterable.
 *
 * Layout follows the reference screenshot: a control row above a dense table,
 * rank first, an identity block carrying position/team/bye under the name, and
 * numeric columns to the right. The *look* follows docs/DESIGN.md — cream
 * ground, 2px ink borders, one hard offset shadow on the card rather than on
 * every row — per §9's note that reference images are layout inspiration and
 * must not be replicated closely enough to read as a clone.
 *
 * Deliberately absent, per §9's scope list: the pick queue, player comparison,
 * and favourites. Also no DRAFT button — submitting a pick is the draft engine,
 * and this board is read-only.
 *
 * Filtering is client-side. The pool is bounded by the value feed at ~1,000
 * ranked players, so a round trip per keystroke would cost more than it saves.
 */

/** The pills, in the order a manager scans them. */
const POSITION_FILTERS = ["QB", "RB", "WR", "TE", "K", "DEF"];

/** Injury values worth surfacing on the row, shortened to fit the density. */
const INJURY_LABELS: Record<string, string> = {
  Questionable: "QUES",
  Doubtful: "DOUB",
  Out: "OUT",
  IR: "IR",
  PUP: "PUP",
  Sus: "SUSP",
  COV: "COV",
  DNR: "DNR",
  NA: "NA",
};

function injuryLabel(status: string | null): string | null {
  if (!status) return null;
  return INJURY_LABELS[status] ?? status.slice(0, 4).toUpperCase();
}

function PlayerHeadshot({ player }: { player: RankedPlayer }) {
  return (
    <span
      className={`relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-ink ${positionColor(
        player.position
      )}`}
    >
      {/* Built from the id at render time (docs/SLEEPER.md#player-photos); the
          position-colored circle behind it is the fallback when the CDN has no
          headshot, which is common for depth-chart players. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={headshotUrl(player.player_id)}
        alt=""
        loading="lazy"
        className="h-full w-full object-cover object-top"
        onError={(event) => {
          event.currentTarget.style.visibility = "hidden";
        }}
      />
    </span>
  );
}

function PlayerRow({ player }: { player: RankedPlayer }) {
  const injury = injuryLabel(player.injury_status);

  return (
    <tr
      className={`border-t-2 border-ink/10 ${
        player.isDrafted ? "opacity-40" : "hover:bg-ink/[0.03]"
      }`}
    >
      <th
        scope="row"
        className="whitespace-nowrap py-1.5 pl-3 pr-2 text-left font-sans text-[12px] font-bold tabular-nums"
      >
        {player.rank ?? <span className="text-ink/30">—</span>}
      </th>

      <td className="py-1.5 pr-3">
        <div className="flex items-center gap-2">
          <PlayerHeadshot player={player} />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-[13px] font-semibold leading-tight">
                {player.displayName}
              </span>
              {player.isDrafted && (
                <span className="shrink-0 rounded-full border-2 border-ink bg-white px-1.5 py-px text-[9px] font-bold uppercase tracking-wide">
                  Drafted
                </span>
              )}
              {injury && (
                <span className="shrink-0 rounded-full bg-orange px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-white">
                  {injury}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-ink/50">
              <span
                className={`rounded-[4px] px-1 py-px text-[9px] ${positionColor(player.position)}`}
              >
                {player.position ?? "—"}
              </span>
              <span>{player.team ?? "FA"}</span>
              {player.bye_week !== null && <span>· Bye {player.bye_week}</span>}
            </div>
          </div>
        </div>
      </td>

      <td className="py-1.5 pr-3 text-right text-[12px] font-bold tabular-nums">
        {player.value ?? <span className="font-normal text-ink/30">—</span>}
      </td>
      <td className="py-1.5 pr-3 text-right text-[12px] tabular-nums">
        {player.projected_points ?? <span className="text-ink/30">—</span>}
      </td>
      <td className="py-1.5 pr-3 text-right text-[12px] tabular-nums text-ink/70">
        {player.bye_week ?? <span className="text-ink/30">—</span>}
      </td>
      <td className="py-1.5 pr-4 text-right text-[12px] tabular-nums text-ink/70">
        {player.age ?? <span className="text-ink/30">—</span>}
      </td>
    </tr>
  );
}

export function PlayerRankings({ players }: { players: RankedPlayer[] }) {
  const [search, setSearch] = useState("");
  const [positions, setPositions] = useState<string[]>([]);
  const [hideDrafted, setHideDrafted] = useState(false);

  // Counted over the whole pool, so the numbers on the pills stay put while
  // you type rather than collapsing toward zero.
  const counts = useMemo(() => positionCounts(players), [players]);
  const visible = useMemo(
    () => filterPlayers(players, { search, positions, hideDrafted }),
    [players, search, positions, hideDrafted]
  );

  const togglePosition = (position: string) =>
    setPositions((current) =>
      current.includes(position)
        ? current.filter((p) => p !== position)
        : [...current, position]
    );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {/* Pill-shaped field with a leading icon, per §9. */}
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink/40"
            strokeWidth={2.4}
            aria-hidden
          />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search player or team"
            aria-label="Search player or team"
            className="w-64 rounded-full border-2 border-ink bg-white py-1.5 pl-9 pr-3 text-[13px] outline-none placeholder:text-ink/40 focus:shadow-[3px_3px_0_var(--ink)]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by position">
          <button
            type="button"
            onClick={() => setPositions([])}
            aria-pressed={positions.length === 0}
            className={`rounded-full border-2 border-ink px-3 py-1 text-[10px] font-bold uppercase tracking-wide ${
              positions.length === 0 ? "bg-ink text-white" : "bg-white"
            }`}
          >
            All
          </button>
          {POSITION_FILTERS.map((position) => {
            const active = positions.includes(position);
            return (
              <button
                key={position}
                type="button"
                onClick={() => togglePosition(position)}
                aria-pressed={active}
                className={`rounded-full border-2 border-ink px-3 py-1 text-[10px] font-bold uppercase tracking-wide ${
                  active ? positionColor(position) : "bg-white"
                }`}
              >
                {position}
                <span className={active ? "opacity-80" : "text-ink/40"}> {counts[position] ?? 0}</span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => setHideDrafted((value) => !value)}
          aria-pressed={hideDrafted}
          className={`rounded-full border-2 border-ink px-3 py-1 text-[10px] font-bold uppercase tracking-wide ${
            hideDrafted ? "bg-green text-white" : "bg-white"
          }`}
        >
          Hide drafted
        </button>

        {(search || positions.length > 0 || hideDrafted) && (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setPositions([]);
              setHideDrafted(false);
            }}
            className="flex items-center gap-1 text-[11px] font-bold text-ink/50 underline"
          >
            <X className="h-3 w-3" strokeWidth={2.4} aria-hidden />
            Clear
          </button>
        )}

        <span className="ml-auto text-[11px] font-bold uppercase tracking-wide text-ink/50">
          {visible.length} of {players.length}
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl border-2 border-ink bg-white shadow-[5px_5px_0_var(--ink)]">
        <table className="w-full min-w-[42rem] border-collapse">
          <caption className="sr-only">Players in rank order</caption>
          <thead>
            <tr className="border-b-2 border-ink text-[10px] font-bold uppercase tracking-[0.12em] text-ink/50">
              <th scope="col" className="py-2 pl-3 pr-2 text-left">Rk</th>
              <th scope="col" className="py-2 pr-3 text-left">Player</th>
              <th scope="col" className="py-2 pr-3 text-right">Value</th>
              <th scope="col" className="py-2 pr-3 text-right">Proj</th>
              <th scope="col" className="py-2 pr-3 text-right">Bye</th>
              <th scope="col" className="py-2 pr-4 text-right">Age</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((player) => (
              <PlayerRow key={player.player_id} player={player} />
            ))}
          </tbody>
        </table>

        {visible.length === 0 && players.length > 0 && (
          <p className="px-4 py-10 text-center text-sm text-ink/60">
            No players match those filters.
          </p>
        )}
      </div>
    </div>
  );
}
