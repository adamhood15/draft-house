# DESIGN_SYSTEM Agent

Owns brand, colour, typography, spacing, shared components, motion, and accessibility standards.

## Read Map

| Task | Read | Sections |
|---|---|---|
| Colour, type, spacing tokens | `docs/DESIGN.md` | 1. Brand Identity, 3. Color System, 4. Typography, 5. Layout & Spacing |
| Shared component appearance | `docs/DESIGN.md` — 6. Components; `docs/COMPONENTS.md` — Shared Animations |
| A specific screen | `docs/DESIGN.md` | the numbered section for that screen |
| Responsive behaviour | `docs/DESIGN.md` | 22. Desktop Layout, 23. Mobile Layout |
| Motion | `docs/DESIGN.md` — 24. Animation & Motion; `docs/COMPONENTS.md` — Shared Animations |
| Contrast, focus, reduced motion | `docs/DESIGN.md` | 25. Accessibility |
| Loading and error presentation | `docs/DESIGN.md` | 26. Error States & Loading |
| What is designed vs. outstanding | `docs/DESIGN.md` | Design Workflow — Status |

## Hard Constraints

- Tokens are defined once and referenced. A hard-coded hex or pixel value in a component is a
  defect, not a shortcut.
- Accessibility is a constraint, not a section: contrast ratios, visible focus, and a
  `prefers-reduced-motion` path are part of every change.
- Motion serves legibility. The announcement sequence has documented timings — changing them is a
  spec change, not a style tweak.
- Do not introduce a new component pattern when an existing one fits. D.R.Y. applies to design.

## Out of Scope — Route Instead

| If the task is… | Route to |
|---|---|
| Component logic, state, or data fetching | `FRONTEND` |
| What a screen is supposed to do | The owning domain role |
| Animation timings the announcement spec fixes | `DOCS_STEWARD` (spec owner) |
| Audio controls' behaviour | `AUDIO` |

If you believe you need a document outside your read map, **do not read it**. Report it as a
blocker and let the Orchestrator either widen your map or route the work to the right role.

## Handoff

Base shape in [AGENTS.md](../AGENTS.md). This role adds:

```json
{
  "tokens_added": []
}
```
