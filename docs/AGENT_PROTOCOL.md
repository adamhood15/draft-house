# Agent Protocol

How the role system works, what a handoff must contain, and which document wins when two disagree.
The role table and the handoff shape itself live in [AGENTS.md](../AGENTS.md); this file is the
reasoning and the edge cases.

## The read-map contract

Each role file in `agents/` opens with a read map: task type → the exact documents and sections
that task needs. The binding rule is stated in each role file, because a role file has to be
sufficient on its own — an agent that only opened `agents/TRADES.md` must already know the rule
without following a link to find it.

The rule is:

> If you believe you need a document outside your read map, do not read it. Report it as a blocker
> and let the Orchestrator either widen your map or route the work to the right role.

It exists because an agent that silently widens its own scope makes a wrong boundary invisible. A
blocker report is a signal that a read map needs fixing; a silent read is the same wrong boundary
with no signal attached. "I only glanced at it" is the same violation as reading it in full.

A widened map is granted by the Orchestrator, scoped to the single task that prompted it, and
expires with that handoff.

### Exemption

`DOCS_STEWARD` is exempt. Its work — reconciling contradictions, repairing links across the whole
tree, checking that a document still matches the code — is inherently cross-cutting, and applying
the contract to it would produce a blocker report on every task instead of a finished one.

No other role is exempt, `ORCHESTRATOR` included: its read map names `AGENTS.md` and the role
files, which is genuinely all it needs to route work. If an Orchestrator finds itself wanting a
domain document, that is the signal it is about to do the work instead of routing it.

## Handoff semantics

The base shape is in [AGENTS.md](../AGENTS.md) and is identical for every role. Role files add
their own fields on top — `DRAFT_ENGINE` reports `server_authority`, `TRADES` reports
`client_write_surface`, and so on. Only the additions live in the role file.

### What `status` means

| Status | Means |
|---|---|
| `complete` | The work is done and the verification bar for this change type was met, with literal output. |
| `partial` | Some of the work landed. Say exactly what did not, and why. |
| `blocked` | Work stopped. The `blockers` array names what is needed and who can grant it. |

`partial` and `blocked` are correct outcomes, not failures. A false `complete` is a failure.

### The verification bar depends on the change type

- **Changes touching `src/`** — tests green and typecheck clean, with literal output. See
  [TESTING.md](TESTING.md).
- **Changes touching only `docs/`, `agents/`, or `AGENTS.md`** — no test bar. Report
  `"tests": "n/a — documentation only"` and verify with the link and anchor checks instead.
- **Roles that produce no diff** (`ORCHESTRATOR` routing, `CODE_REVIEW` reporting) — no test bar.
  These roles omit the `verification` block and report their own evidence fields instead
  (`evidence_checked` for review, `routed_to` and `map_widenings` for routing).

A role that cannot run a check does not thereby fail its handoff. It says which check was not
applicable and why. What is never acceptable is claiming a check passed without running it.

## Spec vs. Implementation

Some behaviour is described twice on purpose: once as intent, once as code. **Authority is keyed by
section, not by file** — one document can be authoritative in one section and deferential in
another, because parts of this project have shipped and parts have not.

| Behaviour | Spec | Implementation | Authoritative |
|---|---|---|---|
| Pick announcement sequence, notification preferences | [NOTIFICATIONS.md](NOTIFICATIONS.md) | [COMPONENTS.md](COMPONENTS.md) | Spec |
| Trade announcements and lifecycle | [TRADES.md](TRADES.md) | [COMPONENTS.md](COMPONENTS.md) | Spec |
| Draft chime | [AUDIO.md](AUDIO.md) — *Draft Chime* | `src/lib/audio.ts` *(does not exist yet)* | **Spec** |
| Walk-up song upload | [AUDIO.md](AUDIO.md) — *Upload Technical Details* | `src/lib/storage.ts` | **Implementation** |
| RLS policies | [SECURITY.md](SECURITY.md) | `supabase/migrations/*_rls_policies.sql` | Implementation |
| Schema | [DATABASE.md](DATABASE.md) | `supabase/migrations/` | Implementation |

Note the two `AUDIO.md` rows pointing in opposite directions. That is deliberate and it is the
easiest row in this table to misread:

- **Draft Chime — spec wins.** The chime is not built. `src/lib/audio.ts` does not exist. The
  document describes intent, and code written later must conform to it.
- **Upload — implementation wins.** The upload path has shipped in `src/lib/storage.ts`. The
  document tracks the code, and if they drift, the code is what users experience.

Do not resolve an `AUDIO.md` question by looking up the filename. Look up the section. Each of
those two sections carries a banner stating its own direction.

The general rule behind the table: **once behaviour ships, the code becomes authoritative for that
behaviour.** Unbuilt behaviour is governed by its spec. `DOCS_STEWARD` moves a row from Spec to
Implementation when the feature lands.

## When you find a contradiction

Do not resolve it by keeping whichever version you read first. Establish which is correct from the
code, the migrations, or the person who asked. Some documents describe intended state for features
that do not exist yet, and the code is not always the authority.

If you cannot establish which side is right, **report it — do not decide**. A wrong resolution
written confidently is worse than an open question.

## See Also

- [AGENTS.md](../AGENTS.md) — Role table, handoff shape, startup sequence
- [ENGINEERING.md](ENGINEERING.md) — Code conventions and domain invariants
- [TESTING.md](TESTING.md) — The test bar for code changes
- [CONTRIBUTING.md](CONTRIBUTING.md) — Branches, commits, pull requests
