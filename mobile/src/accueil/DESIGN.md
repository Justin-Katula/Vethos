---
name: Vethos mobile — introduction
description: Implemented native onboarding within the established Vethos identity.
colors:
  background: "#000000"
  background-calm: "#0a0a0a"
  sleep: "#050505"
  surface: "#141414"
  surface-selected: "#232323"
  surface-raised: "#2f2f2f"
  text: "#f2f2f2"
  text-secondary: "#bebebe"
  text-muted: "#8d8d8d"
  line: "rgba(242, 242, 242, 0.16)"
  line-strong: "rgba(242, 242, 242, 0.3)"
  signal: "#f0525f"
  task-default: "#505359"
  goal-default: "#e03131"
  anchor-default: "#2c3a56"
typography:
  display:
    fontFamily: "Geist_600SemiBold"
    fontSize: "43px"
    lineHeight: "49px"
    letterSpacing: "-1.1px"
  headline:
    fontFamily: "Geist_600SemiBold"
    fontSize: "34px"
    lineHeight: "41px"
    letterSpacing: "-1.1px"
  body:
    fontFamily: "Geist_400Regular"
    fontSize: "16px"
    lineHeight: "24px"
  action:
    fontFamily: "Geist_600SemiBold"
    fontSize: "16px"
  label:
    fontFamily: "Geist_400Regular"
    fontSize: "13px"
  help:
    fontFamily: "Geist_400Regular"
    fontSize: "12px"
    lineHeight: "18px"
  input-large:
    fontFamily: "Geist_500Medium"
    fontSize: "34px"
    letterSpacing: "-0.8px"
  input-number:
    fontFamily: "GeistMono_400Regular"
    fontSize: "24px"
    letterSpacing: "0px"
rounded:
  segment: "2px"
  mark: "3px"
  day: "8px"
  budget: "10px"
  session: "12px"
  action-choice: "14px"
  signature: "16px"
spacing:
  compact: "8px"
  small: "12px"
  inline: "16px"
  choice: "18px"
  action: "20px"
  columns: "24px"
  page: "26px"
  section: "28px"
components:
  button-primary:
    backgroundColor: "{colors.text}"
    textColor: "{colors.background}"
    typography: "{typography.action}"
    rounded: "{rounded.action-choice}"
    padding: "0px 20px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.text-secondary}"
    typography: "{typography.action}"
    rounded: "{rounded.action-choice}"
  choice:
    backgroundColor: "transparent"
    textColor: "{colors.text}"
    rounded: "{rounded.action-choice}"
    padding: "18px"
  choice-selected:
    backgroundColor: "{colors.surface-selected}"
    textColor: "{colors.text}"
    rounded: "{rounded.action-choice}"
    padding: "18px"
  day-selected:
    backgroundColor: "{colors.text}"
    textColor: "{colors.background}"
    rounded: "{rounded.day}"
  session:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.session}"
    padding: "18px"
---

# Design System: Vethos mobile — introduction

## Overview

**Creative North Star: "Their own week, then their real week"**

The introduction persuades with the user's own truth, never with invented numbers. Recognition comes before confrontation; the loss is computed from what they tapped; the thing they named becomes their first commitment; and from the commitment choice onward every visual is a real Vethos component fed by the real planner.

Arc: name → what matters → "you already know" (recognition) → what you keep putting off (their words) → which evenings last week ended without it (seven real, dated evenings) → silence → "N evenings a week is N×52 evenings a year" (a 52 × 7 year grid lights their weekdays) → "“I'll start tomorrow.” You said it N times last week." → the Vethos logo → Task / Goal / Anchor → the real dial → the real week → the app.

