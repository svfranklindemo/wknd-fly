// Flights Block - Displays flight search results (GraphQL CF + fallback to sample data)
import { isAuthorEnvironment } from '../../scripts/scripts.js';
import { readBlockConfig } from '../../scripts/aem.js';
import { dispatchCustomEvent } from '../../scripts/custom-events.js';

const AUTHOR_GRAPHQL_BASE_For_Search = 'https://author-p159983-e1710854.adobeaemcloud.com/graphql/execute.json/wknd-fly/flight-details-list';
const PUBLISH_GRAPHQL_BASE_For_Search = 'https://275323-918sangriatortoise.adobeioruntime.net/api/v1/web/dx-excshell-1/flight-details-list';

const AUTHOR_GRAPHQL_BASE_For_Destination = 'https://author-p159983-e1710854.adobeaemcloud.com/graphql/execute.json/wknd-fly/flight-details-list';
const PUBLISH_GRAPHQL_BASE_For_Destination = 'https://275323-918sangriatortoise.adobeioruntime.net/api/v1/web/dx-excshell-1/flight-details-list';

let selectButtonDataAttributes = {};

// Sample airport data (shared with flight-search)
const AIRPORTS = [
  { code: 'WAW', city: 'Warsaw', country: 'Poland' },
  { code: 'LHR', city: 'London', country: 'United Kingdom' },
  { code: 'CDG', city: 'Paris', country: 'France' },
  { code: 'ORD', city: 'Chicago', country: 'United States' },
  { code: 'LAS', city: 'Las Vegas', country: 'United States' },
  { code: 'JFK', city: 'New York', country: 'United States' },
  { code: 'MBJ', city: 'Montego Bay', country: 'Jamaica' },
  { code: 'AMS', city: 'Amsterdam', country: 'Netherlands' },
  { code: 'TXL', city: 'Berlin', country: 'Germany' },
  { code: 'HND', city: 'Tokyo', country: 'Japan' },
  { code: 'SFR', city: 'San Francisco', country: 'United States' },
  { code: 'CUN', city: 'Cancún', country: 'Mexico' },
  { code: 'DEL', city: 'Delhi', country: 'India' },
  { code: 'TQO', city: 'Tulum', country: 'Mexico' },
];

// Trip / checkout: persist selected flights across pages (sessionStorage)
const TRIP_STORAGE_KEY = 'wknd-fly-selected-flights';

// Normalize string for matching URL slug to country (e.g. "United States" -> "unitedstates")
function slugify(str) {
  return (str || '').toLowerCase().replace(/[- ]/g, '');
}

// True when path is /en/destinations/<slug> (destination page: no from/to, fetch by destination)
function isDestinationPage() {
  const pathname = (typeof window !== 'undefined' && window.location.pathname) || '';
  return pathname.includes('/en/destinations/');
}

// If on destination page: return country name from path (slug matched to AIRPORTS countries), else null
function getDestinationFromPath() {
  const pathname = (typeof window !== 'undefined' && window.location.pathname) || '';
  const match = pathname.match(/\/en\/destinations\/([^/]+)/i);
  if (!match) return null;
  const slug = slugify(match[1] || '').replaceAll('.html', '');
  if (!slug) return null;
  const countries = [...new Set(AIRPORTS.map((a) => a.country))];
  const country = countries.find((c) => slugify(c) === slug);
  return country ?? slug;
}

// If on destination page: return airport code(s) for the country from path, else null. Single code = first airport in that country.
function getDestinationCodesFromPath() {
  const country = getDestinationFromPath();
  if (!country) return null;
  const codes = AIRPORTS.filter((a) => a.country === country).map((a) => a.code);
  return codes.length ? codes : null;
}

function getDestinationCodeFromPath() {
  const codes = getDestinationCodesFromPath();
  return codes && codes.length ? codes[0] : null;
}

// Resolve from/to only when not on a destination page (destination page has no from/to)
function resolveFromAndTo() {
  const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const from = (urlParams.get('from') || '').trim().toUpperCase();
  const to = (urlParams.get('to') || '').trim().toUpperCase();
  if (from && to) return { from, to };
  if (!from && typeof window !== 'undefined' && window.getDataLayerProperty) {
    const dlFrom = window.getDataLayerProperty('from');
    const resolvedFrom = (dlFrom && String(dlFrom).trim().toUpperCase()) || '';
    if (resolvedFrom && to) return { from: resolvedFrom, to };
  }
  return { from, to };
}

