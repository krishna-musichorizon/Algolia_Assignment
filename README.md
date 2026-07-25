# OpenTable Restaurant Discovery Demo

This project is a small Algolia-backed restaurant discovery experience for OpenTable. It combines a restaurant dataset from two sources, imports it into Algolia, and exposes a modern search UI for both known-item and exploratory discovery.

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

### Index configuration (`scripts/import-algolia.js`)

- **Searchable attributes** are ordered as separate priority tiers — `name > cuisine > dining_style > neighborhood > city > state > address > payment_options > display_location > price_range` — so a restaurant-name match always outranks a cuisine or location match.
- **Facets**: `cuisine`, `price_range`, `neighborhood`, `city`, `dining_style` (all facet-searchable) plus `rating_bucket`.
- **Custom ranking**: `desc(popularity_score) → desc(rating) → desc(reviews_count)` as the tie-breaker after Algolia's built-in relevance criteria.
- **Sort replicas**: two virtual replicas (`_top_rated`, `_price_asc`) that only override `customRanking`, powering a "Sort by" control (Recommended / Top Rated / Price: Low to High) without duplicating data or facet config.
- **Query tuning**: typo tolerance, `queryType: prefixAll`, `ignorePlurals`, `removeWordsIfNoResults: lastWords`, optional words for generic terms (restaurant/bar/grill/cafe), and cuisine synonyms (steakhouse↔steak house, sushi↔japanese, etc.).

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

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Merge the dataset:
   ```bash
   npm run prepare-data
   ```
3. Copy `.env.example` to `.env` and fill in your Algolia app ID, admin API key, and index name. Then import the records (this also configures index settings and the two sort replicas):
   ```bash
   cp .env.example .env   # then edit .env with your credentials
   npm run import-algolia
   ```
4. Add the same app ID, a search-only key, and index name in `index.js`.
5. Run the local demo:
   ```bash
   npm start
   ```
