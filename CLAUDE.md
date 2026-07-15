# CLAUDE.md — Household Bill Splitter

This file is read automatically at the start of every Claude Code session. Keep it lean — it's a router, not the full spec. Detailed decisions live in `docs/PROJECT_PLAN.md`; the step-by-step build order lives in `docs/ROADMAP.md`; what's already built lives in `docs/PROGRESS.md`.

## What this project is

A realtime, mobile-installable (PWA) app for a 3-4 person household to split grocery/restaurant bills. Someone uploads a photo of a receipt, AI parses it into line items, everyone on the household opens the bill on their own phone and marks which items they had (with a share count for shared items), and the app produces a final per-person total. No account needed beyond Google login. No running balance/ledger — each bill is self-contained; the final total gets logged to Splitwise manually or via the built-in integration.

## Tech stack

- **Frontend:** Next.js (App Router) + TypeScript + Tailwind CSS, deployed on Vercel
- **PWA:** `@serwist/next` (actively maintained Workbox wrapper) — auto-generates precache manifest with content-hashed URLs on every `next build`; no manual cache-busting needed
- **Auth:** Firebase Authentication (Google Sign-In only)
- **Database:** Firestore (realtime listeners + offline persistence via `persistentLocalCache`) — realtime sync AND works on flaky mobile connections
- **File storage:** None. Receipt images are never persisted — uploaded straight from the browser to the parsing API route, sent to Gemini, then discarded. Avoids requiring the paid Firebase Blaze plan (Storage requires it as of Oct 2024) and there's no product need to keep the photo after it's parsed.
- **Push notifications:** Firebase Cloud Messaging (FCM) — confirmed working for all household members (all on iOS 17/18, well above the iOS 16.4 PWA push requirement)
- **Receipt parsing:** Google Gemini API (vision, free tier — Gemini Flash) called from a Next.js API route — image is sent directly in the request (not stored first), gets back structured JSON (items, prices, tax, tip, service charge, total). Chosen specifically to keep running cost at $0: the free tier's daily request quota comfortably covers a 3-4 person household's bill volume, with no card on file and no per-call billing. Accepted risk: Google could tighten/remove the free tier later, or the quota could be hit under unusually heavy use — revisit if that happens.
- **Expense export:** Splitwise API (one-tap push of the final split into a Splitwise group)
- **UI components:** shadcn/ui (Radix primitives + Tailwind, code copied into the repo) — see `docs/PROJECT_PLAN.md` §12 for the full design system decision (visual identity, navigation shell). Screens built before Phase 3 (login, onboarding, household, bill upload) were plain ad hoc Tailwind and get restyled against this in Phase 3; everything from Phase 4 onward is built against it from the start.
- **Commit hooks:** Husky + lint-staged — runs `next lint` + `tsc --noEmit` on staged `.ts`/`.tsx` files; activated automatically on `npm install` via the `prepare` script

## How to work in this repo (for Claude Code, every session)

1. Read `docs/PROGRESS.md` first — this tells you exactly what's already built and any deviations from the original plan.
2. Read `docs/ROADMAP.md` and find the **first unchecked step**. That is the only thing you should build this session. Do not jump ahead to later phases even if it seems efficient — steps are sized intentionally small so each fits in one focused session.
3. Only consult `docs/PROJECT_PLAN.md` for the specific section relevant to the step you're building (e.g. if the step is about the data model, read only that section) — don't re-read the whole file every session, it's for reference, not required context.
4. Build only that one step. Don't scaffold future phases "while you're at it."
5. When the step is done and working:
   - Check off the step in `docs/ROADMAP.md`
   - Append a short entry to `docs/PROGRESS.md` (see template at the top of that file) — what was built, files touched, any decisions/deviations made, anything the next session needs to know
6. Stop there. The user will open a new chat for the next step to keep context windows small and cheap.

## Token efficiency conventions

- Don't re-read the entire codebase at the start of a session — use targeted file reads/greps based on what the current step needs.
- Don't restate the full plan back to the user before building — just confirm the step and build it.
- Keep `PROGRESS.md` entries terse (bullet points, not prose paragraphs).
- Prefer small, focused diffs over large rewrites.

## Roles & permissions (quick reference — full detail in PROJECT_PLAN.md §3)

Three-tier hierarchy — **Creator > Admin > Guest**. The creator is the one who originally created the household (`households/{id}.createdBy`), a permanent super-admin; it's not a separate `role` value (a creator's `Member.role` is still `"admin"`). This tier pattern is meant to be reused for other sensitive/critical actions in later phases, not just member management.

- **Creator**: everything an Admin can do, plus can demote/remove other admins, plus can delete the entire household (wipes all members/bills/data, requires typing the household name to confirm). Cannot themselves ever be demoted or removed except as the last step of that full household deletion (enforced in Firestore rules, not just UI) — there's no ownership-transfer feature.
- **Admin**: everything bill-related, plus can promote a guest to admin and remove a guest. Cannot demote or remove another admin (including the creator) — that's creator-only.
- **Guest** (e.g. a temporary roommate): everything bill-related — upload, review/edit parsed items, select items/shares, view final grid, push to Splitwise. Cannot touch household management screens at all.

## Git discipline

- Never run `git commit` or `git push` (or any other action that alters git history/remote state) unless the user explicitly asks for it in that moment. The user commits and pushes themselves. Staging/inspecting (`git status`, `git diff`, `git add` to prep for the user) is fine.

## Environment notes

- Never touch/delete `.idea/` or `splitly.iml` in the repo root — they're IntelliJ project files the user actively uses, and removing/editing them crashes IntelliJ. Leave them alone even though they're unrelated to the Next.js app.

## Non-goals (explicitly out of scope — don't build these)

- No running balance / "who owes whom overall" ledger across bills. Each bill stands alone.
- No in-app payments. Splitwise (or manual) handles actual money movement.
- No native iOS/Android app — PWA only.