/**
 * Calculates flight length string from departure and arrival time strings.
 * Supports "HH:mm", "HH:mm:ss", "h:mm a" and ISO date-time; returns e.g. "2h 30m" or "" if unparseable.
 */
function calculateFlightLengthFromTimes(departureTime, arrivalTime) {
  if (!departureTime || !arrivalTime || typeof departureTime !== 'string' || typeof arrivalTime !== 'string') return '';
  const parseToMinutes = (str) => {
    const s = str.trim();
    if (!s) return NaN;
    const iso = s.match(/T(\d{2}):(\d{2})(?::(\d{2}))?/);
    if (iso) return parseInt(iso[1], 10) * 60 + parseInt(iso[2], 10) + (parseInt(iso[3], 10) || 0) / 60;
    const hm = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?$/i);
    if (hm) {
      let h = parseInt(hm[1], 10);
      const m = parseInt(hm[2], 10) + (parseInt(hm[3], 10) || 0) / 60;
      if (hm[4]) {
        if (hm[4].toLowerCase() === 'pm' && h !== 12) h += 12;
        if (hm[4].toLowerCase() === 'am' && h === 12) h = 0;
      }
      return h * 60 + m;
    }
    const d = new Date(s);
    return isNaN(d.getTime()) ? NaN : d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
  };
  const depM = parseToMinutes(departureTime);
  const arrM = parseToMinutes(arrivalTime);
  if (Number.isNaN(depM) || Number.isNaN(arrM)) return '';
  let diffM = arrM - depM;
  if (diffM < 0) diffM += 24 * 60;
  const h = Math.floor(diffM / 60);
  const m = Math.round(diffM % 60);
  if (h === 0 && m === 0) return '';
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function mapGraphQLItemToFlight(item, isAuthor) {
  const imageRef = item?.image || item?.bannerimage;
  const imageUrl = imageRef?.[isAuthor ? '_authorUrl' : '_publishUrl'] || imageRef?._dynamicUrl || '';
  const id = item?.id?.trim() || item?._path?.replace(/[/]/g, '_') || item?.title || `flight-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  // Support both CF model names (flightFromShortName, flightPrice, etc.) and alternate names (from, price)
  const from = item?.flightFromShortName ?? item?.from ?? '';
  const to = item?.flightToShortName ?? item?.to ?? '';
  const fromName = item?.flightFromFullName ?? item?.fromName ?? from ?? '';
  const toName = item?.flightToFullName ?? item?.toName ?? to ?? '';
  const price = Number(item?.flightPrice ?? item?.price) || 0;
  const departureTime = item?.departureTime ?? '';
  const arrivalTime = item?.arrivalTime ?? '';
  const flightLength =
    item?.flightLength ?? item?.length ?? calculateFlightLengthFromTimes(departureTime, arrivalTime);
  return {
    id,
    sku: item?.sku?.trim() || id,
    from,
    to,
    fromName,
    toName,
    departureTime,
    arrivalTime,
    price,
    class: item?.flightClass ?? item?.class ?? 'economy',
    image: imageUrl,
    flightLength,
  };
}

async function fetchFlightsFromGraphQL(from, to) {
  const fromCode = (from || '').toUpperCase();
  const toCode = (to || '').toUpperCase();
  const isAuthor = isAuthorEnvironment();
  try {
    const url = isAuthor
      ? `${AUTHOR_GRAPHQL_BASE_For_Search};from=${encodeURIComponent(fromCode)};to=${encodeURIComponent(toCode)};ts=${Date.now()}`
      : `${PUBLISH_GRAPHQL_BASE_For_Search}?environment=p159983-e1710854&endpoint=flight-details-list&from=${encodeURIComponent(fromCode)}&to=${encodeURIComponent(toCode)}&time=${Date.now()}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) return [];
    const payload = await response.json();
    if (payload?.errors?.length) return [];
    const items =
      payload?.data?.flightDetailsList?.items ||
      payload?.data?.flight_details_List?.items ||
      payload?.data?.flightDetails_List?.items ||
      [];
    return items.map((it) => mapGraphQLItemToFlight(it, isAuthor));
  } catch (e) {
    console.warn('Flights GraphQL fetch failed:', e);
    return [];
  }
}

