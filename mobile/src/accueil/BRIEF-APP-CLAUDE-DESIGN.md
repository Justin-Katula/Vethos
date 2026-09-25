# Vethos — iPhone app interface brief (for Claude Design)

Paste everything below this line into Claude Design. It continues the onboarding brief: same identity, same sample user.

---

## What to build

An **interactive, clickable prototype of the Vethos iPhone app after onboarding**: the five tabs, their sheets and overlays, every state (normal, empty, loading, full, error), in **dark and light**.

- Frame: **iPhone 15 / 16, 393 × 852 pt**, portrait, safe areas respected. Also check each screen at **375 pt wide** (iPhone SE): nothing may be cut or truncated.
- Language: **English**. The copy below is the current copy; you may tighten it, but never change what a sentence *claims*.
- It will be **re-implemented in React Native** (Animated, react-native-svg). Only animate opacity / translate / scale / rotate. No backdrop blur, no WebGL.
- You are free to **redesign the layout and the visual hierarchy**. You are **not** free to change what each screen shows or what it lets the user do (everything listed per screen below). Every number comes from Vethos's planning engine; the interface only decides where to put it.

## The product

Vethos is an anti-procrastination app. The user declares **commitments**; Vethos **places them in their real week** around their sleep and fixed hours, recalculates when life changes, and when it's time, asks one thing: **"I'm starting"**. Pressing it starts the session and **locks their distractions** (iOS Screen Time) until the session ends.

Three kinds of commitment, each with its own law:
- **TASK**: a deadline and a finite amount of work. Ruled by *slack*: whatever is due first goes first. Can be split automatically into "Part 1, Part 2…".
- **GOAL**: a weekly target in hours, never a deadline. Ruled by *rhythm*: it moves forward without ever being late.
- **ANCHOR**: a fixed hour, chosen once. Ruled by *stability*: it never moves from one day to the next.

**Personality:** calm, exact, never preachy. Vethos gives numbers, not advice. It never says "Great job!" or "You can do it!". It never shames. When it refuses something, it says what it would cost, and the decision stays the user's.

**Usage:** the user opens the app a few times a day, mostly to see **what's next** and to press **I'm starting**. Everything else is consultation or occasional adjustment. So: Today must be readable in 2 seconds, and "I'm starting" must be impossible to miss.

## Identity (keep it)

**Colours:**

| Token | Dark | Light | Use |
|---|---|---|---|
| bg | `#000000` | `#e6e6e6` | Background |
| surface | `#141414` | `#f8f8f8` | Cards, sheets |
| surface2 | `#232323` | `#eeeeee` | Pressed, tracks |
| surface3 | `#2f2f2f` | `#e0e0e0` | Third level |
| text | `#f2f2f2` | `#181818` | Titles |
| text2 | `#bebebe` | `#4e4e4e` | Body |
| text3 | `#8d8d8d` | `#787878` | Labels, secondary |
| line | `rgba(242,242,242,.16)` | `rgba(24,24,24,.13)` | Hairlines |
| accent (fills) | `#cf1b29` | `#c1121f` | The present, "I'm starting", the active tab rule |
| accentInk (text) | `#f0525f` | `#c1121f` | Red text |
| alert | `#d69b3a` | `#8d5b00` | "Not placed", warnings (amber, never green) |
| Task block | `#505359` | `#55585c` | Task blocks |
| Goal block | `#e03131` | `#c1121f` | Goal blocks |
| Anchor block | `#2c3a56` | `#253047` | Anchor blocks |

- **No green anywhere** (hue 60°–170° banned). Done = white/black, not green.
- Red = **now** and **the one action**. If everything is red, nothing is.
- Four appearance modes exist: Device (default), Light, Dark, On a clock (dark between two hours).

**Type:** Geist 400/500/600; Geist Mono for times, durations and numbers (tabular). Screen title 28/600; section title 18/600; body 15–17; labels 12–13; tab labels 10.

