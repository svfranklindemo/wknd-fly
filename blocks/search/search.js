import {
  createOptimizedPicture,
  decorateIcons
} from '../../scripts/aem.js';
import { fetchPlaceholders } from '../../scripts/placeholders.js';
import { getLanguage } from '../../scripts/utils.js';

const searchParams = new URLSearchParams(window.location.search);

// --- Utilities ---
function debounce(fn, delay = 200) {
  let timerId;
  return (...args) => {
    clearTimeout(timerId);
    timerId = setTimeout(() => fn(...args), delay);
  };
}

function safeText(value) {
  return typeof value === 'string' ? value : '';
}

function findNextHeading(el) {
  let preceedingEl = el.parentElement.previousElement || el.parentElement.parentElement;
  let h = 'H2';
  while (preceedingEl) {
    const lastHeading = [...preceedingEl.querySelectorAll('h1, h2, h3, h4, h5, h6')].pop();
    if (lastHeading) {
      const level = parseInt(lastHeading.nodeName[1], 10);
      h = level < 6 ? `H${level + 1}` : 'H6';
      preceedingEl = false;
    } else {
      preceedingEl = preceedingEl.previousElement || preceedingEl.parentElement;
    }
  }
  // Default down to H4 to avoid very large headings inside result cards
  if (h === 'H2') return 'H4';
  return h;
}

function highlightTextElements(terms, elements) {
  elements.forEach((element) => {
    if (!element || !element.textContent) return;

    const matches = [];
    const { textContent } = element;
    terms.forEach((term) => {
      let start = 0;
      let offset = textContent.toLowerCase().indexOf(term.toLowerCase(), start);
      while (offset >= 0) {
        matches.push({ offset, term: textContent.substring(offset, offset + term.length) });
        start = offset + term.length;
        offset = textContent.toLowerCase().indexOf(term.toLowerCase(), start);
      }
    });

    if (!matches.length) {
      return;
    }

    matches.sort((a, b) => a.offset - b.offset);
    let currentIndex = 0;
    const fragment = matches.reduce((acc, { offset, term }) => {
      if (offset < currentIndex) return acc;
      const textBefore = textContent.substring(currentIndex, offset);
      if (textBefore) {
        acc.appendChild(document.createTextNode(textBefore));
      }
      const markedTerm = document.createElement('mark');
      markedTerm.textContent = term;
      acc.appendChild(markedTerm);
      currentIndex = offset + term.length;
      return acc;
    }, document.createDocumentFragment());
    const textAfter = textContent.substring(currentIndex);
    if (textAfter) {
      fragment.appendChild(document.createTextNode(textAfter));
    }
    element.innerHTML = '';
    element.appendChild(fragment);
  });
}

function getSnippet(result, searchTerms, searchPhrase) {
  const sourceText = (result.body || result.description || '').trim();
  if (!sourceText) return '';
  const lc = sourceText.toLowerCase();
  let bestIdx = -1;
  // Prefer exact phrase if present
  if (searchPhrase && searchPhrase.length >= 2) {
    const phraseIdx = lc.indexOf(searchPhrase);
    if (phraseIdx >= 0) bestIdx = phraseIdx;
  }
  searchTerms.forEach((t) => {
    const idx = lc.indexOf(t.toLowerCase());
    if (idx >= 0 && (bestIdx === -1 || idx < bestIdx)) bestIdx = idx;
  });
  let start = 0;
  let end = Math.min(sourceText.length, 180);
  if (bestIdx >= 0) {
    start = Math.max(0, bestIdx - 60);
    end = Math.min(sourceText.length, bestIdx + 120);
  }
  let snippet = sourceText.slice(start, end).replace(/\s+/g, ' ').trim();
  if (start > 0) snippet = `… ${snippet}`;
  if (end < sourceText.length) snippet = `${snippet} …`;
  return snippet;
}

export async function fetchData(source) {
  try {
    const response = await fetch(source, { credentials: 'same-origin' });
    if (!response.ok) {
      // eslint-disable-next-line no-console
      console.error('[search] error loading index:', response.status, response.statusText);
      return [];
    }
    const json = await response.json();
    if (!json || !Array.isArray(json.data)) return [];
    return json.data;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[search] fetchData failed', e);
    return [];
  }
}

function applySearchPathFilter(data, searchPath) {
  const list = Array.isArray(data) ? data : [];
  const prefix = (searchPath || '').trim().toLowerCase();
  if (!prefix || prefix === '/' || prefix === '*') return list;
  return list.filter((r) => typeof r?.path === 'string' && r.path.toLowerCase().startsWith(prefix));
}

