const fs = require('fs').promises;
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'dataset');
const INPUT_JSON = path.join(DATA_DIR, 'restaurants_list.json');
const INPUT_CSV = path.join(DATA_DIR, 'restaurants_info.csv');
const OUTPUT_JSON = path.join(DATA_DIR, 'merged_restaurants.json');

function parseCsv(raw) {
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const header = lines[0].split(';').map((value) => value.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(';').map((value) => value.trim());
    const row = {};
    header.forEach((key, index) => {
      row[key] = cells[index] || '';
    });
    return row;
  });
}

function normalizePriceLevel(priceRange) {
  switch (priceRange) {
    case '$30 and under':
      return 1;
    case '$31 to $50':
      return 2;
    case '$50 and over':
      return 3;
    default:
      return 0;
  }
}

function ratingBucket(rating) {
  if (rating >= 4.5) return 'Excellent';
  if (rating >= 4.0) return 'Very Good';
  if (rating >= 3.5) return 'Good';
  if (rating > 0) return 'Average';
  return 'Unknown';
}

function popularityScore(rating, reviewsCount) {
  return rating * Math.log10(1 + reviewsCount);
}

async function main() {
  const jsonRaw = await fs.readFile(INPUT_JSON, 'utf8');
  const csvRaw = await fs.readFile(INPUT_CSV, 'utf8');

  const restaurants = JSON.parse(jsonRaw);
  const extraRows = parseCsv(csvRaw);
  const extraMap = new Map(extraRows.map((row) => [String(row.objectID), row]));

  const merged = restaurants.map((restaurant) => {
    const extra = extraMap.get(String(restaurant.objectID)) || {};
    const rating = parseFloat(extra.stars_count) || 0;
    const reviewsCount = parseInt(extra.reviews_count, 10) || 0;
    const priceRange = extra.price_range || '';
    const neighborhood = extra.neighborhood || '';

    return {
      ...restaurant,
      cuisine: extra.food_type || '',
      dining_style: extra.dining_style || '',
      price_range: priceRange,
      price_level: normalizePriceLevel(priceRange),
      neighborhood,
      rating,
      reviews_count: reviewsCount,
      phone_number: extra.phone_number || restaurant.phone || '',
      rating_bucket: ratingBucket(rating),
      popularity_score: popularityScore(rating, reviewsCount),
      display_location: neighborhood && neighborhood !== restaurant.city
        ? `${neighborhood}, ${restaurant.city}`
        : restaurant.city,
      featured_label: rating >= 4.5 ? 'Top Rated' : undefined,
      _tags: [
        extra.food_type || '',
        extra.dining_style || '',
        neighborhood,
        restaurant.city,
      ].filter(Boolean),
    };
  });

  const missing = restaurants.filter((restaurant) => !extraMap.has(String(restaurant.objectID)));
  console.log(`Built ${merged.length} merged records.`);
  console.log(`Missing CSV records for ${missing.length} restaurant(s).`);

  await fs.writeFile(OUTPUT_JSON, JSON.stringify(merged, null, 2), 'utf8');
  console.log(`Saved merged dataset to ${path.relative(process.cwd(), OUTPUT_JSON)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
