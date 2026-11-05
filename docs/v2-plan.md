# H.O.M.E.R. v2: plan

Status: DEFINE (nothing built yet) · Owner: Igor Bondarenko · Date: 2026-11-05 · Source: v1.0.0 release, PRD §3 and §9, and the owner's own earlier project `~/PetProjects/Assistant` (same household, different stack), which has working versions of several of these ideas.

v1 is pull-only: HOMER shows what is due when someone opens it. v2 makes it push and widens what it can read and hear, without breaking the rule that household data stays in the house.

## 1. The five themes

### A. Jobs and notifications (the foundation)

- A scheduler in the api (`node-cron` is already a dependency). First job: a daily check that puts items that have *become* low onto the grocery list. Today a low item is only added when something is written to it or the api restarts, so one that drifts below its threshold with time can wait.
- Notifications to phones through **ntfy**. `Assistant/src/lib/server/notify.ts` is a small, tested sender that can be copied nearly as it is. It only sends, never listens, so knowing the topic lets someone read notifications, not act. Notification text says only what a lock screen may show.
- A morning summary (the PRD's 06:00 job) and due reminders ride on the same sender.
- **Decision needed:** the Assistant project uses the public ntfy.sh relay, which sees the notification text. HOMER promises that no household data leaves the house. Recommended: run **ntfy in the compose file** on the tailnet. As I understand it, an iPhone then still needs a content-free wake-up ping through the ntfy.sh relay for instant delivery (an Android phone does not). That needs checking before it is promised. Even that ping is an outbound network call, and the PRD (§5) says there are none except to Ollama, so accepting it means amending that rule. Nothing here changes the PRD's scope until the owner approves it.

### B. Maintenance schedules and routines

- **Maintenance:** things that come round on a longer cycle: furnace filter every 3 months, softener salt, cleaning. Needs repeats the task model does not have yet ("every N weeks or months", not only daily, weekly, monthly), a "due soon" view, and a reminder through theme A. Fits the existing tasks and `nextDueDate` logic.
- **Routines (a daily checklist):** a set of things done several times a day, ticked off per day, some with a count. HOMER's tasks can repeat daily, but this wants a grid: rows are the routine items, columns are days, and a tap ticks one (with an optional count). Open design questions: who sees it, whether a tick can use up stock (an item's quantity), and what a missed day looks like.
- A tick that uses up stock would also give the learned-usage estimate (slice 7) real consumption to learn from, instead of only restock gaps.

### C. Receipts

- Photograph a receipt, read it with a local vision model, match each line to a tracked item, and offer one tap to restock them all and tick them off the grocery list. Learns from corrections: which receipt text means which item, per store.
- Reuse from the Assistant project: the extractor, which checks that line items add up to the receipt total (this catches wildly wrong line prices), its saved receipts and benchmark (`bench:accuracy`), and its remembered store names and corrections.
- **Important:** HOMER's PRD and `.env.example` name `qwen3-vl:8b`. The Assistant project measured that model as unusable for receipts (it pastes raw regions into descriptions) and uses `qwen2.5vl:7b` (3 of 3 exact, about 47 s each). Run that benchmark again on this household's receipts before choosing.
- Out of scope: price comparison and flyer deals. They need the internet, which breaks "local only".

### D. Voice

Three levels, in order of effort:

1. **Dictation today:** phone and tablet keyboards already have a microphone key that types into the chat box. Check it on the kitchen tablet. This costs nothing.
2. **Push to talk:** a button in the chat records audio in the browser (needs HTTPS, which Tailscale gives), sends it to the api, and a **local** speech model on the Mac turns it into text, which goes into the same assistant flow. Do not use the browser's own speech recognition: it sends audio to Google or Apple.
3. Hands-free wake word. Later, probably never.

Level 2 needs a speech-to-text install on the Mac next to Ollama (Docker has no GPU there). Which one to use needs a short bake-off.

### E. Carry-overs from v1

- **Assistant speed.** Median reply is 10 s. The Assistant project cut its tool-choosing step from 4.5 to 8 s down to 0.6 to 1.9 s by giving that step to a smaller model with a short list of tools (its decision D096). HOMER's loop is different: the model also fills in the arguments and reads the results, so the gain here is unproven. Try it against HOMER's golden set.
- Assistant accuracy: about 1 run in 20 still fails in the eval (mostly asking where it should act).
- Run the documented backup command end to end and a restore from it (not yet verified), and add CI and lint.

## 2. Suggested order

Each step is its own DEFINE, PLAN and PRs.

1. **A. Jobs and notifications**, starting with the daily depletion check. Everything else that "tells you" depends on it.
2. **B. Maintenance**, then **routines**.
3. **C. Receipts**, starting with the vision-model benchmark.
4. **D. Voice**, starting with the dictation check.
5. **E.** Assistant speed can be done at any point and is a good quick win between the bigger steps.

## 3. Decisions for the owner

1. **ntfy:** self-hosted in compose (recommended) or the public ntfy.sh?
2. **Routines:** is the checklist grid right? Should a tick use up stock?
3. **Receipts:** keep the photo for review (recommended) or discard it after reading?
4. **Voice:** start with the dictation check, then push to talk with a local speech model?
5. **Order:** as suggested, or something first?
