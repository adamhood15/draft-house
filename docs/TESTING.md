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
- **`server-only` is aliased in `vitest.config.mts`, and must stay aliased.** Without it no module
  under `src/lib` can be imported by a test at all: `import "server-only"` throws outside a React
  Server Component. Next substitutes an empty module through the `react-server` export condition,
  and vitest has no such condition. This one silently capped the project's entire coverage — the
  tests were not missing because nobody had written them, they were missing because they could not
  run.

## Writing tests

- **Watch the test fail before you make it pass.** A test written against already-passing code
  proves the assertion compiles, not that it holds. If you cannot get it to fail, say so in the
  handoff rather than reporting a red-green cycle that did not happen. This applies with most force
  to a harness change: fake timers, mocked clocks, and short-circuited control flow all fail
  **open**, so a test that has quietly stopped asserting anything keeps passing. Whenever a harness
  pattern makes a test faster or simpler, flip the assertion to a wrong value and confirm it fails
  *for the stated reason* before trusting it.
- **Do not weaken an assertion to reach green.** Report the disagreement instead.
- **A skipped or flaky test is a failure** until proven otherwise. Say so plainly.
- **Fixtures, never live services.** A test must not reach a real Supabase project or the Sleeper
  API. This applies to server actions, Supabase clients, and every Sleeper call path.
- **Unit coverage is not enough for a user-facing flow.** Exercise it end to end.
- **Never report a suite as green without the literal output.** "Tests pass" is not evidence.

## Harness notes

Behaviour of this harness that the source does not reveal, and that each cost real time to
rediscover. None of it is inferable from reading the module under test.

- **`redirect()` throws; it does not return.** Every server action in `src/lib/leagues` has success
  paths that throw and failure paths that return, so the naive test shape fails on the *success*
  case. A bare `.rejects.toThrow()` then passes for the wrong reason — it cannot tell a redirect
  from a crash. Assert on the redirect digest so a genuine error still fails the test, and match it
  by prefix rather than pinning its exact shape or a line number inside `next/dist`: this project's
  Next.js differs from training data and is expected to move under you.
- **Fake timers need `runAllTimersAsync`, not `runAllTimers`.** Anything behind `sleeperFetch`'s
  `2 ** attempt * 250` backoff sleeps for real — three attempts is 1.5s of wall clock, and an
  assertion that only holds on an idle machine. Use `vi.useFakeTimers()`, start awaiting the
  assertion *before* advancing the clock, and drive it with `await vi.runAllTimersAsync()`. The
  synchronous form leaves the awaited `wait()` un-drained, so the test hangs rather than failing
  usefully. Restore with `vi.useRealTimers()` in a `finally` — a leaked fake clock follows every
  later test in the file.
- **Module-load-time constants need `vi.resetModules()` first.** A `const` initialised from
  `process.env` at module load — `BASE_URL` and `TIMEOUT_MS` in `src/lib/sleeper/client.ts` — is
  frozen the moment the module is first imported, which for a test file is its own top-level
  import. `vi.stubEnv` afterwards has no effect, and neither does re-importing on its own. The order
  is `vi.resetModules()`, then `vi.stubEnv(...)`, then `await import(...)`. Beware a
  `resetModules()` sitting in a shared `afterEach`: it makes the pattern appear to work without the
  inline reset, so the requirement looks optional right up until someone writes a test in a file
  that has no such hook.

## Existing coverage

The suite is the authority on what is covered; an inventory in prose goes stale the week it is
written. What follows is only the part that reading the test files will not tell you.

Covered:

- **Sleeper import**, against captured fixtures in `src/lib/sleeper/__fixtures__/payloads.ts`. The
  fixtures exist so that no test reaches the live API — see *Fixtures, never live services* above.
- **`src/lib/media-constraints.test.ts`** — the upload allow-list, and specifically the
  MIME-**or**-extension rule from [AUDIO.md](AUDIO.md). That rule is the part most likely to be
  "simplified" into MIME-only by someone reading the constraints list without the surrounding prose.

Still open, and each needs a decision before it can be closed:

- **The draft engine and the timer** need a clock-faking strategy.
- **RLS policy tests have no agreed target.** Running one needs a database to assert against, and
  the project has not settled what that is.
  [DEVELOPMENT.md](DEVELOPMENT.md#why-not-supabase-emulator) rules out the Supabase emulator, but
  that decision does not answer the question — and [DEVELOPMENT.md](DEVELOPMENT.md) currently says
  three different things about whether a local Postgres is part of the setup at all. Whether these
  run against a scratch cloud project, a local Postgres, or not at all, is undecided — raise it
  rather than assuming an answer.
- **Migration-only changes have no stated bar.** [AGENT_PROTOCOL.md](AGENT_PROTOCOL.md) classifies a
  change as touching `src/` or as touching documentation; one that only adds a file under
  `supabase/migrations/` is neither, so no verification bar currently applies. That is a gap in the
  protocol for its owner to close, not a licence to ship a migration unverified.

## See Also

- [AGENT_PROTOCOL.md](AGENT_PROTOCOL.md) — The verification bar by change type
- [ENGINEERING.md](ENGINEERING.md) — Code conventions and domain invariants
- [DEVELOPMENT.md](DEVELOPMENT.md) — Local environment and seeding test data
- [CONTRIBUTING.md](CONTRIBUTING.md) — Branches, commits, pull requests
