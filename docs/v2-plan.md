# H.O.M.E.R. v2: plan

Status: In progress (released as v2.0.0 with steps 1 to 4, then MCP built; voice and two languages are next; receipts and assistant speed dropped on 2026-11-25) · Owner: Igor Bondarenko · Last updated: 2026-11-25 · Source: v1.0.0 release, PRD §3 and §9, and the owner's own earlier project `~/PetProjects/Assistant` (same household, different stack), which has working versions of several of these ideas.

v1 is pull-only: HOMER shows what is due when someone opens it. v2 makes it push, keeps its data safe, and widens what it can read and hear, without breaking the rule that household data stays in the house.

Each step below is its own DEFINE, PLAN and PRs (see `CLAUDE.md`).

## 1. Decisions (owner, 2026-11-05)

1. **Assistant speed:** dropped (2026-11-25). The owner uses HOMER as an MCP server for their own agent (`docs/mcp.md`), so the in-app assistant's speed and accuracy are no longer worked on.
2. **Backups:** an automatic backup once a day, run from code or cron. First.
3. **Notifications:** ntfy to start, and small notifications are fine. There must be a notification at the end of the day. A more robust channel can replace ntfy later, so the sender sits behind a small interface.
4. **Routines:** a separate screen under a specific person, which that person sets up as they want.
5. **Receipts:** dropped (2026-11-25). The owner handles receipts in another project (`~/PetProjects/Assistant`); its agent marks items bought in HOMER over MCP.
6. **Voice:** start with the dictation check. The assistant has to understand Russian, English and a mix of both in one sentence (theme F).
7. **Order:** backups, then routines for the people in the household, then the rest as suggested in section 3.

## 2. The themes

### A. Jobs and notifications

- A scheduler in the api (`node-cron` is already a dependency). First job after backups: a daily check that puts items that have *become* low onto the grocery list. Today a low item is only added when something is written to it or the api restarts, so one that drifts below its threshold with time can wait.
- Notifications to phones through **ntfy**, including an end-of-day one. `Assistant/src/lib/server/notify.ts` is a small, tested sender that can be copied nearly as it is. It only sends, never listens, so knowing the topic lets someone read notifications, not act. Text says only what a lock screen may show, which fits "small notifications are fine".
- A morning summary (the PRD's 06:00 job), due reminders and the end-of-day notification ride on the same sender.
- **To confirm when this step starts:** the public ntfy.sh relay sees the notification text, and the PRD (§5) says there are no outbound calls except to Ollama. Choose between running ntfy in the compose file on the tailnet (nothing leaves the house, though as I understand it an iPhone still needs a content-free wake-up ping through ntfy.sh for instant delivery, which needs checking) and the public relay with deliberately small text. Either one means amending the PRD rule. Nothing here changes the PRD's scope until the owner approves it.

### B. Maintenance schedules and routines

- **Routines (built, see `docs/design-routines.md`):** a daily checklist that lives under one person, on People, then Routine. They set up the rows, each with a target per day, and tap cells in a Monday-to-Sunday grid. There are no accounts, so everyone in the household can see and change it, and the screen says so. A missed day is an empty cell. It does not use up stock yet.
- A later link from a routine row to an item would use up stock on a tick, and would also give the learned-usage estimate (slice 7) real consumption to learn from, instead of only restock gaps.
- **Maintenance:** things that come round on a longer cycle: furnace filter every 3 months, softener salt, cleaning. Designed in `docs/design-maintenance.md`: a separate list whose cycle counts from the day it was last done (a filter is changed on a day, not on a fixed calendar slot), so it does not use the tasks repeat or `nextDueDate`. It has its own page, a "due soon" card on Home, and a note through theme A.

### C. Receipts

Dropped on 2026-11-25. Receipts are read in the owner's other project, and its agent updates HOMER through MCP (`docs/mcp.md`). Nothing here is planned.

### D. Voice

Three levels, in order of effort:

1. **Dictation today:** phone and tablet keyboards already have a microphone key that types into the chat box. Check it on the kitchen tablet, in both languages. This costs nothing and is where this theme starts.
2. **Push to talk:** a button in the chat records audio in the browser (needs HTTPS, which Tailscale gives), sends it to the api, and a **local** speech model on the Mac turns it into text, which goes into the same assistant flow. Do not use the browser's own speech recognition: it sends audio to Google or Apple. The model has to cope with Russian, English and a mix of both in one sentence.
3. Hands-free wake word. Later, probably never.

Level 2 needs a speech-to-text install on the Mac next to Ollama (Docker has no GPU there). Which one to use needs a short bake-off in both languages.

### E. Carry-overs

- **MCP (built):** HOMER's tools for the owner's local agent, `docs/mcp.md`.
- **Assistant speed and accuracy:** dropped on 2026-11-25 (see decision 1).
- CI and lint.

### F. Two languages (Russian and English)

The assistant must handle Russian, English and mixed-language sentences. Things in the code that assume English today:

- The assistant's replies for changes are written by code in English (`apps/api/src/messages.ts`), and the app's text is English (`apps/web/src/copy.ts`).
- Day words ("today", "tomorrow", weekday names) and time words are resolved by code in English (`packages/shared/src/dateWords.ts`, `timeWords.ts`), and the guard that stops deleting looks for the English word "delete".
- Name matching treats plurals the English way. Names written in Cyrillic are letters like any other, but Russian word endings are not handled.

The first step is a measurement: a golden set of Russian and mixed-language prompts, run against the current model. Then decide what to translate or resolve in code: the assistant replying in the language it was spoken to, the day and time words, and whether the app's own screens need translating (a separate decision).

## 3. Order

1. **Backups** (built): a daily copy at 06:00 from the api into a folder on the Mac, checked after writing, 14 daily plus 6 weekly kept, caught up at boot if the Mac slept, restore steps in the README (tried on a scratch stack). 
2. **Routines** (built), on a person's page.
3. **A. Jobs and notifications** (built, `docs/design-jobs-and-ntfy.md`): the daily depletion check, ntfy, the end-of-day note, and per-row routine reminders set like a timer. Due-maintenance reminders join when maintenance is built.
4. **B. Maintenance schedules** (built, with its daily note; `docs/design-maintenance.md`).
5. **C. Receipts** (dropped).
6. **D. Voice**, starting with the dictation check, together with the first measurement for **F. Two languages**.
7. **E. MCP** (built, `docs/mcp.md`). Assistant speed is dropped. CI and lint remain.
