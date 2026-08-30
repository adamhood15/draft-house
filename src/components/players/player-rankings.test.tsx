// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PlayerRankings } from "@/components/players/player-rankings";
import { rankPlayers, type PlayerRow } from "@/lib/players/rankings";

/**
 * The interactive half of the board. rankings.test.ts covers the ordering
 * rules; these cover that the controls actually drive them, and that the two
 * states a manager can misread — an unranked player and a drafted one — look
 * distinct rather than silently ordinary.
 */

function row(overrides: Partial<PlayerRow> = {}): PlayerRow {
  return {
    player_id: "p1",
    full_name: "Player One",
    first_name: null,
    last_name: null,
    position: "RB",
    team: "ATL",
    age: 24,
    injury_status: null,
    value: 100,
    projected_points: 200,
    bye_week: 10,
    drafted_by_team_id: null,
    drafted_at_pick_no: null,
    ...overrides,
  };
}

const PLAYERS = rankPlayers([
  row({ player_id: "1", full_name: "Ja'Marr Chase", position: "WR", team: "CIN", value: 9000 }),
  row({ player_id: "2", full_name: "Bijan Robinson", position: "RB", team: "ATL", value: 8000 }),
  row({ player_id: "3", full_name: "Josh Allen", position: "QB", team: "BUF", value: 7000 }),
  row({
    player_id: "4",
    full_name: "Travis Kelce",
    position: "TE",
    team: "KC",
    value: 6000,
    drafted_by_team_id: "team-1",
    drafted_at_pick_no: 3,
  }),
  row({ player_id: "5", full_name: "Fred Warner", position: "LB", team: "SF", value: null }),
]);

/** Player names in the order they appear in the table body. */
function renderedNames() {
  const rows = screen.getAllByRole("row").slice(1); // drop the header row
  return rows.map((tr) => within(tr).getAllByRole("cell")[0].textContent ?? "");
}

describe("PlayerRankings table", () => {
  it("lists players in rank order", () => {
    render(<PlayerRankings players={PLAYERS} />);
    const names = renderedNames();
    expect(names[0]).toContain("Ja'Marr Chase");
    expect(names[1]).toContain("Bijan Robinson");
    expect(names[2]).toContain("Josh Allen");
  });

  it("numbers the ranked players from one", () => {
    render(<PlayerRankings players={PLAYERS} />);
    const rows = screen.getAllByRole("row").slice(1);
    // The rank is a row header, not a cell — a screen reader should announce
    // it with the row (§25).
    expect(within(rows[0]).getByRole("rowheader")).toHaveTextContent("1");
    expect(within(rows[1]).getByRole("rowheader")).toHaveTextContent("2");
  });

  it("shows an em dash for a player the value feed does not cover", () => {
    // The IDP case. Rendering 0, or a rank, would present "we have no data" as
    // "this player is worthless" — and this league is IDP, so it is most of
    // the pool.
    render(<PlayerRankings players={PLAYERS} />);
    const rows = screen.getAllByRole("row").slice(1);
    const warner = rows.find((tr) => within(tr).queryByText(/Fred Warner/))!;

    expect(within(warner).getByRole("rowheader")).toHaveTextContent("—");
    expect(warner).toBe(rows[rows.length - 1]);
  });

  it("marks a drafted player rather than hiding them by default", () => {
    render(<PlayerRankings players={PLAYERS} />);
    const rows = screen.getAllByRole("row").slice(1);
    const kelce = rows.find((tr) => within(tr).queryByText(/Travis Kelce/))!;

    expect(within(kelce).getByText("Drafted")).toBeInTheDocument();
  });

  it("reports how many players are showing", () => {
    render(<PlayerRankings players={PLAYERS} />);
    expect(screen.getByText("5 of 5")).toBeInTheDocument();
  });
});

describe("PlayerRankings filters", () => {
  it("narrows by search, ignoring punctuation", async () => {
    render(<PlayerRankings players={PLAYERS} />);
    await userEvent.type(screen.getByLabelText("Search player or team"), "jamarr");

    expect(renderedNames()).toHaveLength(1);
    expect(renderedNames()[0]).toContain("Ja'Marr Chase");
  });

  it("searches by team as well as name", async () => {
    render(<PlayerRankings players={PLAYERS} />);
    await userEvent.type(screen.getByLabelText("Search player or team"), "BUF");

    expect(renderedNames()[0]).toContain("Josh Allen");
  });

  it("filters to a position when its pill is pressed", async () => {
    render(<PlayerRankings players={PLAYERS} />);
    await userEvent.click(screen.getByRole("button", { name: /^WR/ }));

    expect(renderedNames()).toHaveLength(1);
    expect(renderedNames()[0]).toContain("Ja'Marr Chase");
  });

  it("combines two position pills rather than replacing the first", async () => {
    render(<PlayerRankings players={PLAYERS} />);
    await userEvent.click(screen.getByRole("button", { name: /^WR/ }));
    await userEvent.click(screen.getByRole("button", { name: /^QB/ }));

    expect(renderedNames()).toHaveLength(2);
  });

  it("keeps the pill counts fixed while a search narrows the table", async () => {
    // The counts describe the pool, not the current view. If they tracked the
    // filtered list they would collapse toward zero as you type, which reads
    // as "there are no receivers" rather than "you have typed a name".
    render(<PlayerRankings players={PLAYERS} />);
    const wrPill = screen.getByRole("button", { name: /^WR/ });
    expect(wrPill).toHaveTextContent("1");

    await userEvent.type(screen.getByLabelText("Search player or team"), "josh");
    expect(wrPill).toHaveTextContent("1");
  });

  it("hides drafted players on request", async () => {
    render(<PlayerRankings players={PLAYERS} />);
    expect(screen.getByText(/Travis Kelce/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /hide drafted/i }));
    expect(screen.queryByText(/Travis Kelce/)).not.toBeInTheDocument();
  });

  it("clears every filter at once", async () => {
    render(<PlayerRankings players={PLAYERS} />);
    await userEvent.type(screen.getByLabelText("Search player or team"), "josh");
    await userEvent.click(screen.getByRole("button", { name: /hide drafted/i }));
    expect(renderedNames()).toHaveLength(1);

    await userEvent.click(screen.getByRole("button", { name: /clear/i }));
    expect(renderedNames()).toHaveLength(5);
  });

  it("says so when filters match nothing, rather than showing a bare table", async () => {
    render(<PlayerRankings players={PLAYERS} />);
    await userEvent.type(screen.getByLabelText("Search player or team"), "zzzz");

    expect(screen.getByText("No players match those filters.")).toBeInTheDocument();
    expect(screen.getByText("0 of 5")).toBeInTheDocument();
  });
});
