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

**Pre-0.1 note (2026-07-14):** Added a "Git discipline" rule to `CLAUDE.md`: never run `git commit`/`git push` unless explicitly asked in the moment. **Correction:** an earlier version of this note said IntelliJ files (`splitly.iml`, `.idea/`) were removed — that was wrong/reverted. The user actively uses IntelliJ alongside this repo; those files must never be touched (crashes IntelliJ). See `CLAUDE.md` → "Environment notes".

## 0.2 (partial) — Firebase project setup  (2026-07-14)
- Built: Firebase console setup (Auth w/ Google provider, Firestore, web app registration). Decided **not** to use Firebase Storage — receipt images are never persisted (see decision below) — so no Storage/Blaze plan needed.
- Files: `.env.local` (gitignored, real Firebase config), `.env.example` (committed, placeholders).
- Deviations/decisions: Dropped Firebase Storage from the whole project entirely. Receipt images will be sent directly from the browser to the Claude parsing API route (Phase 2.2) and discarded — never written to any storage. This avoids the paid Blaze plan (Storage requires it as of Oct 2024) and matches the user's explicit **$0 running cost** goal. Updated `CLAUDE.md`, `docs/PROJECT_PLAN.md` (data model + Vercel timeout section), and `docs/ROADMAP.md` (steps 2.1/2.2) accordingly. Also flagged that Vercel Hobby's 10s function timeout (vs Pro's 60s) may constrain how the Claude parsing route is built in 2.2 — plan to fit within Hobby's limit rather than assume Pro.
- Next session should know: `lib/firebase.ts` (client init with `persistentLocalCache`) has NOT been created yet — that's the remaining part of 0.2, now unblocked since 0.1 (below) is done.

## 0.1 — Next.js + TypeScript + Tailwind scaffold  (2026-07-14)
- Built: Scaffolded via `create-next-app` (App Router, TypeScript, Tailwind, ESLint, `src/` dir) into a temp dir then merged into the repo root to avoid clobbering existing files (`.env.local`, `CLAUDE.md`, `docs/`, `.idea/`). Added `src/components/`, `src/lib/`, `src/types/` per the planned folder structure. Set up Husky + lint-staged (`prepare` script auto-activates hooks on `npm install`; pre-commit runs `eslint --fix` + `tsc --noEmit` on staged `.ts`/`.tsx`). Verified `npm run dev` serves 200 on localhost:3000, and verified the pre-commit hook actually fires (tested with a real commit, then reverted it — should not have committed without asking, corrected immediately).
- Files: `package.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `postcss.config.mjs`, `src/app/*`, `.husky/pre-commit`, `.gitignore` (merged/rewritten — see deviation below).
- Deviations/decisions: **`next lint` does not exist in Next 16** (this project's version) — the generated `package.json` uses plain `eslint` with a flat `eslint.config.mjs` (via `eslint-config-next`). Adjusted lint-staged and the pre-commit hook to call `eslint --fix` instead of `next lint --fix`, functionally equivalent. Also: `create-next-app` refused to scaffold directly into the repo root (non-empty dir) and its own generated `.gitignore` would have blanket-ignored `.env*` (which would've hidden `.env.example` from git, undesired) — rewrote `.gitignore` by hand to merge Next.js ignores with the existing IntelliJ/Eclipse/etc. ignores and keep `.env*.local`/`.env` ignored but `.env.example` tracked.
- Next session should know: Nothing is committed yet — all scaffold files are sitting as unstaged/untracked changes for the user to review and commit themselves. Node modules were installed locally (`npm install`) but are gitignored as usual. A moderate `npm audit` advisory exists in Next's bundled PostCSS (transitive); fixing it would downgrade Next significantly, so left as-is.
