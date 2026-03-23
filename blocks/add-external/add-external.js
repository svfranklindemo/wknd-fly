/**
 * Add External block – two variants via adaptive form.
 * Variant "account": Add external account – Type (Bank Account), Origin, Account number, Authorization / Authorized user name, Submit.
 * Variant "credit-card": Add external credit card – Type (Credit Card), Origin, Card number, Authorization / Authorized user name, Submit.
 */

import { readBlockConfig, loadCSS, toClassName } from '../../scripts/aem.js';

/** Read config: UE structure (data-aue-prop) or table (readBlockConfig). */
function readConfigFromBlock(blockOrContainer) {
  const el = blockOrContainer;
  const variantEl = el.querySelector('[data-aue-prop="variant"]');
  if (variantEl) {
    const v = (variantEl.textContent ?? '').trim().toLowerCase();
    return { variant: (v === 'credit-card' || v === 'creditcard') ? 'credit-card' : 'account' };
  }
  const cfg = readBlockConfig(el) || {};
  const v = String(cfg.variant ?? cfg.form ?? 'account').trim().toLowerCase();
  return { variant: (v === 'credit-card' || v === 'creditcard') ? 'credit-card' : 'account' };
}

function buildExternalAccountFormDef() {
  return {
    id: 'add-external-account',
    fieldType: 'form',
    appliedCssClassNames: 'add-external-form',
    items: [
      {
        id: 'heading-add-external',
        fieldType: 'heading',
        label: { value: 'Add external account' },
        appliedCssClassNames: 'col-12 add-external-heading',
      },
      {
        id: 'panel-add-external-account',
        name: 'externalAccount',
        fieldType: 'panel',
        label: { value: '' },
        items: [
          {
            id: 'type',
            name: 'type',
            fieldType: 'drop-down',
            label: { value: 'Type' },
            enum: ['bank-account'],
            enumNames: ['Bank Account'],
            properties: { colspan: 12 },
          },
          { id: 'origin', name: 'origin', fieldType: 'text-input', label: { value: 'Origin' }, properties: { colspan: 12 } },
          { id: 'accountNumber', name: 'accountNumber', fieldType: 'text-input', label: { value: 'Account number' }, properties: { colspan: 12 } },
          {
            id: 'auth-section',
            fieldType: 'plain-text',
            value: 'Authorization',
            appliedCssClassNames: 'col-12 add-external-section-label',
          },
          { id: 'authorizedUserName', name: 'authorizedUserName', fieldType: 'text-input', label: { value: 'Authorized user name' }, properties: { colspan: 12 } },
          {
            id: 'submit-add-external-btn',
            name: 'submitAddExternal',
            fieldType: 'button',
            buttonType: 'submit',
            label: { value: 'Submit' },
            appliedCssClassNames: 'add-external-submit-btn col-12',
          },
        ],
      },
    ],
  };
}

function buildExternalCreditCardFormDef() {
  return {
    id: 'add-external-credit-card',
    fieldType: 'form',
    appliedCssClassNames: 'add-external-form',
    items: [
      {
        id: 'heading-add-external',
        fieldType: 'heading',
        label: { value: 'Add external credit card' },
        appliedCssClassNames: 'col-12 add-external-heading',
      },
      {
        id: 'panel-add-external-credit-card',
        name: 'externalCreditCard',
        fieldType: 'panel',
        label: { value: '' },
        items: [
          {
            id: 'type',
            name: 'type',
            fieldType: 'drop-down',
            label: { value: 'Type' },
            enum: ['', 'credit-card'],
            enumNames: ['Select...', 'Credit Card'],
            properties: { colspan: 12 },
          },
          { id: 'origin', name: 'origin', fieldType: 'text-input', label: { value: 'Origin' }, properties: { colspan: 12 } },
          { id: 'cardNumber', name: 'cardNumber', fieldType: 'text-input', label: { value: 'Card number' }, properties: { colspan: 12 } },
          {
            id: 'auth-section',
            fieldType: 'plain-text',
            value: 'Authorization',
            appliedCssClassNames: 'col-12 add-external-section-label',
          },
          { id: 'authorizedUserName', name: 'authorizedUserName', fieldType: 'text-input', label: { value: 'Authorized user name' }, properties: { colspan: 12 } },
          {
            id: 'submit-add-external-btn',
            name: 'submitAddExternal',
            fieldType: 'button',
            buttonType: 'submit',
            label: { value: 'Submit' },
            appliedCssClassNames: 'add-external-submit-btn col-12',
          },
        ],
      },
    ],
  };
}

function buildFormDef(variant) {
  return variant === 'credit-card' ? buildExternalCreditCardFormDef() : buildExternalAccountFormDef();
}

function collectFormData(form) {
  const data = {};
  form.querySelectorAll('input, select, textarea').forEach((el) => {
    const name = el.getAttribute('name');
    if (!name) return;
    data[name] = el.type === 'checkbox' ? el.checked : (el.value || '');
  });
  return data;
}

export default async function decorate(block) {
  const codeBasePath = window.hlx?.codeBasePath || '';
  await loadCSS(`${codeBasePath}/blocks/form/form.css`);
  await loadCSS(`${codeBasePath}/blocks/add-external/add-external.css`);

  block.classList.add('add-external-block');

  const hasUEStructure = block.querySelector('[data-aue-prop="variant"]');
  let configContainer = null;

  if (!hasUEStructure) {
    configContainer = document.createElement('div');
    configContainer.className = 'add-external-config';
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
    block.querySelectorAll('[data-aue-prop]').forEach((cell) => {
      const row = cell.closest(':scope > div');
      if (row) row.classList.add('add-external-config-row');
    });
  }

  const getConfigSource = () => (configContainer || block);
  const config = readConfigFromBlock(getConfigSource());
  const variant = config.variant;

  const formDef = buildFormDef(variant);
  const formContainer = document.createElement('div');
  formContainer.className = 'add-external-form-wrapper form';

  const pre = document.createElement('pre');
  const code = document.createElement('code');
  code.textContent = JSON.stringify(formDef);
  pre.append(code);
  formContainer.append(pre);
  block.append(formContainer);

  const formModule = await import('../form/form.js');
  await formModule.default(formContainer);

  setTimeout(() => {
    const form = block.querySelector('form');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const data = collectFormData(form);
        // eslint-disable-next-line no-console
        console.log('Add external form data:', data);
        const msg = block.querySelector('.add-external-success-msg');
        if (msg) msg.remove();
        const success = document.createElement('p');
        success.className = 'add-external-success-msg';
        success.textContent = 'Thank you. Your information has been submitted.';
        success.setAttribute('role', 'status');
        const panel = form.querySelector('.panel-wrapper');
        if (panel) panel.insertBefore(success, panel.firstChild);
        else form.insertBefore(success, form.firstChild);
      });
    }
  }, 100);
}