/** @param {string} destination - Airport code (e.g. ORD, LHR). GraphQL filters by this code. */
async function fetchFlightsForDestination(destination) {
  if (!destination || !String(destination).trim()) return [];
  const isAuthor = isAuthorEnvironment();
  const encoded = encodeURIComponent(String(destination).trim());
  try {
    const url = isAuthor
      ? `${AUTHOR_GRAPHQL_BASE_For_Destination};to=${encoded};ts=${Date.now()}`
      : `${PUBLISH_GRAPHQL_BASE_For_Destination}?environment=p159983-e1710854&endpoint=flight-details-list-for-destination-page&to=${encoded}&time=${Date.now()}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) return [];
    const payload = await response.json();
    if (payload?.errors?.length) return [];
    const items =
      payload?.data?.flightDetailsListForDestinationPage?.items ||
      payload?.data?.flight_details_list_for_destination_page?.items ||
      payload?.data?.flightDetailsList?.items ||
      [];
    return items.map((it) => mapGraphQLItemToFlight(it, isAuthor));
  } catch (e) {
    console.warn('Destination flights GraphQL fetch failed:', e);
    return [];
  }
}
// Live: site-relative path. Author: derive from current path (path up to /en/ + checkout.html)
const LIVE_CHECKOUT_PATH = '/en/checkout';

function getAuthorCheckoutPath() {
  const pathname = window.location.pathname;
  const enIndex = pathname.indexOf('/en/');
  if (enIndex !== -1) return pathname.slice(0, enIndex + 4) + 'checkout.html';
  if (pathname.endsWith('/en')) return pathname + '/checkout.html';
  return '/en/checkout.html';
}

export function getCheckoutPath() {
  if (typeof window === 'undefined') return LIVE_CHECKOUT_PATH;
  const isAuthor = window.location.hostname.includes('author') || window.location.hostname.includes('adobeaemcloud');
  return isAuthor ? getAuthorCheckoutPath() : LIVE_CHECKOUT_PATH;
}

export function getSelectedFlights() {
  try {
    const raw = sessionStorage.getItem(TRIP_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function addFlightToTrip(flight) {
  const list = getSelectedFlights();
  const id = flight.id || `trip-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  list.push({ ...flight, id });
  sessionStorage.setItem(TRIP_STORAGE_KEY, JSON.stringify(list));
  return id;
}

export function removeFlightFromTrip(id) {
  const list = getSelectedFlights().filter((f) => f.id !== id);
  sessionStorage.setItem(TRIP_STORAGE_KEY, JSON.stringify(list));
}

function updateBookNowBar(barEl) {
  const count = getSelectedFlights().length;
  const link = barEl.querySelector('.flights-book-now-link');
  const countEl = barEl.querySelector('.flights-book-now-count');
  if (countEl) countEl.textContent = count;
  barEl.classList.toggle('flights-book-now-bar-hidden', count === 0);
  if (link) link.href = getCheckoutPath();
}

function addBookNowBar(block) {
  let bar = block.querySelector('.flights-book-now-bar');
  if (!bar) {
    bar = createElement('div', 'flights-book-now-bar flights-book-now-bar-hidden');
    const countSpan = createElement('span', 'flights-book-now-count', '0');
    const link = createElement('a', 'flights-book-now-link', 'Book Now');
    link.href = getCheckoutPath();
    bar.appendChild(countSpan);
    bar.appendChild(document.createTextNode(' flight(s) in trip — '));
    bar.appendChild(link);
    block.appendChild(bar);
  }
  updateBookNowBar(bar);
}

// Utility functions
function createElement(tag, className, content) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (content !== undefined) {
    if (typeof content === 'string') {
      element.innerHTML = content;
    } else {
      element.appendChild(content);
    }
  }
  return element;
}

