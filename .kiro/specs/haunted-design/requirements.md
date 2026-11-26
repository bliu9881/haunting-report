# Requirements: Haunted Design

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
