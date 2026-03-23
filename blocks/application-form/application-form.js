/**
 * Application Form block – 3-step wizard matching reference look and feel.
 * Step 1: First name, Last name (side-by-side), Email address, Phone number.
 * Step 2: Address, State (dropdown), ZIP code + City (side-by-side), Country (dropdown).
 * Step 3: Date of birth, Social Security Number, Submit.
 * Back (grey) / step indicator (dots + "n/3 step") / Next or Submit (teal).
 */

import { readBlockConfig, loadCSS } from '../../scripts/aem.js';

const APPLICATION_FORM_TEAL = '#0d9488';
const APPLICATION_FORM_GREY = '#e5e7eb';

function applyButtonConfigToSubmitButton(block, config) {
  const submitButton = block.querySelector("form button[type='submit']");
  if (!submitButton) return;
  const eventType = config.buttoneventtype ?? config['button-event-type'];
  if (eventType && String(eventType).trim()) submitButton.dataset.buttonEventType = String(eventType).trim();
  const webhookUrl = config.buttonwebhookurl ?? config['button-webhook-url'];
  if (webhookUrl && String(webhookUrl).trim()) submitButton.dataset.buttonWebhookUrl = String(webhookUrl).trim();
  const formId = config.buttonformid ?? config['button-form-id'];
  if (formId && String(formId).trim()) submitButton.dataset.buttonFormId = String(formId).trim();
  const buttonData = config.buttondata ?? config['button-data'];
  if (buttonData && String(buttonData).trim()) submitButton.dataset.buttonData = String(buttonData).trim();
}

function buildApplicationFormDef() {
  const stateOptions = ['', 'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'];
  const stateNames = ['Select...', ...stateOptions.slice(1)];
  return {
    id: 'application-form',
    fieldType: 'form',
    appliedCssClassNames: 'application-form-form application-form-wizard',
    items: [
      {
        id: 'heading-application-form',
        fieldType: 'heading',
        label: { value: 'Credit Card Application' },
        appliedCssClassNames: 'col-12 application-form-heading',
      },
      {
        id: 'description-application-form',
        fieldType: 'plain-text',
        value: 'Complete the form below to apply.',
        appliedCssClassNames: 'col-12 application-form-subtitle',
      },
      {
        id: 'panel-wizard',
        name: 'wizard',
        fieldType: 'panel',
        ':type': 'fd/panel/wizard',
        items: [
          {
            id: 'step-personal',
            name: 'personal',
            fieldType: 'panel',
            label: { value: 'Personal Information' },
            items: [
              { id: 'firstName', name: 'firstName', fieldType: 'text-input', label: { value: 'First name' }, properties: { colspan: 6 } },
              { id: 'lastName', name: 'lastName', fieldType: 'text-input', label: { value: 'Last name' }, properties: { colspan: 6 } },
              { id: 'email', name: 'email', fieldType: 'email', label: { value: 'Email address' }, properties: { colspan: 12 } },
              { id: 'phone', name: 'phone', fieldType: 'text-input', label: { value: 'Phone number' }, properties: { colspan: 12 } },
            ],
          },
          {
            id: 'step-address',
            name: 'address',
            fieldType: 'panel',
            label: { value: 'Address' },
            items: [
              { id: 'streetAddress', name: 'streetAddress', fieldType: 'text-input', label: { value: 'Address' }, properties: { colspan: 12 } },
              {
                id: 'state',
                name: 'state',
                fieldType: 'drop-down',
                label: { value: 'State' },
                enum: stateOptions,
                enumNames: stateNames,
                properties: { colspan: 12 },
              },
              { id: 'zipCode', name: 'zipCode', fieldType: 'text-input', label: { value: 'ZIP code' }, properties: { colspan: 6 } },
              { id: 'city', name: 'city', fieldType: 'text-input', label: { value: 'City' }, properties: { colspan: 6 } },
              {
                id: 'country',
                name: 'country',
                fieldType: 'drop-down',
                label: { value: 'Country' },
                enum: ['', 'US', 'CA', 'MX', 'GB', 'OTHER'],
                enumNames: ['Select...', 'United States of America', 'Canada', 'Mexico', 'United Kingdom', 'Other'],
                properties: { colspan: 12 },
              },
            ],
          },
          {
            id: 'step-details',
            name: 'details',
            fieldType: 'panel',
            label: { value: 'Details' },
            items: [
              { id: 'dateOfBirth', name: 'dateOfBirth', fieldType: 'text-input', label: { value: 'Date of birth' }, placeholder: 'MM/DD/YYYY', properties: { colspan: 12 } },
              { id: 'ssn', name: 'ssn', fieldType: 'text-input', label: { value: 'Social Security Number' }, properties: { colspan: 12 } },
              {
                id: 'submit-application-btn',
                name: 'submitApplication',
                fieldType: 'button',
                buttonType: 'submit',
                label: { value: 'Submit' },
                appliedCssClassNames: 'application-form-submit-btn col-12',
              },
            ],
          },
        ],
      },
    ],
  };
}