function deriveScopeFromRaw(raw) {
  const value = (raw || '').trim();
  if (!value) return '';
  const marker = '/language-masters/';
  const idx = value.indexOf(marker);
  if (idx >= 0) {
    const after = value.slice(idx + marker.length);
    const lang = (after.split('/')[0] || '').trim();
    return lang ? `/${lang}` : '';
  }
  if (value.startsWith('/')) {
    const seg = value.split('/').filter(Boolean)[0] || '';
    return seg ? `/${seg}` : '';
  }
  return '';
}

function getScopedPrefix(block) {
  // forwarded scope from overlay → search page takes precedence
  if (block && typeof block._forwardedScope === 'string' && block._forwardedScope) return block._forwardedScope;
  try {
    const a = block.querySelector(':scope > div:nth-child(1) .button-container a[href]');
    const raw = (a?.textContent || a?.getAttribute('href') || '').trim();
    return deriveScopeFromRaw(raw);
  } catch (e) { /* noop */ }
  return '';
}

function attachScopeParam(url, scope) {
  if (!url || !scope) return;
  if (scope !== '/') url.searchParams.set('sp', scope);
}

function isExcludedResult(result) {
  const path = safeText(result.path).toLowerCase();
  const robots = safeText(result.robots).toLowerCase();
  if (robots.includes('noindex')) return true;
  if (/\/(nav|footer)$/i.test(path)) return true;
  return false;
}

function renderResult(result, searchTerms, searchPhrase, titleTag) {
  const li = document.createElement('li');
  const a = document.createElement('a');
  a.href = result.path;
  if (result.image) {
    const wrapper = document.createElement('div');
    wrapper.className = 'search-result-image';
    const pic = createOptimizedPicture(result.image, '', false, [{ width: '375' }]);
    wrapper.append(pic);
    a.append(wrapper);
  }
  const displayTitle = result.navTitle || result.title;
  if (displayTitle) {
    const title = document.createElement(titleTag);
    title.className = 'search-result-title';
    const link = document.createElement('a');
    link.href = result.path;
    link.textContent = displayTitle;
    highlightTextElements(searchTerms, [link]);
    title.append(link);
    a.append(title);
  }
  const snippetText = getSnippet(result, searchTerms, searchPhrase);
  if (snippetText) {
    const description = document.createElement('p');
    description.textContent = snippetText;
    highlightTextElements(searchTerms, [description]);
    a.append(description);
  }
  li.append(a);
  return li;
}

function clearSearchResults(block) {
  const searchResults = block.querySelector('.search-results');
  searchResults.innerHTML = '';
}

function clearSearch(block) {
  clearSearchResults(block);
  const dropdown = block.querySelector('.search-dropdown');
  if (dropdown) dropdown.classList.remove('open');
  if (dropdown && dropdown.parentElement) dropdown.parentElement.classList.remove('open');
  // collapse expanded mode if present
  if (block.classList.contains('expanded')) {
    block.classList.remove('expanded');
    const expanded = block.querySelector('.search-expanded');
    if (expanded) expanded.remove();
  }
  if (window.history.replaceState) {
    const url = new URL(window.location.href);
    url.search = '';
    searchParams.delete('q');
    window.history.replaceState({}, '', url.toString());
  }
}

async function renderResults(block, config, filteredData, searchTerms, searchPhrase) {
  clearSearchResults(block);
  const searchResults = block.querySelector('.search-results');
  const headingTag = searchResults.dataset.h;
  const dropdown = block.querySelector('.search-dropdown');

  if (filteredData.length) {
    searchResults.classList.remove('no-results');
    filteredData.forEach((result) => {
      const li = renderResult(result, searchTerms, searchPhrase, headingTag);
      searchResults.append(li);
    });
    if (dropdown) {
      dropdown.classList.add('open');
      if (dropdown.parentElement) dropdown.parentElement.classList.add('open');
    }
  } else {
    const noResultsMessage = document.createElement('li');
    searchResults.classList.add('no-results');
    noResultsMessage.textContent = config.placeholders.searchNoResults || 'No results found.';
    searchResults.append(noResultsMessage);
    if (dropdown) {
      dropdown.classList.add('open');
      if (dropdown.parentElement) dropdown.parentElement.classList.add('open');
    }
  }
}

