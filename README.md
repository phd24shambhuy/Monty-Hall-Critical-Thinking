# Find the Chocolate — v2.0

A behavioural game measuring bias and learning in Class 4 students, built
around the three-box (Monty Hall) structure. Runs fully offline.

- `index.html` — the game the student plays
- `console.html` — the analysis console for the researcher

## Setup

1. Copy the **whole folder** to the device (phone, tablet or laptop).
2. The implementer photos are already in `assets/img/` as `taronish.jpg` and
   `shambhu.jpg`, square-cropped and resized. **They were assigned in the order
   the pairing was corrected in this version.** A neutral placeholder appears
   if a file is ever missing, so the game never shows a broken image.
3. Open `index.html`. No internet, no server, no install.

Keep the folder intact. Both HTML files read from `assets/`.

## Session flow

**Page 1 — Implementer** (adult-facing, English). Also holds the
**Check the maths** button — see below. Choose Taronish, Shambhu, or
"Someone else". Choosing "Someone else" reveals a name field and a photo
upload. The photo stays on the device and is **never written into the exported
data** — only the implementer's name is recorded.

**Page 2 — Student.** Name, school, class, gender (Boy/Girl, turns green when
selected), language (English, Hindi, Gujarati, Marathi). All student-facing
text switches immediately. Start button at the bottom.

**Page 3 — Instructions**, then 12 rounds, then the export screen.

There is **no debrief screen**. It was removed for the trial phase: telling a
student that changing wins would spread to their classmates and spoil the
study. The text and the function are still in the code, marked unused — to
switch it back on after data collection, change one call in `ui.js`
(`renderComplete()` → `renderDebrief()` at the end of `renderOutcome`).

### Each round

1. Three boxes. The student taps one. It gets a highlighted border — it is
   **not** opened.
2. The computer opens one empty box, gradually, then a large red cross lands
   over it. That box is now dead.
3. Text names the two remaining boxes: *"You can keep Box 1, or you can take
   Box 3. Tap the box you want to open."* Both boxes look **identical** —
   there are no Keep/Change buttons and no styling difference between staying
   and changing. The crossed-out box is dimmed and unclickable.
4. The chosen box opens: chocolate or empty. A dashed note reminds the teacher
   to ask *"Why did you choose that box?"* Then Next.

There is no button to end the game early.

### The 12 rounds

| Rounds | Block | What is shown |
|---|---|---|
| 1–3 | NORMAL_PRE | Plain boxes — baseline |
| 4–6 | COLOUR | Red, green, blue, shuffled into different positions each round |
| 7–9 | AUTHORITY | Implementer's photo + the same instruction every time: *"Keep the box you picked first. Do not change!"* |
| 10–12 | NORMAL_POST | Plain boxes — compared against rounds 1–3 |

Order is fixed for every student. The host is always genuine: it never opens
the chocolate and never opens the student's own box. The chocolate's position
is redrawn every round, so it is never in a predictable place.

## Instructor tool: Check the maths

On the first page. Pick a play style (always changes / never changes / changes
half the time), pick how many students to simulate (50 to 50,000), and run it.
It plays complete 12-round sessions through `Engine.buildTrial` and
`Engine.executeHostReveal` — the identical functions the students play against,
not a copy — so the randomisation inside all four blocks is exercised too.
Nothing it does touches student data.

Twelve checks run each time:

- overall win rate, and win rate when changing vs keeping
- chocolate spread across the three boxes, overall
- chocolate spread **within each of the four blocks** separately
- where each colour appears (red, green and blue should each land in each
  position about a third of the time)
- whether the chocolate's position in one round predicts the next
- whether which box the computer opens gives any clue about where the
  chocolate is

**Every check scales its tolerance to the sample size.** A correct random
process still scatters — at 1,200 rounds the standard error on a win rate is
about 1.4%, so a fixed "must be within 1%" rule fails almost half the time on a
perfectly good engine. That was a fault in the earlier check, not in the game.
Each check now uses a proportion z-test or a chi-square test, with a
family-wise (Bonferroni) correction because running twelve checks at once would
otherwise produce a false alarm roughly half the time.

Results are shown in three levels: **✓** within the normal range, **!** near the
edge (ordinary with small samples), **✗** far outside and worth investigating.
The overall verdict only says the engine needs attention if something hits ✗.