**Shape:** angular. Radius **3 / 5 / 6 / 8, never more** (except the round dial). 4-pt spacing grid (4, 8, 12, 16, 20, 24, 32, 40, 48). Side margins 20–24.

**Motion:** calm. Micro 150–210 ms, sheets 300–400 ms, ease-out `cubic-bezier(0.23,1,0.32,1)`, on-screen moves `cubic-bezier(0.77,0,0.175,1)`. No animation on things used dozens of times a day beyond press feedback (scale 0.97). Reduce Motion: fades only.

**Controls:** every hour/duration/date is set with an **iOS-style wheel** (hours | minutes columns, looping 24 h, 5 rows visible). The only text fields are names.

## Navigation

A bottom **tab bar with 5 tabs**, icon + label (10 pt), height 84 incl. home indicator, bg colour, a 1-pt top hairline. **The active tab is marked by a short 2-pt red rule above its icon** (22 pt wide), static: no sliding capsule. Active tint = text, inactive = text3.

1. **Today**
2. **My time**
3. **Commitments**
4. **Blocking**
5. **Settings**

Plus two things that sit above the tabs: the **"It's time" overlay** and **detail sheets**.

## Sample data (Alex, continuing from onboarding)

- Now: **Wednesday, 18:10**. Sleep 23:30 → 07:30. Work Mon–Fri 09:00 → 17:30, commute 17:30 → 18:00.
- ANCHOR **Go to the gym**: Mon · Wed · Fri · Sat, 18:30 → 20:30.
- GOAL **Read**: 3 h 30 / week, done this week 1 h 00.
- TASK **Finish the report**: due Friday, 6 h estimated, 2 h 30 done, split into Part 1 (done), Part 2 (tonight 21:00 → 22:30), Part 3 (Thursday).
- Today's capacity: **3 h 40 free**, **3 h 30 committed**, **rest 20 min**, **late 0 min**.

---

## 1 · Today (the home screen)

**Job:** in 2 seconds: what's now, what's next, how much of my day is left.