function compareFound(hit1, hit2) {
  return hit1.minIdx - hit2.minIdx;
}

function filterData(searchTerms, data, searchPhrase) {
  const foundInHeader = [];
  const foundInMeta = [];
  const foundByPhrase = [];

  (Array.isArray(data) ? data : []).forEach((result) => {
    let minIdx = -1;

    searchTerms.forEach((term) => {
      const idx = safeText(result.header || result.navTitle).toLowerCase().indexOf(term);
      if (idx < 0) return;
      if (minIdx < idx) minIdx = idx;
    });

    if (minIdx >= 0) {
      foundInHeader.push({ minIdx, result });
      return;
    }

    const metaContents = `${safeText(result.navTitle || result.title)} ${safeText(result.description)} ${safeText(result.body)} ${safeText(result.path)?.split('/').pop() || ''}`.toLowerCase();

    // Prefer exact phrase match across meta contents
    if (searchPhrase && searchPhrase.length >= 2) {
      const phraseIdx = metaContents.indexOf(searchPhrase);
      if (phraseIdx >= 0) {
        foundByPhrase.push({ minIdx: phraseIdx, result });
        return;
      }
    }
    searchTerms.forEach((term) => {
      const idx = metaContents.indexOf(term);
      if (idx < 0) return;
      if (minIdx < idx) minIdx = idx;
    });

    if (minIdx >= 0) {
      foundInMeta.push({ minIdx, result });
    }
  });

  return [
    ...foundByPhrase.sort(compareFound),
    ...foundInHeader.sort(compareFound),
    ...foundInMeta.sort(compareFound),
  ].map((item) => item.result);
}

async function handleSearchImpl(e, block, config) {
  const inputEl = block?.querySelector?.('input.search-input');
  const searchValue = (e && e.target && typeof e.target.value === 'string'
    ? e.target.value
    : (inputEl && typeof inputEl.value === 'string' ? inputEl.value : '')) || '';
  searchParams.set('q', searchValue);
  if (window.history.replaceState) {
    const url = new URL(window.location.href);
    url.search = searchParams.toString();
    window.history.replaceState({}, '', url.toString());
  }

  if (searchValue.length < 3) {
    clearSearch(block);
    return;
  }
  const searchPhrase = searchValue.toLowerCase().trim();
  const searchTerms = searchPhrase.split(/\s+/).filter((term) => term && term.length >= 2);

  const authoredPrefix = getScopedPrefix(block);
  const data = (await fetchData(config.source)).filter((r) => !isExcludedResult(r));
  const scoped = applySearchPathFilter(data, authoredPrefix);
  const filteredData = filterData(searchTerms, scoped, searchPhrase);
  await renderResults(block, config, filteredData, searchTerms, searchPhrase);
}

const handleSearch = debounce(handleSearchImpl, 150);

function searchResultsContainer(block) {
  const results = document.createElement('ul');
  results.className = 'search-results';
  results.dataset.h = findNextHeading(block);
  return results;
}

function searchInput(block, config) {
  const input = document.createElement('input');
  input.setAttribute('type', 'search');
  input.className = 'search-input';

  const searchPlaceholder = config.placeholders.searchPlaceholder || 'Search...';
  input.placeholder = searchPlaceholder;
  input.setAttribute('aria-label', searchPlaceholder);

  // Only attach suggestion handler for icon variant (overlay).
  // For search-bar variant, we disable suggestions and rely on Enter to expand.
  const isIconVariant = block.classList.contains('search-icon');
  if (isIconVariant) {
    input.addEventListener('input', (e) => {
      handleSearch(e, block, config);
    });
  }

  input.addEventListener('keyup', (e) => { if (e.code === 'Escape') { clearSearch(block); } });

  return input;
}

function searchIcon() {
  const icon = document.createElement('span');
  icon.classList.add('icon', 'icon-search');
  return icon;
}

function searchBox(block, config) {
  const box = document.createElement('div');
  box.classList.add('search-box');
  const input = searchInput(block, config);
  const icon = searchIcon();
  const isIconVariant = block.classList.contains('search-icon');
  if (isIconVariant) {
    const dropdown = document.createElement('div');
    dropdown.className = 'search-dropdown';
    const results = searchResultsContainer(block);
    dropdown.append(results);
    box.append(
      input,
      icon,
      dropdown,
    );
  } else {
    box.append(
      input,
      icon,
    );
  }

  return box;
}