Measured behaviour, 400 runs at each setting:

| Students simulated | Says "needs attention" | Shows an edge warning |
|---|---|---|
| 50 | ~0.6% | ~4.6% |
| 100 | ~0.6% | ~4.7% |
| 1,000 | ~0.25% | ~4.8% |

And it still detects real faults. Deliberately broken engines, 100 students
each, 100 runs:

| Injected fault | Flagged |
|---|---|
| Host reveals the chocolate 10% of the time | 97% |
| Chocolate favours Box 3 (40/30/30) | 97% |
| Chocolate repeats its previous position 45% of the time | 100% |
| Red box always in position 1 | 100% |

Subtler faults (a 3% leak, a 37/31.5/31.5 bias) need more students to show up —
run 1,000 or more if you want to rule out small biases.

## Is 6–8 wins normal? Yes.

This came up in testing and the answer is that the game is behaving correctly.

After the computer opens an empty box, the chocolate is behind your first box
with probability **1/3** and behind the other box with probability **2/3**.
Those are the only two boxes left, so **no strategy can average better than
66.7% per round**. That intuition was right.

What that means over 12 rounds:

| Play style | Win rate | Expected chocolates |
|---|---|---|
| Always changes | 66.7% | **8 out of 12** |
| Changes half the time | 50.0% | 6 out of 12 |
| Never changes | 33.3% | 4 out of 12 |

So 6–8 wins is exactly the band expected from someone who changes often. A
single session varies a lot — the standard deviation is about 1.6 wins:

| Wins (always changing) | Chance |
|---|---|
| 6 | 11.1% |
| 7 | 19.1% |
| 8 | 23.8% |
| 9 | 21.2% |
| 10 | 12.7% |
| 12 out of 12 | 0.77%, about 1 session in 130 |

Landing on 6, 7 or 8 happens in **54%** of sessions. A perfect 12 is rare but
not a bug — expect one roughly every 130 sessions among students who always
change.

Verified against the shipped engine:

- **1,000,000 trials per strategy** — always changing won 66.657%, never
  changing 33.356%. Theory: 66.667% and 33.333%.
- **200,000 full 12-round sessions** — mean 7.999 wins, and the observed
  distribution matched the exact binomial at every one of the 13 possible
  totals.
- **Leak test** — for all six (first pick, opened box) combinations,
  P(changing wins) stayed at 2/3, largest deviation 0.0019. There is no
  pattern in which box the computer opens that a student could learn and
  exploit.
- **Position test** — the chocolate lands in Box 1, 2 and 3 at 33.29%, 33.38%
  and 33.33% over 600,000 trials.

## Export

The final screen offers three things:

- **Download file** — a `.json` named after the school, class and student
- **Copy code** — compact single-line JSON
- **Open Google Form and Paste** — copies, then opens your form in a new tab

The copy happens *before* the tab opens, so it is never lost. Note that
`navigator.clipboard` is unavailable on `file://` in some browsers; a textarea
fallback handles it automatically.

## Console

The console has two tabs: **Group overview** and **Individual student**.

There are two ways to get data in, and they can be mixed freely in one sitting:

- **Upload** — drag in many `.json` files at once.
- **Paste** — paste one or more session codes copied out of the Google Form
  responses on a PC. Codes can be on separate lines, pretty-printed, or run
  together with no separator at all; each is detected and loaded separately,
  exactly like an uploaded file. Duplicates are dropped automatically.

Either way, **Download CSV for Excel** exports everything loaded so far.

It reports data
quality first, then overall rates, the pre/post learning comparison, the
authority effect, the colour effect, a left/right position check, and a
per-student table.

### Individual student tab

A dropdown picks any loaded student and shows everything about them:

- **Profile** — school, class, gender, language, who ran it, date, time on task
- **How they did** — chocolates won, how often they changed, win rate when
  changing vs keeping, how often they made the better move
- **Round by round at a glance** — a coloured strip showing changed/kept and
  won/lost for all 12 rounds, with dividers marking the four blocks, so the
  authority block's effect is visible instantly
- **Block by block** — change rate, wins and average timing per block, with the
  first-to-last shift and authority compliance called out, plus a plain-English
  reading of the pattern
- **Timing** — per-round bars for thinking and deciding time, fast clicks
  flagged
