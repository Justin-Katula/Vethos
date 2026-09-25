# Vethos — iPhone onboarding brief (for Claude Design)

Paste everything below this line into Claude Design.

---

## What to build

An **interactive, clickable prototype of the complete iPhone onboarding of Vethos**: every screen, every state, every transition, in one flow, from the first screen to "Enter Vethos".

- Frame: **iPhone 15 / 16, 393 × 852 pt**, portrait. Respect the safe areas: status bar and Dynamic Island at the top (≈59 pt), home indicator at the bottom (34 pt).
- Language of the interface: **English**. Keep every piece of copy **exactly** as written in this brief (it has been reviewed line by line).
- The prototype will be **re-implemented in React Native** (Animated with the native driver, react-native-svg). So only animate **opacity, translate, scale and rotate**, and draw with plain shapes or SVG. No backdrop blur, no WebGL, no CSS-only tricks that can't be translated.
- Deliver one screen after another, playable, with a sample user (below) so every number on screen is real.

## The product, in one paragraph

Vethos is an anti-procrastination app. It doesn't give advice: it **takes one thing the user keeps pushing to "tomorrow" and places it in their real week**, around their sleep and their fixed hours, then locks their distractions while they do it. The onboarding has one job: make the user **feel** what "tomorrow" has already cost them, then show them the exact moment it stops. It must touch the heart, because an honest emotional moment is what makes someone subscribe. It must never lie, lecture or guilt-trip. Every number comes from their own answers.

## The seven rules (non-negotiable)

1. **One question per screen.** Any "?" on screen has buttons that answer it. No rhetorical questions, ever. If it can't be answered, it's written as a statement.
2. **Each answer is acknowledged once**: as a small grey line at the top of the *next* screen. Never under the answer and then again on the next screen.
3. **Word-by-word text appears in exactly one place**: the "“I’ll start tomorrow.”" screen. Everywhere else, a sentence appears whole (one fade + 8 pt rise).
4. **Every answer is used later.** The table at the end shows where each one comes back. If a screen doesn't feed something later, it shouldn't exist.
5. **No explanatory text.** No "This is a replay…", no "Here's how it works". The screen shows; it doesn't explain.
6. **After the name, the user never types.** Everything is a tap or a wheel.
7. **No maths on screen.** No "4 × 2 h × 26 weeks". Numbers appear as a result (a count-up) or as dots on a calendar, never as a calculation.

## Visual system (the existing Vethos identity — keep it)

**Colours (dark only for the onboarding):**

| Token | Value | Use |
|---|---|---|
| bg | `#000000` | Background, true black |
| surface | `#141414` | Cards, option rows |
| surface2 | `#232323` | Pressed state, empty tracks |
| surface3 | `#2f2f2f` | Rare third level |
| text | `#f2f2f2` | Titles, primary button fill |
| text2 | `#bebebe` | Body |
| text3 | `#8d8d8d` | Small grey lines, labels |
| line | `rgba(242,242,242,0.16)` | Hairlines |
| accent | `#cf1b29` | Red fills: pushed evenings, progress |
| accentInk | `#f0525f` | Red text: lost hours |
| gold (today only) | `#d69b3a` | The glow of **today**, nowhere else |
| Task block | `#505359` | "TASK" colour |
| Goal block | `#e03131` | "GOAL" colour |
| Anchor block | `#2c3a56` | "ANCHOR" colour |

- **No green anywhere** (no hue between 60° and 170°). "Success" is white, not green.
- Red is rare: it only means **time lost to "tomorrow"**.
- Gold only means **today**.

**Type:** Geist (400 / 500 / 600) for everything, Geist Mono for small numbers in cards.
- Big title 34 / 40, weight 600, tracking −1
- Title 28 / 34, weight 600, tracking −0.6
- Body 17 / 24, weight 400, text2
- Grey acknowledgement line 15 / 21, weight 500, text3
- Big counter 64–88 pt, weight 600, tracking −2.5, tabular numbers

**Shape:** Vethos is angular. Radius **8 max** on cards and rows (option rows 16 are acceptable for large touch rows; never pills except the small "Start with" chips). Spacing on a 4-pt grid: 8 / 12 / 16 / 24 / 32. Side margins 24.

