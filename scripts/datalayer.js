// ==========================================
// DataLayer Management System - WKND Fly
// Only properties present in data-elements.json are initialized.
// No checkout (not in data-elements). Cart has only total (Reservation-TotalValue).
// ==========================================

window._dataLayerQueue = window._dataLayerQueue || [];
window._dataLayerReady = false;
window._dataLayerUpdating = false;

let _dataLayer = null;

const STORAGE_KEY = 'wkndfly_dataLayer';
const STORAGE_TIMESTAMP_KEY = 'wkndfly_dataLayer_timestamp';
const STORAGE_TTL = 30 * 24 * 60 * 60 * 1000;
const ECID_SESSION_KEY = 'com.adobe.reactor.dataElements.ECID';

function isObject(item) {
  return item && typeof item === 'object' && !Array.isArray(item);
}

function deepMerge(target, source) {
  if (!target) {
    return isObject(source) ? { ...source } : source;
  }
  const output = { ...target };
  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach((key) => {
      if (isObject(source[key])) {
        if (!target[key] || !isObject(target[key])) {
          output[key] = { ...source[key] };
        } else {
          output[key] = deepMerge(target[key], source[key]);
        }
      } else {
        output[key] = source[key];
      }
    });
  }
  return output;
}

function getEcidFromSession() {
  try {
    if (typeof sessionStorage !== 'undefined') {
      const ecid = sessionStorage.getItem(ECID_SESSION_KEY);
      return (ecid && String(ecid).trim()) || '';
    }
  } catch (e) {
    // ignore
  }
  return '';
}

function applyEcidToDataLayer() {
  if (!_dataLayer || !_dataLayer._demosystem4) return;
  const ecid = getEcidFromSession();
  if (!_dataLayer._demosystem4.identification) _dataLayer._demosystem4.identification = {};
  const core = _dataLayer._demosystem4.identification.core;
  if (!core) {
    _dataLayer._demosystem4.identification.core = { ecid: '', email: null, loyaltyId: '', isMember: 'n' };
  }
  _dataLayer._demosystem4.identification.core.ecid = ecid || _dataLayer._demosystem4.identification.core.ecid || '';
}

function normalizeDemosystem4Email() {
  if (!_dataLayer?._demosystem4?.identification?.core) return;
  const core = _dataLayer._demosystem4.identification.core;
  if (core.email === '') core.email = null;
}

function dispatchDataLayerEvent(eventType = 'initialized') {
  document.dispatchEvent(
    new CustomEvent('dataLayerUpdated', {
      bubbles: true,
      detail: {
        dataLayer: JSON.parse(JSON.stringify(_dataLayer)),
        type: eventType,
      },
    })
  );
}

function processDataLayerQueue() {
  if (window._dataLayerQueue && window._dataLayerQueue.length > 0) {
    window._dataLayerQueue.forEach((queuedUpdate) => {
      const { updates, merge } = queuedUpdate;
      if (merge) {
        _dataLayer = deepMerge(_dataLayer, updates);
      } else {
        _dataLayer = { ..._dataLayer, ...updates };
      }
    });
    try {
      const now = Date.now().toString();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(_dataLayer));
      localStorage.setItem(STORAGE_TIMESTAMP_KEY, now);
    } catch (storageError) {
      console.warn('⚠ Could not persist dataLayer:', storageError.message);
    }
    window._dataLayerQueue = [];
    dispatchDataLayerEvent('updated');
  }
}

/**
 * Initial dataLayer structure only from paths in data-elements.json.
 * project: only id, currency (Project-ID, Currency). No locale.
 * cart: only total (Reservation-TotalValue).
 */
function getInitialDataLayerFromDataElements() {
  return {
    project: {
      id: 'wknd-fly',
      currency: 'USD',
    },
    page: {
      thumbnail: '',
      name: '',
      title: '',
    },
    product: {
      id: '',
      image: '',
      name: '',
      category: '',
    },
    cart: {
      products: {},
      productCount: 0,
      subTotal: 0,
      total: 0,
    },
    bookingReference: '',
    flightLength: 0,
    flightNumber: '',
    ticketNumber: '',
    itineraryNumber: '',
    class: '',
    upgradeWithPoints: 'n',
    travelPreferences: {
      seat: '',
      seatSection: '',
      meal: '',
    },
    wizard: {
      name: '',
    },
    options: {},
    partnerData: {
      Presence_of_premimum_credit_card: 'n',
      VacationSpenders: 87,
      PartnerID: "Partner456"
    },
    payment: {
      nameOnCard: '',
      cardExpiration: '',
      cvv: '',
      cardNumber: '',
    },
    smsConsent: 'n',
    loyaltyConsent: 'n',
    person: {
      name: {
        firstName: '',
        middleName: '',
        lastName: '',
      },
      gender: '',
      birthDate: '',
      isMember: 'n',
    },
    consents: {},
    homeAddress: {
      postalCode: '',
      city: '',
      street1: '',
    },
    profile: {
      cookiePolicy: '',
    },
    _demosystem4: {
      identification: {
        core: {
          ecid: '',
          email: null,
          loyaltyId: '',
          isMember: 'n',
        },
      },
      demoEnvironment: {
        brandName: 'wknd-fly',
      },
      interactionDetails: {
        core: {
          channel: 'web',
        },
      },
    },
    personalEmail: {
      address: '',
    },
    mobilePhone: {
      number: '',
    },
  };
}

