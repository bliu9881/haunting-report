# Requirements: Haunted Design

**v2, 2026-11-26: the séance ledger.** Reworked with the `frontend-design` skill after it flagged v1 as common defaults (near-black with one bright accent, identical rounded cards, typewriter labels, Creepster). Requirement 1's levels are unchanged. Requirement 2 is replaced by the v2 rules below; Requirement 3 stands. Tokens and type live in `.kiro/steering/design-system.md`.

### v2 Requirement A: The spirit board
1. THE haunting meter SHALL be drawn as a talking-board arc with the five level names, and a planchette resting on the building's level, with the exact rank and percentile beside it in body type.
2. THE planchette MAY settle into place once on first paint (at most 600 ms), and SHALL NOT move under `prefers-reduced-motion: reduce`.
3. THE board SHALL keep the text equivalent from Requirement 1.3.

### v2 Requirement B: One record
1. THE building page SHALL read as one document: sections separated by rules, not boxed cards.
2. On screens 1000 px wide or more, an index of sections SHALL stay visible beside the record and mark the section in view; on smaller screens it SHALL be a row of links under the address.
3. THE violations list SHALL show 5 entries and a "Show all N" button that reveals the rest without a new request.
4. Every page SHALL work from 360 px wide: no horizontal scrolling, tables become stacked rows.
5. Body text and numbers SHALL meet WCAG AA (4.5:1); focus SHALL be visible.

### v2 Requirement C: Pages without content
1. Not found and error pages SHALL use the same voice and say what happened and what to do next.

---
v1 (2026-11-26, superseded where noted):

Give the app a Halloween identity that helps a renter read the report faster, without hiding the numbers or hurting legibility. Judged under Design (20%) and Presentation (20%).

## Requirement 1: The haunting meter
**User story:** As a renter, I want one glance to tell me how bad a building is compared with its neighbors.

Acceptance criteria:
1. WHEN a building is ranked, THE report SHALL show a five-step haunting meter derived only from its share of neighbors it is more haunted than (`moreHauntedThan`, p) and its score:

   | Level | Name | Rule |
   |---|---|---|
   | 0 | Peaceful | score is 0, or p < 0.50 |
   | 1 | Restless | 0.50 ≤ p < 0.75 |
   | 2 | Haunted | 0.75 ≤ p < 0.90 |
   | 3 | Possessed | 0.90 ≤ p < 0.98 |
   | 4 | Cursed | p ≥ 0.98 |

2. THE meter SHALL always appear next to the rank, percentile and score it summarizes, never instead of them (product.md: every claim traces to data).
3. THE meter SHALL have a text equivalent for screen readers ("Haunting level: Possessed, 4 of 5").
4. WHEN a building is not ranked, THE report SHALL NOT show a meter.
5. The level function SHALL be pure and property-tested: levels only go up as p goes up, a score of 0 is always Peaceful, and every p in [0, 1) maps to exactly one level.

## Requirement 2: Look and feel
1. Display fonts are self-hosted (no build-time or runtime font downloads, deployment.md): Creepster for the logo and page titles only, Special Elite (typewriter) for section labels. Body text stays in the system font.
2. Body text and numbers SHALL meet WCAG AA contrast against their background. Keyboard focus SHALL be visible.
3. Motion (fog drift, candle flicker) SHALL stop under `prefers-reduced-motion: reduce`.
4. Every report section reads as a page in a case file: a typewriter label "Case file N of 6 · <dataset>".
5. Loading states use the theme ("Summoning the city's records…") and still say what is happening.
6. The favicon is a ghost.

## Requirement 3: A home page that demos itself
1. THE home page SHALL offer example searches as one-click chips, covering a heavily haunted building, a commercial building with no housing records, and an ambiguous address.
2. THE home page SHALL explain, in three short steps, what the app stitches together (the Frankenstein story): find the building, stitch seven city datasets, rank it against its neighbors.

## Out of scope
Images or illustrations beyond inline SVG; sound; dark/light theme switching.