**Components you must reuse on every screen:**
- **Primary button**: full width, 56 high, white fill (`#f2f2f2`), black label 16/600 + a small chevron on the right. Pressed: scale 0.975, opacity 0.82. Disabled: opacity 0.28. Always pinned at the bottom, above the home indicator.
- **Secondary button**: same size, transparent, text2 label 15/500, no chevron.
- **Option row** (answer to a question): full width, min 56 high, surface fill, title 17/500 on the left, a radio circle (single choice) or a checkbox square (multiple choice) on the right. Selected: surface2 fill + white filled indicator. The whole row is the touch target.
- **Progress bar**: a 2-pt hairline at the very top under the status bar, filling in red. Hidden during the story's emotional screens (see below).
- **Wheel picker** (for every hour, duration or date): iOS-style wheel, 5 rows visible, the centre row highlighted by a surface band. Hours and minutes are two separate columns, **looping 24 h** (23 → 00 wraps). Only the columns themselves are draggable.

**Motion (slow and calm, the app is 40 % slower than a typical UI):**
- Micro (press, selection): **210 ms**
- Element entering (fade + 8 pt rise): **420 ms**, stagger 110 ms between items
- Screen change: **530 ms** crossfade + 12 pt horizontal shift
- Cinematic moments (calendar, zoom): **1.2 – 2.5 s**
- Easing for entering: `cubic-bezier(0.23, 1, 0.32, 1)`. For moving on screen: `cubic-bezier(0.77, 0, 0.175, 1)`. Never ease-in. Never scale from 0 (start at 0.95).
- **Reduce Motion variant**: no movement, only fades. Word-by-word becomes a single fade. The zoom becomes a crossfade.
- Haptics: annotate them in the prototype (light / medium / heavy / error). They'll be wired natively.

## Sample user (use it everywhere so the numbers are real)

- Name: **Alex**
- Matters most: **Health** and **Discipline**
- Says "I’ll do it tomorrow": **Almost every evening** (= 5 evenings a week)
- Keeps pushing: **Going to the gym** and **Reading every day**
- Gym: meant to since **About 6 months** (26 weeks), actually goes **Once a week**
  → real training = 4 sessions a week of 2 h → misses 3 a week → **78 workouts, 156 h**
- Reading: meant to since **About 3 months** (13 weeks), actually reads **Never**
  → reading every day = 7 × 30 min → **91 sessions, 45 h 30**
- Total lost: **≈ 202 hours**. "Tomorrow" said ≈ **130 times** (5 × 26).
- What stops Alex: **My phone** and **Too tired by evening**
- Sleep 23:30 → 07:30. Work Mon–Fri 09:00 → 17:30.

---

## The flow, screen by screen

The story is in three acts:
- **Act 1 — Listen** (screens 1–6): the user answers, the app hears.
- **Act 2 — The cost** (screens 7–10): the user sees, feels, decides.
- **Act 3 — The place** (screens 11–17): Vethos builds their real week.

The progress bar is visible in acts 1 and 3. It is **hidden** from screen 8 to 10 (nothing should distract from the emotion).

---

### ACT 1 — LISTEN

#### 1 · Name
- Big title: **First, what should I call you?**
- One text field, label "Your name", keyboard opens immediately, "Done" on the keyboard continues.
- Button: **Continue** (disabled until something is typed).
- *This is the only screen with typing.*

#### 2 · What matters
- Grey line (the only greeting, one time): **Nice to meet you, Alex.**
- Title: **What matters most to you right now?**
- Grey line under the title: **Choose everything that’s true.**
- 6 option rows, **multiple choice**, each with a title and a small grey subtitle:
  - School · *Make room to learn.*
  - Work · *Finish what matters.*
  - A project · *Bring an idea to life.*
  - Health · *Show up for yourself.*
  - Discipline · *Do what you said.*
  - Creativity · *Make something of your own.*
- Button: **Continue** (disabled until one is picked). Haptic: light on each tap.

