# Requirements: AI Summary ("The medium's reading")

A short plain-English reading of one building's records, written by Gemini from the same data the report shows, and checked against it before it is shown. It sits at the top of the building page, above the ranking.

Status: draft. Decisions D1 to D4 need the owner's sign-off. Blocked until a Gemini project can serve requests. On 2026-11-26 the first project returned `402 RESOURCE_EXHAUSTED` ("prepayment credits are depleted"), and a new project returned `403 PERMISSION_DENIED` ("free tier is not available for this project"). Per Google's troubleshooting guide, free-tier eligibility is decided per account and project, and a new key in the same project doesn't help; the fix is linking billing and prepaying.

## Requirement 1: Only what the records say
**User story:** As a renter, I want a quick reading I can trust, so I don't have to read six sections to get the gist.

Acceptance criteria:
1. THE model SHALL receive only the building's report data: the ranking (if any), building facts, open violation counts and up to 5 recent open violation texts, complaint counts by category, the top 311 types, eviction counts and dates, and the permit count. Nothing else.
2. THE model SHALL return structured JSON: 2 to 5 sentences, each with the ids of the sections it relies on (`ranking`, `pluto`, `violations`, `complaints`, `service_requests`, `evictions`, `permits`).
3. **Server-side check.** Before showing it, THE system SHALL drop any sentence that:
   a. cites a section that did not load, or cites none;
   b. contains a number (digits, or a number word up to twenty) that does not appear in the data given to the model;
   c. gives advice ("you should", "avoid", "don't rent") or speculates ("probably", "likely", "may be because").
4. IF fewer than 2 sentences survive, THEN THE summary SHALL NOT be shown, and the page SHALL say a summary isn't available for this building.
5. Each sentence SHALL show which sections it comes from, as links that jump to those sections.
6. THE summary SHALL be labelled as AI-written and checked against the records below, with the product disclaimer (not legal advice).
7. WHEN every housing section is empty, THE summary SHALL say so plainly and SHALL NOT describe the building as safe or well kept (product.md).

## Requirement 2: Tone
1. The title is themed ("The medium's reading", design-system.md); the sentences are plain, factual and neutral, with no spooky wording inside them.
2. No names of people, and no apartment numbers. The input already contains no names (building-dossier Requirement 4); apartment numbers are removed from violation texts before they are sent.

## Requirement 3: Cost and limits
1. **D1, model (recommended): `gemini-3.8-flash`, set by `GEMINI_MODEL`, with no `temperature`.** Gemini 3.6+ models ignore sampling parameters and will reject them in a future release (Google's troubleshooting guide), so determinism comes from structured output and the server-side check instead. It is the current Flash model listed for this key (2026-11-26). A summary is about 1,500 input and 300 output tokens, well under a cent on the paid tier.
2. **D2, when it runs (recommended): automatically, once the sections it needs have loaded, and cached for 6 hours per building with the sections.** The alternative is a "Read the records" button, which uses fewer calls but makes the demo one click longer.
3. **D3, spending cap (recommended):** at most 20 Gemini calls per minute and 500 per day per server process. Beyond that, the page says the summary is unavailable and the rest of the report is unaffected.
4. Each Gemini call SHALL time out after 15 seconds, without retrying a 4xx. Failures are not cached.
5. `GEMINI_API_KEY` SHALL come from the environment only, be sent in the `x-goog-api-key` header (never in a URL), and never be logged.

## Requirement 4: Data use
**D4: the paid tier.** The free tier isn't available to this account's projects (see Status), so this is no longer a choice. On the paid tier, prompts and responses are not used to improve Google's products.

## Out of scope
Chat or follow-up questions; summaries of neighborhood pages; languages other than English.
