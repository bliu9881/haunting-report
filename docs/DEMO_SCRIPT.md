# Demo video script (target 2:45, hard limit 3:00)

Judges may stop watching at 3:00, and Presentation is 20% of the score (plus the Best Demo prize). The video must show the app running on your own device, and be public on YouTube. Use no third-party music, or only tracks from the YouTube Audio Library.

Narration is about 390 words, roughly 2:40 at a calm pace. Read it aloud once with a timer before recording.

---

## Before you record

1. **Warm the cache** (at most 30 minutes before recording). A building's first visit takes up to 20 seconds per section, because the city's datasets are slow on cold queries. Cached, it's instant. Run this from the repo root:
   ```sh
   B=https://perky-mediumvioletred-giraffe-73.hostingersite.com
   for q in "bbl=3013610043&bin=3036097&a=1248+SAINT+MARK%27S+AVENUE" "bbl=1015500031&bin=1050055&a=350+EAST+88+STREET" "bbl=3013770043&a=1321+ST+JOHNS+PLACE"; do
     bbl=$(echo "$q" | sed 's/.*bbl=\([0-9]*\).*/\1/'); bin=$(echo "$q" | grep -o 'bin=[0-9]*' | cut -d= -f2)
     for s in pluto violations complaints service_requests evictions permits ranking; do curl -s -o /dev/null "$B/api/building/$bbl/$s${bin:+?bin=$bin}" & done; wait
     curl -s -o /dev/null "$B/api/building/$bbl/summary${bin:+?bin=$bin}"
   done; curl -s -o /dev/null "$B/neighborhood/BK0802"; echo warmed
   ```
   Then open each demo page once in the browser. Caches reset at midnight New York time and on every deploy, so don't deploy between warming and recording.
2. **Browser:** a clean Chrome window at 1920×1080, zoom 110%, bookmarks bar hidden, no other tabs, notifications off.
3. **Kiro:** have the repo open, with `.kiro/specs/building-linker/requirements.md` ready in a tab. Run the MCP chat prompt (scene 9) once beforehand to confirm `haunting-report` is connected and the answer comes back cached and fast.
4. **Recording:** QuickTime or OBS, 1080p, a decent microphone, a quiet room. Record each scene as a separate take and cut them together. It's far easier than one perfect take.

---

## Script

### 1. The problem (0:00–0:15)
**Screen:** home page, still.
**Say:**
> In New York, the city already knows whether your next apartment is a nightmare: open hazardous violations, no heat every winter, evictions. It's all public. It's spread across seven datasets that don't even agree on how to name a building. Haunting Report stitches them together.

### 2. Search (0:15–0:28)
**Screen:** type `1248 St Marks Ave, Brooklyn`, press Search. The building page opens.
**Say:**
> Type an address. Geosearch finds the building, and if an address is ambiguous, it asks instead of guessing.

### 3. The spirit board (0:28–0:45)
**Screen:** hold on "Among its neighbors". The planchette settles on Possessed.
**Say:**
> Every night, about 172,000 buildings are scored on hazardous violations per apartment and ranked inside their own neighborhood. This one is 266th of 2,955 in Crown Heights North: more haunted than 90 percent of its neighbors. The board is the summary. The real numbers are right underneath it.

### 4. The medium's reading (0:45–1:05)
**Screen:** scroll to "The medium's reading". Click the `(violations)` link at the end of the second sentence; the page jumps to Open violations.
**Say:**
> The medium's reading is an AI summary, but it isn't trusted. It's checked. The server removes any sentence with a number that isn't in the records, or one that gives advice or calls a building safe. Every sentence links to its source.

### 5. The records (1:05–1:22)
**Screen:** on Open violations, point at "23 class C". Click "Show all 20". Scroll to the complaints tally, with heat/hot water at the top.
**Say:**
> Twenty-three immediately hazardous violations open right now, written in plain English instead of legal citations. Complaints by problem: heat and hot water, every winter. Each section loads on its own, so a slow city dataset never holds up the page.

### 6. The neighborhood (1:22–1:35)
**Screen:** scroll up, click "Crown Heights (North)". Hold on the table, then click #1, 1321 St Johns Place. Its board shows Cursed in red.
**Say:**
> Here are the most haunted buildings in the neighborhood. Number one has 169 class C violations in six apartments. Cursed.

### 7. Honest when there's nothing (1:35–1:48)
**Screen:** Home, click the example `350 E 88th St, Manhattan`. Hold on the "No housing records on file" notice.
**Say:**
> And when the records are empty, it says so. An office building with no HPD records isn't a clean building, and the app never pretends it is.

### 8. Built with Kiro: specs and steering (1:48–2:18)
**Screen:** Kiro IDE. Show the `.kiro` tree: six specs and five steering docs. Open `building-linker/requirements.md` and scroll to the note "Confidence is not a usable ranking signal". Then open `steering/deployment.md`.
**Say:**
> I built it in Kiro, spec first. Six specs, each with requirements, design and tasks. And the specs changed when the data disagreed. Geosearch's confidence turned out to be 0.8 for every result, right or wrong, so the rule was rewritten to check the actual address, with the reason kept in the spec. Steering docs carry the hard lessons, like every Hostinger deploy surprise. And about sixty property-based tests guard the ranking, the summary checker and privacy.

### 9. Built with Kiro: MCP (2:18–2:38)
**Screen:** Kiro chat. Type: `Find 1248 St Marks Ave, Brooklyn and summarize its open violations.` Show the `find_building` and `building_report` tool calls and the answer.
**Say:**
> The app ships its own MCP server, so Kiro can query any building straight from chat: find it, read its record, rank its neighbors. No keys needed.

### 10. Close (2:38–2:48)
**Screen:** back to the home page with the logo, or the spirit board.
**Say:**
> Haunting Report. Before you sign the lease, ask the city's own records.

---

## Cutting room (use only if you're under time)
- **Mobile (5 s):** the building page on a phone, scrolling past the board.
- **Ambiguous address (8 s):** `350 88th St, New York, NY` → "That address exists in more than one borough. Which one do you mean?"

## Upload
- **Title:** `Haunting Report: how haunted is your next NYC building? (Kiroween 2026)`
- **Description:** the one-paragraph pitch from `docs/SUBMISSION.md`, plus the live URL and the repo URL.
- **Visibility:** Public.
- **Captions:** turn on auto-captions, then fix "Geosearch", "HPD" and "Kiro".
- **Thumbnail:** `apps/web/app/opengraph-image.png`.
