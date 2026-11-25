# Haunting Report: product rules

A renter types an NYC address and gets a dossier on the building, assembled from separate city datasets. Entered in Kiroween 2026, Frankenstein category.

## Principles
- Every claim in the UI or the AI summary must trace to a record in a named dataset. No invented facts.
- The AI summary only restates what the linked data supports. If the data is thin or empty, say so.
- Never present the haunting score as legal advice or a safety guarantee. Show a short disclaimer on every report.
- A building with zero housing records (commercial, new, or unmatched) gets an explicit "no records found" state. It must never look like a clean bill of health.
- The datasets lag and are incomplete. Show "data as of" dates per source.
- Every report shows the address the app resolved, with a "not this building?" link back to search. The geocoder can return a near miss, so the user must be able to see and correct it.

## Scope limits (10-day solo build)
- NYC only. Keyless public APIs only.
- No accounts. Building reports are fetched live and cached in memory.
- One database: Hostinger MySQL holds only the precomputed neighborhood rankings, refreshed nightly (spec: neighborhood-rankings). Nothing user-specific is stored.
- Rankings never show owner names.
- Don't add datasets beyond those in docs/data-sources.md without a spec update.
