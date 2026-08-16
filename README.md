# OpenTable Restaurant Discovery Demo

This project is a small Algolia-backed restaurant discovery experience for OpenTable. It combines a restaurant dataset from two sources, imports it into Algolia, and exposes a modern search UI for both known-item and exploratory discovery.

**Live demo**: [https://agt.krish.info](https://agt.krish.info)

**Demo video**: [https://www.youtube.com/watch?v=C1pY1KYUvbc](https://www.youtube.com/watch?v=C1pY1KYUvbc)

## What the demo does

- Joins restaurant data from `dataset/restaurants_list.json` and `dataset/restaurants_info.csv`
- Cleans and enriches the records with cuisine, rating, reviews, price range, neighborhood, and geolocation
- Indexes the merged records in Algolia with search, filter, ranking, sorting, and geo-awareness in mind
- Provides a full front-end demo for search, refinement, sorting, and discovery — with a reservation call-to-action tying the experience back to bookings

## Approach

### Data preparation

`scripts/prepare-data.js` joins the base JSON restaurant list with metadata from the CSV on `objectID`, and computes several derived fields:

- `cuisine`, `dining_style`, `price_range`, `neighborhood` — pulled directly from the CSV
- `price_level` — a numeric 1-3 mapping of `price_range`, so price can be sorted, not just filtered
- `rating_bucket` — a discrete bucket (Excellent / Very Good / Good / Average / Unknown) derived from the continuous `rating`, used for faceting
- `popularity_score` — `rating × log10(1 + reviews_count)`, a log-dampened score so a 5★ restaurant with 3 reviews doesn't outrank a 4.7★ with 5,000 reviews
- `display_location` — a human-readable `"neighborhood, city"` string, only joined when the two differ (fixed a data bug where ~50% of records had a neighborhood field identical to the city, producing duplicated text like `"Carbondale, Carbondale"`)
- `name_condensed` — a space-stripped, lowercased version of the restaurant name (e.g. `"mamasfishhouse"`). Testing turned up a real gap: Algolia's typo tolerance handles character-level mistakes, not missing word boundaries, so a concatenated query like `"mamasfishhouse"` matched nothing against the normal `name` field. Indexing this extra field fixes it, since a field with no separators is indexed as a single token, making the concatenated query an exact match. Trade-off: it only covers names actually in the dataset, not concatenated cuisine or location terms.

### Index configuration (`scripts/import-algolia.js`)

- **Searchable attributes** are ordered as separate priority tiers — `name > cuisine > dining_style > neighborhood > city > state > address > payment_options > display_location > price_range > name_condensed` — so a restaurant-name match always outranks a cuisine or location match, with `name_condensed` last as a fallback for concatenated queries.
- **Facets**: `cuisine`, `price_range`, `neighborhood`, `city`, `dining_style` (all facet-searchable) plus `rating_bucket`.
- **Custom ranking**: `desc(popularity_score) → desc(rating) → desc(reviews_count)` as the tie-breaker after Algolia's built-in relevance criteria.
- **Sort replicas**: three virtual replicas (`_top_rated`, `_price_asc`, `_price_desc`) that only override `customRanking`, powering a "Sort by" control (Recommended / Top Rated / Price: Low to High / Price: High to Low) without duplicating data or facet config.
- **Query tuning**: typo tolerance, `queryType: prefixAll`, `ignorePlurals`, `removeWordsIfNoResults: lastWords`, optional words for generic terms (restaurant/bar/grill/cafe), and cuisine synonyms (steakhouse↔steak house, sushi↔japanese, etc.).
- **Price-intent Rules**: testing found that `"$50"` matched the right price tier (Algolia strips the `$`, leaving the token `50`), but `"50 dollars"` or `"50 USD"` didn't, those tokens matched noise in restaurant *names* instead, since `name` outranks `price_range`. Four Algolia Rules (`price-intent-30-dollars`, `price-intent-30-usd`, `price-intent-50-dollars`, `price-intent-50-usd`) detect that phrasing and apply a `price_range` filter directly, replacing the text query entirely. Scope limit: Rules only match literal words, not arbitrary numbers, so this covers the two real price boundaries in the dataset (30, 50) but wouldn't generalize to `"40 dollars"` without a rule per number.

### Relevance strategy

- Exact name and cuisine matches rank above generic location matches
- Highly rated, well-reviewed restaurants are favored via custom ranking
- Location-aware ranking when geolocation is available, with a **graceful out-of-coverage fallback**: if the nearest result is implausibly far (>150km), the app drops geo-bias entirely and shows the default popularity ranking instead of a meaningless "nearest US city to your location" ordering — this was tested directly against a real out-of-coverage case (Sydney, AU) rather than assumed
- Typo-tolerant, prefix-matching query behavior for common search mistakes

### UX story

The interface supports two user personas from the assignment:

- **Known-item search**: users who know exactly what they want and search by restaurant name, with a "Reserve" call-to-action on every result (using the `reserve_url` field) to tie search directly to the booking outcome
- **Open-ended discovery**: users who are browsing and want inspiration — hero cuisine chips, a full faceted filter panel (Cuisine, City, Price, Rating, Dining Style, Neighborhood) with multi-select checkboxes, per-facet search, and "show more values," plus a "Sort by" control

### Location awareness

- A contextual inline link ("📍 Enable location to see nearby results") requests permission only when clicked, rather than interrupting the page load with a browser prompt the user has no context for
- Already-granted/denied permission state is detected via the Permissions API, so returning users aren't asked again
- Once granted, a status line reflects what's actually happening: `"Showing results near <neighborhood, city>"` when nearby results exist, or the out-of-coverage fallback message when they don't

### Mobile / touch

- The filter panel collapses behind a "Filters" toggle on narrow screens (with a working expand/collapse, not just a static chevron) so results are visible immediately without scrolling past every facet
- Checkbox tap targets are sized for touch, not just mouse precision

### Map view

- A List/Map toggle above the results lets users browse either as a list or visually on a map, both stay in sync with the current search, facets, and sort
- Built with Leaflet and free OpenStreetMap tiles rather than Google Maps, avoiding a Google Cloud billing/API key requirement that would add setup friction for anyone running this demo
- Switching views reuses the search results already in memory (no extra Algolia calls), and markers use each record's `_geoloc`, auto-fit to the bounds of the current results, and show a popup with photo, name, rating, and price range on click

### Shareable search links

- The full search state (query, selected facets, sort option, page) syncs into the URL via `history.replaceState` after every search, with no page reload
- A "Share this search" button copies the current URL to the clipboard, with a visible confirmation and a `window.prompt` fallback if clipboard access is blocked
- Geolocation is deliberately excluded from the URL for privacy — sharing a link shouldn't leak the sharer's exact coordinates, so whoever opens it gets their own fresh location prompt instead
- On page load, the URL is read back to restore that exact state before the first search fires, so a shared link reproduces the same results

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Merge the dataset:
   ```bash
   npm run prepare-data
   ```
3. Copy `.env.example` to `.env` and fill in your Algolia app ID, admin API key, and index name. Then import the records (this also configures index settings and the three sort replicas):
   ```bash
   cp .env.example .env   # then edit .env with your credentials
   npm run import-algolia
   ```
4. Add the same app ID, a search-only key, and index name in `index.js`. Use a permanent, non-expiring key scoped to the primary index and its replicas, not a temporary/debug key (see Notes below).
5. Run the local demo:
   ```bash
   npm start
   ```

### Deploying

This is a static site, there's no backend or server process, so it deploys to any static host:

```bash
npm run build
```

This outputs static HTML/JS/CSS to `dist/`. Point your host's build command at `npm install && npm run build` and its publish directory at `dist`. No environment variables are needed at deploy time, `index.js` embeds the Algolia app ID and public search-only key directly (safe, since it's a search-only key), and the admin key in `.env` is only ever used locally by `import-algolia.js`.

## Notes

- **Search key hygiene**: the search-only key originally in `index.js` turned out to be a temporary "debug" key with an expiration and a restriction to a single index, it would have silently broken the demo (and the sort replicas, which live in separate indices) once it expired. Replaced with a permanent key correctly scoped to the primary index and all replicas.
- **Virtual replicas don't passively inherit everything**: settings pushed via `setSettings()` (searchable attributes, facets, synonyms declared in code) apply consistently across the primary index and its virtual replicas. But synonyms added directly through the Algolia dashboard, outside that script, only landed on the primary, the sorted views silently lost that synonym matching. The fix pattern that recurred twice (once for synonyms, once for the price-intent Rules below): explicitly pass `forwardToReplicas: true` when writing rules/synonyms directly via the API, don't assume a replica mirrors a change made outside `setSettings()`.
- **Rules quota**: batch-saving multiple Rules at once via `saveRules()` failed with `"Rules quota exceeded"` on this plan, even for just 4 rules, while saving the exact same rules one at a time via sequential `saveRule()` calls succeeded. `import-algolia.js` saves price-intent rules in a loop for this reason.