function formatDate(date) {
  if (!date) return '';
  // Handle ISO date strings (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss.sssZ)
  let d;
  if (typeof date === 'string' && date.includes('T')) {
    // ISO format with time
    d = new Date(date);
  } else if (typeof date === 'string' && date.match(/^\d{4}-\d{2}-\d{2}$/)) {
    // YYYY-MM-DD format
    d = new Date(date + 'T00:00:00');
  } else {
    d = new Date(date);
  }
  
  // Check if date is valid
  if (isNaN(d.getTime())) {
    return '';
  }
  
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const year = d.getFullYear();
  return `${month}/${day}/${year}`;
}

// Display flight results
function displayFlightResults(flights, from, to, date) {
  const block = document.querySelector('.flights');
  if (!block) {
    console.error('Flights block not found!');
    return;
  }
  
  console.log('Displaying flights:', flights.length, flights);
  
  // Clear existing content but preserve hidden config divs
  const hiddenDivs = Array.from(block.children).filter(child => child.style.display === 'none');
  block.innerHTML = '';
  // Re-append hidden divs for Universal Editor
  hiddenDivs.forEach(div => {
    div.style.display = 'none';
    block.appendChild(div);
  });
  
  if (flights.length === 0) {
    const noResults = createElement('div', 'flight-no-results');
    const msg = from
      ? `No flights found for ${from} to ${to}${date ? ` on ${formatDate(date)}` : ''}`
      : `No flights found to ${to}${date ? ` on ${formatDate(date)}` : ''}`;
    noResults.innerHTML = `
      <p>${msg}</p>
      <p>Please try different airports or dates.</p>
      <a href="/" class="flight-back-link">← Back to Search</a>
    `;
    block.appendChild(noResults);
    return;
  }

  const title = createElement('h2', 'flight-results-title');
  if (from) {
    const fromAirport = AIRPORTS.find((a) => a.code === from);
    const toAirport = AIRPORTS.find((a) => a.code === to);
    title.textContent = `One-Way connections from ${fromAirport?.city || from} to ${toAirport?.city || to}`;
  } else {
    title.textContent = `Flights to ${to}`;
  }
  block.appendChild(title);

  // Disclaimer
  const disclaimer = createElement('p', 'flight-results-disclaimer');
  disclaimer.textContent = 'Presented fares are per passenger, including fees and taxes. Additional services and amenities may vary per flight or change in time.';
  block.appendChild(disclaimer);
  
  const resultsList = createElement('div', 'flight-results-list');
  const dateForDataLayer = date != null ? (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(date) ? date.slice(0, 10) : (() => { try { const d = new Date(date); return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10); } catch (e) { return ''; } })()) : '';
  flights.forEach((flight) => {
    const flightWithDate = { ...flight, date: dateForDataLayer, flightLength: flight.flightLength || '' };
    const flightCard = createElement('div', 'flight-card');

    const imageContainer = createElement('div', 'flight-card-image');
    const image = createElement('img', '');
    image.src = flight.image || '';
    image.alt = `${flight.toName} destination`;
    imageContainer.appendChild(image);
    
    const detailsContainer = createElement('div', 'flight-card-details');
    
    const route = createElement('div', 'flight-route');
    route.textContent = `${flight.fromName} (${flight.from}) to ${flight.toName} (${flight.to})`;
    
    const codesLine = createElement('div', 'flight-codes-line');
    codesLine.innerHTML = `
      <span class="flight-airport">${flight.from}</span>
      <span class="flight-codes-connector" aria-hidden="true"></span>
      <span class="flight-airport">${flight.to}</span>
    `;
    
    const timesRow = createElement('div', 'flight-times-row');
    timesRow.innerHTML = `
      <span class="flight-time-value">${flight.departureTime}</span>
      <span class="flight-time-separator" aria-hidden="true">—</span>
      <span class="flight-time-value">${flight.arrivalTime}</span>
    `;
    
    detailsContainer.appendChild(route);
    detailsContainer.appendChild(codesLine);
    detailsContainer.appendChild(timesRow);
    
    const priceContainer = createElement('div', 'flight-card-price');
    const priceClass = createElement('div', 'flight-class');
    priceClass.textContent = flight.class;
    
    const price = createElement('div', 'flight-price');
    price.textContent = `$${flight.price.toFixed(2)}`;
    
    const selectButton = createElement('button', 'flight-select-button', 'Select');
    selectButton.addEventListener('click', () => {
      handleFlightSelect(flightWithDate);
    });
    
    priceContainer.appendChild(priceClass);
    priceContainer.appendChild(price);
    priceContainer.appendChild(selectButton);
    
    flightCard.appendChild(imageContainer);
    flightCard.appendChild(detailsContainer);
    flightCard.appendChild(priceContainer);
    
    resultsList.appendChild(flightCard);
  });
  
  block.appendChild(resultsList);
}

