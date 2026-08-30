// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PositionTag, positionColor } from "@/components/ui/position-tag";

/**
 * docs/DESIGN.md §3 states these colors are fixed and semantic and closes
 * with "Never reassign." That is a rule a refactor can quietly break — the
 * chips still render, just in the wrong colors — so it is pinned here.
 *
 * Green is the load-bearing absence: it is reserved for the on-the-clock
 * state, precisely so an active pick can never be confused with a position.
 */

describe("positionColor", () => {
  it.each([
    ["QB", "bg-pink"],
    ["RB", "bg-blue"],
    ["WR", "bg-purple"],
    ["TE", "bg-gold"],
    ["DEF", "bg-teal"],
    ["K", "bg-orange"],
    ["FLEX", "bg-flex-gray"],
  ])("colors %s with %s", (position, expected) => {
    expect(positionColor(position)).toContain(expected);
  });

  it("outlines bench rather than filling it", () => {
    expect(positionColor("BN")).toContain("bg-white");
  });

  it("never assigns clock-green to a position", () => {
    const everyPosition = ["QB", "RB", "WR", "TE", "DEF", "DST", "K", "FLEX", "BN", "WHAT"];
    for (const position of everyPosition) {
      expect(positionColor(position)).not.toContain("bg-green");
    }
  });

  it("reads a lowercase position the same as an uppercase one", () => {
    expect(positionColor("rb")).toBe(positionColor("RB"));
  });

  it("falls back to neutral rather than borrowing another position's color", () => {
    expect(positionColor("ATHLETE")).toContain("bg-flex-gray");
    expect(positionColor(null)).toContain("bg-flex-gray");
  });
});

describe("PositionTag", () => {
  it("renders the position uppercased", () => {
    render(<PositionTag position="rb" />);
    expect(screen.getByText("RB")).toBeInTheDocument();
  });

  it("renders a placeholder when a player has no position", () => {
    render(<PositionTag position={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