export function buildCustomDataLayer() {
  try {
    const savedDataLayer = localStorage.getItem(STORAGE_KEY);
    const savedTimestamp = localStorage.getItem(STORAGE_TIMESTAMP_KEY);

    let isDataValid = false;
    if (savedDataLayer && savedTimestamp) {
      const cacheAge = Date.now() - parseInt(savedTimestamp, 10);
      if (cacheAge <= STORAGE_TTL) {
        isDataValid = true;
      } else {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(STORAGE_TIMESTAMP_KEY);
      }
    }

    if (savedDataLayer && isDataValid) {
      _dataLayer = JSON.parse(savedDataLayer);
      normalizeDemosystem4Email();
    } else {
      _dataLayer = getInitialDataLayerFromDataElements();
    }

    applyEcidToDataLayer();

    if (!_dataLayer.page) _dataLayer.page = {};
    _dataLayer.page.title = document.title || _dataLayer.page.title;
    _dataLayer.page.name = (document.title || '').toLowerCase() || _dataLayer.page.name;

    try {
      const now = Date.now().toString();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(_dataLayer));
      localStorage.setItem(STORAGE_TIMESTAMP_KEY, now);
    } catch (storageError) {
      console.warn('⚠ Could not persist dataLayer:', storageError.message);
    }

    Object.defineProperty(window, 'dataLayer', {
      get() {
        return JSON.parse(JSON.stringify(_dataLayer));
      },
      set() {
        console.error(
          '❌ Direct assignment to window.dataLayer is not allowed. Use window.updateDataLayer() instead.'
        );
        throw new Error('Direct modification of dataLayer is prohibited. Use updateDataLayer() method.');
      },
      configurable: false,
      enumerable: true,
    });

    window._dataLayerReady = true;
    processDataLayerQueue();

    setTimeout(() => {
      dispatchDataLayerEvent(savedDataLayer ? 'restored' : 'initialized');
    }, 0);
  } catch (error) {
    console.error('Error initializing dataLayer:', error);
    _dataLayer = getInitialDataLayerFromDataElements();
    Object.defineProperty(window, 'dataLayer', {
      get() { return JSON.parse(JSON.stringify(_dataLayer)); },
      set() { console.error('❌ Direct assignment to window.dataLayer is not allowed.'); },
    });
    window._dataLayerReady = true;
    processDataLayerQueue();
  }
}

window.updateDataLayer = function (updates, merge = true) {
  if (!updates || typeof updates !== 'object') {
    console.error('Invalid updates provided to updateDataLayer');
    return;
  }
  if (!window._dataLayerReady || !_dataLayer) {
    window._dataLayerQueue.push({ updates, merge });
    return;
  }
  window._dataLayerUpdating = true;
  if (merge) {
    _dataLayer = deepMerge(_dataLayer, updates);
  } else {
    _dataLayer = { ..._dataLayer, ...updates };
  }
  normalizeDemosystem4Email();
  try {
    const now = Date.now().toString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(_dataLayer));
    localStorage.setItem(STORAGE_TIMESTAMP_KEY, now);
  } catch (storageError) {
    console.warn('⚠ Could not persist dataLayer:', storageError.message);
  }
  window._dataLayerUpdating = false;
  dispatchDataLayerEvent('updated');
};

window.getDataLayerProperty = function (path) {
  if (!_dataLayer) return undefined;
  if (!path) return JSON.parse(JSON.stringify(_dataLayer));
  const keys = path.split('.');
  let value = _dataLayer;
  for (const key of keys) {
    if (value && typeof value === 'object' && key in value) {
      value = value[key];
    } else {
      return undefined;
    }
  }
  return typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value;
};

window.clearDataLayer = function () {
  window._dataLayerQueue = [];
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(STORAGE_TIMESTAMP_KEY);
};

window.getDataLayerQueueStatus = function () {
  return {
    ready: window._dataLayerReady,
    dataLayerQueueLength: window._dataLayerQueue ? window._dataLayerQueue.length : 0,
    dataLayerQueue: window._dataLayerQueue || [],
  };
};

// Normalize boolean/checkbox/radio to Oxygen pattern: 'y' or 'n' for dataLayer/XDM
window.getDataLayerYesNo = function (val) {
  if (val === true || val === 'y' || val === 'yes' || val === 1) return 'y';
  if (val === false || val === 'n' || val === 'no' || val === 0 || val === '' || val == null) return 'n';
  return String(val).toLowerCase() === 'y' || String(val).toLowerCase() === 'yes' ? 'y' : 'n';
};

// Normalize flight class to AEP enum (first class | business class | premium economy | economy)
window.getDataLayerFlightClass = function (val) {
  if (val == null || val === '') return '';
  const v = String(val).trim().toLowerCase();
  if (v === 'standard') return 'economy';
  if (v === 'business') return 'business class';
  if (v === 'first class' || v === 'first') return 'first class';
  if (v === 'premium economy') return 'premium economy';
  if (v === 'economy') return 'economy';
  return 'economy';
};

// Normalize flight length to integer for dataLayer/XDM (minutes)
window.getDataLayerFlightLength = function (val) {
  if (val == null || val === '') return 0;
  const n = typeof val === 'number' ? val : parseInt(String(val).trim(), 10);
  return Number.isNaN(n) ? 0 : Math.max(0, Math.floor(n));
};

// Normalize date to ISO 8601 for dataLayer/XDM (e.g. "2026-03-10T18:30:00Z" — no milliseconds)
window.getDataLayerDate = function (val) {
  if (val == null || val === '') return '';
  const s = String(val).trim();
  if (!s) return '';
  const stripMs = (iso) => (typeof iso === 'string' ? iso.replace(/\.\d{3}Z$/i, 'Z') : iso);
  if (s.indexOf('T') !== -1) return stripMs(s); // already ISO-like
  const match = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}T00:00:00Z`;
  try {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? '' : stripMs(d.toISOString());
  } catch {
    return '';
  }
};

buildCustomDataLayer();
