import algoliasearch from "algoliasearch";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// A plain CSS marker instead of Leaflet's bundled image icons: Parcel 1.x can't
// resolve image assets from nested node_modules packages, and this also keeps
// the marker on-brand instead of Leaflet's default blue pin.
const restaurantMarkerIcon = L.divIcon({
  className: 'map-marker',
  html: '<span class="map-marker__pin"></span>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
  popupAnchor: [0, -10],
});

const ALGOLIA_APP_ID = 'R8X6F7NECU';
const ALGOLIA_SEARCH_KEY = '56242d779655c1f05fff07c2ec205583';
const ALGOLIA_INDEX_NAME = 'aglogia-demo-restaurants';

const FEATURED_QUERIES = ['Italian', 'Sushi', 'Seafood', 'Steakhouse'];

const SORT_OPTIONS = [
  { value: ALGOLIA_INDEX_NAME, label: 'Recommended' },
  { value: `${ALGOLIA_INDEX_NAME}_top_rated`, label: 'Top Rated' },
  { value: `${ALGOLIA_INDEX_NAME}_price_asc`, label: 'Price: Low to High' },
  { value: `${ALGOLIA_INDEX_NAME}_price_desc`, label: 'Price: High to Low' },
];

const PRICE_ORDER = ['$30 and under', '$31 to $50', '$50 and over'];
const RATING_ORDER = ['Excellent', 'Very Good', 'Good', 'Average', 'Unknown'];
const FIXED_FACET_ORDER = {
  price_range: PRICE_ORDER,
  rating_bucket: RATING_ORDER,
};

const FACET_FIELDS = [
  { key: 'cuisine', label: 'Cuisine', searchable: true },
  { key: 'city', label: 'City', searchable: true },
  { key: 'price_range', label: 'Price', searchable: false },
  { key: 'rating_bucket', label: 'Rating', searchable: false },
  { key: 'dining_style', label: 'Dining style', searchable: true },
  { key: 'neighborhood', label: 'Neighborhood', searchable: true },
];

const FACET_DEFAULT_VISIBLE = 5;

const RATING_BUCKET_LABELS = {
  Excellent: '★★★★★ <span class="facet-option__sublabel">4.5 &amp; up</span>',
  'Very Good': '★★★★☆ <span class="facet-option__sublabel">4.0 &amp; up</span>',
  Good: '★★★☆☆ <span class="facet-option__sublabel">3.5 &amp; up</span>',
  Average: '★★☆☆☆ <span class="facet-option__sublabel">Under 3.5</span>',
  Unknown: '<span class="facet-option__sublabel">Not yet rated</span>',
};

function createElement(tag, className, html) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (html !== undefined) element.innerHTML = html;
  return element;
}

