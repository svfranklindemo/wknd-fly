// Flight Search Block
import { readBlockConfig } from '../../scripts/aem.js';
import { dispatchCustomEvent } from '../../scripts/custom-events.js';
import { isAuthorEnvironment } from '../../scripts/scripts.js';
import { getPathDetails } from '../../scripts/utils.js';

const AUTHOR_GRAPHQL_BASE_For_Dropdown = 'https://author-p189874-e1977911.adobeaemcloud.com/graphql/execute.json/wknd-fly/flight-source-dropdown';
const PUBLISH_GRAPHQL_BASE_For_Dropdown = 'https://publish-p189874-e1977911.adobeaemcloud.com/graphql/execute.json/wknd-fly/flight-source-dropdown';

// Sample airport data
const FALLBACK_AIRPORTS = [
  { code: 'WAW', city: 'Warsaw', country: 'Poland' },
  { code: 'LHR', city: 'London', country: 'United Kingdom' },
  { code: 'CDG', city: 'Paris', country: 'France' },
  { code: 'ORD', city: 'Chicago', country: 'United States' },
  { code: 'LAS', city: 'Las Vegas', country: 'United States' },
  { code: 'JFK', city: 'New York', country: 'United States' },
  { code: 'SFR', city: 'San Francisco', country: 'United States' },
  { code: 'MBJ', city: 'Montego Bay', country: 'Jamaica' },
  { code: 'AMS', city: 'Amsterdam', country: 'Netherlands' },
  { code: 'TXL', city: 'Berlin', country: 'Germany' },
  { code: 'HND', city: 'Tokyo', country: 'Japan' },
  { code: 'CUN', city: 'Cancún', country: 'Mexico' },
  { code: 'DEL', city: 'Delhi', country: 'India' },
  { code: 'TQO', city: 'Tulum', country: 'Mexico' },
];
let airportsData = [...FALLBACK_AIRPORTS];

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
  const d = new Date(date);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const year = d.getFullYear();
  return `${month}/${day}/${year}`;
}

function getTodayDate() {
  const today = new Date();
  return formatDate(today);
}

function normalizeContentFragmentPath(path, isAuthor) {
  if (!path || typeof path !== 'string') return '';
  let normalizedPath = path.trim();
  if (typeof window !== 'undefined' && window.location?.origin) {
    normalizedPath = normalizedPath.replace(window.location.origin, '');
  }
  if (isAuthor) {
    normalizedPath = normalizedPath.replace(/\.html$/i, '');
  }
  return normalizedPath;
}

function findGraphQLItems(data) {
  if (!data || typeof data !== 'object') return [];
  const queue = [data];
  while (queue.length) {
    const current = queue.shift();
    if (!current || typeof current !== 'object') continue;
    if (Array.isArray(current?.items)) return current.items;
    Object.values(current).forEach((value) => {
      if (value && typeof value === 'object') queue.push(value);
    });
  }
  return [];
}

function parseAirportMappingString(value) {
  if (!value || typeof value !== 'string') return null;
  const codeMatch = value.match(/code\s*:\s*['"]([^'"]+)['"]/i);
  const cityMatch = value.match(/city\s*:\s*['"]([^'"]+)['"]/i);
  const countryMatch = value.match(/country\s*:\s*['"]([^'"]+)['"]/i);
  const code = (codeMatch?.[1] || '').trim().toUpperCase();
  if (!code) return null;
  return {
    code,
    city: (cityMatch?.[1] || code).trim(),
    country: (countryMatch?.[1] || '').trim(),
  };
}

function mapGraphQLItemToAirport(item) {
  if (!item || typeof item !== 'object') return null;
  const code = (item.airportCode ?? item.code ?? item.iataCode ?? item.shortCode ?? '').toString().trim().toUpperCase();
  if (!code) return null;
  const city = (item.airportCity ?? item.city ?? item.airportName ?? item.name ?? code).toString().trim() || code;
  const country = (item.airportCountry ?? item.country ?? item.region ?? '').toString().trim();
  return { code, city, country };
}

