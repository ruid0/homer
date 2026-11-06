# H.O.M.E.R. v2: plan

Status: In progress (owner decisions recorded 2026-11-05; steps 1 to 3, backups, routines and jobs with ntfy, are built) · Owner: Igor Bondarenko · Last updated: 2026-11-05 · Source: v1.0.0 release, PRD §3 and §9, and the owner's own earlier project `~/PetProjects/Assistant` (same household, different stack), which has working versions of several of these ideas.

v1 is pull-only: HOMER shows what is due when someone opens it. v2 makes it push, keeps its data safe, and widens what it can read and hear, without breaking the rule that household data stays in the house.

Each step below is its own DEFINE, PLAN and PRs (see `CLAUDE.md`).

## 1. Decisions (owner, 2026-11-05)

1. **Assistant speed:** later. Ideas to try then: keeping context for the assistant, retrieval (RAG), MCP, or other ways (theme E).
2. **Backups:** an automatic backup once a day, run from code or cron. First.
3. **Notifications:** ntfy to start, and small notifications are fine. There must be a notification at the end of the day. A more robust channel can replace ntfy later, so the sender sits behind a small interface.
4. **Routines:** a separate screen under a specific person, which that person sets up as they want.
5. **Receipts:** keep the photos, and the owner can look at them at any time.
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
- **Maintenance:** things that come round on a longer cycle: furnace filter every 3 months, softener salt, cleaning. Needs repeats the task model does not have yet ("every N weeks or months", not only daily, weekly, monthly), a "due soon" view, and a reminder through theme A. Fits the existing tasks and `nextDueDate` logic.

### C. Receipts

- Photograph a receipt, read it with a local vision model, match each line to a tracked item, and offer one tap to restock them all and tick them off the grocery list. Learns from corrections: which receipt text means which item, per store.
- **Photos are kept** and can be opened at any time from the receipt. The SQLite file is the "one file to back up", so the photos need to be in the backup too. Likely shape: image files in their own folder or volume, a database row pointing at each, and the daily backup copying both. To settle in the DEFINE.
- Reuse from the Assistant project: the extractor, which checks that line items add up to the receipt total (this catches wildly wrong line prices), its saved receipts and benchmark (`bench:accuracy`), and its remembered store names and corrections.
- **Important:** HOMER's PRD and `.env.example` name `qwen3-vl:8b`. The Assistant project measured that model as unusable for receipts (it pastes raw regions into descriptions) and uses `qwen2.5vl:7b` (3 of 3 exact, about 47 s each). Run that benchmark again on this household's receipts before choosing. Receipts in a second language need to be in the test set.
- Out of scope: price comparison and flyer deals. They need the internet, which breaks "local only".

### D. Voice

Three levels, in order of effort:

1. **Dictation today:** phone and tablet keyboards already have a microphone key that types into the chat box. Check it on the kitchen tablet, in both languages. This costs nothing and is where this theme starts.
2. **Push to talk:** a button in the chat records audio in the browser (needs HTTPS, which Tailscale gives), sends it to the api, and a **local** speech model on the Mac turns it into text, which goes into the same assistant flow. Do not use the browser's own speech recognition: it sends audio to Google or Apple. The model has to cope with Russian, English and a mix of both in one sentence.
3. Hands-free wake word. Later, probably never.

Level 2 needs a speech-to-text install on the Mac next to Ollama (Docker has no GPU there). Which one to use needs a short bake-off in both languages.

### E. Assistant speed and the other carry-overs from v1

- **Assistant speed.** Median reply is 10 s. Ideas to measure, each against HOMER's golden set:
  - Keep the model loaded in memory between messages and reuse the unchanged start of the prompt (Ollama can keep a model resident and reuse a prompt prefix), so a turn does not pay for the setup again.
  - Give the tool-choosing step to a smaller model with a short list of tools. The Assistant project cut that step from 4.5 to 8 s down to 0.6 to 1.9 s this way (its decision D096). HOMER's loop is different: the model also fills in the arguments and reads the results, so the gain here is unproven.
  - Retrieval (RAG) helps when there is more text than fits in a prompt. The household's data here is small and already reached through tools, so it is unlikely to help, but worth ruling out.
  - MCP is a way of offering HOMER's tools to other apps. It would not make a model faster, but could be useful on its own later.
- Assistant accuracy: about 1 run in 20 still fails in the eval (mostly asking where it should act).
- CI and lint.

### F. Two languages (Russian and English)

The assistant must handle Russian, English and mixed-language sentences. Things in the code that assume English today:

- The assistant's replies for changes are written by code in English (`apps/api/src/messages.ts`), and the app's text is English (`apps/web/src/copy.ts`).
- Day words ("today", "tomorrow", weekday names) and time words are resolved by code in English (`packages/shared/src/dateWords.ts`, `timeWords.ts`), and the guard that stops deleting looks for the English word "delete".
- Name matching treats plurals the English way. Names written in Cyrillic are letters like any other, but Russian word endings are not handled.

The first step is a measurement: a golden set of Russian and mixed-language prompts, run against the current model. Then decide what to translate or resolve in code: the assistant replying in the language it was spoken to, the day and time words, and whether the app's own screens need translating (a separate decision).

## 3. Order

1. **Backups** (built): a daily copy at 06:00 from the api into a folder on the Mac, checked after writing, 14 daily plus 6 weekly kept, caught up at boot if the Mac slept, restore steps in the README (tried on a scratch stack). Receipt photos join the backup when receipts are built.
2. **Routines** (built), on a person's page.
3. **A. Jobs and notifications** (built, `docs/design-jobs-and-ntfy.md`): the daily depletion check, ntfy, the end-of-day note, and per-row routine reminders set like a timer. Due-maintenance reminders join when maintenance is built.
4. **B. Maintenance schedules.**
5. **C. Receipts**, starting with the vision-model benchmark.
6. **D. Voice**, starting with the dictation check, together with the first measurement for **F. Two languages**.
7. **E. Assistant speed** whenever there is time, later.