#### 3 · How often — *the old "Then why do you keep pushing it?" is gone*
- Grey line, static, appears with the screen (no word-by-word): **Health. Discipline. You already know what matters.** (the user's own choices, joined by ". ")
- Title: **How often do you tell yourself “I’ll do it tomorrow”?**
- 4 option rows, single choice:
  - Almost every evening
  - A few evenings a week
  - About once a week
  - Rarely
- **No button.** Tapping an answer: row selects (medium haptic), 500 ms pause, then the next screen comes. Nothing is written under the answer.

#### 4 · What keeps getting pushed
- Grey line (the acknowledgement of screen 3, the only place it appears). Depends on the answer:
  - Almost every evening → *Almost every evening. That’s a lot waiting for you.*
  - A few evenings a week → *A few evenings a week. It adds up faster than it feels.*
  - About once a week → *About once a week. Small — until you count it.*
  - Rarely → *Rarely. Then let’s check what “rarely” costs.*
- Title, also depends on the answer:
  - Almost every evening → **So what keeps getting pushed?**
  - A few evenings a week → **What gets pushed on those evenings?**
  - About once a week → **What gets pushed, that one evening?**
  - Rarely → **When it does happen, what gets pushed?**
- Grey line: **Choose everything that’s true.**
- Option rows, **multiple choice**, grouped under a small grey header per priority chosen in screen 2 (header only if more than one priority). The catalogue:
  - **School**: Studying for my exams · An assignment I haven’t started · Reviewing my notes
  - **Work**: A report I keep delaying · Deep work on what matters · Learning a skill for my career
  - **A project**: Launching it · Building the first version · Working on it every week
  - **Health**: Going to the gym · Going for a run · Cooking real meals
  - **Discipline**: Reading every day · Learning a language · Meditating
  - **Creativity**: Writing · Practicing my instrument · Finishing a piece I started
- Button: **That’s the one** (one picked) / **These are the ones** (several).

#### 5 · The details — one question per screen, for each thing
A small grey header on each of these screens: **1 of 2 · Going to the gym** (counter only if several things).
Every answer auto-advances after 500 ms, **no button**. A thin segmented indicator under the header shows the 2 or 3 sub-steps for this thing.

**5a · Since when**
- Title: **Since when have you been meaning to go to the gym?** (the verb comes from the catalogue: "study for your exams", "start that assignment", "launch your project", "read every day"…)
- Options: About a month · About 3 months · About 6 months · A year or more

**5b · How much work** *(only for one-time things: assignment, report, launching, first version, finishing a piece)*
- Title: **How much work does it really need?**
- Options: About 10 hours · About 30 hours · About 80 hours · 150 hours or more

**5c · The honest question** *(this screen must land; more air, the title a bit bigger, alone in the middle)*
- For repeated things: **How often do you actually go to the gym now?** → Never · Once a week · 2–3 times a week · Almost every day
- For one-time things: **How many hours a week do you actually put into it?** → None, honestly · About 1 hour · About 3 hours · 6 hours or more

Then the next thing (5a for "Reading every day"…), then screen 6.

#### 6 · What stops you — *new: the real "why", and this one can be answered*
- Grey line: **Now the honest part.**
- Title: **What usually stops you?**
- Grey line: **Choose everything that’s true.**
- Option rows, multiple choice:
  - My phone
  - Too tired by evening
  - No time left in the day
  - I don’t know where to start
  - I wait until I feel ready
- Button: **Show me what it cost**

---

### ACT 2 — THE COST (progress bar hidden)

#### 7 · The cost, thing by thing (plays by itself, no tap)
For each thing, one after the other, on the same screen:
1. Small grey header: **1 of 2 · Going to the gym**
2. A big red number counting up from 0 (1.2 s, ease-out, light haptic ticks): **156** + white "hours", and under it in text2: **already lost since you first decided.**
3. **The calendar** (the heart of the onboarding, see the dedicated spec below) fills itself month by month, from the month they first decided until today.
4. Once filled, two lines fade in, 1 s apart:
   - text2: **Since March, you meant 104 workouts. You went to 26.**
   - text white 600: **If nothing changes, another 78 workouts are gone by March.**
5. 3 s later, the whole block slides away and the next thing starts.

Then the **summary** (same screen):
- text2 18: **All together, since you first decided,**
- counter 88 pt white: **202**
- title 24: **hours went to “tomorrow”.**
- 1.9 s later, text2: an equivalence tied to what they chose, e.g. **That’s 5 full work weeks of your life.**
- Then one compact card per thing (stagger 250 ms): name on the left, red hours in mono on the right, a thin red bar proportional to the heaviest, one line under it (the "Since March…" line). **The cards don't open.** No "Tap one to see its year".
- Button fades in at the end: **I don’t want that**

#### 8 · The thought (the only word-by-word screen)
- Centred, huge (40 pt, weight 600): **“I’ll start tomorrow.”**
- Each word slams in (scale 1.08 → 1, 90 ms, heavy haptic per word). On the last word: error haptic + a short horizontal shake (3 oscillations, 6 pt, 300 ms).
- 700 ms later, text2 20 pt under it: **You say it almost every evening. That’s about 130 times since you first decided.** (the first sentence depends on screen 3: *You say it a few evenings a week.* / *You say it about once a week.* / *You said “rarely”.*)
- 1.8 s later, button: **Not this time, Alex.** (their name comes back here, at the moment of the decision)

#### 9 · The turn (no button, ~9 s, plays by itself)
The same calendar as screen 7 comes back, all things merged into one.
1. **0 – 2.5 s** — The calendar reveals, month by month. Grey line above: **Every red dot is an evening you meant it.**
2. **2.5 – 4.5 s** — The camera **zooms into today** (scale ×3.4, centred on today's dot, ease-in-out 1.4 s). Today's gold dot flashes (a soft gold ring expands and fades). Heavy haptic. A single word appears, huge, above: **Today.**
3. **4.5 – 7.5 s** — The camera pulls back out. Starting from today and spreading forward day by day like a ripple (1.8 s), **every future red dot turns white**: those are the evenings Vethos will give back. A light haptic every few dots. Caption: **From today, those evenings are yours again.**
4. **7.5 – 9 s** — Everything fades to black → screen 10.

#### 10 · Vethos
- The Vethos logo arrives in the centre (168 pt, from scale 0.95 + opacity 0, 900 ms).
- Under it, grey 19 pt centred: **You already know what matters.** (the callback to screen 3 — the only other place this sentence appears)
- Title centred: **Vethos makes sure your day respects it.**
- Button: **Give Vethos one thing**
- Progress bar comes back after this screen.

---

### ACT 3 — THE PLACE

#### 11 · Start with one
- Only if they chose several things. Small label **Start with**, then horizontal chips (pill-shaped, the only pills in the app), the heaviest one pre-selected: [Going to the gym] [Reading every day]
- Title: **How should Vethos hold “Go to the gym”?**
- Body: **We picked what fits. You can change it.**
- Three cards, the best fit pre-selected and marked with a small **Best fit** tag. Each card: a colour swatch (block colour), the name in caps, one line:
  - **TASK** · *It has a finish line. Once it’s done, it’s done.*
  - **GOAL** · *A few hours every week, wherever they fit.*
  - **ANCHOR** · *Same time, same days — it never moves.*
- Button: **Continue**

#### 12 · The settings (one question per screen, wheels only)
The card of the chosen type stays small at the top (swatch + name + "ANCHOR").
- **TASK**: 12a **When does it need to be done?** → date wheel, max 30 days from today · 12b **How much work is left, in total?** → hours | minutes wheel, max 150 h
- **GOAL**: **How much time does it get each week?** → hours | minutes wheel, max 100 h, pre-filled from the catalogue (gym → 8 h)
- **ANCHOR**: 12a **At what time?** → hour | minute wheel, looping 24 h · 12b **For how long, and on which days?** → duration wheel + a row of 7 day toggles (M T W T F S S), pre-filled from the catalogue (gym → 4 days, 2 h)
- Button: **Next**, then on the last one **Keep this commitment** (medium "lock" haptic).

#### 13 · Protection — *uses the answer of screen 6*
- Title: **Give it your undivided attention.**
- Body, **only if they chose "My phone"** in screen 6: **You said your phone gets you. While you do this, it can’t.** Otherwise: **While you work on it, your distractions stay locked.**
- Visual: an iPhone home screen mock (not a screenshot, drawn) with a few neutral app icons; during the session they dim and a small lock appears on each, with a pill at the top "Focus · protected".
- Buttons: **Lock my distractions** (primary) / **Not now** (secondary). After locking: **Continue** / **Change what’s locked**.

#### 14 · Sleep
- Title: **Your day starts with a good night.**
- Body: **Vethos never places anything while you sleep.**
- Visual: a round 24-h dial (the app's real clock) with the night drawn as a dark arc between bedtime and wake-up, updating live.
- Two wheels side by side, labelled **Bedtime** and **Wake-up**, looping 24 h. The night must stay between 6 and 10 h: outside that, the arc turns red, a warning haptic fires and the button disables.
- Button: **Keep this time for me**

#### 15 · Fixed hours
- Title: **What’s already part of your day?**
- Body: **Vethos builds around it, never over it.**
- Option rows: **Work** · **School** · **My days change** · **Nothing fixed**. Work and School can both be selected (pre-selected from screen 2). "Nothing fixed" is exclusive (unselects the others).
- For each selected one, a compact panel opens (fade + height) with **From** / **Until** wheels and the 7 day toggles (pre-filled Mon–Fri 09:00 → 17:30).
- Button: **Find its place, Vethos**

#### 16 · Finding its place (plays by itself, ~3 s)
- Title: **Finding its place.**
- Body: **Around your sleep, around your fixed hours.**
- The same 24-h dial: the night arc, the work arcs, then the commitment's block orbits once around the dial and **settles** in its slot (e.g. 18:30 → 20:30) with a medium haptic. If they said "Too tired by evening" in screen 6, the block visibly prefers an earlier slot.

#### 17 · Your week
- Title: **This is what one decision changes.**
- Body: **“Go to the gym” finally has a place in your week.**
- The app's real week card: 7 columns, the commitment's blocks in its type colour; tap a day to see that day's agenda (a vertical timeline with sleep, work, and the block).
- If nothing fits: title **Your week is full. Vethos sees it.**, body **Free up some hours, or adjust the commitment.**, secondary button **Adjust my commitment**.
- Button: **Enter Vethos** → the onboarding fades into the real app (the same week is already there).

---

## The calendar ("la frise") — detailed spec

The single most important visual. Used in screen 7 (one thing at a time) and screen 9 (all merged).

- **One dot per day**, rows = months. Each row: a 3-letter month label on the left (text3, 11 pt), then up to 31 dots.
- Range: from **the month they first decided** (today minus their "since when" answer) to **today + 3 months**. So it is **mostly the past**.
- Dot 7 pt, gap 3 pt, fully round.
- States:
  - **Past, pushed evening**: red `#cf1b29`. How many: their frequency (5 per week for "Almost every evening"), spread naturally across the week, not a pattern.
  - **Past, other day**: `#232323`.
  - **Today**: gold `#d69b3a` with a soft breathing glow (a 20-pt gold halo fading between 0.25 and 0.6 opacity, 2.4 s loop).
  - **Future, if nothing changes**: red at 35 % opacity.
  - **The day it would be done** (one-time things only): a white ring around the dot.
- Reveal: rows appear one after the other (120 ms each), dots within a row fill left to right quickly.
- Legend under it (text3, 12 pt, with a small dot each): **Pushed to “tomorrow”** · **Today** · **If nothing changes**

## Where each answer comes back (keep this chain intact)

| Answer | Comes back in |
|---|---|
| Name (1) | Screen 2 greeting · the button of screen 8 "Not this time, Alex." |
| What matters (2) | Screen 3 grey line · screen 4 groups · screen 10 callback · screen 15 pre-selection |
| How often (3) | Screen 4 grey line + title · red dot density · screen 8 sentence · "130 times" |
| What's pushed (4) | Screens 5, 7, 9, 11, the commitment's name |
| Since when (5a) | The first month of the calendar · "since March" · the lost hours |
| How much work (5b) | The finish-line ring on the calendar · the Task duration |
| Actual rhythm (5c) | The lost hours (the gap between what it needs and what they do) |
| What stops you (6) | Screen 13 protection copy · screen 16 slot choice |
| Sleep, fixed hours (14–15) | Screens 16 and 17, then the real app |

## What must NOT appear

- "Then why do you keep pushing it?" or any question without answers.
- Any sentence that repeats one already shown (except the deliberate callback on screen 10).
- Word-by-word anywhere except screen 8.
- Formulas, multiplication signs, "× weeks".
- Explanations of how the app works.
- Stock illustrations, emojis, gradients, glassmorphism, green.
- A "V" monogram in the corner. The logo only appears on screen 10.

## What to send back

1. The playable prototype of all 17 screens with the sample user.
2. For each screen: final copy, spacing and sizes (pt), colours used, and the exact animation timings/easing you chose if they differ from this brief.
3. The Reduce Motion variant of screens 7, 8 and 9.