// --- Expanded (inline) results mode for search-bar variant ---
function buildExpandedLayout(block) {
  let expanded = block.querySelector('.search-expanded');
  if (expanded) return {
    expanded,
    filters: expanded.querySelector('.search-filters'),
    results: expanded.querySelector('.search-expanded-results .search-results'),
  };

  expanded = document.createElement('div');
  expanded.className = 'search-expanded';

  const filters = document.createElement('aside');
  filters.className = 'search-filters';

  const resultsWrap = document.createElement('div');
  resultsWrap.className = 'search-expanded-results';
  const results = document.createElement('ul');
  results.className = 'search-results';
  results.dataset.h = findNextHeading(block);
  resultsWrap.append(results);

  expanded.append(filters, resultsWrap);
  block.append(expanded);
  return { expanded, filters, results };
}

function normalizeTimestamp(value) {
  if (!value && value !== 0) return NaN;
  if (typeof value === 'number') {
    // if seconds, convert to ms
    return value < 1e12 ? value * 1000 : value;
  }
  const ms = Date.parse(value);
  if (!Number.isNaN(ms)) return ms;
  const asNum = Number(value);
  if (!Number.isNaN(asNum)) return normalizeTimestamp(asNum);
  return NaN;
}

function getResultTimestamp(result) {
  const primary = normalizeTimestamp(result.publishDate);
  const fallback = normalizeTimestamp(result.lastModified);
  if (!Number.isNaN(primary)) return primary;
  if (!Number.isNaN(fallback)) return fallback;
  return NaN;
}

// Specific timestamp getters for distinct filters
function getPublishedTimestamp(result) {
  return normalizeTimestamp(result.publishDate);
}

function getModifiedTimestamp(result) {
  return normalizeTimestamp(result.lastModified);
}

function applyDateFilter(data, dateRange, getResultTimestamp) {
  if (!dateRange || dateRange === 'any') return data;
  const now = Date.now();
  const ranges = { '24h': 24 * 60 * 60 * 1000, '7d': 7 * 24 * 60 * 60 * 1000, '30d': 30 * 24 * 60 * 60 * 1000 };
  const windowMs = ranges[dateRange];
  if (!windowMs) return data;
  return data.filter((r) => {
    const ts = getResultTimestamp(r);
    if (Number.isNaN(ts)) return false;
    return (now - ts) <= windowMs;
  });
}

// --- Tags helpers ---
function getResultTags(result) {
  const raw = result && result.tags;
  if (Array.isArray(raw)) return raw.map((t) => (typeof t === 'string' ? t.trim() : '')).filter(Boolean);
  if (typeof raw === 'string') return raw.split(/\s*,\s*/).map((t) => t.trim()).filter(Boolean);
  return [];
}

function collectTagsWithCounts(list) {
  const freq = new Map();
  (Array.isArray(list) ? list : []).forEach((r) => {
    getResultTags(r).forEach((t) => {
      freq.set(t, (freq.get(t) || 0) + 1);
    });
  });
  return [...freq.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => a.key.localeCompare(b.key));
}

function applyTagFilter(data, selectedTags) {
  const list = Array.isArray(data) ? data : [];
  const selected = new Set((Array.isArray(selectedTags) ? selectedTags : []).map((t) => (typeof t === 'string' ? t.trim() : '')).filter(Boolean));
  if (!selected.size) return list;
  return list.filter((r) => getResultTags(r).some((t) => selected.has(t)));
}

