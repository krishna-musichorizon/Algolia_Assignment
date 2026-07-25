const fs = require('fs').promises;
const path = require('path');
const algoliasearch = require('algoliasearch');
require('dotenv').config();

const DATA_DIR = path.join(__dirname, '..', 'dataset');
const MERGED_JSON = path.join(DATA_DIR, 'merged_restaurants.json');

const APP_ID = process.env.ALGOLIA_APP_ID;
const ADMIN_KEY = process.env.ALGOLIA_ADMIN_KEY;
const INDEX_NAME = process.env.ALGOLIA_INDEX_NAME;

if (!APP_ID || !ADMIN_KEY || !INDEX_NAME) {
  console.error('Missing environment variables. Please set ALGOLIA_APP_ID, ALGOLIA_ADMIN_KEY, and ALGOLIA_INDEX_NAME (e.g. in a .env file).');
  process.exit(1);
}

// Virtual replicas share the primary index's data, searchable attributes, and
// facets — they only override ranking, so they're the right fit for a "Sort by"
// control that shouldn't change what's searchable/filterable, only the order.
const REPLICAS = [
  {
    suffix: 'top_rated',
    label: 'Top Rated',
    customRanking: ['desc(rating)', 'desc(reviews_count)', 'desc(popularity_score)'],
  },
  {
    suffix: 'price_asc',
    label: 'Price: Low to High',
    customRanking: ['asc(price_level)', 'desc(popularity_score)'],
  },
];

const settings = {
  searchableAttributes: [
    'name',
    'cuisine',
    'dining_style',
    'neighborhood',
    'city',
    'state',
    'address',
    'payment_options',
    'display_location',
    'price_range',
  ],
  attributesForFaceting: [
    'searchable(cuisine)',
    'searchable(price_range)',
    'searchable(neighborhood)',
    'searchable(city)',
    'searchable(dining_style)',
    'rating_bucket',
  ],
  customRanking: [
    'desc(popularity_score)',
    'desc(rating)',
    'desc(reviews_count)',
  ],
  replicas: REPLICAS.map(({ suffix }) => `virtual(${INDEX_NAME}_${suffix})`),
  attributesToSnippet: ['name:10', 'cuisine:5', 'display_location:5'],
  removeWordsIfNoResults: 'lastWords',
  ignorePlurals: true,
  typoTolerance: true,
  queryType: 'prefixAll',
  advancedSyntax: false,
  optionalWords: ['restaurant', 'bar', 'grill', 'cafe', 'café'],
  synonyms: [
    ['steakhouse', 'steak house'],
    ['sushi', 'japanese'],
    ['italian', 'italiano'],
    ['seafood', 'fish'],
  ],
  minWordSizefor1Typo: 4,
  minWordSizefor2Typos: 8,
};

async function chunkArray(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

async function main() {
  const client = algoliasearch(APP_ID, ADMIN_KEY);
  const index = client.initIndex(INDEX_NAME);

  console.log('Reading merged index data...');
  const content = await fs.readFile(MERGED_JSON, 'utf8');
  const records = JSON.parse(content);

  console.log('Configuring index settings...');
  await index.setSettings(settings);

  console.log(`Uploading ${records.length} records in chunks...`);
  const chunks = await chunkArray(records, 1000);
  for (let i = 0; i < chunks.length; i += 1) {
    console.log(`Uploading chunk ${i + 1}/${chunks.length}`);
    await index.saveObjects(chunks[i]);
  }

  console.log('Configuring replica ranking (sort options)...');
  for (const { suffix, customRanking } of REPLICAS) {
    const replicaIndex = client.initIndex(`${INDEX_NAME}_${suffix}`);
    await replicaIndex.setSettings({ customRanking });
  }

  console.log('Import completed successfully.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
