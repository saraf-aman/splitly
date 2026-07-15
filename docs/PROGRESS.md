# Progress Log

Append one entry per completed step, most recent at the bottom. Keep entries short — bullet points, not paragraphs. This file (plus ROADMAP.md) is what a fresh chat session needs to pick up exactly where the last one left off, so it's worth being precise about deviations/decisions even if terse.

Entry template:

```
## [Step number] — [short title]  (YYYY-MM-DD)
- Built: <one or two lines on what was implemented>
- Files: <key files added/changed>
- Deviations/decisions: <anything that differs from PROJECT_PLAN.md or ROADMAP.md, or a judgment call made while building>
- Next session should know: <anything not obvious from the code itself>
```

---

*(No steps completed yet — Phase 0 build not started.)*

**Pre-0.1 note (2026-07-14):** Removed stray IntelliJ Java template files (`src/Main.java`, `splitly.iml`, `.idea/`) that were left over from repo creation — unrelated to the Next.js app, not yet committed. Added a "Git discipline" rule to `CLAUDE.md`: never run `git commit`/`git push` unless explicitly asked in the moment. Next session should start fresh on step **0.1** (Next.js + TypeScript + Tailwind scaffold, folder structure, Husky/lint-staged) — nothing from 0.1 has been built yet.