function renderTagFilters(container, availableTags, selectedTags, onChange, openPathsSet) {
  if (!Array.isArray(availableTags) || !availableTags.length) return;
  const group = document.createElement('div');
  group.className = 'filter-group tags';
  const title = document.createElement('h4');
  title.textContent = 'Tags';
  group.append(title);
 
  const capitalizeFirst = (text) => {
    const str = String(text || '');
    if (!str) return str;
    return str.charAt(0).toUpperCase() + str.slice(1);
  };

  const splitNamespace = (key) => {
    const raw = String(key || '');
    const colonIdx = raw.indexOf(':');
    if (colonIdx > -1) {
      const ns = raw.slice(0, colonIdx);
      const remainder = raw.slice(colonIdx + 1);
      return { ns: ns || 'Other', remainder };
    }
    return { ns: 'Other', remainder: raw };
  };

  const buildTagTree = (list) => {
    const root = new Map(); // ns -> node
    (Array.isArray(list) ? list : []).forEach((t) => {
      const { ns, remainder } = splitNamespace(t.key);
      const path = (remainder || '').split('/').filter(Boolean);
      let nsNode = root.get(ns);
      if (!nsNode) { nsNode = { name: ns, children: new Map(), leaf: null, count: 0, hasSelected: false }; root.set(ns, nsNode); }
      let current = nsNode;
      // if no path, treat as single leaf under namespace
      if (!path.length) {
        current.leaf = { key: t.key, label: t.key, count: t.count };
        return;
      }
      path.forEach((seg, idx) => {
        let child = current.children.get(seg);
        if (!child) { child = { name: seg, children: new Map(), leaf: null, count: 0, hasSelected: false }; current.children.set(seg, child); }
        current = child;
        if (idx === path.length - 1) {
          current.leaf = { key: t.key, label: seg, count: t.count };
        }
      });
    });
    const computeCounts = (node) => {
      let total = node.leaf ? (node.leaf.count || 0) : 0;
      node.children.forEach((child) => { total += computeCounts(child); });
      node.count = total;
      return total;
    };
    root.forEach((n) => computeCounts(n));
    return root;
  };

  const markSelected = (node, selectedSet) => {
    let has = node.leaf ? selectedSet.has(node.leaf.key) : false;
    node.children.forEach((child) => { if (markSelected(child, selectedSet)) has = true; });
    node.hasSelected = has;
    return has;
  };

  const renderNode = (parentEl, node, name, selected, onChange, depth = 0, path = '') => {
    const hasChildren = node.children && node.children.size;
    const nodePath = path ? `${path}/${node.name}` : node.name;

    if (hasChildren) {
      const details = document.createElement('details');
      details.className = 'tag-collapsible';
      details.dataset.path = nodePath;
      // keep open if this branch contains a selected tag
      const shouldOpen = (depth === 0)
        || node.hasSelected
        || (openPathsSet && openPathsSet.has(nodePath));
      if (shouldOpen) details.open = true;

      const summary = document.createElement('summary');
      summary.textContent = `${capitalizeFirst(node.name)}${typeof node.count === 'number' ? ` (${node.count})` : ''}`;
      details.append(summary);

      const content = document.createElement('div');
      content.className = 'tag-subgroup';

      // Render leaf (selectable) at this node, if present
      if (node.leaf) {
        const id = `${name}-${node.leaf.key.replace(/[^a-z0-9]+/gi, '-')}`;
        const label = document.createElement('label');
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.name = name;
        cb.id = id;
        cb.checked = (selected || []).includes(node.leaf.key);
        cb.addEventListener('change', () => {
          const next = new Set(selected || []);
          if (cb.checked) next.add(node.leaf.key); else next.delete(node.leaf.key);
          onChange([...next]);
        });
        const text = document.createTextNode(` ${capitalizeFirst(node.leaf.label)}${typeof node.leaf.count === 'number' ? ` (${node.leaf.count})` : ''}`);
        label.append(cb, text);
        content.append(label);
      }

      [...node.children.values()].sort((a, b) => a.name.localeCompare(b.name)).forEach((child) => {
        renderNode(content, child, name, selected, onChange, depth + 1, nodePath);
      });

      details.append(content);
      parentEl.append(details);
      return;
    }

    // Leaf-only node, render checkbox directly
    if (node.leaf) {
      const id = `${name}-${node.leaf.key.replace(/[^a-z0-9]+/gi, '-')}`;
      const label = document.createElement('label');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.name = name;
      cb.id = id;
      cb.checked = (selected || []).includes(node.leaf.key);
      cb.addEventListener('change', () => {
        const next = new Set(selected || []);
        if (cb.checked) next.add(node.leaf.key); else next.delete(node.leaf.key);
        onChange([...next]);
      });
      const text = document.createTextNode(` ${capitalizeFirst(node.leaf.label)}${typeof node.leaf.count === 'number' ? ` (${node.leaf.count})` : ''}`);
      label.append(cb, text);
      parentEl.append(label);
    }
  };

  const tree = buildTagTree(availableTags);
  const name = `tags-${Math.random().toString(36).slice(2)}`;
  // mark selection so collapsibles with selected leaves remain open
  const selectedSet = new Set((selectedTags || []).filter(Boolean));
  [...tree.values()].forEach((nsNode) => markSelected(nsNode, selectedSet));
  [...tree.values()].sort((a, b) => a.name.localeCompare(b.name)).forEach((nsNode) => {
    const section = document.createElement('div');
    section.className = 'tag-group';
    renderNode(section, nsNode, name, selectedTags || [], onChange, 0, '');
    group.append(section);
  });

  container.append(group);
}

