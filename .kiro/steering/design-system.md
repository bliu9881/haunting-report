# Design system

Spec: haunted-design. Applies to everything in `apps/web`.

## Principles
- Spooky framing, plain facts. The theme names things (haunting levels, "case file", "summoning"); the numbers, dates and sources stay literal and visible.
- Never let a theme element replace a number. The haunting meter sits next to the rank it summarizes.
- Legibility first: body text in the system font, display fonts only for the logo, page titles and section labels.

## Tokens (`apps/web/app/globals.css`)
| Token | Use |
|---|---|
| `--bg` #0b0a10, `--panel` #15121d, `--line` #2a2435 | Night background, case-file panels, rules |
| `--text` #ede8f5, `--muted` #a79cba | Body, secondary text (both pass AA on `--panel`) |
| `--pumpkin` #ff7a1a | Links, accents, class B |
| `--blood` #ff4d6d | Class C (immediately hazardous) and "Cursed" |
| `--ecto` #7cf2b0 | "Peaceful" and good news |

## Type
- `--font-display`: Creepster (self-hosted via `@fontsource/creepster`). Logo, h1 only.
- `--font-label`: Special Elite (`@fontsource/special-elite`). Section labels, badges, meter names.
- Body: `system-ui`.

## Voice
- Section loading: "Summoning the city's records…"
- Empty states say what an empty result can mean, in plain words.
- No stake inflation: "Cursed" is a label for the top 2% of a neighborhood, explained in the meter's caption.

## Motion
Fog drift and candle flicker only, both disabled under `prefers-reduced-motion: reduce`.
