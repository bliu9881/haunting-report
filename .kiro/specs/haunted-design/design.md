# Design: Haunted Design

Tokens, type and voice live in `.kiro/steering/design-system.md`, so every later UI change follows them.

## Pieces
- `apps/web/lib/haunting.ts`: `hauntingLevel(moreHauntedThan, score)`, pure, with property tests (`test/haunting.test.ts`).
- `apps/web/app/components/haunt-meter.tsx`: five inline-SVG ghosts lit up to the level, the level name in the typewriter face and one plain sentence saying what it means. `role="img"` with a text label; the visual parts are `aria-hidden`.
- `apps/web/app/components/ghost.tsx`: the ghost glyph, shared by the logo, the meter and the favicon (`app/icon.svg`).
- `apps/web/app/globals.css`: tokens, fog layer, case-file panels, meter, candle loader, reduced-motion overrides.

## Fonts
`@fontsource/creepster` and `@fontsource/special-elite` are npm packages holding the `.woff2` files. `globals.css` imports their CSS, so webpack copies the fonts into `.next/static/media` at build time. There are no Google Fonts requests at build or run time. `next/font/google` was avoided because it downloads fonts while building, which adds a failure point on Hostinger's build servers.

## Where the theme shows
| Place | Theme element | Function it serves |
|---|---|---|
| Ranking panel | Haunting meter | One-glance severity, next to the exact rank and score |
| Report sections | "Case file N of 6 · source" label | Shows the report is six sources, each named |
| Loading | Candle and "Summoning the city's records…" | Says a city dataset is being queried |
| Home | Example chips, three numbered steps | Lets a judge demo in one click; tells the Frankenstein story |
| Neighborhood list | Top three rows tinted | Draws the eye to the worst buildings |

## Checked
Headless Chrome screenshots at 1200 px and 500 px of the home page, building A and Crown Heights (North). A layout fix came out of the review: the six ranking counts wrapped badly, so "36 months" moved into one caption, and the apartment count (already in the score line) left that grid.
