# Engineering Conventions

Rules that bind code in this repository, and the two domain invariants that cross every role.

## Domain invariants

These are properties of the system, not preferences. Breaking one is a bug regardless of how the
code reads.

### Server authority

Draft operations — the clock, pick acceptance, undo — are decided server-side. The client may
request; it may never decide. No component may treat a local optimistic update as authoritative for
a pick, a trade, or the clock.

Every draft-mechanics table is written with the service-role client only. `trade_offers` and
`trade_offer_items` are the single documented exception, which is why their RLS policies are
load-bearing rather than defence-in-depth. See [SECURITY.md](SECURITY.md).

### Sleeper initializes; it does not govern

Sleeper data seeds Draft House at import. After that, Draft House owns its own state. Never add a
code path that re-reads Sleeper to "correct" local data. See [SLEEPER.md](SLEEPER.md).

## Code conventions

- **D.R.Y.** One fact has one home — in code, in docs, in configuration. When two places describe
  the same behaviour, one is authoritative and the other refers to it. Two live copies is how two
  agents come to build two different behaviours.
- **Explicit naming.** Variables and functions are named for what they contain or do, not
  abstractly. `replaceTeamFile` over `handleFile`; `validationError` over `result`.
- **Import, do not re-implement.** If another module owns a helper, import it. The draft chime is
  the standing example: it was once defined twice, at two different volumes, one of them ignoring
  the mute setting.
- **Untrusted input stays untrusted.** Anything from a browser or an external API is validated
  server-side before it reaches the schema. Client-side validation exists for feedback only, and
  the authoritative check must already exist before you rely on it.
- **This project's Next.js is not the one you know.** Read the relevant guide under
  `node_modules/next/dist/docs/` before writing framework code. Version-specific APIs and file
  conventions differ from training data.

## Working conventions

- **Stay in scope.** Work the request, not the surrounding area. Out-of-scope findings are reported
  in the handoff `notes`, not fixed silently. A change touching files outside your role's ownership
  is a review finding even when the code is good.
- **Verify before claiming done.** Never report something as working without running it. "Done"
  means the checks for your change type passed *and you ran them*, with literal output. For a
  user-facing flow, that includes exercising it end to end — two browser windows side by side for
  anything real-time.
- **A skipped step is reported, not omitted.** If a check did not run, say which and why. See
  [AGENT_PROTOCOL.md](AGENT_PROTOCOL.md) for how the bar varies by change type.

## See Also

- [AGENT_PROTOCOL.md](AGENT_PROTOCOL.md) — Read maps, handoffs, spec-vs-implementation authority
- [TESTING.md](TESTING.md) — TDD and the test bar
- [ARCHITECTURE.md](ARCHITECTURE.md) — Tech stack and application structure
- [SECURITY.md](SECURITY.md) — RLS and the service-role boundary
- [CONTRIBUTING.md](CONTRIBUTING.md) — Branches, commits, pull requests
