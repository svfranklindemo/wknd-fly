import { isAuthorEnvironment } from "../../scripts/scripts.js";
import { readBlockConfig } from "../../scripts/aem.js";
import { dispatchCustomEvent } from "../../scripts/custom-events.js";
import { fetchPlaceholders } from "../../scripts/placeholders.js";

const PROFILE_API_BASE_URL = "https://dsn.adobe.com/api/v2/profile/email";
const REGISTERED_USER_KEY = "wkndfly_registered_user";

// Registered-user field -> profile (XDM) path
const PROFILE_FIELD_PATHS = {
  firstName: "person.name.firstName",
  lastName: "person.name.lastName",
  email: "personalEmail.address",
  phone: "mobilePhone.number",
  streetAddress: "homeAddress.street1",
  city: "homeAddress.city",
  state: "homeAddress.state",
  zipCode: "homeAddress.postalCode",
  country: "homeAddress.country",
};

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

export default async function decorate(block) {
  const config = readBlockConfig(block) || {};
  /* Hide button config rows on published/live, same as hero/cards */
  [...block.children].forEach((row) => { row.style.display = 'none'; });

  const isAuthor = isAuthorEnvironment();

  // Build Adaptive Form definition for Sign In
  const formDef = {
    id: "sign-in",
    fieldType: "form",
    appliedCssClassNames: "sign-in-form",
    items: [
      {
        id: "heading-sign-in",
        fieldType: "heading",
        label: { value: "Sign in to your account" },
        appliedCssClassNames: "col-12",
      },
      {
        id: "panel-main",
        name: "main",
        fieldType: "panel",
        items: [
          {
            id: "email",
            name: "email",
            fieldType: "email",
            label: { value: "Email address" },
            required: true,
            autoComplete: "email",
            properties: { colspan: 12 },
          },
          {
            id: "password",
            name: "password",
            fieldType: "password-input",
            label: { value: "Password" },
            required: true,
            autoComplete: "current-password",
            properties: { colspan: 12 },
          },
          {
            id: "sign-in-btn",
            name: "signInButton",
            fieldType: "button",
            buttonType: "submit",
            label: { value: "SIGN IN" },
            appliedCssClassNames: "submit-wrapper col-12",
          },
        ],
      },
    ],
  };

  // Create a child form block that reuses the existing form renderer
  const formContainer = document.createElement("div");
  formContainer.className = "form";

  const pre = document.createElement("pre");
  const code = document.createElement("code");
  code.textContent = JSON.stringify(formDef);
  pre.append(code);
  formContainer.append(pre);
  block.replaceChildren(formContainer);

  const formModule = await import("../form/form.js");
  await formModule.default(formContainer);

  // Wait for form to be rendered before attaching handlers
  setTimeout(() => {
    applyButtonConfigToSubmitButton(block, config);
    attachSignInHandler(block);
    addCreateAccountLink(block, isAuthor);
  }, 100);
}

/**
 * Validates email format
 * @param {string} email - Email to validate
 * @returns {boolean} True if valid email
 */
function isValidEmail(email) {
  if (!email || typeof email !== "string") return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
}

/**
 * Prefills the email field using stored registration data
 * @param {HTMLFormElement} form - The sign-in form element
 */
