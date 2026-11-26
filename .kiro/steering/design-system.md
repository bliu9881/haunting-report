# Design system: the séance ledger

Spec: haunted-design (v2, 2026-11-26). Applies to everything in `apps/web`. Built with the `frontend-design` skill (`.kiro/skills/frontend-design`).

## Concept
A 19th-century spiritualist medium's record of a building, kept like a housing ledger. The framing is a séance; the facts are literal. The concept comes from what the product already does: "the medium's reading" is an AI summary checked against the city's records.

## Principles
- **One bold element: the spirit board.** The haunting meter is a talking-board arc with five levels and a planchette on the building's level, its exact rank printed beside it. It is the only animated moment (one settle on load). Everything else is quiet.
- **One document, not a stack of cards.** A building is one continuous record with sections separated by rules, plus an index of sections (sticky on wide screens). Boxes only where they mean something: the reading and the "no housing records" notice.
- **Spooky framing, plain facts.** Section titles and the meter carry the theme; numbers, dates and sources stay literal and visible. The meter never replaces the rank it summarizes.
- **Avoid template chrome** (from the skill): no all-caps eyebrow labels over headings, no middle-dot meta strings, no monospace data labels, no "→" on links, no identical rounded cards with one shadow.

## Logo
- **Mark:** a talking-board planchette in candle gold, whose round lens looks into a lit, arched tenement window in bone. The séance and the building in one shape. Solid fills only, so it reads at 16 px. Chosen over a keyhole planchette (the keyhole vanished at 16 px) and a tenement facade (generic, unreadable small).
- **Lockup:** the mark left of "Haunting Report" in IM Fell English, one color. Source: `apps/web/app/components/logo.tsx`; favicon `app/icon.svg`; `app/apple-icon.png` (180 px) and `app/opengraph-image.png` / `twitter-image.png` (1200×630), rendered from `docs/brand/*.html` with headless Chrome.
- Keep the geometry identical in all four files.

## Color (`apps/web/app/globals.css`)
| Token | Hex | Use | Contrast on `--plum` |
|---|---|---|---|
| `--plum` | #1d1424 | Page | |
| `--plum-deep` | #150e1a | Wells (meter, inputs) | |
| `--bone` | #eee4d3 | Body text | 14.2 |
| `--ash` | #ab9fb3 | Secondary text | 7.1 |
| `--gold` | #e3a34a | Links, accents, planchette, class B | 8.2 |
| `--blood` | #e86677 | Class C, "Cursed" | 5.6 (the planned #d9475c was 4.25, below AA) |
| `--moss` | #8fc49a | "Peaceful", good news | 8.9 |
| `--rule` | rgba(238, 228, 211, 0.14) | Rules between sections | |

## Type
- **IM Fell English** (`@fontsource/im-fell-english`, OFL): headlines, the address, section titles, the spirit board. Large, so the old letterpress forms carry the mood. Italic for the reading's title only.
- **Atkinson Hyperlegible Next** (`@fontsource/atkinson-hyperlegible-next`, OFL): everything else, including every number that matters. IM Fell's old-style 1 reads as a capital I, so big figures use Atkinson bold. Tabular figures only in tables and tallies; elsewhere proportional, so numbers don't look monospaced.
- Scale (1.25): 13, 15, 17 (body), 21, 27, 34, 42, 53 px. Body line height 1.6; measure under 70 characters.
- Sentence case everywhere. No letter-spaced capitals.

## Layout
- Left aligned. Content column up to 680 px; on screens of 1000 px and wider, a 180 px index column on the left.
- Building page order: address and identifiers, spirit board with rank, the medium's reading, then the six records, then sources.
- Violations list shows 5, with "Show all N".

## Voice
- Loading: "Consulting the city's records…" (one line per section, no animation).
- Empty states say what an empty result can mean, in plain words.
- "Cursed" is the top 2% of a neighborhood, said in the meter's caption.

## Motion
Only the planchette's settle on first paint (600 ms). Disabled under `prefers-reduced-motion: reduce`. No fog, no flicker.