function renderDateFilters(container, selected, onChange) {
  const group = document.createElement('div');
  group.className = 'filter-group date-range';
  const title = document.createElement('h4');
  title.textContent = 'Published';
  group.append(title);

  const options = [
    { key: 'any', label: 'Any time' },
    { key: '24h', label: 'Last 24 hours' },
    { key: '7d', label: 'Last week' },
    { key: '30d', label: 'Last month' },
  ];
  const name = `date-range-${Math.random().toString(36).slice(2)}`;
  options.forEach((opt, idx) => {
    const id = `${name}-${idx}`;
    const label = document.createElement('label');
    const rb = document.createElement('input');
    rb.type = 'radio';
    rb.name = name;
    rb.id = id;
    rb.checked = (selected || 'any') === opt.key;
    rb.addEventListener('change', () => onChange(opt.key));
    label.append(rb, document.createTextNode(` ${opt.label}`));
    group.append(label);
  });
  container.append(group);
}

function renderModifiedFilters(container, selected, onChange) {
  const group = document.createElement('div');
  group.className = 'filter-group date-range modified-range';
  const title = document.createElement('h4');
  title.textContent = 'Modified';
  group.append(title);

  const options = [
    { key: 'any', label: 'Any time' },
    { key: '24h', label: 'Last 24 hours' },
    { key: '7d', label: 'Last week' },
    { key: '30d', label: 'Last month' },
  ];
  const name = `modified-range-${Math.random().toString(36).slice(2)}`;
  options.forEach((opt, idx) => {
    const id = `${name}-${idx}`;
    const label = document.createElement('label');
    const rb = document.createElement('input');
    rb.type = 'radio';
    rb.name = name;
    rb.id = id;
    rb.checked = (selected || 'any') === opt.key;
    rb.addEventListener('change', () => onChange(opt.key));
    label.append(rb, document.createTextNode(` ${opt.label}`));
    group.append(label);
  });
  container.append(group);
}

function applyAllFilters(base, selectedPublishedRange, selectedModifiedRange) {
  const byPublished = applyDateFilter(base, selectedPublishedRange, getPublishedTimestamp);
  const byModified = applyDateFilter(byPublished, selectedModifiedRange, getModifiedTimestamp);
  return byModified;
}

function renderSortControls(container, selected, onChange) {
  const group = document.createElement('div');
  group.className = 'filter-group sort-order';
  const title = document.createElement('h4');
  title.textContent = 'Sort';
  group.append(title);

  const options = [
    { key: 'relevance', label: 'Relevance' },
    { key: 'az', label: 'Title A–Z' },
    { key: 'za', label: 'Title Z–A' },
  ];
  const name = `sort-order-${Math.random().toString(36).slice(2)}`;
  options.forEach((opt, idx) => {
    const id = `${name}-${idx}`;
    const label = document.createElement('label');
    const rb = document.createElement('input');
    rb.type = 'radio';
    rb.name = name;
    rb.id = id;
    rb.checked = (selected || 'relevance') === opt.key;
    rb.addEventListener('change', () => onChange(opt.key));
    label.append(rb, document.createTextNode(` ${opt.label}`));
    group.append(label);
  });
  container.append(group);
}

function applySort(results, order) {
  if (!Array.isArray(results) || !results.length) return results;
  if (order === 'az' || order === 'za') {
    const copy = [...results];
    copy.sort((a, b) => {
      const at = (a.navTitle || a.title || '').toLowerCase();
      const bt = (b.navTitle || b.title || '').toLowerCase();
      if (at < bt) return -1;
      if (at > bt) return 1;
      return 0;
    });
    return order === 'az' ? copy : copy.reverse();
  }
  return results; // relevance is original order
}

