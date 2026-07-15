# CLAUDE.md — Household Bill Splitter

This file is read automatically at the start of every Claude Code session. Keep it lean — it's a router, not the full spec. Detailed decisions live in `docs/PROJECT_PLAN.md`; the step-by-step build order lives in `docs/ROADMAP.md`; what's already built lives in `docs/PROGRESS.md`.

## What this project is

A realtime, mobile-installable (PWA) app for a 3-4 person household to split grocery/restaurant bills. Someone uploads a photo of a receipt, AI parses it into line items, everyone on the household opens the bill on their own phone and marks which items they had (with a share count for shared items), and the app produces a final per-person total. No account needed beyond Google login. No running balance/ledger — each bill is self-contained; the final total gets logged to Splitwise manually or via the built-in integration.

## Tech stack

- **Frontend:** Next.js (App Router) + TypeScript + Tailwind CSS, deployed on Vercel
- **PWA:** manifest.json + service worker so it installs as a home-screen app on iOS/Android
- **Auth:** Firebase Authentication (Google Sign-In only)
- **Database:** Firestore (realtime listeners — this is what makes the multi-user live sync work with zero custom backend)
- **File storage:** Firebase Storage (receipt images)
- **Push notifications:** Firebase Cloud Messaging (FCM)
- **Receipt parsing:** Claude API (vision) called from a Next.js API route — sends the image, gets back structured JSON (items, prices, tax, tip, service charge, total)
- **Expense export:** Splitwise API (one-tap push of the final split into a Splitwise group)

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

## Roles & permissions (quick reference — full detail in PROJECT_PLAN.md)

- **Admin** (the 3 core household members): everything, including household management (add/remove members and guests, change roles).
- **Guest** (e.g. a temporary roommate): everything bill-related — upload, review/edit parsed items, select items/shares, view final grid, push to Splitwise. Cannot touch household management screens.

## Non-goals (explicitly out of scope — don't build these)

- No running balance / "who owes whom overall" ledger across bills. Each bill stands alone.
- No in-app payments. Splitwise (or manual) handles actual money movement.
- No native iOS/Android app — PWA only.
