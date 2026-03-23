/**
 * Insurance block – single-step form (Life Insurance style).
 * UE-editable title for the main heading. Two-column layout: personal (First name, Last name, Birth date)
 * and address (Permanent Address, City, Zip Code, Country). Teal Submit button.
 * Uses same adaptive form runtime as application-form.
 */

import { readBlockConfig, loadCSS, toClassName } from '../../scripts/aem.js';

/** Read config: UE structure (data-aue-prop) or table (readBlockConfig). */
function readConfigFromBlock(blockOrContainer) {
  const el = blockOrContainer;
  const titleEl = el.querySelector('[data-aue-prop="title"]');
  if (titleEl) {
    return { title: (titleEl.textContent ?? '').trim() || 'Life Insurance' };
  }
  const cfg = readBlockConfig(el) || {};
  return { title: (cfg.title ?? 'Life Insurance').toString().trim() };
}

function buildInsuranceFormDef(title) {
  return {
    id: 'insurance',
    fieldType: 'form',
    appliedCssClassNames: 'insurance-form',
    items: [
      {
        id: 'heading-insurance',
        fieldType: 'heading',
        label: { value: title },
        appliedCssClassNames: 'col-12 insurance-heading',
      },
      {
        id: 'panel-insurance',
        name: 'insurance',
        fieldType: 'panel',
        label: { value: '' },
        items: [
          { id: 'firstName', name: 'firstName', fieldType: 'text-input', label: { value: 'First Name' }, properties: { colspan: 6 } },
          { id: 'lastName', name: 'lastName', fieldType: 'text-input', label: { value: 'Last Name' }, properties: { colspan: 6 } },
          { id: 'birthDate', name: 'birthDate', fieldType: 'text-input', label: { value: 'Birth date(YYYY-MM-DD)' }, placeholder: 'mm / dd / yyyy', properties: { colspan: 12 } },
          { id: 'permanentAddress', name: 'permanentAddress', fieldType: 'text-input', label: { value: 'Permanent Address' }, properties: { colspan: 12 } },
          { id: 'city', name: 'city', fieldType: 'text-input', label: { value: 'City' }, properties: { colspan: 6 } },
          { id: 'zipCode', name: 'zipCode', fieldType: 'text-input', label: { value: 'Zip Code' }, properties: { colspan: 6 } },
          { id: 'country', name: 'country', fieldType: 'text-input', label: { value: 'Country' }, properties: { colspan: 12 } },
          {
            id: 'submit-insurance-btn',
            name: 'submitInsurance',
            fieldType: 'button',
            buttonType: 'submit',
            label: { value: 'Submit' },
            appliedCssClassNames: 'insurance-submit-btn col-12',
          },
        ],
      },
    ],
  };
}

function collectInsuranceFormData(form) {
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
  await loadCSS(`${codeBasePath}/blocks/insurance/insurance.css`);

  block.classList.add('insurance-block');

  const hasUEStructure = block.querySelector('[data-aue-prop="title"]');
  let configContainer = null;

  if (!hasUEStructure) {
    /* Table structure: wrap rows in one container and mark data-aue-prop for UE */
    configContainer = document.createElement('div');
    configContainer.className = 'insurance-config';
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
    /* UE structure: hide config divs but leave in place for UE */
    block.querySelectorAll('[data-aue-prop]').forEach((cell) => {
      const row = cell.closest(':scope > div');
      if (row) row.classList.add('insurance-config-row');
    });
  }

  const getConfigSource = () => (configContainer || block);
  const config = readConfigFromBlock(getConfigSource());
  const title = config.title || 'Life Insurance';

  const formDef = buildInsuranceFormDef(title);
  const formContainer = document.createElement('div');
  formContainer.className = 'insurance-form-wrapper form';

  const pre = document.createElement('pre');
  const code = document.createElement('code');
  code.textContent = JSON.stringify(formDef);
  pre.append(code);
  formContainer.append(pre);
  block.append(formContainer);

  const formModule = await import('../form/form.js');
  await formModule.default(formContainer);

  setTimeout(() => {
    const heading = formContainer.querySelector('#heading-insurance h2, [id="heading-insurance"] h2');
    if (heading) heading.setAttribute('data-aue-prop', 'title');

    const form = block.querySelector('form');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const data = collectInsuranceFormData(form);
        // eslint-disable-next-line no-console
        console.log('Insurance form data:', data);
        const msg = block.querySelector('.insurance-success-msg');
        if (msg) msg.remove();
        const success = document.createElement('p');
        success.className = 'insurance-success-msg';
        success.textContent = 'Thank you. Your information has been submitted.';
        success.setAttribute('role', 'status');
        const panel = form.querySelector('.panel-wrapper');
        if (panel) panel.insertBefore(success, panel.firstChild);
        else form.insertBefore(success, form.firstChild);
      });
    }
  }, 100);
}