async function activateExpandedSearch(block, config, searchValue, cachedData) {
  const value = (searchValue || '').trim();
  if (value.length < 3) return;

  // manage URL param
  searchParams.set('q', value);
  if (window.history.replaceState) {
    const url = new URL(window.location.href);
    url.search = searchParams.toString();
    window.history.replaceState({}, '', url.toString());
  }

  // close dropdown if open
  const dropdown = block.querySelector('.search-dropdown');
  if (dropdown) dropdown.classList.remove('open');
  if (dropdown && dropdown.parentElement) dropdown.parentElement.classList.remove('open');

  block.classList.add('expanded');
  const { filters, results } = buildExpandedLayout(block);

  // fetch/cached data
  let data = cachedData || block._searchData;
  if (!data) {
    const fetched = (await fetchData(config.source)).filter((r) => !isExcludedResult(r));
    const scope = getScopedPrefix(block);
    data = applySearchPathFilter(fetched, scope);
    block._searchData = data;
  }

  const searchPhrase = value.toLowerCase();
  const searchTerms = searchPhrase.split(/\s+/).filter((t) => t && t.length >= 2);
  const base = filterData(searchTerms, data, searchPhrase);

  // state
  let selectedPublishedRange = block._selectedPublishedRange || 'any';
  let selectedModifiedRange = block._selectedModifiedRange || 'any';
  let sortOrder = block._sortOrder || 'relevance';
  let selectedTags = Array.isArray(block._selectedTags) ? block._selectedTags : [];
  const availableTags = collectTagsWithCounts(data);

  const renderFilters = () => {
    filters.innerHTML = '';
    // Tag filters are injected dynamically via refreshTagFilters()
    // so only static groups are built here to keep handlers simple
    renderDateFilters(filters, selectedPublishedRange, (next) => {
      selectedPublishedRange = next;
      block._selectedPublishedRange = selectedPublishedRange;
      refreshTagFilters();
      renderList();
    });
    renderModifiedFilters(filters, selectedModifiedRange, (next) => {
      selectedModifiedRange = next;
      block._selectedModifiedRange = selectedModifiedRange;
      refreshTagFilters();
      renderList();
    });
    renderSortControls(filters, sortOrder, (next) => {
      sortOrder = next;
      block._sortOrder = sortOrder;
      renderList();
    });
    // Insert Tags group at the top initially
    refreshTagFilters(true);
  };

  const refreshTagFilters = (insertAtTop = false) => {
    // available tags should reflect the current result set AFTER date filters, BEFORE tag filters
    const preTag = applyAllFilters(base, selectedPublishedRange, selectedModifiedRange);
    const availableTags = collectTagsWithCounts(preTag);
    const existing = filters.querySelector('.filter-group.tags');
    // capture currently open paths so we can preserve expand state
    const openPaths = new Set();
    if (existing) {
      existing.querySelectorAll('details.tag-collapsible[open][data-path]').forEach((d) => {
        const p = d.getAttribute('data-path');
        if (p) openPaths.add(p);
      });
    }
    if (existing) existing.remove();
    // Render and optionally move to top
    const temp = document.createElement('div');
    renderTagFilters(temp, availableTags, selectedTags, (next) => {
      selectedTags = next;
      block._selectedTags = selectedTags;
      // when tags change, recompute available tags again from preTag (still ignoring tags)
      refreshTagFilters();
      renderList();
    }, openPaths);
    const newGroup = temp.firstElementChild;
    if (!newGroup) return;
    // Always keep Tags group at the top for consistency
    const first = filters.firstElementChild;
    if (first) {
      filters.insertBefore(newGroup, first);
    } else {
      filters.appendChild(newGroup);
    }
  };

  const renderList = () => {
    const preTag = applyAllFilters(base, selectedPublishedRange, selectedModifiedRange);
    const afterTags = applyTagFilter(preTag, selectedTags);
    const filtered = applySort(afterTags, sortOrder);
    results.innerHTML = '';
    if (!filtered.length) {
      const msg = document.createElement('li');
      msg.textContent = config.placeholders.searchNoResults || 'No results found.';
      results.classList.add('no-results');
      results.append(msg);
      return;
    }
    results.classList.remove('no-results');
    filtered.forEach((r) => results.append(renderResult(r, searchTerms, searchPhrase, results.dataset.h)));
  };

  renderFilters();
  renderList();
}