function collectApplicationFormData(form) {
  const data = {};
  form.querySelectorAll('input, select, textarea').forEach((el) => {
    const name = el.getAttribute('name');
    if (!name) return;
    if (el.type === 'checkbox') {
      data[name] = el.checked;
    } else {
      data[name] = el.value || '';
    }
  });
  return data;
}

function restrictNumericFields(form) {
  const numericNames = ['phone', 'ssn'];
  numericNames.forEach((name) => {
    const el = form.querySelector(`[name="${name}"]`);
    if (!el) return;
    el.addEventListener('input', () => {
      const digits = el.value.replace(/\D/g, '');
      if (el.value !== digits) el.value = digits;
    });
  });
}

function formatDateOfBirthInput(form) {
  const el = form.querySelector('[name="dateOfBirth"]');
  if (!el) return;
  el.addEventListener('input', () => {
    const digits = el.value.replace(/\D/g, '').slice(0, 8);
    let formatted = '';
    if (digits.length > 0) formatted = digits.slice(0, 2);
    if (digits.length > 2) formatted += `/${digits.slice(2, 4)}`;
    if (digits.length > 4) formatted += `/${digits.slice(4, 8)}`;
    if (el.value !== formatted) el.value = formatted;
  });
}

function attachApplicationFormSubmitHandler(block) {
  const form = block.querySelector('form');
  if (!form) return;

  const submitSection = form.querySelector('#step-details')?.closest('fieldset') || form.querySelector('.panel-wrapper:last-of-type');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const data = collectApplicationFormData(form);
    // eslint-disable-next-line no-console
    console.log('Application form data:', data);

    const msg = block.querySelector('.application-form-success-msg');
    if (msg) msg.remove();
    const success = document.createElement('p');
    success.className = 'application-form-success-msg';
    success.textContent = 'Thank you. Your application has been submitted successfully.';
    success.setAttribute('role', 'status');
    if (submitSection) {
      submitSection.insertBefore(success, submitSection.firstChild);
    } else {
      form.insertBefore(success, form.firstChild);
    }
  });
}

export default async function decorate(block) {
  const config = readBlockConfig(block) || {};
  [...block.children].forEach((row) => { row.style.display = 'none'; });

  block.classList.add('application-form-block');

  const codeBasePath = window.hlx?.codeBasePath || '';
  await loadCSS(`${codeBasePath}/blocks/form/form.css`);

  const formDef = buildApplicationFormDef();
  const formContainer = document.createElement('div');
  formContainer.className = 'application-form-wrapper form';

  const pre = document.createElement('pre');
  const code = document.createElement('code');
  code.textContent = JSON.stringify(formDef);
  pre.append(code);
  formContainer.append(pre);
  block.append(formContainer);

  const formModule = await import('../form/form.js');
  await formModule.default(formContainer);

  setTimeout(() => {
    applyButtonConfigToSubmitButton(block, config);
    attachApplicationFormSubmitHandler(block);
    setupApplicationFormStepIndicator(block);
    const form = block.querySelector('form');
    if (form) {
      restrictNumericFields(form);
      formatDateOfBirthInput(form);
    }
  }, 100);
}

function setupApplicationFormStepIndicator(block) {
  const wizard = block.querySelector('form .wizard');
  if (!wizard) return;
  const totalSteps = wizard.querySelectorAll('.panel-wrapper').length;
  const menu = wizard.querySelector('.wizard-menu-items');
  const btnWrapper = wizard.querySelector('.wizard-button-wrapper');
  if (!btnWrapper || totalSteps === 0) return;

  const stepLabel = document.createElement('span');
  stepLabel.className = 'application-form-step-label';
  stepLabel.setAttribute('aria-live', 'polite');
  function updateStepLabel() {
    const current = wizard.querySelector('.current-wizard-step');
    const idx = current ? (parseInt(current.dataset.index, 10) + 1) : 1;
    stepLabel.textContent = `${idx}/${totalSteps} step`;
  }
  updateStepLabel();
  wizard.addEventListener('wizard:navigate', updateStepLabel);

  const nextBtn = btnWrapper.querySelector('.wizard-button-next, [id*="wizard-button-next"]');
  if (nextBtn) btnWrapper.insertBefore(stepLabel, nextBtn);
  else btnWrapper.appendChild(stepLabel);

  /* Move Submit into the wizard button row so it sits inline with Back and "n/3 step" */
  const submitWrapper = wizard.querySelector('.submit-wrapper');
  if (submitWrapper) btnWrapper.appendChild(submitWrapper);
}