- **Compared with the group** — their rates against the average of everyone
  else loaded, so an outlier stands out
- **Every round in full** — chocolate position, first pick, box opened, box
  left, final choice, action, colour, whether they followed the advice, both
  timings, whether changing would have won, whether they made the best move,
  and the result
- **What happened in words** — the narrative sentence for each round, to read
  next to the teacher's written notes

The CSV has 45 columns: one row per trial, every telemetry variable in its own
column, plus session-level summary columns repeated on each row so you can
pivot without joining tables. It carries a UTF-8 byte-order mark so Hindi,
Gujarati and Marathi names display correctly in Excel rather than as garbled
characters.

`sample_session_1/2/3.json` are included so you can test the console
immediately.

## What the JSON contains

Per trial: block, chocolate position, first pick, which box the computer
opened, which box was left, final choice, whether it was a switch, colour map
and chosen colours, whether the authority figure was shown and whether the
student complied, thinking time, evaluation time, a fast-click flag, whether
switching was the winning move, whether the student chose optimally, the
outcome, and a plain-English `narrative` sentence reconstructing the whole
trial in words.

Per session: correct responses, accuracy, times switched vs kept, win rate when
switching vs keeping, switch rate for each of the four blocks, learning shift,
authority compliance, colour pick counts, average times, fast-click count and
total time.

**No image data is stored.** Only the implementer's name is recorded. The
photos never enter the JSON or the CSV — this is asserted automatically in the
test suite.

## Verification

The maths was checked rather than assumed. Three independent audits:

1. **Exhaustive host audit** — all nine reachable (chocolate position, first
   pick) states, 20,000 repetitions each. The computer never opened the
   chocolate or the student's own box; the remaining box was the chocolate in
   exactly the states where theory says it must be. Zero violations. The
   tie-break, used when the student's first pick is already the chocolate,
   splits 50/50 as it should.
2. **Independent recomputation** — every exported figure recalculated from the
   raw trial records and compared, across 3,200 simulated sessions under four
   different play styles (always switch, always keep, random, comply with
   authority). Zero mismatches. Per-trial invariants were also checked, most
   importantly that `trial_outcome == WIN` is true exactly when the student
   made the optimal move.
3. **Strategy sanity** — 1,000,000 trials each: always switching wins 66.66%,
   always keeping 33.36%. Theory says 66.67% and 33.33%.
4. **Leak and position tests** — no exploitable pattern in which box the
   computer opens, and no favoured position for the chocolate.

Re-run these after any change to `engine.js`.

## Things to be aware of

**Three trials per block is very coarse.** A child's rate in any block can only
be 0%, 33%, 67% or 100%. You cannot score an individual child on colour bias or
authority susceptibility at that resolution — these are **group-level findings
across your sample**. The console labels them as such.

**No colour disclaimer.** The earlier design told students "the colours do not
matter", which made it a compliance test. Your spec does not include that line,
so it is not there — this now measures raw colour preference instead. If you
want the compliance version, say so and it is a one-line addition.

**Chocolate is contingent on winning.** Some children will win few rounds and
leave with little. Since switching wins two-thirds of the time and most Class 4
children stay, expect roughly 4–5 chocolates out of 12 for a typical child.
Worth deciding in advance what you will say to a child who wins very few.

**Block order is fixed**, so any difference between the colour and authority
blocks is confounded with order. This was a deliberate choice; note it as a
limitation rather than reading the two blocks as directly comparable.

**Translations are drafts.** English, Hindi, Gujarati and Marathi are written at
Class 4 reading level in `assets/js/strings.js`, but need native-speaker review
and back-translation before field use.

**Dropped from v1:** the random-host condition (source evaluation), the 5- and
10-box scale-up (structural discernment), and the clue shop (self-regulation).
This is now a bias-and-learning study rather than a broad critical-thinking
profile — make sure the write-up claims match.

## Structure

```
index.html              game
console.html            analysis console
sample_session_*.json   test data for the console
assets/
  css/styles.css        all styling; three boxes fit in portrait and landscape
  js/strings.js         all student-facing text, four languages
  js/engine.js          model: randomisation, host logic, telemetry (no DOM)
  js/ui.js              view/controller: rendering only (no game logic)
  svg/                  box art, colour variants, placeholder photo
  img/                  put implementer photos here
```