function extractAirportsFromDropdownPayload(payload) {
  const mapping = payload?.data?.flightDestinationDropdownByPath?.item?.destination_mapping;
  if (Array.isArray(mapping)) {
    return mapping
      .map((entry) => parseAirportMappingString(entry))
      .filter(Boolean);
  }
  const items = findGraphQLItems(payload?.data);
  return items
    .map((item) => mapGraphQLItemToAirport(item))
    .filter(Boolean);
}

async function fetchAirportsFromGraphQL(contentFragmentPath) {
  if (!contentFragmentPath) return [];
  const isAuthor = isAuthorEnvironment();
  try {
    const url = `${isAuthor ? AUTHOR_GRAPHQL_BASE_For_Dropdown : PUBLISH_GRAPHQL_BASE_For_Dropdown};path=${contentFragmentPath};ts=${Date.now()}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) return [];
    const payload = await response.json();
    if (payload?.errors?.length) return [];
    const airports = extractAirportsFromDropdownPayload(payload);
    const seenCodes = new Set();
    return airports.filter((airport) => {
        if (!airport || seenCodes.has(airport.code)) return false;
        seenCodes.add(airport.code);
        return true;
      });
  } catch (e) {
    console.warn('Airport dropdown GraphQL fetch failed:', e);
    return [];
  }
}

// Create airport dropdown
function createAirportDropdown(airports, selectedCode, placeholder, id) {
  const container = createElement('div', 'flight-input-group');
  const label = createElement('label', '', placeholder);
  label.setAttribute('for', id);
  
  const inputContainer = createElement('div', 'flight-input-container');
  const input = createElement('input', 'flight-input');
  input.type = 'text';
  input.id = id;
  input.placeholder = placeholder;
  input.value = selectedCode || '';
  input.readOnly = true;
  input.setAttribute('aria-label', placeholder);
  
  const dropdown = createElement('div', 'airport-dropdown');
  dropdown.style.display = 'none';
  
  airports.forEach((airport) => {
    const option = createElement('div', 'airport-option');
    option.dataset.code = airport.code;
    option.innerHTML = `
      <span class="airport-code">${airport.code}</span>
      <span class="airport-city">${airport.city}</span>
      <span class="airport-country">${airport.country}</span>
    `;
    option.addEventListener('click', () => {
      input.value = airport.code;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      dropdown.style.display = 'none';
      inputContainer.classList.remove('open');
      // Trigger search if both fields are filled
      const searchBtn = document.querySelector('.flight-search-button');
      if (searchBtn) {
        const fromInput = document.getElementById('flight-from');
        const toInput = document.getElementById('flight-to');
        if (fromInput.value && toInput.value) {
          // Auto-search can be enabled here if needed
        }
      }
    });
    dropdown.appendChild(option);
  });
  
  input.addEventListener('click', (e) => {
    e.stopPropagation();
    const allDropdowns = document.querySelectorAll('.airport-dropdown');
    allDropdowns.forEach((dd) => {
      if (dd !== dropdown) {
        dd.style.display = 'none';
        dd.parentElement.classList.remove('open');
      }
    });
    dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
    inputContainer.classList.toggle('open');
  });
  
  inputContainer.appendChild(input);
  inputContainer.appendChild(dropdown);
  container.appendChild(label);
  container.appendChild(inputContainer);
  
  return container;
}

// Create date picker
function createDatePicker(selectedDate, id) {
  const container = createElement('div', 'flight-input-group');
  const label = createElement('label', '', 'Date');
  label.setAttribute('for', id);
  
  const inputContainer = createElement('div', 'flight-input-container');
  const input = createElement('input', 'flight-input');
  input.type = 'date';
  input.id = id;
  input.value = selectedDate || '';
  input.min = getTodayDate();
  input.setAttribute('aria-label', 'Date');
  
  inputContainer.appendChild(input);
  container.appendChild(label);
  container.appendChild(inputContainer);
  
  return container;
}

// Default airport selection when no URL params
const DEFAULT_FROM = 'WAW';
const DEFAULT_TO = 'TQO';

// Fire a custom event (for Launch) when button has an event type – same pattern as page-view / custom-events.js
function fireButtonCustomEventIfConfigured(submitter) {
  const eventType = submitter?.dataset?.buttonEventType?.trim();
  if (!eventType) return;
  if (typeof window.updateDataLayer === 'function') {
    updateFlightSearchDataLayer();
  }
  dispatchCustomEvent(eventType);
}

// Create search form
function createFlightSearchForm(fromDefault = DEFAULT_FROM, toDefault = DEFAULT_TO) {
  const form = createElement('form', 'flight-search-form');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const submitter = e.submitter;
    if (submitter?.dataset?.buttonEventType) {
      fireButtonCustomEventIfConfigured(submitter);
    }
    handleSearch();
  });
  
  const searchRow = createElement('div', 'flight-search-row');
  
  // From dropdown (default WAW)
  const fromGroup = createAirportDropdown(airportsData, fromDefault, 'From', 'flight-from');
  searchRow.appendChild(fromGroup);
  
  // To dropdown (default TQO)
  const toGroup = createAirportDropdown(airportsData, toDefault, 'To', 'flight-to');
  searchRow.appendChild(toGroup);
  
  // Date picker
  const dateGroup = createDatePicker('', 'flight-date');
  searchRow.appendChild(dateGroup);
  
  // Search button
  const buttonGroup = createElement('div', 'flight-button-group');
  const searchButton = createElement('button', 'flight-search-button', 'Search');
  searchButton.type = 'submit';
  buttonGroup.appendChild(searchButton);
  searchRow.appendChild(buttonGroup);
  
  form.appendChild(searchRow);
  
  // Options row
  const optionsRow = createElement('div', 'flight-options-row');
  const options = [
    { id: 'business-trip', label: 'Business Trip' },
    { id: 'business-class', label: 'Business Class' },
    { id: 'travelling-children', label: 'Travelling with children' },
  ];
  
  options.forEach((option) => {
    const optionContainer = createElement('div', 'flight-option');
    const checkbox = createElement('input', 'flight-checkbox');
    checkbox.type = 'checkbox';
    checkbox.id = option.id;
    checkbox.name = option.id;
    
    const label = createElement('label', '', option.label);
    label.setAttribute('for', option.id);
    
    optionContainer.appendChild(checkbox);
    optionContainer.appendChild(label);
    optionsRow.appendChild(optionContainer);
  });
  
  form.appendChild(optionsRow);
  
  return form;
}

// Handle search
function handleSearch() {
  const fromInput = document.getElementById('flight-from');
  const toInput = document.getElementById('flight-to');
  const dateInput = document.getElementById('flight-date');
  
  const from = fromInput?.value?.trim() || '';
  const to = toInput?.value?.trim() || '';
  const date = dateInput?.value || '';
  
  // Build URL with query parameters (from, to, date are optional)
  const isAuthor = isAuthorEnvironment();
  const { pathname } = window.location;
  let flightsPath;
  
  if (isAuthor) {
    // Author environment: /content/wknd-fly/language-masters/en/home.html
    // Get language code from path details and ensure it's in the URL
    const pathDetails = getPathDetails();
    const { langCode } = pathDetails;
    const pathParts = pathname.split('/');
    const langMastersIndex = pathParts.indexOf('language-masters');
    
    if (langMastersIndex !== -1) {
      // Check if language code exists after language-masters
      const expectedLangIndex = langMastersIndex + 1;
      const hasLanguageCode = pathParts.length > expectedLangIndex 
        && /^[a-z]{2,3}$/i.test(pathParts[expectedLangIndex]) 
        && !pathParts[expectedLangIndex].includes('.html');
      
      if (hasLanguageCode) {
        // Path has language: /content/wknd-fly/language-masters/en/home.html
        // Replace last part (e.g., 'home.html') with 'flights.html'
        pathParts[pathParts.length - 1] = 'flights.html';
        flightsPath = pathParts.join('/');
      } else {
        // Language code missing, insert it before the page name
        // /content/wknd-fly/language-masters/home.html -> /content/wknd-fly/language-masters/en/flights.html
        const languageToUse = langCode || 'en';
        // Insert language code after language-masters
        pathParts.splice(langMastersIndex + 1, 0, languageToUse);
        // Replace last part with flights.html
        pathParts[pathParts.length - 1] = 'flights.html';
        flightsPath = pathParts.join('/');
      }
    } else {
      // No language-masters found, use getPathDetails to construct path
      // This shouldn't happen in author, but handle it
      const languageToUse = langCode || 'en';
      pathParts[pathParts.length - 1] = 'flights.html';
      flightsPath = pathParts.join('/');
    }
  } else {
    // Live site: /en/flights or /web/wknd-fly/flights
    // Get path details to extract language and structure
    const pathDetails = getPathDetails();
    const { langCode, prefix } = pathDetails;
    
    if (langCode) {
      // Path has language: /en/home -> /en/flights
      // Or /web/wknd-fly/en/home -> /web/wknd-fly/en/flights
      if (prefix) {
        flightsPath = `${prefix}/${langCode}/flights`;
      } else {
        flightsPath = `/${langCode}/flights`;
      }
    } else {
      // No language detected, use current path structure
      // /web/wknd-fly/home -> /web/wknd-fly/flights
      const pathParts = pathname.split('/').filter(Boolean);
      if (pathParts.length > 0) {
        pathParts[pathParts.length - 1] = 'flights';
        flightsPath = '/' + pathParts.join('/');
      } else {
        flightsPath = '/flights';
      }
    }
  }
  
  // Build query string (only include non-empty values)
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  if (date) params.set('date', date);
  
  const queryString = params.toString();
  const url = queryString ? `${flightsPath}?${queryString}` : flightsPath;
  setTimeout(() => { window.location.href = url; }, 2000);
}


// Push current flight search form values to datalayer (from, to, date, options)
function updateFlightSearchDataLayer() {
  if (typeof window.updateDataLayer !== 'function') return;
  const fromInput = document.getElementById('flight-from');
  const toInput = document.getElementById('flight-to');
  const dateInput = document.getElementById('flight-date');
  const businessTrip = document.getElementById('business-trip');
  const businessClass = document.getElementById('business-class');
  const travellingChildren = document.getElementById('travelling-children');
  const dateVal = dateInput?.value?.trim();
  const todayYYYYMMDD = typeof window.getDataLayerDate === 'function'
    ? window.getDataLayerDate(new Date().toISOString().slice(0, 10))
    : '';
  const updates = {
    from: fromInput?.value?.trim() || '',
    to: toInput?.value?.trim() || '',
    date: (typeof window.getDataLayerDate === 'function' ? (window.getDataLayerDate(dateVal) || todayYYYYMMDD) : (dateVal || todayYYYYMMDD)) || '',
    options: {
      businessTrip: (typeof window.getDataLayerYesNo === 'function' ? window.getDataLayerYesNo(businessTrip?.checked) : (businessTrip?.checked ? 'y' : 'n')),
      businessClass: (typeof window.getDataLayerYesNo === 'function' ? window.getDataLayerYesNo(businessClass?.checked) : (businessClass?.checked ? 'y' : 'n')),
      familyTrip: (typeof window.getDataLayerYesNo === 'function' ? window.getDataLayerYesNo(travellingChildren?.checked) : (travellingChildren?.checked ? 'y' : 'n')),
    },
  };
  window.updateDataLayer(updates, true);
}

// Attach listeners so datalayer updates as soon as user changes dropdown, date, or checkboxes
function attachFlightSearchDataLayerUpdates(block) {
  const form = block.querySelector('.flight-search-form');
  if (!form) return;
  updateFlightSearchDataLayer(); // set initial values
  const fromInput = document.getElementById('flight-from');
  const toInput = document.getElementById('flight-to');
  const dateInput = document.getElementById('flight-date');
  const businessTrip = document.getElementById('business-trip');
  const businessClass = document.getElementById('business-class');
  const travellingChildren = document.getElementById('travelling-children');
  [fromInput, toInput, dateInput, businessTrip, businessClass, travellingChildren].forEach((el) => {
    if (el) el.addEventListener('change', updateFlightSearchDataLayer);
  });
  if (dateInput) dateInput.addEventListener('input', updateFlightSearchDataLayer);
}

// Close dropdowns when clicking outside
function setupClickOutside() {
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.flight-input-container')) {
      const dropdowns = document.querySelectorAll('.airport-dropdown');
      dropdowns.forEach((dropdown) => {
        dropdown.style.display = 'none';
        dropdown.parentElement.classList.remove('open');
      });
    }
  });
}

// Main decorate function
export default async function decorate(block) {
  const config = readBlockConfig(block) || {};
  const isAuthor = isAuthorEnvironment();
  /* Hide button config rows (index >= 7) on published/live, same as hero/cards */
  [...block.children].forEach((row, index) => {
    if (index >= 7) row.style.display = 'none';
  });

  // Clear block
  block.innerHTML = '';
  block.className = 'flight-search';

  const customStyles = config.customstyles;
  if (customStyles && String(customStyles).trim()) {
    block.classList.add(String(customStyles).trim());
  }
  
  let flightDropdownContentFragmentPath = null;
  if(config.flightdropdowncontentfragment || config['flightdropdowncontentfragment']) {
    flightDropdownContentFragmentPath = config.flightdropdowncontentfragment ?? config['flightdropdowncontentfragment'];
    flightDropdownContentFragmentPath = normalizeContentFragmentPath(flightDropdownContentFragmentPath, isAuthor);
  }

  if (flightDropdownContentFragmentPath) {
    const fetchedAirports = await fetchAirportsFromGraphQL(flightDropdownContentFragmentPath);
    if (fetchedAirports.length > 0) {
      airportsData = fetchedAirports;
    } else {
      airportsData = [...FALLBACK_AIRPORTS];
    }
  } else {
    airportsData = [...FALLBACK_AIRPORTS];
  }

  // Check for URL parameters to pre-fill form (override defaults when present)
  const urlParams = new URLSearchParams(window.location.search);
  const fromParam = urlParams.get('from');
  const toParam = urlParams.get('to');
  const dateParam = urlParams.get('date');
  
  const form = createFlightSearchForm(fromParam || DEFAULT_FROM, toParam || DEFAULT_TO);
  block.appendChild(form);

  // Apply button config as data attributes on the Search button (for analytics/webhooks)
  const searchButton = block.querySelector('.flight-search-button');
  if (searchButton) {
    const eventType = config.buttoneventtype ?? config['button-event-type'];
    if (eventType && String(eventType).trim()) searchButton.dataset.buttonEventType = String(eventType).trim();
    const webhookUrl = config.buttonwebhookurl ?? config['button-webhook-url'];
    if (webhookUrl && String(webhookUrl).trim()) searchButton.dataset.buttonWebhookUrl = String(webhookUrl).trim();
    const formId = config.buttonformid ?? config['button-form-id'];
    if (formId && String(formId).trim()) searchButton.dataset.buttonFormId = String(formId).trim();
    const buttonData = config.buttondata ?? config['button-data'];
    if (buttonData && String(buttonData).trim()) searchButton.dataset.buttonData = String(buttonData).trim();
  }

  // Setup click outside handler
  setupClickOutside();
  // Update datalayer when user changes From/To dropdowns, date, or option checkboxes
  attachFlightSearchDataLayerUpdates(block);
  
  if (dateParam) {
    const dateInput = document.getElementById('flight-date');
    if (dateInput) dateInput.value = dateParam;
  }
}
