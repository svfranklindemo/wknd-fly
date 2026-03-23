/**
 * Join Us block – same pattern as sign-in: adaptive form definition + form module.
 * Form: JOIN WKND FLY CLUB heading, First Name, Last Name, Email, Phone, consent toggle, JOIN US button. All optional.
 * On submit, show green success popup: "Thank you for joining WKND Fly Club..."
 * Button config (event type, webhook, form id, data) is authorable; custom event fired on success for Launch.
 */

import { readBlockConfig } from "../../scripts/aem.js";
import { dispatchCustomEvent } from "../../scripts/custom-events.js";

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

function showSuccessPopup() {
  const overlay = document.createElement('div');
  overlay.className = 'join-us-success-overlay';
  overlay.setAttribute('aria-live', 'polite');
  overlay.innerHTML = `
    <div class="join-us-success-popup join-us-success-visible">
      <span class="join-us-success-icon" aria-hidden="true"></span>
      <p class="join-us-success-text">Thank you for joining WKND Fly Club. Check your email, new exciting travels are ahead of you!</p>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.classList.add('join-us-success-overlay-visible');
  setTimeout(() => {
    overlay.classList.remove('join-us-success-overlay-visible');
    setTimeout(() => overlay.remove(), 300);
  }, 3500);
}

export default async function decorate(block) {
  const config = readBlockConfig(block) || {};
  [...block.children].forEach((row) => { row.style.display = 'none'; });

  // Build Adaptive Form definition for Join Us (same pattern as sign-in)
  const formDef = {
    id: 'join-us',
    fieldType: 'form',
    appliedCssClassNames: 'join-us-form',
    items: [
      {
        id: 'heading-join-us',
        fieldType: 'heading',
        label: { value: 'JOIN WKND FLY CLUB' },
        appliedCssClassNames: 'col-12',
      },
      {
        id: 'panel-main',
        name: 'main',
        fieldType: 'panel',
        items: [
          {
            id: 'firstName',
            name: 'firstName',
            fieldType: 'text-input',
            label: { value: 'First Name' },
            properties: { colspan: 12 },
          },
          {
            id: 'lastName',
            name: 'lastName',
            fieldType: 'text-input',
            label: { value: 'Last Name' },
            properties: { colspan: 12 },
          },
          {
            id: 'email',
            name: 'email',
            fieldType: 'email',
            label: { value: 'Email' },
            properties: { colspan: 12 },
          },
          {
            id: 'phone',
            name: 'phone',
            fieldType: 'text-input',
            label: { value: 'Phone number' },
            properties: { colspan: 12 },
          },
          {
            id: 'consent',
            name: 'consent',
            fieldType: 'checkbox',
            label: {
              value: 'I want to join WKND Fly Club and I have read and understand the Privacy and Cookies Policy. I want to receive personalized communication by email.',
            },
            enum: ['true'],
            type: 'string',
            properties: {
              variant: 'switch',
              alignment: 'horizontal',
              colspan: 12,
            },
          },
          {
            id: 'join-us-btn',
            name: 'joinUsButton',
            fieldType: 'button',
            buttonType: 'submit',
            label: { value: 'JOIN US' },
            appliedCssClassNames: 'submit-wrapper col-12',
          },
        ],
      },
    ],
  };

  // Create form container and inject definition (same as sign-in)
  const formContainer = document.createElement('div');
  formContainer.className = 'form';

  const pre = document.createElement('pre');
  const code = document.createElement('code');
  code.textContent = JSON.stringify(formDef);
  pre.append(code);
  formContainer.append(pre);
  block.replaceChildren(formContainer);

  const formModule = await import('../form/form.js');
  await formModule.default(formContainer);

  // After form is rendered, apply button config and attach submit handler
  setTimeout(() => {
    applyButtonConfigToSubmitButton(block, config);
    attachFormSubmitHandler(block);
  }, 100);
}

/**
 * Attaches form submission handler.
 * Uses capture phase so we run first; stopImmediatePropagation prevents the Adaptive Form
 * runtime from doing a POST to the page URL (which returns 405 / "Error invoking a rest API").
 * @param {HTMLElement} block - The join-us block
 */
function attachFormSubmitHandler(block) {
  const form = block.querySelector('form');
  if (!form) {
    console.warn('Form not found in join-us block');
    return;
  }

  form.addEventListener(
    'submit',
    (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();

      const email = form.querySelector('input[name="email"]')?.value?.trim() || '';
      const firstName = form.querySelector('input[name="firstName"]')?.value?.trim() || '';
      const lastName = form.querySelector('input[name="lastName"]')?.value?.trim() || '';
      const consent = form.querySelector('input[name="consent"]')?.checked ?? true ? 'true' : 'false';

      // So Launch "Profile - Email from Storage" and Identity Map resolve when Registration rule runs
      if (email) {
        try {
          localStorage.setItem("com.adobe.reactor.dataElements.Profile - Email", email);
          if (typeof window._satellite !== "undefined" && typeof window._satellite.setVar === "function") {
            window._satellite.setVar("Profile - Email", email);
          }
        } catch (e) {
          // ignore storage/setVar errors
        }
      }

      if (typeof window.updateDataLayer === 'function') {
        window.updateDataLayer({
          personalEmail: { address: email },
          person: { name: { firstName, lastName } },
          loyaltyConsent: consent,
        });
      }
      showSuccessPopup();
      // If button has an authored event type, fire it (for Launch, same pattern as flight-search)
      const submitBtn = form.querySelector("button[type='submit']");
      const authoredEventType = submitBtn?.dataset?.buttonEventType?.trim();
      if (authoredEventType) {
        dispatchCustomEvent(authoredEventType);
      }
    },
    true
  );
}
