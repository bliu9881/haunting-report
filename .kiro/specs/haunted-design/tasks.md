# Tasks: Haunted Design

- [x] 1. Design-system steering doc (`.kiro/steering/design-system.md`): tokens, type, voice, motion
- [x] 2. `hauntingLevel` with example and property tests (Requirement 1.1, 1.5)
- [x] 3. Ghost glyph, favicon, haunting meter with a text equivalent (Requirement 1.2 to 1.4, 2.6)
- [x] 4. Self-hosted Creepster and Special Elite; theme CSS with AA contrast, visible focus, reduced motion (Requirement 2.1 to 2.3)
- [x] 5. Case-file labels and the candle loader on the six report sections (Requirement 2.4, 2.5)
- [x] 6. Home page: example chips and the three-step story (Requirement 3)
- [x] 7. Screenshot review at 1200 px and 500 px; fix the ranking-count grid
- [x] 8. Check the live site after deploy: fonts served from `/_next/static/media` (Creepster 28 KB, Special Elite 53 KB, `font/woff2`), favicon served as SVG, building A rendered with the meter in headless Chrome. Layout shift was not measured

## v2: the séance ledger
- [x] 9. Plan with the `frontend-design` skill; record it in `design-system.md`. Contrast check changed class C red from #d9475c (4.25:1) to #e86677 (5.6:1)
- [x] 10. Fonts (IM Fell English, Atkinson Hyperlegible Next), tokens, base styles; remove Creepster, Special Elite and the fog
- [x] 11. Spirit board meter (v2 A)
- [x] 12. Building page as one record: index, rules instead of cards, 5 violations with "Show all" (v2 B)
- [x] 13. Home, search, neighborhood (stacked rows on small screens), not found and error pages (v2 B.4, C)
- [x] 14. Screenshot review at 1280, 768 and 360 px; fix; deploy and check live. Fixes from the review:
  - The index column pushed the record below it (grid areas fixed).
  - IM Fell's old-style figures made "1321" read as "I32I": digits inside display text now use the body face (`components/fell.tsx`); big figures use Atkinson bold.
  - The planchette was drawn as a long needle that lay flat at "Cursed"; it is now a short teardrop that travels along the arc with its tip on the word.
  - 360 px check through Chrome's DevTools protocol (headless screenshots can't go narrower than about 500 px, which made the earlier phone shots look cut off): home, search, building, neighborhood and not-found pages all have scrollWidth 360, so nothing scrolls sideways
- [x] 15. Logo: three concepts tested at 48, 32 and 16 px; chosen mark is a gold planchette whose lens shows a lit arched tenement window. Header lockup, favicon, 180 px apple-touch icon, 1200×630 Open Graph and Twitter images, theme color
- [x] 16. Mobile audit at 375×812 with touch emulation (Chrome DevTools protocol), 2026-11-26: viewport tag present, no sideways scroll on any page, no text under 12 px, search input 18 px (no iOS zoom). Fixed: 7 tap targets under 24 px (example searches, summary source links), the neighborhood list's 3-column wrap on phones, the truncated placeholder, and Class C's color on phones. After the fixes, 0 of 40 tap targets are under 24 px