function prefillEmail(form) {
  if (!form) return;
  const emailInput = form.querySelector('input[name="email"]');
  if (!emailInput) return;

  const candidateKeys = ["com.adobe.reactor.dataElements.Profile - Email"];

  let storedEmail = "";

  for (const key of candidateKeys) {
    const value = localStorage.getItem(key);
    if (value && typeof value === "string" && value.trim()) {
      storedEmail = value;
      break;
    }
  }

  if (!storedEmail) {
    try {
      const reg = JSON.parse(
        localStorage.getItem("wkndfly_registered_user") || "{}"
      );
      if (reg.email) {
        storedEmail = reg.email;
      }
    } catch (e) {
      // Ignore JSON parse errors
    }
  }

  if (storedEmail) {
    const cleanedEmail = storedEmail.replace(/[\*\"\']/g, "").trim();
    if (isValidEmail(cleanedEmail)) {
      emailInput.value = cleanedEmail;
    }
  }
}

/**
 * Fetches the profile for an email from the Adobe Profile API
 * @param {string} email - Email to look up
 * @returns {Promise<object|null>} Profile entity, or null if not found
 * @throws {Error} If the profile lookup fails
 */
async function checkProfileViaAPI(email) {
  try {
    // fetchPlaceholders lowercases keys: orgId -> orgid, sandboxName -> sandboxname
    const { orgid, sandboxname } = await fetchPlaceholders();
    if (!orgid || !sandboxname) {
      console.warn("Profile API: orgId/sandboxName missing in placeholders");
      throw new Error('Profile API configuration is missing');
    }

    const url = `${PROFILE_API_BASE_URL}/${encodeURIComponent(email)}`
      + `?orgId=${encodeURIComponent(orgid)}&sandboxName=${encodeURIComponent(sandboxname)}`;
    const response = await fetch(url);
    if (!response.ok) {
      console.warn("Profile API request failed:", response.status);
      throw new Error(`Profile API request failed: ${response.status}`);
    }

    const data = await response.json();
    if (data?.status !== 'success') {
      throw new Error('Profile API returned an unsuccessful response');
    }
    // A missing profile still returns status "success" with an empty result
    const [profile] = Object.values(data?.result || {});
    return profile?.entity || null;
  } catch (error) {
    console.error("Error checking profile via API:", error);
    throw error;
  }
}

/**
 * Mirrors the storage and data-layer writes done at registration for an existing profile
 * @param {object} entity - Profile entity from the API
 */
function applyProfile(entity) {
  const user = {};
  Object.entries(PROFILE_FIELD_PATHS).forEach(([field, path]) => {
    const value = path.split(".").reduce((node, key) => node?.[key], entity);
    if (value) user[field] = value;
  });
  // identityMap is the source of truth for email
  user.email = entity.identityMap?.email?.[0]?.id;
  if (!user.email) return;

  let stored = {};
  try {
    stored = JSON.parse(localStorage.getItem(REGISTERED_USER_KEY) || "{}");
  } catch (e) {
    // Ignore JSON parse errors
  }
  const base = stored.email?.toLowerCase() === user.email.toLowerCase() ? stored : {};
  localStorage.setItem(REGISTERED_USER_KEY, JSON.stringify({
    ...base,
    ...user,
    registeredAt: base.registeredAt || new Date().toISOString(),
    userId: base.userId || generateUserId(),
  }));
  localStorage.setItem("com.adobe.reactor.dataElements.Profile - Email", user.email);
  if (typeof window._satellite?.setVar === "function") {
    window._satellite.setVar("Profile - Email", user.email);
  }

  if (typeof window.updateDataLayer === "function") {
    const updates = { _demosystem4: { identification: { core: { email: user.email } } } };
    Object.entries(PROFILE_FIELD_PATHS).forEach(([field, path]) => {
      if (!user[field]) return;
      const keys = path.split(".");
      const last = keys.pop();
      const parent = keys.reduce((node, key) => (node[key] = node[key] || {}), updates);
      parent[last] = user[field];
    });
    window.updateDataLayer(updates);
  }
}

function generateUserId() {
  return `user_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Attaches sign-in form submission handler
 * @param {HTMLElement} block - The sign-in block
 */
function attachSignInHandler(block) {
  let form = block.querySelector("form");
  if (!form) {
    console.warn("Sign-in form not found");
    return;
  }

  // Clone the form to remove all existing event listeners (including form component's submit handler)
  const newForm = form.cloneNode(true);
  form.parentNode.replaceChild(newForm, form);
  form = newForm; // Update reference to use the new form

  prefillEmail(form);

  // Now attach our custom submit handler to the clean form
  form.addEventListener("submit", async (event) => {
    event.preventDefault(); // Prevent default form submission

    // Get form values
    const emailInput = form.querySelector('input[name="email"]');
    const passwordInput = form.querySelector('input[name="password"]');

    if (!emailInput || !passwordInput) {
      showErrorMessage(form, "Form fields not found");
      return;
    }

    const enteredEmail = emailInput.value.trim();
    const enteredPassword = passwordInput.value;

    // Validate email format
    if (!isValidEmail(enteredEmail)) {
      showErrorMessage(form, "Please enter a valid email address");
      emailInput.focus();
      return;
    }

    // Validate password is not empty
    if (!enteredPassword || enteredPassword.trim() === "") {
      showErrorMessage(form, "Please enter your password");
      passwordInput.focus();
      return;
    }

    // Load the profile before marking sign-in successful
    try {
      const profile = await checkProfileViaAPI(enteredEmail);
      if (!profile) {
        // eslint-disable-next-line no-use-before-define
        showErrorMessage(form, 'Profile not found. Check if the profile identified'
          + ' by provided email exists in Platform.');
        return;
      }
      applyProfile(profile);

      // Set authentication flag in localStorage
      localStorage.setItem("wkndfly_user_logged_in", "true");

      localStorage.setItem(
        "com.adobe.reactor.dataElements.Identities",
        JSON.stringify({
          Email: [
            {
              id: enteredEmail,
              primary: true,
              authenticatedState: "authenticated",
            },
          ],
        })
      );

      sessionStorage.setItem(
        "com.adobe.reactor.dataElements.Identity Map",
        JSON.stringify({
          Email: [
            {
              id: enteredEmail,
              primary: true,
              authenticatedState: "authenticated",
            },
          ],
        })
      );

      // Update dataLayer before firing custom event (same pattern as flight-search and user-registration)
      if (typeof window.updateDataLayer === "function") {
        const updates = { personalEmail: { address: enteredEmail } };
        if (enteredEmail && String(enteredEmail).trim()) {
          updates._demosystem4 = {
            identification: {
              core: {
                email: String(enteredEmail).trim(),
              },
            },
          };
        }
        window.updateDataLayer(updates);
      }

      // If button has an authored event type, fire it (for Launch, same pattern as flight-search)
      const submitBtn = form.querySelector("button[type='submit']");
      const authoredEventType = submitBtn?.dataset?.buttonEventType?.trim();
      if (authoredEventType) {
        dispatchCustomEvent(authoredEventType);
      }

      // Show success message
      showSuccessMessage(form, "Sign-in successful! Redirecting...");

      // Redirect to home page after delay (allows custom/analytics calls to complete)
      setTimeout(() => {
        window.location.href = "/";
      }, 2000);
    } catch (error) {
      console.error("Sign-in error:", error);
      showErrorMessage(form, "Sign-in failed. Please try again.");
    }
  });
}

/**
 * Shows success message
 * @param {HTMLFormElement} form - The form element
 * @param {string} message - Success message
 */
function showSuccessMessage(form, message) {
  // Remove any existing messages
  const existingMessages = form.querySelectorAll(".form-message");
  existingMessages.forEach((msg) => msg.remove());

  const messageEl = document.createElement("div");
  messageEl.className = "form-message success";
  messageEl.textContent = message;
  messageEl.style.cssText = `
    padding: 15px;
    margin: 20px 0;
    background-color: #4caf50;
    color: white;
    border-radius: 4px;
    text-align: center;
    font-weight: bold;
    animation: slideDown 0.3s ease-out;
  `;

  const submitButton = form.querySelector('button[type="submit"]');
  if (submitButton) {
    submitButton.parentNode.insertBefore(messageEl, submitButton);
    submitButton.disabled = true;
  } else {
    form.appendChild(messageEl);
  }
}

/**
 * Shows error message
 * @param {HTMLFormElement} form - The form element
 * @param {string} message - Error message
 */
function showErrorMessage(form, message) {
  // Remove any existing messages
  const existingMessages = form.querySelectorAll(".form-message");
  existingMessages.forEach((msg) => msg.remove());

  const messageEl = document.createElement("div");
  messageEl.className = "form-message error";
  messageEl.textContent = message;
  messageEl.style.cssText = `
    padding: 15px;
    margin: 20px 0;
    background-color: #f44336;
    color: white;
    border-radius: 4px;
    text-align: center;
    font-weight: bold;
    animation: slideDown 0.3s ease-out;
  `;

  const submitButton = form.querySelector('button[type="submit"]');
  if (submitButton) {
    submitButton.parentNode.insertBefore(messageEl, submitButton);
  } else {
    form.appendChild(messageEl);
  }

  // Auto-remove error message after 5 seconds
  setTimeout(() => {
    messageEl.remove();
  }, 5000);
}

function addCreateAccountLink(block, isAuthor) {
  const formElement = block.querySelector("form");
  if (!formElement) return;

  // Create "Create account" link section
  const linkSection = document.createElement("div");
  linkSection.className = "sign-in-links";

  // Divider
  const divider = document.createElement("div");
  divider.className = "sign-in-divider";
  divider.innerHTML = "<span>or</span>";

  // Create account link with smart path construction
  const createAccountLink = document.createElement("a");
  createAccountLink.className = "create-account-link";
  createAccountLink.textContent = "Create an account";

  // Smart path construction
  const currentPath = window.location.pathname;
  let registrationPath;

  if (isAuthor) {
    // For author, replace 'sign-in.html' with 'registration.html'
    registrationPath = currentPath.replace(
      "/sign-in.html",
      "/registration.html"
    );
  } else {
    // For EDS publish, replace '/sign-in' with '/registration'
    registrationPath = currentPath.replace(
      /\/sign-in(\.html)?$/,
      "/registration"
    );
  }

  createAccountLink.href = registrationPath;

  linkSection.append(divider, createAccountLink);
  formElement.parentElement.append(linkSection);
}