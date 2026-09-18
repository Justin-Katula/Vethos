# Vethos Design Contract

Vethos is a desktop operating board for focus time. It should feel calm, local,
and decisive: the app has already done the arithmetic, so the user reads the
next useful fact instead of hunting for one.

## Visual World

- Strictly neutral greys, thin rules, compact spacing. The interface carries no
  hue of its own: light mode is a neutral off-white, dark mode is a true black
  canvas with neutral panels lifted above it. Green is banned outright,
  including as a tint — the earlier grey-green enamel is gone.
- Geist for interface text. Geist Mono for hours, durations, totals, and other
  values that compare in columns.
- One red, `#C1121F`, for the present moment, active constraints, primary
  blocking actions, and true attention states.
- Fixed obligations use quiet matte category colors. Planned blocks use a small
  semantic set: task red, objective slate, ancre ink blue.
- Corners stay small, generally 3-8 px. Avoid pill shapes for text controls.

## Layout

- The first screen of the authenticated app is the product itself: left rail,
  date, 24-hour clock, daily board, factual signals, and cumulative projection.
- Do not introduce marketing heroes, decorative cards, floating orbs, gradient
  backgrounds, or glow layers.
- Page sections are unframed layouts or single bordered panels. Avoid cards
  inside cards.
- Dense product screens should favor scan lines, tables, rows, and stable
  controls over roomy promotional composition.

## Interaction

- Motion is quiet and functional: short page changes, modest row/block
  transitions, and reduced-motion support.
- Active navigation uses a stable left rule, not a moving capsule.
- Pressed controls move down slightly. Focus states are visibly red.
- The block overlays may remain black and stark, but their text colors must be
  explicit and their main action must not rely on global light-theme aliases.

## Voice

- French, direct, factual, tutoiement.
- Explain calculations and constraints without hype. Avoid fake certainty such
  as "100 % sous contrôle" unless the engine proves it.
- Preserve the product distinction between Planifier and Bloquer.