**Must show:**
- The date (e.g. "Wed 23 Sep") and a screen title.
- **The 24-h dial** (Vethos's signature object): a ring of 24 h, with sleep as a dark arc, fixed hours as grey arcs, the day's commitment blocks in their type colours, and a red hand/marker for **now**. The centre says what's left: the free time remaining (e.g. **3 h 40** "free today"), or the running session, or one of: *Free day* / *All done* / *The night is yours.* / *Time that's yours.*
- **The day's measures**, linked visually to the number they explain: **Capacity** (free), **Committed**, **Rest**, **Late**. Numbers only, no score, no percentages invented.
- **Up next**: the next block, big and clear: name, type, time range, "in 20 min". This is where "I'm starting" lives when a block is due.
- **Facts** the engine noticed, at three weights:
  - *Deficit* (something to decide, in a framed card, options come with numbers): e.g. "The report needs 1 h 30 more than your week has. Move Thursday's reading, or push the deadline to Monday."
  - *Signals* (a framed note, no red): e.g. "You've skipped Wednesday's gym 3 weeks in a row."
  - *Tension* (plain text, nothing to do).
- **Your day**: the agenda, line by line, from wake-up to bedtime, each block tappable (opens its detail sheet). Link **The week →** opens the week view. Empty state: *Nothing committed today.*
- **Tasks in progress**: each task with a thin progress bar (done / planned), its due date, "3 parts", and a small **+25 min** button (*Grant 25 more minutes to Finish the report*) when the user needs more time. "Not placed" in amber if the engine couldn't fit it.
- **Projection** (a second page of the dial area, swipeable, "Show Projection"): the long view — what the weekly hours become over a year (e.g. "3 h 30 of reading a week = 182 h this year ≈ 23 books"). Per type: Tasks / Goals / Anchors, with empty states: *Every task is done*, *No long-term goal declared* → **Set my first goal**, *No ritual anchored yet* → **Create an anchor**.
- A primary action **Add a commitment**.
- Loading state: *Vethos is placing your day.* Empty (no schedule declared): *Declare your schedule in My time*.

## 2 · "It's time" — the full-screen overlay (the most important screen in the app)

**Job:** interrupt, and get one decision.

- Appears **full screen**, above everything, when a block's start time arrives (and stays until acted on).
- Shows: small label **It's time**, the block's name huge, its type (Task / Goal / Anchor, with the type colour), its time range, and — **live** — how late the user is if they haven't started ("4 min late", updating every minute, in red after the start time).
- **One button, full-strength red**, the only red fill in the app: **I'm starting**. Loading: *Starting…*. Error: *Could not start. Try again.*
- A quiet secondary way out (text only) exists but is visually minor.
- On press: heavy haptic, the shield goes up (distractions locked), the overlay turns into the **running session** state: big elapsed/remaining timer, the block name, "Focus · protected", and a way to end it.

## 3 · My time

**Job:** declare the time that isn't free (sleep and fixed commitments) and see the week.

**Must show:**
- Title **My time**, the current week's dates.
- **The week map**: 7 columns (Mon → Sun), each a vertical 24-h (or wake-hours) track, with sleep, fixed commitments and Vethos's blocks. Today's column and the **current time line** in red. Tapping a day selects it.
- **Day by day**: the selected day's agenda under the map.
- Under it: the available hours "**available across seven days**".
- **Sleep** section (link to settings rule: 6–10 h).
- **Fixed commitments** list: each with name, category, days, start–end. Swipe or tap to delete, with confirmation (*Confirm deleting Maths class*, *Cancel deletion*). Empty: *Add your classes, your work or your commutes.*
- Action **Add a fixed commitment** → a sheet **New fixed commitment**: Name (placeholder *Maths class*), Category (School · Work · Commute · Commitment · Other), Repeat (**Every week** with 7 day toggles, or **Once only** with a date wheel), Start / End wheels. Errors: *Give this commitment a name.* · *Pick at least one day.* · *Enter valid times, with an end after the start.* · *Could not save. Try again.* Saving: *Saving…*
- Action **Ask for free time** → a small sheet: "I want X minutes" (stepper **Less / More**), **Ask**. Vethos answers with a verdict, not an opinion: **Granted — 45 min.** or **Denied.** plus what it would cost (e.g. "The report would miss Friday by 40 min."). The user can still decide.
- Loading: *Vethos is mapping your week.*

## 4 · Commitments

**Job:** see everything promised, grouped by law, add or adjust.

Three sections, each in its own framed box, each **stating its law in one line** (the user is new to the vocabulary):

- **Tasks** — *Slack Engine · Deadlines* — "A deadline and a finite amount of work. Ruled by slack: whatever is due first goes first."
  - Each task: colour mark, title, due ("Due Friday"), "3 parts", a progress bar (done / planned), **+25 min**. Parts are shown **under their task**, indented ("Part 1 · Finished", "Part 2 · Tonight 21:00", "Part 3 · Thursday"), never as separate tasks.
  - Empty: *No open tasks* → **Add a task**
- **Goals** — *Rhythm Engine · Habits* — "A weekly target, never a deadline. Ruled by rhythm: it moves forward without ever being late."
  - Each goal: title, **1 h 00 / 3 h 30 this week** with a bar.
  - Empty: *No weekly goals* → **Add a goal**
- **Anchors** — *Stability Engine · Appointments* — "A fixed hour, chosen once. Ruled by stability: it never moves from one day to the next."
  - Each anchor: title, time, duration, day letters (M · W · F · S highlighted).
  - Empty: *No fixed anchors* → **Add an anchor**
- Sections show 2 items, then **Show 3 more tasks** / **Show fewer tasks**.
- **Add forms** (sheets, one per type):
  - Task: *Task title* (placeholder *Finish the report*), **Deadline** date wheel (*Done by — at most a month ahead*), **Estimated duration** wheel (max 150 h), importance 1–10, "The plan: what this concretely involves" (placeholder *Tonight at my desk, I write the first three pages.*).
  - Goal: *Goal name* (*Guitar, sport, reading…*), **Time per week** wheel (max 100 h), the plan (*What does it involve? E.g. every evening at the studio, an hour of scales.*).
  - Anchor: *Anchor name* (*Sport, reading, meditation…*), **Anchor time** wheel, **Anchor duration** wheel (max 8 h), **Days** toggles, the plan (*E.g. tonight at the gym, 45 min upper body.*).
  - Error: *Could not create.*
- **Detail sheet** (opened from any block anywhere): name, type + its law in one line, time, and per type: Deadline / Initial estimate / Remaining work (task), weekly progress (goal), time and days (anchor). Delete with confirmation.

## 5 · Blocking

**Job:** say honestly what Vethos blocks, when, and what it can't do.

Sections, in this order:
- **Screen Time** permission: status + **Allow**. Copy: "Apple's permission is what lets an app be hidden. You can withdraw it whenever you want, from Settings." Without it: "Without it, Vethos can only show you your plan."
- **How far it goes**: two strengths, one trigger — *"Two strengths, one trigger. Either way, nothing is raised until you say “I'm starting”."*
  - **Set aside**: "Only what you picked above is set aside. Everything else stays where it is." → **Pick my apps** / **Change my selection**. Empty: *Nothing selected — a session will shield nothing.*
  - **Deep focus**: "Every app is set aside except the ones you keep. Stronger, and easier to get wrong." → **Pick what I keep** / **Change what I keep**. Warning: *Keep Vethos itself, or the only way out is iOS Settings.* Empty: *Nothing kept yet.*
- **What you set aside**: the picked apps/categories (drawn from Apple's picker — show them as app-icon tokens).
- **The web**: toggle **Filter the web during a session** / **Turn the filter off**. "Apple's own filter, not a list of ours…"
- **When it applies**: "During a session you started, and never otherwise…"
- **Today's sessions**: the day's blocks that will raise the shield, with times; the running one highlighted.
- **What Vethos cannot do**: an honest short list (it can't block what iOS doesn't let it; a shield can be lifted from iOS Settings).
- **Status line** (what iOS actually answers): *Not checked yet.* / *Vethos asked for a shield; iOS says none is up. Checked at 18:32.* (amber) / *A shield is still up, and no session is running. Checked at 18:32.*

## 6 · Settings

- **Sleep** first: **Bedtime** / **Wake-up** wheels. "The single source of your day. Capacity is computed between these two hours, and nothing is ever placed on top of them." Rule: *Between 6 and 10 hours a night.*; after onboarding, only 2 h of total flexibility around the declared night → refusal: *No flexibility left around 23:30 → 07:30.* (warning haptic).
- **Appearance**: Device · Light · Dark · On a clock (with **Dark from** / **Light from** wheels; *Dark from 20:00 to 07:00, light the rest of the time.*; error *The same hour twice: it will stay dark all the time.*). Footnote: "Following the device is the default…"
- **First name**: field, "Used to greet you, nowhere else."
- **What Vethos keeps**: counts of Tasks / Goals / Anchors.
- **Introduction**: replay the onboarding. "Touches neither your commitments nor the time you declared. It only replays the first launch."

## States to design for every screen

- Normal (Alex's data) · Empty (brand-new user) · Loading · Error · Overfull week (engine can't place everything: amber "Not placed", a Deficit card with numbered options) · Running session (Today, Blocking and the tab bar reflect it) · Dark and Light · Reduce Motion · largest Dynamic Type on Today and the overlay.

## What must NOT appear

- Scores, streak flames, badges, confetti, motivational quotes, "Great job!".
- Green, gradients, glassmorphism, emojis, stock illustrations.
- Radius above 8 (except the round dial), pill-shaped tab indicators.
- Any number the engine doesn't compute (no invented percentages or "productivity score").
- Keyboard entry for hours or durations.
- Hamburger menus.

## What to send back

1. The playable prototype: 5 tabs + the "It's time" overlay + running session + all sheets, with Alex's data, in dark and light.
2. For each screen: sizes (pt), spacing, colours, type styles, and animation timings.
3. The empty, loading, error and overfull variants.
