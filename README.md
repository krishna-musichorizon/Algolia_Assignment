# OpenTable Restaurant Discovery Demo

This project is a small Algolia-backed restaurant discovery experience for OpenTable. It combines a restaurant dataset from two sources, imports it into Algolia, and exposes a modern search UI for both known-item and exploratory discovery.

## What the demo does

- Joins restaurant data from `dataset/restaurants_list.json` and `dataset/restaurants_info.csv`
- Cleans and enriches the records with cuisine, rating, reviews, price range, neighborhood, and geolocation
- Indexes the merged records in Algolia with search, filter, ranking, and geo-awareness in mind
- Provides a simple front-end demo for search, refinement, and discovery

## Approach

### Data preparation

The merge script creates a richer record by combining the base JSON restaurant list with metadata from the CSV, including:

- `cuisine`
- `rating`
- `reviews_count`
- `price_range`
- `dining_style`
- `neighborhood`
- `display_location`
- `popularity_score`

These fields support both search relevance and filtering.

### Relevance strategy

The Algolia index is configured to favor:

- exact name and cuisine matches
- highly rated and well-reviewed restaurants
- location-aware results when geolocation is available
- typo-tolerant behavior for common search mistakes

### UX story

The interface supports two user personas from the assignment:

- users who know exactly what they want and search by restaurant name
- users who are browsing and want inspiration through cuisine, price, and neighborhood exploration

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Merge the dataset:
   ```bash
   npm run prepare-data
   ```
3. Copy `.env.example` to `.env` and fill in your Algolia app ID, admin API key, and index name. Then import the records:
   ```bash
   cp .env.example .env   # then edit .env with your credentials
   npm run import-algolia
   ```
4. Add the same app ID, search key, and index name in `index.js`.
5. Run the local demo:
   ```bash
   npm start
   ```

## Interview talking points

You can explain the solution like this:

- I transformed a split dataset into a single, searchable restaurant index.
- I chose searchable attributes for names, cuisine, and location to support known-item queries and discovery.
- I used ranking and filtering to surface popular and high-quality restaurants.
- I added location-aware search to make the experience feel more useful for real-world restaurant discovery.

## Notes

- The demo uses browser geolocation when available.
- If geolocation is denied, it falls back to the default behavior and still returns relevant results.
