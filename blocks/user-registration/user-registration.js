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

export default async function decorate(block) {
  const config = readBlockConfig(block) || {};
  /* Hide button config rows on published/live, same as hero/cards */
  [...block.children].forEach((row) => { row.style.display = 'none'; });

  // Build Adaptive Form definition for User Registration (fields per design)
  const formDef = {
    id: "user-registration",
    fieldType: "form",
    appliedCssClassNames: "user-registration-form",
    items: [
      {
        id: "heading-register",
        fieldType: "heading",
        label: { value: "Register to WKND Fly" },
        appliedCssClassNames: "col-12",
      },
      {
        id: "panel-main",
        name: "main",
        fieldType: "panel",
        items: [
          {
            id: "firstName",
            name: "firstName",
            fieldType: "text-input",
            label: { value: "First name" },
            required: true,
            properties: { colspan: 6 },
          },
          {
            id: "lastName",
            name: "lastName",
            fieldType: "text-input",
            label: { value: "Last name" },
            required: true,
            properties: { colspan: 6 },
          },
          {
            id: "email",
            name: "email",
            fieldType: "email",
            label: { value: "Email" },
            required: true,
            properties: { colspan: 6 },
          },
          {
            id: "phone",
            name: "phone",
            fieldType: "text-input",
            label: { value: "Phone number" },
            properties: { colspan: 6 },
          },
          {
            id: "wkndFlyMember",
            name: "wkndFlyMember",
            fieldType: "drop-down",
            label: { value: "WKND Fly Member" },
            enum: ["", "member", "non-member"],
            enumNames: ["Select...", "Member", "Non-member"],
            type: "string",
            properties: { colspan: 12 },
          },
          {
            id: "emailComm",
            name: "emailComm",
            fieldType: "checkbox",
            label: { value: "I want to receive personalized communication by email" },
            enum: ["true"],
            type: "string",
            properties: {
              variant: "switch",
              alignment: "horizontal",
              colspan: 12,
            },
          },
          {
            id: "submit-btn",
            name: "submitButton",
            fieldType: "button",
            buttonType: "submit",
            label: { value: "REGISTER" },
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

  // Wait for form to be fully rendered before attaching listeners
  setTimeout(() => {
    applyButtonConfigToSubmitButton(block, config);
    attachDataLayerUpdaters(block);
    prePopulateFormFromDataLayer(block);
    attachFormSubmitHandler(block);
    addSignInLink(block);
  }, 100);
}

/**
 * Attaches form submission handler
 * @param {HTMLElement} block - The user registration block
 */
function attachFormSubmitHandler(block) {
  const form = block.querySelector("form");
  if (!form) {
    console.warn("Form not found in user registration block");
    return;
  }

  // Use capture phase so we run first; stopImmediatePropagation prevents the Adaptive Form
  // runtime from doing a POST to the page URL (which returns 405 Method Not Allowed).
  form.addEventListener(
    "submit",
    async (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();

      // Validate required fields
    const requiredFields = ["firstName", "lastName", "email"];
    const formData = {};
    let isValid = true;

    // Collect all form data and validate required fields
    const allFields = form.querySelectorAll("input, select, textarea");
    allFields.forEach((field) => {
      const fieldName = field.name || field.id;
      if (!fieldName) return;

      if (field.type === "checkbox") {
        const checkboxes = form.querySelectorAll(`input[name="${fieldName}"]`);
        if (checkboxes.length > 1) {
          // Checkbox group
          formData[fieldName] = Array.from(checkboxes)
            .filter((cb) => cb.checked)
            .map((cb) => cb.value);
        } else {
          // Single checkbox
          formData[fieldName] = field.checked ? field.value || "true" : "";
        }
      } else {
        formData[fieldName] = field.value;
      }

      // Check required fields
      if (requiredFields.includes(fieldName)) {
        if (!field.value || field.value.trim() === "") {
          isValid = false;
          field.classList.add("error");
        } else {
          field.classList.remove("error");
        }
      }
    });

    if (!isValid) {
      console.warn("Please fill in all required fields");
      return;
    }

    // Update dataLayer one final time with all form data
    updateAllDataLayerFields(formData);

    // Simulate user registration (replace with actual API call)
    try {
      // Save registration data to localStorage
      const registrationData = {
        ...formData,
        registeredAt: new Date().toISOString(),
        userId: generateUserId(),
      };

      localStorage.setItem(
        "com.adobe.reactor.dataElements.Identities",
        JSON.stringify({
          Email: [
            {
              id: formData.email,
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
              id: formData.email,
              primary: true,
              authenticatedState: "authenticated",
            },
          ],
        })
      );

      // So Launch "Profile - Email from Storage" and Identity Map resolve when Registration rule runs
      if (registrationData.email) {
        try {
          localStorage.setItem("com.adobe.reactor.dataElements.Profile - Email", registrationData.email);
          if (typeof window._satellite !== "undefined" && typeof window._satellite.setVar === "function") {
            window._satellite.setVar("Profile - Email", registrationData.email);
          }
        } catch (e) {
          // ignore storage/setVar errors
        }
      }

      localStorage.setItem(
        "wkndfly_registered_user",
        JSON.stringify(registrationData)
      );

      // If button has an authored event type, fire it (for Launch, same pattern as flight-search)
      const submitBtn = form.querySelector("button[type='submit']");
      const authoredEventType = submitBtn?.dataset?.buttonEventType?.trim();
      if (authoredEventType) {
        dispatchCustomEvent(authoredEventType);
      }

      // Show success message briefly before redirect
      showSuccessMessage(
        form,
        "Registration successful! Redirecting to sign-in..."
      );

      // Redirect to sign-in page after delay (allows custom/analytics calls to complete)
      setTimeout(() => {
        window.location.href = "/en/sign-in";
      }, 2000);
    } catch (error) {
      console.error("Registration error:", error);
      showErrorMessage(form, "Registration failed. Please try again.");
    }
  },
    true
  );
}

/**
 * Updates all dataLayer fields at once
 * @param {Object} formData - All form data
 */
function updateAllDataLayerFields(formData) {
  if (!window.updateDataLayer) return;

  const isMember = (formData.wkndFlyMember || "").toLowerCase() === "member" ? "y" : "n";
  const updateObj = {
    personalEmail: { address: formData.email || "" },
    mobilePhone: { number: formData.phone || "" },
    person: {
      name: {
        firstName: formData.firstName || "",
        lastName: formData.lastName || "",
      },
      wkndFlyMember: formData.wkndFlyMember || "",
      isMember: isMember === "y",
    },
    consents: {
      marketing: {
        email: {
          val: formData.emailComm === "true" || formData.emailComm === true,
        },
      },
    },
    _demosystem4: {
      identification: {
        core: {
          email: formData.email || null,
          isMember,
        },
      },
    },
  };

  window.updateDataLayer(updateObj);
}

/**
 * Generates a unique user ID
 * @returns {string} Unique user ID
 */
function generateUserId() {
  return "user_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
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
  `;

  const submitButton = form.querySelector('button[type="submit"]');
  if (submitButton) {
    submitButton.parentNode.insertBefore(messageEl, submitButton);
  } else {
    form.appendChild(messageEl);
  }
}

/**
 * Adds "Already have an account? Sign In" link below the form
 * @param {HTMLElement} block - The user registration block
 */
function addSignInLink(block) {
  const form = block.querySelector("form");
  if (!form) return;
  const wrapper = form.closest(".form") || form.parentElement;
  if (!wrapper) return;
  const existing = wrapper.querySelector(".user-registration-sign-in-link");
  if (existing) return;

  const signInDiv = document.createElement("div");
  signInDiv.className = "user-registration-sign-in-link";
  signInDiv.style.cssText = "margin-top: 1rem; text-align: center;";
  const signInAnchor = document.createElement("a");
  signInAnchor.href = "/en/sign-in";
  signInAnchor.textContent = "Sign In";
  signInAnchor.style.color = "#2874F0";
  signInDiv.append(document.createTextNode("Already have an account? "), signInAnchor);
  wrapper.appendChild(signInDiv);
}

/**
 * Pre-populates form fields from existing dataLayer values
 * @param {HTMLElement} block - The user registration block
 */
function prePopulateFormFromDataLayer(block) {
  if (!window.dataLayer) return;

  const form = block.querySelector("form");
  if (!form) return;

  const dataLayer = window.dataLayer;

  // Helper function to safely get nested property
  const getNestedProperty = (obj, path) => {
    return path.split(".").reduce((current, prop) => current?.[prop], obj);
  };

  // Populate each field from dataLayer
  Object.keys(fieldToDataLayerMap).forEach((fieldName) => {
    const dataLayerPath = fieldToDataLayerMap[fieldName];
    const value = getNestedProperty(dataLayer, dataLayerPath);

    if (value !== undefined && value !== null && value !== "") {
      const field = form.querySelector(`[name="${fieldName}"]`);
      if (!field) return;

      if (field.type === "checkbox") {
        field.checked = value === true || value === "true";
      } else if (field.tagName.toLowerCase() === "select") {
        field.value = value;
      } else {
        field.value = value;
      }
    }
  });

  // Pre-populate email communication checkbox
  const emailCommVal = getNestedProperty(dataLayer, "consents.marketing.email.val");
  if (emailCommVal === true || emailCommVal === "true") {
    const emailCommField = form.querySelector('[name="emailComm"]');
    if (emailCommField) emailCommField.checked = true;
  }
}

/**
 * Maps form field names to dataLayer paths
 */
const fieldToDataLayerMap = {
  firstName: "person.name.firstName",
  lastName: "person.name.lastName",
  email: "personalEmail.address",
  phone: "mobilePhone.number",
  wkndFlyMember: "person.wkndFlyMember",
  emailComm: "consents.marketing.email.val",
};

/**
 * Updates dataLayer with field value
 * @param {string} fieldName - Form field name
 * @param {*} value - Field value
 */
function updateDataLayerField(fieldName, value) {
  if (!window.updateDataLayer) {
    console.warn("DataLayer not available yet");
    return;
  }

  const dataLayerPath = fieldToDataLayerMap[fieldName];
  if (!dataLayerPath) return;

  const pathParts = dataLayerPath.split(".");
  const updateObj = {};
  let current = updateObj;

  for (let i = 0; i < pathParts.length - 1; i++) {
    current[pathParts[i]] = {};
    current = current[pathParts[i]];
  }

  if (fieldName === "emailComm") {
    current[pathParts[pathParts.length - 1]] = value === "true" || value === true;
  } else {
    current[pathParts[pathParts.length - 1]] = value || "";
  }

  window.updateDataLayer(updateObj);
}

/**
 * Attaches dataLayer updaters to all form fields
 * @param {HTMLElement} block - The user registration block
 */
function attachDataLayerUpdaters(block) {
  const form = block.querySelector("form");
  if (!form) {
    console.warn("Form not found in user registration block");
    return;
  }

  const fields = form.querySelectorAll("input, select, textarea");

  fields.forEach((field) => {
    const fieldName = field.name || field.id;
    if (!fieldName) return;

    if (field.type === "checkbox" || field.type === "radio") {
      field.addEventListener("change", () => {
        handleFieldUpdate(form, fieldName, field);
      });
    } else {
      field.addEventListener("blur", () => {
        handleFieldUpdate(form, fieldName, field);
      });
      if (field.tagName.toLowerCase() === "select") {
        field.addEventListener("change", () => {
          handleFieldUpdate(form, fieldName, field);
        });
      }
    }
  });
}

/**
 * Handles field update and triggers dataLayer update
 * @param {HTMLFormElement} form - The form element
 * @param {string} fieldName - Field name
 * @param {HTMLElement} field - Field element
 */
function handleFieldUpdate(form, fieldName, field) {
  let value;

  if (field.type === "checkbox") {
    // Handle checkbox groups (multiple checkboxes with same name)
    const checkboxes = form.querySelectorAll(`input[name="${fieldName}"]`);
    if (checkboxes.length > 1) {
      // Checkbox group
      value = Array.from(checkboxes)
        .filter((cb) => cb.checked)
        .map((cb) => cb.value);
    } else {
      // Single checkbox
      value = field.checked ? field.value || "true" : "";
    }
  } else if (field.type === "radio") {
    // For radio buttons, only update if this one is checked
    if (field.checked) {
      value = field.value;
    } else {
      return; // Don't update if radio is not checked
    }
  } else {
    // Text, select, textarea
    value = field.value;
  }

  updateDataLayerField(fieldName, value);
}