export default async function decorate(block) {
  const placeholders = await fetchPlaceholders();
  // Determine source path from the first config row anchor, or existing anchor in block, or locale default
  const configAnchor = block.querySelector(':scope > div:nth-child(1) a[href]');
  const inlineAnchor = block.querySelector('a[href]');
  const candidate = configAnchor?.href || inlineAnchor?.href || '';
  const isJsonSource = candidate && /\.json(\?|$)/.test(candidate) && /query-index\.json(\?|$)/.test(candidate);
  let source = isJsonSource ? candidate : '';
  if (!source) {
    const htmlLang = (document.documentElement.getAttribute('lang') || '').trim();
    const langMatch = htmlLang.match(/^[a-z]{2}(?:-[A-Z]{2})?$/);
    const locale = langMatch ? htmlLang.split('-')[0] : '';
    source = `${locale ? `/${locale}` : ''}/query-index.json`;
    // eslint-disable-next-line no-console
    if (candidate && !isJsonSource) console.log('[search] ignoring non-JSON config anchor for source:', candidate);
  }

  // Read style from second row and hide first two rows (config rows)
  try {
    const styleText = block.querySelector(':scope > div:nth-child(2) > div p')?.textContent?.trim();
    if (styleText) block.classList.add(styleText);
    const row1 = block.querySelector(':scope > div:nth-child(1)');
    const row2 = block.querySelector(':scope > div:nth-child(2)');
    [row1, row2].forEach((r) => { if (r) r.style.display = 'none'; });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.log('[search] style/hide rows error', e);
  }

  // Variant selection via block classes
  const useIconVariant = block.classList.contains('search-icon');
  const useBarVariant = block.classList.contains('search-bar') || !useIconVariant;

  if (useIconVariant) {
    if (!block.classList.contains('search-icon')) block.classList.add('search-icon');
    // icon variant: trigger opens overlay hosting search UI
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'search-trigger';
    trigger.setAttribute('aria-label', 'Open search');
    const icon = searchIcon();
    trigger.append(icon);
    const overlay = document.createElement('div');
    overlay.className = 'search-overlay';
    const panel = document.createElement('div');
    panel.className = 'search-overlay-panel';
    panel.append(
      searchBox(block, { source, placeholders }),
    );
    overlay.append(panel);
    block.append(trigger, overlay);

    const openOverlay = () => {
      overlay.classList.add('open');
      const input = overlay.querySelector('input.search-input');
      if (input) input.focus();
    };
    const closeOverlay = () => {
      overlay.classList.remove('open');
      clearSearch(block);
    };

    trigger.addEventListener('click', openOverlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeOverlay(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && overlay.classList.contains('open')) closeOverlay(); });

    // Enter in icon variant should redirect to /{lang}/search?q=...
    const getLocalePrefix = () => {
      try {
        const lang = getLanguage();
        console.log('lang', lang);
        return lang ? `/${lang}` : '';
      } catch (e) {
        const htmlLang = (document.documentElement.getAttribute('lang') || '').trim();
        const langMatch = htmlLang.match(/^[a-z]{2}(?:-[A-Z]{2})?$/);
        const locale = langMatch ? htmlLang.split('-')[0] : '';
        return locale ? `/${locale}` : '';
      }
    };
    const redirectToSearchPage = (query) => {
      const targetPath = `${getLocalePrefix()}/search`;
      const url = new URL(targetPath, window.location.origin);
      if (query && query.trim()) url.searchParams.set('q', query.trim());
      // Carry scoped search path to the search page if authored
      attachScopeParam(url, getScopedPrefix(block));
      window.location.href = url.toString();
    };
    const overlayInput = panel.querySelector('input.search-input');
    if (overlayInput) {
      overlayInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          redirectToSearchPage(overlayInput.value || '');
        }
      });
    }
  } else {
    // bar variant: inline search box with dropdown beneath input
    block.append(
      searchBox(block, { source, placeholders }),
    );

    // Enter activates expanded mode
    const input = block.querySelector('input.search-input');
    input.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        await activateExpandedSearch(block, { source, placeholders }, input.value);
      }
    });

    // Ensure suggestions are hidden for search-bar variant
    const dropdown = block.querySelector('.search-dropdown');
    if (dropdown) dropdown.remove();
  }

  if (searchParams.get('q')) {
    const input = block.querySelector('input');
    input.value = searchParams.get('q');
    // Apply scoped path forwarded via 'sp' param (from search-icon overlay)
    const forwardedScope = (new URL(window.location.href)).searchParams.get('sp') || '';
    if (forwardedScope) {
      block._forwardedScope = forwardedScope;
    }
    if (useBarVariant) {
      await activateExpandedSearch(block, { source, placeholders }, input.value);
    } else {
      input.dispatchEvent(new Event('input'));
    }
  }

  decorateIcons(block);

  // close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (!block.contains(e.target)) {
      const dropdown = block.querySelector('.search-dropdown');
      if (dropdown) dropdown.classList.remove('open');
      if (dropdown && dropdown.parentElement) dropdown.parentElement.classList.remove('open');
    }
  });

  // no special positioning logic needed; dropdown is positioned within box
}