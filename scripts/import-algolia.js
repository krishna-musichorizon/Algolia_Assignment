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
  {
    suffix: 'price_desc',
    label: 'Price: High to Low',
    customRanking: ['desc(price_level)', 'desc(popularity_score)'],
  },
];

// Algolia Rules only match literal words or facet-value placeholders, no numeric
// wildcard/regex capture, so this only covers phrasings around the two real price
// boundaries in this dataset (30, 50). It won't generalize to arbitrary amounts
// like "40 dollars" without a rule per number, a known, deliberate scope limit.
const PRICE_INTENT_RULES = [
  { number: '30', word: 'dollars', priceRangeValues: ['$30 and under'] },
  { number: '30', word: 'usd', priceRangeValues: ['$30 and under'] },
  { number: '50', word: 'dollars', priceRangeValues: ['$31 to $50', '$50 and over'] },
  { number: '50', word: 'usd', priceRangeValues: ['$31 to $50', '$50 and over'] },
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
    'name_condensed',
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

  console.log('Configuring price-intent rules...');
  // Saved one at a time: saveRules() (batch) hit a "Rules quota exceeded" error on
  // this plan even for a handful of rules, while sequential saveRule() calls for the
  // same rules succeeded. forwardToReplicas matters here too — virtual replicas don't
  // automatically inherit rules added outside setSettings(), the same gap that bit
  // the manually-added synonyms.
  for (const { number, word, priceRangeValues } of PRICE_INTENT_RULES) {
    const rule = {
      objectID: `price-intent-${number}-${word}`,
      conditions: [{ pattern: `${number} ${word}`, anchoring: 'contains' }],
      consequence: {
        params: {
          query: '',
          filters: priceRangeValues.map((value) => `price_range:"${value}"`).join(' OR '),
        },
      },
    };
    await index.saveRule(rule, { forwardToReplicas: true });
  }

  console.log('Import completed successfully.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