// Build cart object for datalayer from selected flights list
function buildCartFromSelectedFlights(flights) {
  const products = {};
  let subTotal = 0;
  (flights || []).forEach((f) => {
    const id = f.id || `trip-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const price = Number(f.price) || 0;
    const name = `${f.fromName || f.from} (${f.from}) to ${f.toName || f.to} (${f.to})`;
    products[id] = {
      id,
      to: f.to || '',
      from: f.from || '',
      name,
      image: f.image || '',
      price,
      arrival: f.arrivalTime || '',
      category: 'flight',
      departure: f.departureTime || '',
      sku: f.sku || id,
      quantity: 1,
    };
    subTotal += price;
  });
  const productCount = flights.length;
  return {
    products,
    productCount,
    subTotal,
    total: subTotal,
  };
}

function getCurrentDateYYYYMMDD() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Update datalayer with cart and latest string vars; persists via updateDataLayer (localStorage)
// Sets all fields required by XDM - Flight Selection and for checkout/confirmation.
function updateDataLayerWithSelectedFlights(latestFlight) {
  if (typeof window.updateDataLayer !== 'function') return;
  const selected = getSelectedFlights();
  const cart = buildCartFromSelectedFlights(selected);
  const dl = typeof window.dataLayer !== 'undefined' ? window.dataLayer : {};
  const updates = {
    cart,
    from: latestFlight?.from || '',
    to: latestFlight?.to || '',
    flightNumber: latestFlight?.id || '',
    class: (typeof window.getDataLayerFlightClass === 'function' ? window.getDataLayerFlightClass(latestFlight?.class) : (latestFlight?.class || '')) || '',
    date: (typeof window.getDataLayerDate === 'function' ? window.getDataLayerDate(getCurrentDateYYYYMMDD()) : getCurrentDateYYYYMMDD()) || '',
    flightLength: (typeof window.getDataLayerFlightLength === 'function' ? window.getDataLayerFlightLength(latestFlight?.flightLength ?? dl?.flightLength) : (parseInt(latestFlight?.flightLength ?? dl?.flightLength, 10) || 0)),
  };
  window.updateDataLayer(updates, true);
}

// Minimal dataLayer for flight.selection XDM only (no flightNumber, class, date, flightLength, so reservationSearch stays empty).
function updateDataLayerMinimalForFlightSelection(latestFlight) {
  if (typeof window.updateDataLayer !== 'function') return;
  const selected = getSelectedFlights();
  const cart = buildCartFromSelectedFlights(selected);
  window.updateDataLayer({
    cart,
    from: latestFlight?.from || '',
    to: latestFlight?.to || '',
    flightNumber: '',
    class: '',
    date: '',
    flightLength: 0,
  }, true);
}

// Handle flight selection: add to trip, update datalayer, fire Launch event (flight.selected), then go to checkout
function handleFlightSelect(flight) {
  const fullFlight = {
    ...flight,
    image: flight.image || '',
    id: flight.id || `trip-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
  };
  addFlightToTrip(fullFlight);
  // Set minimal dataLayer so Launch builds working flight.selection XDM (only from, to, cart; no extra reservation/reservationSearch fields)
  updateDataLayerMinimalForFlightSelection(fullFlight);
  if(selectButtonDataAttributes.buttonEventType) {
    dispatchCustomEvent(selectButtonDataAttributes.buttonEventType);
    updateDataLayerWithSelectedFlights(fullFlight);
    setTimeout(() => { window.location.href = getCheckoutPath(); }, 2000);
  } else {
    document.dispatchEvent(new CustomEvent('flight.selected', { bubbles: true }));
    updateDataLayerWithSelectedFlights(fullFlight);
    setTimeout(() => { window.location.href = getCheckoutPath(); }, 2000);
  }
}

// Main decorate function
export default async function decorate(block) {
  const config = readBlockConfig(block) || {};

  let flightDropdownContentFragmentPath = null;
  if(config.flightdropdowncontentfragment || config['flightdropdowncontentfragment']) {
    flightDropdownContentFragmentPath = config.flightdropdowncontentfragment ?? config['flightdropdowncontentfragment'];
    if(isAuthorEnvironment()) {
      flightDropdownContentFragmentPath = flightDropdownContentFragmentPath.replace(window.location.origin, '');
      flightDropdownContentFragmentPath = flightDropdownContentFragmentPath.replace('.html', '');
    } else {
      flightDropdownContentFragmentPath = flightDropdownContentFragmentPath.replace(window.location.origin, '');
    }
  }

  let flightListContentFragmentPath = null;
  if(config.flightlistcontentfragment || config['flightlistcontentfragment']) {
    flightListContentFragmentPath = config.flightlistcontentfragment ?? config['flightlistcontentfragment'];
    if(isAuthorEnvironment()) {
      flightListContentFragmentPath = flightListContentFragmentPath.replace(window.location.origin, '');
      flightListContentFragmentPath = flightListContentFragmentPath.replace('.html', '');
    } else {
      flightListContentFragmentPath = flightListContentFragmentPath.replace(window.location.origin, '');
    }
  }

  // Apply button config as data attributes for analytics/webhooks
  if (config.buttoneventtype && String(config.buttoneventtype).trim()) 
    selectButtonDataAttributes.buttonEventType = String(config.buttoneventtype).trim();
  if (config.buttonwebhookurl && String(config.buttonwebhookurl).trim()) 
    selectButtonDataAttributes.buttonWebhookUrl = String(config.buttonwebhookurl).trim();
  if (config.buttonformid && String(config.buttonformid).trim()) 
    selectButtonDataAttributes.buttonFormId = String(config.buttonformid).trim();
  if (config.buttondata && String(config.buttondata).trim()) 
    selectButtonDataAttributes.buttonData = String(config.buttondata).trim();

  const urlParams = new URLSearchParams(window.location.search);
  const urlDate = urlParams.get('date');
  const resolved = resolveFromAndTo();

  block.className = 'flights';

  // Destination page: path contains /en/destinations/ — no from/to; GraphQL expects airport code(s)
  if (isDestinationPage()) {
    const destinationCodes = getDestinationCodesFromPath();
    const destinationLabel = getDestinationFromPath();
    let flights = [];
    if (destinationCodes?.length) {
      const allResults = await Promise.all(
        destinationCodes.map((code) =>
          fetchFlightsForDestination(code).catch(() => []),
        ),
      );
      const seen = new Set();
      flights = allResults.flat().filter((f) => {
        if (seen.has(f.id)) return false;
        seen.add(f.id);
        return true;
      });
    }
    displayFlightResults(flights, '', destinationLabel || 'destination', urlDate);
    addBookNowBar(block);
    const selectedFromUrl = getSelectedFlights();
    if (selectedFromUrl.length > 0) {
      updateDataLayerWithSelectedFlights(selectedFromUrl[selectedFromUrl.length - 1]);
    }
    return;
  }

  // Search page: from and to always present (URL params or datalayer)
  if (resolved.from && resolved.to) {
    const route = `${resolved.from}-${resolved.to}`;
    let flights = [];
    try {
      flights = await fetchFlightsFromGraphQL(resolved.from, resolved.to);
    } catch (_) {
      // keep flights = []
    }
    if (flights.length === 0) {
      flights = SAMPLE_FLIGHTS[route] || [];
    }
    displayFlightResults(flights, resolved.from, resolved.to, urlDate);
    addBookNowBar(block);
    const selectedFromUrl = getSelectedFlights();
    if (selectedFromUrl.length > 0) {
      updateDataLayerWithSelectedFlights(selectedFromUrl[selectedFromUrl.length - 1]);
    }
    return;
  }

  // No from/to resolved and not destination page — nothing to show
  return;
}