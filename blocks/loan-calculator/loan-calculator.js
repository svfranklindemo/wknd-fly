/**
 * Loan Calculator block – Purchase price, Down payment, Term sliders;
 * monthly payment output and Apply now CTA. Interest rate from UE (block config).
 */

import { readBlockConfig, loadCSS, toClassName } from '../../scripts/aem.js';

const DEFAULT_INTEREST_RATE = 6.5;
const MIN_PRICE = 100000;
const MAX_PRICE = 3000000;
const MIN_TERM = 5;
const MAX_TERM = 30;

function parseNumber(val, fallback = 0) {
  const n = parseFloat(String(val).replace(/[^0-9.-]/g, ''), 10);
  return Number.isFinite(n) ? n : fallback;
}

function formatCurrency(n) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function monthlyPayment(principal, annualRatePercent, termYears) {
  if (principal <= 0) return 0;
  const r = (annualRatePercent / 100) / 12;
  const n = termYears * 12;
  if (r <= 0) return principal / n;
  const factor = r * (1 + r) ** n;
  const denom = (1 + r) ** n - 1;
  return (principal * factor) / denom;
}

function buildSlider(id, label, value, min, max, step, formatter) {
  const wrap = document.createElement('div');
  wrap.className = 'loan-calculator-field';
  const labelEl = document.createElement('label');
  labelEl.className = 'loan-calculator-label';
  labelEl.textContent = label;
  const valueEl = document.createElement('div');
  valueEl.className = 'loan-calculator-value';
  valueEl.textContent = formatter ? formatter(value) : value;
  const input = document.createElement('input');
  input.type = 'range';
  input.min = min;
  input.max = max;
  input.step = step || 1;
  input.value = value;
  input.id = id;
  input.setAttribute('aria-label', label);
  wrap.append(labelEl, valueEl, input);
  return { wrap, valueEl, input };
}

/** Read config from block: UE structure (data-aue-prop) or table (readBlockConfig). */
function readConfigFromBlock(blockOrContainer) {
  const el = blockOrContainer;
  const byProp = el.querySelector('[data-aue-prop="interest-rate"]');
  if (byProp) {
    return {
      'interest-rate': (el.querySelector('[data-aue-prop="interest-rate"]')?.textContent ?? '').trim(),
      'apply-now-link': (el.querySelector('[data-aue-prop="apply-now-link"]')?.textContent ?? '').trim(),
      'apply-now-text': (el.querySelector('[data-aue-prop="apply-now-text"]')?.textContent ?? 'Apply now').trim(),
      description: (el.querySelector('[data-aue-prop="description"]')?.textContent ?? 'Estimate how much you could be paying monthly for your loan').trim(),
    };
  }
  return readBlockConfig(el) || {};
}