Sources: `Introduction.tsx` (story), `recit-introduction.tsx` (week audit, year grid, counter, logo), `SuiteIntroduction.tsx` (commitment, protection, time), `engagement-introduction.tsx` (mini-weeks drawn in the CarteSemaine language), `apercu-introduction.tsx` (the app's `Horloge` dial, `CarteSemaine` and `AgendaJour`), `../ui/Roue.tsx` (wheels), `modele-introduction.ts` (product logic, unchanged apart from the added `differe` step).

## Scenes

- **Name, priority** — calm near-black; field focused at once; priorities in two groups of three.
- **Recognition** — "You already know what matters to you." No background word. Action: "Then what is?"
- **Putting off** — free text with three starters per priority; the answer is reused everywhere after.
- **Week audit** — seven dated evening tiles appear after a 0.9 s beat; a tapped evening fills red from the bottom.
- **Silence** — a red point decelerates and stops; auto-advance (screen readers get Continue).
- **Year** — counter and 52 × 7 grid fill together (1.5 s), then everything stops; the action appears only after.
- **Thought** — the user's sentence alone, then last week's count, then the action after 2.6 s.
- **Activation** — the real logo (`assets/vethos-logo.png`) arrives with one haptic; no ring animation.
- **Commitment** — cards show a mini-week in the app's map language (Task: sessions working back from DUE; Goal: hours spread; Anchor: same time, same days). The chosen card becomes the form; the name is pre-filled with what they put off; parameters use wheels. No corner mark.
- **Protection** — a phone: the focus session on top, anonymous apps below that dim and lock. No explanatory copy.
- **Time** — the home screen's 24 h dial (`Horloge`) with free time in its centre; wheels for bedtime, wake-up, work/school hours; construction orbits the commitment arc around the real dial and locks it into the engine's slot; the week is the real `CarteSemaine` plus `AgendaJour`.
- **Enter Vethos** — chrome fades, the transparent modal fades over the real app. No black frame.

## Wheels

Every time of day, duration and date in the app is set on a wheel (`RoueHeure`, `RoueDuree`, `RoueJour` in `src/ui/Roue.tsx`), written in-house on a native `ScrollView`: snap per detent, 3D faces, a selection haptic per detent, five detents visible, VoiceOver adjustable. Hours and minutes loop (24 h is a cycle). A wheel emits nothing until it has settled on its starting value, and snaps back when a rule refuses a value. The package tried first (`@quidone/react-native-wheel-picker`) could open on the wrong detent on iPhone and report it as a real value; it was removed.

## Rules the introduction enforces

- Order: name → priorities (multi) → what keeps getting pushed (multi) → "You already know what matters to you." rises, "Then why do you keep pushing it?" completes it → how often he says "tomorrow" → for each thing: since when, how much work (one-time things), how much he really does now → one combined result → "I'll start tomorrow." → logo → start with ONE of the things.
- The trap (`bilan` in `choix-introduction.ts`, tested): the evenings he pushes, since he decided, used for that thing alone. One-time things: when it could have been done and how many times over, and the date at his current pace (or "never"). Repeated things: sessions that never happened, and this year at his pace versus with those evenings.
- Nothing is typed after the name. Work and School can both be checked and are pre-checked from his priorities; "Nothing fixed" is always alone. Free time is the union of fixed ranges, never their sum.
- A Task deadline is at most 30 days ahead; durations go up to 150 h (a Goal up to 100 h a week). A night lasts 6 to 10 h; after the introduction it moves at most 2 h in total around the declared night.
- Replaying the introduction creates the commitment for real.

## Motion

Three tiers only: micro 150 ms (selection, press, dimming, a tile filling), transformation 380 ms (card expansion, scene fades 150 out / 300 in), cinematic 780–1500 ms (silence point, the year filling, the logo arriving, the placement orbit). Entrances use `cubic-bezier(0.23, 1, 0.32, 1)`; functional movement uses `cubic-bezier(0.77, 0, 0.175, 1)`. No word-by-word text. Pauses are deliberate and short: 0.9 s before the week audit, 1.4 s before the count under the thought.

Reduce Motion: moves become 120 ms fades; the year, the mini-weeks and the placement render in their final state; meaningful haptics (year complete, logo, lock) remain. Screen readers: silence and construction expose explicit actions; delayed actions are available immediately.

## Colors

Black `#000` is silence; `#0a0a0a` is calm. Red is reserved for loss and for the brand: the silence point, the evenings the user admits, the year those evenings add up to, the logo, and errors. Everything from the commitment onward uses the app's own theme tokens and the planner's colour families.

## Do's and Don'ts

- **Do** build emotion from the user's own answers; never invent statistics.
- **Do** reuse the app's real components (`Horloge`, `CarteSemaine`, `AgendaJour`) instead of drawing look-alikes.
- **Do** set every time, duration and date with a wheel.
- **Don't** add explanatory helper copy; every line on screen either asks, shows or acts.
- **Don't** reintroduce emoji as icons, word-by-word text, loaders or artificial waits.
- **Don't** present the anonymous app grid as the user's real Screen Time selection.
- **Don't** treat browser previews as native acceptance: `react-native-web` always reports a screen reader and ignores `contentOffset`; haptics, keyboard and `LayoutAnimation` morphs are native-only.
