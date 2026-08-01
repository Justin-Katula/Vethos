---
name: "```"
theme: "dark"

colors:
  neutral:
    shade-0: "#FFFFFF"
    shade-1: "#F2F2F2"
    shade-2: "#D8D8D8"
    shade-3: "#B2B2B2"
    shade-4: "#7F7F7F"
    shade-5: "#4C4C4C"
    shade-6: "#191919"
    shade-7: "#000000"
    white: "#FFFFFF"
  laser:
    shade-1: "#F9F5EF"
    shade-2: "#F4ECE0"
    shade-3: "#D9BF94"
    shade-4: "#C9A467"
    shade-5: "#A08352"
    shade-6: "#504129"
    shade-7: "#3C311E"
  silver-tree:
    shade-1: "#EDF6F3"
    shade-2: "#DBEDE7"
    shade-3: "#83C2AD"
    shade-4: "#4FA88B"
    shade-5: "#3F866F"
    shade-6: "#1F4337"
    shade-7: "#173229"
  regent-gray:
    shade-1: "#F2F3F5"
    shade-2: "#E6E7EB"
    shade-3: "#A8ADB9"
    shade-4: "#838B9B"
    shade-5: "#686F7C"
    shade-6: "#34373E"
    shade-7: "#27292E"
  spring-wood:
    shade-1: "#FDFDFC"
    shade-2: "#FCFBFA"
    shade-3: "#F5F3ED"
    shade-4: "#F2EFE6"
    shade-5: "#C1BFB8"
    shade-6: "#605F5C"
    shade-7: "#484745"
  bunker:
    shade-1: "#E6E6E7"
    shade-2: "#CECED0"
    shade-3: "#54565A"
    shade-4: "#0B0E14"
    shade-5: "#080B10"
    shade-6: "#040508"
    shade-7: "#030406"

typography:
  heading:
    fontFamily: "Fraunces"
    fontWeight: 500
  body:
    fontFamily: "Inter"
    fontWeight: 400
  sizes:
    desktop:
      h1: 72px
      h2: 52px
      h3: 44px
      h4: 36px
      h5: 28px
      h6: 22px
      text-large: 22px
      text-medium: 18px
      text-regular: 16px
      text-small: 14px
      text-tiny: 12px
    mobile:
      h1: 44px
      h2: 40px
      h3: 32px
      h4: 24px
      h5: 20px
      h6: 18px
      text-large: 18px
      text-medium: 16px
      text-regular: 12px
      text-small: 12px
      text-tiny: 10px

ui:
  style: "default"
  buttonRadius: 6px
  tagRadius: 4px
  inputRadius: 6px

cards:
  style: "outlined"
  borderWidth: 1px
  dividerWidth: 1px
  radiusLarge: 8px
  radiusMedium: 8px
  radiusSmall: 8px

schemes:
  - name: "Scheme 1"
    background: "neutral-shade-7"
    backgroundHex: "#000000"
    foregroundHex: "#000000"
    textHex: "#ffffff"
    accentHex: "#C9A467"
    borderValue: "#ffffff33"
    useLogoVariant: dark
    cssClass: "scheme-1"
---

# ``` — Design Specification

This file contains machine-readable design tokens in the YAML frontmatter above, and human-readable guidance below.

## Colors

The design uses a **dark** theme with a neutral palette and 5 chromatic palettes.

- **Neutral shades** range from shade-0 (darkest) to shade-7 (lightest), plus white
- **Laser** — primary shade: `#C9A467`
- **Silver Tree** — primary shade: `#4FA88B`
- **Regent Gray** — primary shade: `#838B9B`
- **Spring Wood** — primary shade: `#F2EFE6`
- **Bunker** — primary shade: `#0B0E14`

Use the CSS custom properties from `react/globals.css` for all colors (e.g. `--color-neutral-darkest`, `--color-blue-ribbon`).

## Typography

Headings use **Fraunces** at weight 500. Body text uses **Inter** at weight 400.

The type scale has desktop and mobile sizes. Apply mobile sizes at smaller breakpoints. All values are in `react/globals.css`.

## UI Elements

UI style is **default** with button radius 6px. Cards use the **outlined** style with border-width 1px.

## Color Schemes

Sections use color schemes to control their visual appearance. Each scheme is derived from a single background color — all other colors (text, foreground, accent, border) are automatically computed for optimal contrast.

| Scheme | Background | Text | Accent | Logo | CSS class |
|--------|-----------|------|--------|------|-----------|
| Scheme 1 | Neutral Darkest (#000000) | #ffffff | #C9A467 | dark | `.scheme-1` |

Apply a scheme by adding its CSS class to the section element. See `sitemap.md` for which scheme each section uses.

### Tweaking Schemes

To create visual variation, you can change which scheme a section uses. When switching schemes:

- Swap the CSS class (e.g. change `.scheme-1` to `.scheme-2`)
- All child elements automatically inherit the correct text, accent, and border colors
- Use the matching logo variant (`logo-light.svg` or `logo-dark.svg`) based on the scheme's `useLogoVariant`
- Alternate between light and dark schemes to create visual rhythm
