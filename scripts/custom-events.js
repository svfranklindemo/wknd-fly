// ==========================================
// Custom Events for Launch
// Fires "page-view" when dataLayer is ready; dispatchCustomEvent(eventName) used by blocks (registration, sign-in, join-us, flight-search).
// ==========================================

const LAUNCH_WAIT_TIMEOUT_MS = 10000;
const LAUNCH_POLL_INTERVAL_MS = 50;
const LAUNCH_QUEUE_STORAGE_KEY = 'secur_financial_launch_event_queue';
const LAUNCH_QUEUE_TTL_MS = 30 * 60 * 1000;
const LAUNCH_QUEUE_MAX_EVENTS = 100;
const LAUNCH_FLUSH_POLL_TIMEOUT_MS = 60000;

let pageViewHandled = false;

function isLaunchReady() {
  return Boolean(
    (typeof window._satellite !== 'undefined' && window._satellite)
    || window._launchReady === true,
  );
}

function getDataLayerSnapshot() {
  try {
    return typeof window.dataLayer !== 'undefined'
      ? JSON.parse(JSON.stringify(window.dataLayer))
      : null;
  } catch (error) {
    console.warn('[Launch custom event] Failed to clone dataLayer snapshot:', error);
    return null;
  }
}

function emitEvent(name, dataLayerSnapshot, meta = {}) {
  console.debug('[Launch custom event] Firing:', name, '| meta:', meta, '| dataLayer:', dataLayerSnapshot);
  document.dispatchEvent(
    new CustomEvent(name, {
      bubbles: true,
      detail: {
        dataLayer: dataLayerSnapshot,
        ...meta,
      },
    }),
  );
}

function readLaunchQueue() {
  try {
    const raw = sessionStorage.getItem(LAUNCH_QUEUE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const now = Date.now();
    return parsed
      .filter((item) => item && typeof item.name === 'string' && item.timestamp)
      .filter((item) => now - Number(item.timestamp) <= LAUNCH_QUEUE_TTL_MS);
  } catch (error) {
    console.warn('[Launch queue] Failed to read queue:', error);
    return [];
  }
}

function writeLaunchQueue(queue) {
  try {
    sessionStorage.setItem(LAUNCH_QUEUE_STORAGE_KEY, JSON.stringify(queue));
  } catch (error) {
    console.warn('[Launch queue] Failed to write queue:', error);
  }
}

function enqueueLaunchEvent(name, dataLayerSnapshot) {
  const queue = readLaunchQueue();
  queue.push({
    name,
    dataLayer: dataLayerSnapshot,
    timestamp: Date.now(),
    path: `${window.location.pathname}${window.location.search}`,
  });
  const trimmedQueue = queue.slice(-LAUNCH_QUEUE_MAX_EVENTS);
  writeLaunchQueue(trimmedQueue);
  console.debug('[Launch queue] Queued event:', name, '| queue size:', trimmedQueue.length);
}

export function flushQueuedLaunchEvents() {
  if (!isLaunchReady()) return 0;
  const queue = readLaunchQueue();
  if (!queue.length) return 0;
  writeLaunchQueue([]);
  queue.forEach((item) => {
    emitEvent(item.name, item.dataLayer ?? null, {
      replayed: true,
      originalTimestamp: item.timestamp,
      originalPath: item.path || '',
    });
  });
  console.debug('[Launch queue] Flushed events:', queue.length);
  return queue.length;
}

export function dispatchCustomEvent(eventName, options = {}) {
  const name = eventName && String(eventName).trim();
  if (!name) return false;

  const dataLayerSnapshot = Object.prototype.hasOwnProperty.call(options, 'dataLayerSnapshot')
    ? options.dataLayerSnapshot
    : getDataLayerSnapshot();

  if (!isLaunchReady()) {
    if (options.allowQueue !== false) enqueueLaunchEvent(name, dataLayerSnapshot);
    return false;
  }

  flushQueuedLaunchEvents();
  emitEvent(name, dataLayerSnapshot, { replayed: false });
  return true;
}

function waitAndFlushLaunchQueue(startTime = Date.now()) {
  if (flushQueuedLaunchEvents() > 0) return;
  if (isLaunchReady()) return;
  if ((Date.now() - startTime) >= LAUNCH_FLUSH_POLL_TIMEOUT_MS) return;
  setTimeout(() => waitAndFlushLaunchQueue(startTime), LAUNCH_POLL_INTERVAL_MS);
}

/**
 * Waits for dataLayer to be ready, then fires page-view on every page.
 */
function firePageViewWhenReady(startTime = Date.now()) {
  if (pageViewHandled) return;

  if (!window.dataLayer || !window._dataLayerReady) {
    setTimeout(() => firePageViewWhenReady(startTime), LAUNCH_POLL_INTERVAL_MS);
    return;
  }
  if (window._dataLayerQueue && window._dataLayerQueue.length > 0) {
    setTimeout(() => firePageViewWhenReady(startTime), LAUNCH_POLL_INTERVAL_MS);
    return;
  }
  if (window._dataLayerUpdating) {
    document.addEventListener('dataLayerUpdated', () => firePageViewWhenReady(startTime), { once: true });
    return;
  }

  const waited = Date.now() - startTime;
  if (!isLaunchReady() && waited < LAUNCH_WAIT_TIMEOUT_MS) {
    setTimeout(() => firePageViewWhenReady(startTime), LAUNCH_POLL_INTERVAL_MS);
    return;
  }

  if (!isLaunchReady()) {
    console.warn('[Launch custom event] Launch not ready before timeout; queueing page-view with snapshot');
  }
  clearProductUnlessProductIdInUrl();
  pageViewHandled = true;
  dispatchCustomEvent('page-view');
}

function clearProductUnlessProductIdInUrl() {
  const params = new URLSearchParams(window.location.search);
  const hasProductId = params.has('product-id');

  if (!hasProductId) {
    localStorage.removeItem('product');
  }
}

export async function initializeCustomEvents() {
  try {
    waitAndFlushLaunchQueue();
    document.addEventListener('launchReady', () => {
      flushQueuedLaunchEvents();
    });
    firePageViewWhenReady();
  } catch (error) {
    console.error("Error initializing custom events:", error);
  }
}