function formatDistance(meters) {
  if (meters == null) return '';
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

function haversineDistance(from, to) {
  const toRad = (value) => (value * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(to.lat - from.lat);
  const dLon = toRad(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(from.lat)) *
      Math.cos(toRad(to.lat)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function renderResult(hit, userLocation) {
  const distance =
    userLocation && hit._geoloc
      ? formatDistance(haversineDistance(userLocation, hit._geoloc))
      : '';

  return `
    <div class="results__item">
      <div class="result">
        <div class="result__image-container">
          <img class="result__image" src="${hit.image_url || 'https://via.placeholder.com/80x80'}" alt="${hit.name}" />
        </div>
        <div class="result__text-contianer">
          <h1 class="result__title">${hit.name}</h1>
          <p class="result__rating">${hit.rating || 0} ★ (${hit.reviews_count || 0} reviews)<span>${distance ? ` · ${distance}` : ''}</span></p>
          <p class="result__summary">${hit.cuisine || 'Unknown'} · ${hit.display_location || hit.city || ''} · ${hit.price_range || ''}</p>
        </div>
        ${hit.reserve_url ? `
          <div class="result__action">
            <a class="result__reserve-button" href="${hit.reserve_url}" target="_blank" rel="noopener noreferrer">Reserve</a>
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

function renderNoResults(query) {
  return `
    <div id="no-results-message">
      <p>We didn't find any results for the search <em>"${query}"</em>.</p>
      <button class="button__link" id="clear-filters">Clear search</button>
    </div>
  `;
}

function renderDebug(state) {
  if (!state) return '';
  return `
    <div class="debug-panel">
      <div><strong>Query:</strong> ${state.query || '(empty)'}</div>
      <div><strong>Page:</strong> ${state.page + 1}</div>
      <div><strong>Facets:</strong> ${JSON.stringify(state.facets || {})}</div>
      <div><strong>Numeric filters:</strong> ${JSON.stringify(state.numericRefinements || {})}</div>
      <div><strong>Query params:</strong> ${JSON.stringify({
        queryType: state.queryType,
        typoTolerance: state.typoTolerance,
        removeWordsIfNoResults: state.removeWordsIfNoResults,
      })}</div>
    </div>
  `;
}

function renderSuggestionChips() {
  return FEATURED_QUERIES.map((query) => `
    <button class="hero__chip" data-query="${query}">${query}</button>
  `).join('');
}

function renderFilters() {
  return `
    <div class="filter__header">
      <span class="filter__header-text">Filters</span>
    </div>
    <div class="filter__container">
      <div class="filter-group">
        <button class="button__link" id="clear-filters-button">Clear filters</button>
      </div>
      <div id="facet-panel" class="facet-groups"></div>
    </div>
  `;
}

function renderInterface() {
  const page = document.querySelector('.page__container');
  page.innerHTML = `
    <header class="site-header">
      <a href="/" id="logo-home-link" class="site-header__logo">Open<span class="site-header__logo-accent">Table</span></a>
      <span class="site-header__tagline">Discovery, powered by Algolia</span>
    </header>
    <div class="search-bar">
      <div class="search-bar__container">
        <input id="search-input" class="search-bar__input" type="search" placeholder="Search restaurants, cuisine, location" autocomplete="off" />
      </div>
    </div>
    <div class="page__content">
      <div class="hero">
        <div class="hero__content">
          <h2>Discover restaurants for every kind of diner</h2>
          <p>Search by restaurant name, cuisine, or neighborhood, then refine with filters for price and style.</p>
          <div class="hero__chips">${renderSuggestionChips()}</div>
        </div>
      </div>
      <aside class="filter">${renderFilters()}</aside>
      <section class="results">
        <div class="results__view-toggle" role="group" aria-label="Results view">
          <button type="button" class="results__view-toggle-btn results__view-toggle-btn--active" data-view="list">☰ List</button>
          <button type="button" class="results__view-toggle-btn" data-view="map">🗺️ Map</button>
        </div>
        <div class="results__stats-bar">
          <div class="results__stats-info">
            <span class="results__count-text" id="result-count"></span>
            <span class="results__time-text" id="result-time"></span>
            <span class="results__location-status" id="location-status" hidden></span>
          </div>
          <div class="results__sort-wrapper">
            <button type="button" id="share-search-button" class="results__share-button">🔗 Share this search</button>
            <div class="results__sort">
              <label for="sort-select" class="results__sort-label">Sort</label>
              <select id="sort-select">
                ${SORT_OPTIONS.map(({ value, label }) => `<option value="${value}">${label}</option>`).join('')}
              </select>
            </div>
          </div>
        </div>
        <div id="results-list"></div>
        <div id="results-map" hidden></div>
        <div id="load-more-wrapper"></div>
        <div id="debug-wrapper"></div>
      </section>
    </div>
  `;
}

function showMissingCredentials() {
  const page = document.querySelector('.page__container');
  page.innerHTML = `
    <div class="page__content" style="padding: 24px;">
      <h1>Algolia configuration required</h1>
      <p>Please replace <code>YOUR_ALGOLIA_APP_ID</code>, <code>YOUR_ALGOLIA_SEARCH_KEY</code>, and <code>YOUR_INDEX_NAME</code> in <code>index.js</code>.</p>
    </div>
  `;
}

async function init() {
  if (!ALGOLIA_APP_ID || !ALGOLIA_SEARCH_KEY || !ALGOLIA_INDEX_NAME) {
    showMissingCredentials();
    return;
  }

  renderInterface();

  const searchInput = document.getElementById('search-input');
  const clearFiltersButton = document.getElementById('clear-filters-button');
  const resultCount = document.getElementById('result-count');
  const resultTime = document.getElementById('result-time');
  const resultsList = document.getElementById('results-list');
  const loadMoreWrapper = document.getElementById('load-more-wrapper');
  const debugWrapper = document.getElementById('debug-wrapper');
  const facetPanel = document.getElementById('facet-panel');
  const filterHeader = document.querySelector('.filter__header');
  const filterContainer = document.querySelector('.filter__container');
  const sortSelect = document.getElementById('sort-select');
  const locationStatus = document.getElementById('location-status');
  const shareSearchButton = document.getElementById('share-search-button');
  const resultsMap = document.getElementById('results-map');
  const viewToggleButtons = document.querySelectorAll('.results__view-toggle-btn');
  const logoHomeLink = document.getElementById('logo-home-link');

  logoHomeLink.addEventListener('click', (event) => {
    event.preventDefault();
    clearAllFilters();
  });

  let currentView = 'list';
  let leafletMap = null;
  let leafletMarkers = [];

  function renderMapView() {
    const hits = (lastContent && lastContent.hits) || [];
    const hitsWithLocation = hits.filter((hit) => hit._geoloc);

    if (!leafletMap) {
      leafletMap = L.map(resultsMap);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(leafletMap);
    }

    leafletMarkers.forEach((marker) => marker.remove());
    leafletMarkers = hitsWithLocation.map((hit) => {
      const popupHtml = `
        <div class="map-popup">
          <img class="map-popup__image" src="${hit.image_url || 'https://via.placeholder.com/160x100'}" alt="${hit.name}" />
          <div class="map-popup__title">${hit.name}</div>
          <div class="map-popup__meta">${hit.rating || 0} ★ &middot; ${hit.price_range || ''}</div>
          ${hit.reserve_url ? `
            <a class="map-popup__reserve-button" href="${hit.reserve_url}" target="_blank" rel="noopener noreferrer">Reserve</a>
          ` : ''}
        </div>
      `;
      return L.marker([hit._geoloc.lat, hit._geoloc.lng], { icon: restaurantMarkerIcon }).bindPopup(popupHtml).addTo(leafletMap);
    });

    // The map container is hidden (display:none) while in list view, so Leaflet
    // can't compute its size until it's visible; invalidateSize() forces a recheck.
    setTimeout(() => {
      leafletMap.invalidateSize();
      if (leafletMarkers.length === 1) {
        leafletMap.setView([hitsWithLocation[0]._geoloc.lat, hitsWithLocation[0]._geoloc.lng], 13);
      } else if (leafletMarkers.length > 1) {
        leafletMap.fitBounds(L.featureGroup(leafletMarkers).getBounds().pad(0.15));
      } else {
        leafletMap.setView([39.8283, -98.5795], 4); // continental US fallback when nothing has geoloc
      }
    }, 0);
  }

  function setView(view) {
    currentView = view;
    viewToggleButtons.forEach((button) => {
      button.classList.toggle('results__view-toggle-btn--active', button.dataset.view === view);
    });
    resultsList.hidden = view !== 'list';
    loadMoreWrapper.hidden = view !== 'list';
    resultsMap.hidden = view !== 'map';
    if (view === 'map') {
      renderMapView();
    }
  }

  viewToggleButtons.forEach((button) => {
    button.addEventListener('click', () => setView(button.dataset.view));
  });

  shareSearchButton.addEventListener('click', async () => {
    const url = window.location.href;
    const originalText = shareSearchButton.textContent;

    try {
      await navigator.clipboard.writeText(url);
      shareSearchButton.textContent = '✅ Link copied!';
    } catch (error) {
      window.prompt('Copy this link:', url);
      shareSearchButton.textContent = originalText;
      return;
    }

    setTimeout(() => {
      shareSearchButton.textContent = originalText;
    }, 1500);
  });

  filterHeader.addEventListener('click', () => {
    filterHeader.classList.toggle('filter__header--open');
    filterContainer.classList.toggle('filter__container--open');
  });

  const client = algoliasearch(ALGOLIA_APP_ID, ALGOLIA_SEARCH_KEY);

  const NEARBY_THRESHOLD_METERS = 150000; // beyond this, "near you" ranking isn't meaningful

  let userLocation = null;
  let geoCoverage = null; // null (unknown yet) | 'near' | 'far'
  let geoPermissionState = 'unknown'; // 'prompt' | 'granted' | 'denied' | 'unsupported' | 'unknown'
  let nearestLocationLabel = '';
  let latestSearchRequestId = 0;
  let currentQuery = '';
  let currentPage = 0;
  let currentSortIndex = ALGOLIA_INDEX_NAME;
  let lastContent = null;

  const selectedFacetValues = {};
  const facetUiState = {};
  FACET_FIELDS.forEach(({ key }) => {
    selectedFacetValues[key] = new Set();
    facetUiState[key] = { expanded: false, query: '' };
  });

  // Reflects the current search state into the URL so it can be copied and shared.
  // Deliberately excludes geolocation: sharing a link shouldn't leak the sharer's
  // exact coordinates, so the recipient just gets their own fresh location prompt.
  function syncUrlFromState() {
    const params = new URLSearchParams();
    if (currentQuery) params.set('q', currentQuery);
    if (currentSortIndex !== ALGOLIA_INDEX_NAME) params.set('sort', currentSortIndex);
    if (currentPage > 0) params.set('page', String(currentPage + 1));
    FACET_FIELDS.forEach(({ key }) => {
      const values = [...selectedFacetValues[key]];
      if (values.length) params.set(key, values.join(','));
    });

    const queryString = params.toString();
    const newUrl = queryString ? `${window.location.pathname}?${queryString}` : window.location.pathname;
    window.history.replaceState(null, '', newUrl);
  }

  // Pre-populates state (and matching form controls) from a shared URL, before the
  // first search fires, so the initial render already reflects the shared link.
  function readStateFromUrl() {
    const params = new URLSearchParams(window.location.search);

    const q = params.get('q');
    if (q) {
      currentQuery = q;
      searchInput.value = q;
    }

    const sort = params.get('sort');
    if (sort && SORT_OPTIONS.some((option) => option.value === sort)) {
      currentSortIndex = sort;
      sortSelect.value = sort;
    }

    const page = parseInt(params.get('page'), 10);
    if (Number.isInteger(page) && page > 1) {
      currentPage = page - 1;
    }

    FACET_FIELDS.forEach(({ key }) => {
      const raw = params.get(key);
      if (!raw) return;
      raw.split(',').filter(Boolean).forEach((value) => selectedFacetValues[key].add(value));
    });
  }

  // excludeFacetKey omits that facet's own filter from facetFilters. Needed for
  // disjunctive faceting: without it, once cuisine:American is selected, Algolia
  // computes cuisine facet counts from the already-filtered (cuisine=American-only)
  // result set, so every other cuisine value has zero matches there and vanishes
  // from the list, making a second, different cuisine impossible to select.
  function buildSearchParams(excludeFacetKey) {
    const params = {
      queryType: 'prefixAll',
      typoTolerance: true,
      ignorePlurals: true,
      removeWordsIfNoResults: 'lastWords',
      hitsPerPage: 20,
      facets: FACET_FIELDS.map(({ key }) => key),
      maxValuesPerFacet: 100,
      page: currentPage,
    };

    const facetFilters = FACET_FIELDS
      .filter(({ key }) => key !== excludeFacetKey)
      .map(({ key }) => [...selectedFacetValues[key]].map((value) => `${key}:${value}`))
      .filter((group) => group.length > 0);
    if (facetFilters.length) params.facetFilters = facetFilters;

    if (userLocation && geoCoverage !== 'far') {
      params.aroundLatLng = `${userLocation.lat},${userLocation.lng}`;
      params.aroundRadius = 'all';
    }

    return params;
  }

  function renderLocationStatus() {
    if (userLocation && geoCoverage === 'near') {
      locationStatus.textContent = `📍 Showing results near ${nearestLocationLabel}`;
      locationStatus.hidden = false;
      return;
    }

    if (userLocation && geoCoverage === 'far') {
      locationStatus.textContent = '📍 No restaurants found near your location — showing top-rated nationwide';
      locationStatus.hidden = false;
      return;
    }

    if (!userLocation && geoPermissionState === 'prompt') {
      locationStatus.innerHTML = '<button type="button" id="location-enable-link" class="results__location-link">📍 Enable location to see nearby results</button>';
      locationStatus.hidden = false;
      document.getElementById('location-enable-link').addEventListener('click', () => requestLocation());
      return;
    }

    locationStatus.hidden = true;
    locationStatus.textContent = '';
  }

  function getFacetOptions(key) {
    const rawFacets = (lastContent && lastContent.facets && lastContent.facets[key]) || {};
    let entries = Object.entries(rawFacets);

    if (FIXED_FACET_ORDER[key]) {
      entries.sort((a, b) => FIXED_FACET_ORDER[key].indexOf(a[0]) - FIXED_FACET_ORDER[key].indexOf(b[0]));
    }

    const query = facetUiState[key].query.trim().toLowerCase();
    if (query) {
      entries = entries.filter(([value]) => value.toLowerCase().includes(query));
    }

    const expanded = facetUiState[key].expanded;
    const visibleEntries = expanded ? entries : entries.slice(0, FACET_DEFAULT_VISIBLE);
    const hiddenCount = entries.length - visibleEntries.length;

    return { visibleEntries, hiddenCount, expanded };
  }

  function renderFacetOptionsMarkup(key) {
    const selected = selectedFacetValues[key];
    const { visibleEntries, hiddenCount, expanded } = getFacetOptions(key);

    const optionsMarkup = visibleEntries.length
      ? visibleEntries.map(([value, count]) => `
          <label class="facet-option ${key === 'rating_bucket' ? 'facet-option--rating' : ''}">
            <input type="checkbox" data-facet="${key}" value="${value}" ${selected.has(value) ? 'checked' : ''} />
            <span class="facet-option__text">${key === 'rating_bucket' ? (RATING_BUCKET_LABELS[value] || value) : value}</span>
            <span class="facet-option__count">${count}</span>
          </label>
        `).join('')
      : '<p class="facet-empty">No matching values.</p>';

    let showMoreMarkup = '';
    if (hiddenCount > 0) {
      showMoreMarkup = `<button class="facet-show-more" data-facet-toggle="${key}">Show more values (${hiddenCount})</button>`;
    } else if (expanded && visibleEntries.length > FACET_DEFAULT_VISIBLE) {
      showMoreMarkup = `<button class="facet-show-more" data-facet-toggle="${key}">Show fewer values</button>`;
    }

    return { optionsMarkup, showMoreMarkup };
  }

  function attachOptionListeners(listEl, key) {
    listEl.querySelectorAll('input[type="checkbox"][data-facet]').forEach((checkbox) => {
      checkbox.addEventListener('change', () => {
        const value = checkbox.value;
        if (checkbox.checked) selectedFacetValues[key].add(value);
        else selectedFacetValues[key].delete(value);
        currentPage = 0;
        updateSearch();
      });
    });
  }

  function attachShowMoreListener(el, key) {
    const button = el.querySelector('[data-facet-toggle]');
    if (!button) return;
    button.addEventListener('click', () => {
      facetUiState[key].expanded = !facetUiState[key].expanded;
      updateFacetGroupDOM(key);
    });
  }

  function updateFacetGroupDOM(key) {
    const group = facetPanel.querySelector(`[data-facet-group="${key}"]`);
    if (!group) return;
    const { optionsMarkup, showMoreMarkup } = renderFacetOptionsMarkup(key);
    const listEl = group.querySelector('.facet-option-list');
    const showMoreWrapper = group.querySelector('.facet-show-more-wrapper');
    listEl.innerHTML = optionsMarkup;
    showMoreWrapper.innerHTML = showMoreMarkup;
    attachOptionListeners(listEl, key);
    attachShowMoreListener(showMoreWrapper, key);
  }

  function renderFacetPanel() {
    facetPanel.innerHTML = FACET_FIELDS.map(({ key, label, searchable }) => {
      const searchMarkup = searchable
        ? `<div class="facet-group__search"><input type="text" data-facet-search="${key}" placeholder="Search ${label.toLowerCase()}" value="${facetUiState[key].query}" /></div>`
        : '';
      return `
        <div class="facet-group" data-facet-group="${key}">
          <h3 class="facet-group__title">${label}</h3>
          ${searchMarkup}
          <div class="facet-option-list"></div>
          <div class="facet-show-more-wrapper"></div>
        </div>
      `;
    }).join('');

    FACET_FIELDS.forEach(({ key, searchable }) => {
      updateFacetGroupDOM(key);
      if (searchable) {
        const group = facetPanel.querySelector(`[data-facet-group="${key}"]`);
        const input = group.querySelector('[data-facet-search]');
        input.addEventListener('input', () => {
          facetUiState[key].query = input.value;
          facetUiState[key].expanded = true;
          updateFacetGroupDOM(key);
        });
      }
    });
  }

  function renderSearchResult(content) {
    lastContent = content;
    const hits = content.hits || [];

    if (userLocation && geoCoverage === null) {
      const nearest = hits[0];
      const distance = nearest && nearest._geoloc ? haversineDistance(userLocation, nearest._geoloc) : Infinity;
      if (distance <= NEARBY_THRESHOLD_METERS) {
        geoCoverage = 'near';
        nearestLocationLabel = nearest.display_location || nearest.city || 'your area';
      } else {
        geoCoverage = 'far';
      }
      renderLocationStatus();
      if (geoCoverage === 'far') {
        updateSearch(); // re-run without geo bias now that we know there's no nearby coverage
        return;
      }
    }

    resultCount.textContent = `${content.nbHits.toLocaleString()} restaurants found`;
    resultTime.textContent = `in ${content.processingTimeMS} ms`;
    renderFacetPanel();

    if (!hits.length) {
      resultsList.innerHTML = renderNoResults(currentQuery || '');
      loadMoreWrapper.innerHTML = '';
      const clearButton = document.getElementById('clear-filters');
      if (clearButton) {
        clearButton.addEventListener('click', () => clearAllFilters());
      }
      if (currentView === 'map') renderMapView();
      return;
    }

    resultsList.innerHTML = hits.map((hit) => renderResult(hit, userLocation)).join('');

    if (content.page + 1 < content.nbPages) {
      loadMoreWrapper.innerHTML = '<button class="button__link" id="load-more">Load more</button>';
      const loadMoreButton = document.getElementById('load-more');
      loadMoreButton.addEventListener('click', () => {
        currentPage += 1;
        updateSearch();
      });
    } else {
      loadMoreWrapper.innerHTML = '';
    }

    if (currentView === 'map') renderMapView();
  }

  function updateSearch() {
    syncUrlFromState();
    const requestId = ++latestSearchRequestId;
    // One main query (all filters applied, for the actual results) plus one
    // disjunctive query per facet (that facet's own filter excluded, so its full
    // set of options stays visible), batched into a single request.
    const queries = [
      { indexName: currentSortIndex, query: currentQuery, params: buildSearchParams(null) },
      ...FACET_FIELDS.map(({ key }) => ({
        indexName: currentSortIndex,
        query: currentQuery,
        params: Object.assign(buildSearchParams(key), { hitsPerPage: 0 }),
      })),
    ];
    client.search(queries)
      .then(({ results }) => {
        if (requestId !== latestSearchRequestId) {
          return;
        }
        const [mainContent, ...facetResults] = results;
        mainContent.facets = mainContent.facets || {};
        FACET_FIELDS.forEach(({ key }, i) => {
          mainContent.facets[key] = facetResults[i].facets[key] || {};
        });
        renderSearchResult(mainContent);
      })
      .catch((error) => {
        console.error(error);
        if (requestId === latestSearchRequestId) {
          resultsList.innerHTML = renderNoResults(currentQuery || '');
          loadMoreWrapper.innerHTML = '';
        }
      });
  }

  function clearAllFilters() {
    searchInput.value = '';
    currentQuery = '';
    currentPage = 0;
    currentSortIndex = ALGOLIA_INDEX_NAME;
    sortSelect.value = ALGOLIA_INDEX_NAME;
    FACET_FIELDS.forEach(({ key }) => {
      selectedFacetValues[key].clear();
      facetUiState[key] = { expanded: false, query: '' };
    });
    updateSearch();
  }

  searchInput.addEventListener('input', (event) => {
    currentQuery = event.target.value.trim();
    currentPage = 0;
    updateSearch();
  });

  clearFiltersButton.addEventListener('click', () => clearAllFilters());

  sortSelect.addEventListener('change', () => {
    currentSortIndex = sortSelect.value;
    currentPage = 0;
    updateSearch();
  });

  document.querySelectorAll('.hero__chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      currentQuery = chip.dataset.query;
      currentPage = 0;
      searchInput.value = currentQuery;
      updateSearch();
    });
  });

  function requestLocation() {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        userLocation = { lat: position.coords.latitude, lng: position.coords.longitude };
        updateSearch();
      },
      () => {
        geoPermissionState = 'denied';
        renderLocationStatus();
        updateSearch();
      },
      { timeout: 5000 }
    );
  }

  async function initGeoPrompt() {
    if (!navigator.geolocation) {
      geoPermissionState = 'unsupported';
      updateSearch();
      return;
    }

    let permissionState = 'prompt';
    if (navigator.permissions && navigator.permissions.query) {
      try {
        const status = await navigator.permissions.query({ name: 'geolocation' });
        permissionState = status.state;
      } catch (error) {
        permissionState = 'prompt';
      }
    }
    geoPermissionState = permissionState;

    if (permissionState === 'granted') {
      requestLocation();
      return;
    }

    if (permissionState === 'denied') {
      updateSearch();
      return;
    }

    renderLocationStatus();
    updateSearch();
  }

  readStateFromUrl();
  initGeoPrompt();
}

init();
