# Testing

## When TDD applies

**TDD is mandatory for every change that touches `src/`:**

1. Write the tests that capture the desired behaviour and watch them **fail** (red).
2. Implement the minimum to make them pass.
3. Run the suite and typecheck, and confirm green.

**It does not apply to changes that touch only `docs/`, `agents/`, or `AGENTS.md`**, and it does
not apply to roles that produce no diff (`ORCHESTRATOR` routing, `CODE_REVIEW` reporting). Those
report `"tests": "n/a — documentation only"` or omit the verification block, and are still eligible
for `status: "complete"`. See [AGENT_PROTOCOL.md](AGENT_PROTOCOL.md) for the full bar by change
type.

This scoping is deliberate. The earlier phrasing bound "every change" and every role, which made
`complete` unreachable for four of the fourteen roles and turned `partial` into the normal outcome
— draining the signal from a status that is supposed to mean something.

## Running tests

```bash
npm test              # vitest, single run
npm run test:watch    # vitest, resident
npm run typecheck     # tsc --noEmit
```

## Setup

The runner is [Vitest](https://vitest.dev). Configuration is in `vitest.config.mts`;
`vitest.setup.ts` registers the `@testing-library/jest-dom` matchers. Tests sit beside the code they
cover as `src/**/*.test.ts` or `*.test.tsx`.

- **The default environment is `node`.** Most of `src/lib` is pure or server-side, and booting jsdom
  for it costs about twenty seconds a run against roughly half a second without. A component test
  opts in per file with `// @vitest-environment jsdom` as its first line.
- **The `@/` alias is declared twice** — in `tsconfig.json` and in `vitest.config.mts`. If you add a
  path alias, add it in both, or imports will resolve under `tsc` and fail under vitest.

## Writing tests

- **Watch the test fail before you make it pass.** A test written against already-passing code
  proves the assertion compiles, not that it holds. If you cannot get it to fail, say so in the
  handoff rather than reporting a red-green cycle that did not happen.
- **Do not weaken an assertion to reach green.** Report the disagreement instead.
- **A skipped or flaky test is a failure** until proven otherwise. Say so plainly.
- **Fixtures, never live services.** A test must not reach a real Supabase project or the Sleeper
  API. This applies to server actions, Supabase clients, and every Sleeper call path.
- **Unit coverage is not enough for a user-facing flow.** Exercise it end to end.
- **Never report a suite as green without the literal output.** "Tests pass" is not evidence.

## Existing coverage

Current tests are characterization tests, not TDD output — they were written against code that
already existed, to lock in behaviour that documents describe:

- `src/lib/media-constraints.test.ts` — the upload allow-list, and specifically the
  MIME-**or**-extension rule from [AUDIO.md](AUDIO.md). That rule is the part most likely to be
  "simplified" into MIME-only by someone reading the constraints list without the surrounding prose.

Not yet covered, and each needs a design decision before it can be: the draft engine and timer
(needs a clock-faking strategy), trades and RLS (needs a decision on whether policy tests run
against a live local Postgres), and Sleeper import (needs fixture capture).

## See Also

- [AGENT_PROTOCOL.md](AGENT_PROTOCOL.md) — The verification bar by change type
- [ENGINEERING.md](ENGINEERING.md) — Code conventions and domain invariants
- [DEVELOPMENT.md](DEVELOPMENT.md) — Local environment and seeding test data
- [CONTRIBUTING.md](CONTRIBUTING.md) — Branches, commits, pull requests