export default async function decorate(block) {
  const codeBasePath = window.hlx?.codeBasePath || '';
  await loadCSS(`${codeBasePath}/blocks/loan-calculator/loan-calculator.css`);

  block.classList.add('loan-calculator-block');

  const hasUEStructure = block.querySelector('[data-aue-prop="interest-rate"]');
  let configContainer = null;

  if (!hasUEStructure) {
    /* Table structure: wrap rows in one container (avoids tripling in UE tree) and mark data-aue-prop */
    configContainer = document.createElement('div');
    configContainer.className = 'loan-calculator-config';
    configContainer.setAttribute('aria-hidden', 'true');
    configContainer.hidden = true;
    while (block.firstChild) {
      configContainer.appendChild(block.firstChild);
    }
    block.appendChild(configContainer);
    configContainer.querySelectorAll(':scope > div').forEach((row) => {
      const cols = [...row.children];
      if (cols.length >= 2 && cols[0].textContent) {
        const prop = toClassName(cols[0].textContent);
        if (prop) {
          const valueCell = cols[1];
          valueCell.setAttribute('data-aue-prop', prop);
          const p = valueCell.querySelector('p');
          if (p) p.setAttribute('data-aue-prop', prop);
        }
      }
    });
  } else {
    /* UE structure: hide config divs but leave in place so UE can patch */
    block.querySelectorAll('[data-aue-prop]').forEach((cell) => {
      const row = cell.closest(':scope > div');
      if (row) row.classList.add('loan-calculator-config-row');
    });
  }

  const getConfigSource = () => (configContainer || block);
  /** Returns normalized config from current source (table or UE data-aue-prop divs). */
  const getConfig = () => {
    const cfg = readConfigFromBlock(getConfigSource());
    return {
      interestRate: parseNumber(cfg['interest-rate'] ?? cfg.interestrate ?? cfg.interestRate, DEFAULT_INTEREST_RATE),
      applyNowLink: (cfg['apply-now-link'] ?? cfg.applynowlink ?? cfg.applyNowLink ?? '').toString().trim(),
      applyNowText: (cfg['apply-now-text'] ?? cfg.applynowtext ?? cfg.applyNowText ?? 'Apply now').toString().trim(),
      description: (cfg.description ?? 'Estimate how much you could be paying monthly for your loan').toString().trim(),
    };
  };

  /** Builds calculator UI using getConfig() for rate/CTA/description. Call after UE replaces block content. */
  function buildCalculatorRoot() {
    const config = getConfig();
    const contentRoot = document.createElement('div');
    contentRoot.className = 'loan-calculator-root';

    let purchasePrice = 1028000;
    let downPayment = 100000;
    let termYears = 20;

    const heading = document.createElement('h2');
    heading.className = 'loan-calculator-heading';
    heading.textContent = 'Calculate your monthly payment';

    const grid = document.createElement('div');
    grid.className = 'loan-calculator-grid';

    const left = document.createElement('div');
    left.className = 'loan-calculator-inputs';

    const purchase = buildSlider('loan-purchase', 'Purchase price', purchasePrice, MIN_PRICE, MAX_PRICE, 1000, formatCurrency);
    const maxDown = () => Math.min(purchasePrice * 0.9, MAX_PRICE);
    purchase.input.addEventListener('input', () => {
      purchasePrice = Number(purchase.input.value);
      purchase.valueEl.textContent = formatCurrency(purchasePrice);
      const cap = maxDown();
      down.input.max = cap;
      if (downPayment > cap) {
        downPayment = Math.round(cap / 1000) * 1000;
        down.input.value = downPayment;
        const pct = Math.round((downPayment / purchasePrice) * 100);
        down.valueEl.textContent = `${formatCurrency(downPayment)} (${pct}%)`;
      }
      updatePayment();
    });
    left.append(purchase.wrap);

    downPayment = Math.min(downPayment, maxDown());
    const down = buildSlider('loan-down', 'Down payment', downPayment, 0, maxDown(), 1000, (v) => {
      const pct = purchasePrice > 0 ? Math.round((v / purchasePrice) * 100) : 0;
      return `${formatCurrency(v)} (${pct}%)`;
    });
    down.input.addEventListener('input', () => {
      downPayment = Number(down.input.value);
      const pct = Math.round((downPayment / purchasePrice) * 100);
      down.valueEl.textContent = `${formatCurrency(downPayment)} (${pct}%)`;
      updatePayment();
    });
    left.append(down.wrap);

    const term = buildSlider('loan-term', 'Term', termYears, MIN_TERM, MAX_TERM, 1, (v) => `${v} years`);
    term.input.addEventListener('input', () => {
      termYears = Number(term.input.value);
      term.valueEl.textContent = `${termYears} years`;
      updatePayment();
    });
    left.append(term.wrap);

    grid.append(left);

    const right = document.createElement('div');
    right.className = 'loan-calculator-result';
    const amountEl = document.createElement('div');
    amountEl.className = 'loan-calculator-monthly-amount';
    const amountLabel = document.createElement('div');
    amountLabel.className = 'loan-calculator-monthly-label';
    amountLabel.textContent = 'Monthly payment';
    const ctaWrap = document.createElement('div');
    ctaWrap.className = 'loan-calculator-cta';
    const cta = document.createElement('a');
    cta.className = 'loan-calculator-apply-button';
    cta.href = config.applyNowLink || '#';
    cta.textContent = config.applyNowText;
    cta.addEventListener('click', (e) => {
      if (!cta.href || cta.href === '#' || cta.href.endsWith('#')) e.preventDefault();
    });
    function updateCta() {
      const c = getConfig();
      cta.href = c.applyNowLink || '#';
      cta.textContent = c.applyNowText;
    }
    ctaWrap.append(cta);
    const descEl = document.createElement('p');
    descEl.className = 'loan-calculator-description';
    descEl.textContent = config.description;
    right.append(amountEl, amountLabel, ctaWrap, descEl);
    grid.append(right);

    function updatePayment() {
      const c = getConfig();
      const principal = Math.max(0, purchasePrice - downPayment);
      const payment = monthlyPayment(principal, c.interestRate, termYears);
      amountEl.textContent = formatCurrency(Math.round(payment));
    }

    function updateDisplay() {
      const c = getConfig();
      descEl.textContent = c.description;
      updateCta();
      updatePayment();
    }

    updatePayment();
    contentRoot.append(heading, grid);
    return { root: contentRoot, updateDisplay };
  }

  const { root: contentRoot, updateDisplay } = buildCalculatorRoot();

  /* When UE updates Interest Rate (or other config), re-read and refresh monthly payment / CTA / description */
  function applyConfigAndUpdate() {
    updateDisplay();
  }

  if (configContainer) {
    let refreshTimeout;
    const configObserver = new MutationObserver(() => {
      clearTimeout(refreshTimeout);
      refreshTimeout = setTimeout(applyConfigAndUpdate, 150);
    });
    configObserver.observe(configContainer, { childList: true, subtree: true, characterData: true });
  }

  /* Fallback: poll when document has focus so UE edits are picked up */
  const pollInterval = 500;
  let lastRate = getConfig().interestRate;
  setInterval(() => {
    if (!document.hasFocus()) return;
    const newRate = getConfig().interestRate;
    if (newRate !== lastRate) {
      applyConfigAndUpdate();
      lastRate = newRate;
    }
  }, pollInterval);

  /* When UE replaces entire block content (flat data-aue-prop divs), rebuild calculator and append */
  const blockObserver = new MutationObserver(() => {
    if (block.querySelector('.loan-calculator-root')) return;
    if (!block.querySelector('[data-aue-prop="interest-rate"]')) return;
    block.querySelectorAll('[data-aue-prop]').forEach((cell) => {
      const row = cell.closest(':scope > div');
      if (row) row.classList.add('loan-calculator-config-row');
    });
    const { root: newRoot } = buildCalculatorRoot();
    block.appendChild(newRoot);
  });
  blockObserver.observe(block, { childList: true, subtree: true });

  block.appendChild(contentRoot);
}
