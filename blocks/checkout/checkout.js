import { dispatchCustomEvent } from '../../scripts/custom-events.js';
import { readBlockConfig } from '../../scripts/aem.js';
/**
 * Checkout block – consolidates selected flights from the flights block and shows Trip Summary.
 * Selected flights are stored in sessionStorage (wknd-fly-selected-flights) when user clicks Select on any flight.
 * Book Now on the flights block redirects to the checkout page where this block is authored.
 * Confirm Purchase saves booking to sessionStorage and redirects to the confirmation page.
 */

const TRIP_STORAGE_KEY = 'wknd-fly-selected-flights';
const BOOKING_STORAGE_KEY = 'wknd-fly-booking-confirmation';

const LIVE_CONFIRMATION_PATH = '/en/confirmation';

function getConfirmationPath() {
  if (typeof window === 'undefined') return LIVE_CONFIRMATION_PATH;
  const isAuthor = window.location.hostname.includes('author') || window.location.hostname.includes('adobeaemcloud');
  if (isAuthor) {
    const pathname = window.location.pathname;
    const enIndex = pathname.indexOf('/en/');
    if (enIndex !== -1) return pathname.slice(0, enIndex + 4) + 'confirmation.html';
    if (pathname.endsWith('/en')) return pathname + '/confirmation.html';
    return '/en/confirmation.html';
  }
  return LIVE_CONFIRMATION_PATH;
}

function getSelectedFlights() {
  try {
    const raw = sessionStorage.getItem(TRIP_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function setSelectedFlights(list) {
  sessionStorage.setItem(TRIP_STORAGE_KEY, JSON.stringify(list));
}

function removeFlight(id) {
  const list = getSelectedFlights().filter((f) => f.id !== id);
  setSelectedFlights(list);
}

function getFlightsTotal(flights) {
  return flights.reduce((sum, f) => sum + (parseFloat(f.price) || 0), 0);
}

function syncCartDataLayerAfterFlightRemoval(removedFlightId) {
  if (typeof window.updateDataLayer !== 'function') return;

  const existingCart = typeof window.getDataLayerProperty === 'function'
    ? (window.getDataLayerProperty('cart') || {})
    : ((window.dataLayer && window.dataLayer.cart) || {});

  const existingProducts = (existingCart && existingCart.products && typeof existingCart.products === 'object')
    ? existingCart.products
    : {};
  const nextProducts = { ...existingProducts };
  delete nextProducts[removedFlightId];

  const productEntries = Object.values(nextProducts);
  const subTotal = productEntries.reduce((sum, product) => {
    const price = parseFloat(product?.price) || 0;
    const quantity = parseInt(product?.quantity, 10) || 1;
    return sum + (price * quantity);
  }, 0);
  const productCount = productEntries.length;

  const nextCart = {
    ...existingCart,
    products: nextProducts,
    productCount,
    subTotal,
    total: subTotal,
  };

  window.updateDataLayer({ cart: nextCart }, true);
}

function formatPrice(price) {
  const n = parseFloat(price);
  if (Number.isNaN(n)) return '$0.00';
  return `$${n.toFixed(2)}`;
}

function formatRoute(flight) {
  const from = flight.fromName || flight.from || '';
  const to = flight.toName || flight.to || '';
  const fromCode = flight.from ? ` (${flight.from})` : '';
  const toCode = flight.to ? ` (${flight.to})` : '';
  return `${from}${fromCode} to ${to}${toCode}`;
}

function generateBookingReference() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = 'B';
  for (let i = 0; i < 5; i += 1) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function generateElectronicTicketNumber() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 11; i += 1) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function generateItineraryNumber() {
  let s = '';
  for (let i = 0; i < 12; i += 1) s += Math.floor(Math.random() * 10);
  return s;
}

/** Generate 10 alphanumeric characters (e.g. "fa8e413cc7") for commerce.order.purchaseOrderNumber and order */
function generate10AlphaNumeric() {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 10; i += 1) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function collectCheckoutFormData(block) {
  const data = {};
  const inputs = block.querySelectorAll('input, select');
  inputs.forEach((el) => {
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

function renderTripSummary(container, onRemove) {
  const flights = getSelectedFlights();
  container.innerHTML = '';
  if (flights.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'checkout-empty-trip';
    empty.textContent = 'No flights in your trip. Add flights from the Flights block, then use Book Now to come here.';
    container.appendChild(empty);
    return 0;
  }
  const table = document.createElement('div');
  table.className = 'checkout-trip-table';
  const header = document.createElement('div');
  header.className = 'checkout-trip-header';
  header.innerHTML = '<span>NAME</span><span>QTY</span><span>PRICE</span><span></span>';
  table.appendChild(header);
  flights.forEach((flight) => {
    const row = document.createElement('div');
    row.className = 'checkout-trip-row';
    const imgCell = document.createElement('div');
    imgCell.className = 'checkout-trip-image';
    if (flight.image) {
      const pic = document.createElement('picture');
      const img = document.createElement('img');
      img.src = flight.image;
      img.alt = formatRoute(flight);
      pic.appendChild(img);
      imgCell.appendChild(pic);
    }
    const routeCell = document.createElement('div');
    routeCell.className = 'checkout-trip-route';
    routeCell.textContent = formatRoute(flight);
    const nameCell = document.createElement('div');
    nameCell.className = 'checkout-trip-name';
    nameCell.appendChild(imgCell);
    nameCell.appendChild(routeCell);
    const qtyCell = document.createElement('div');
    qtyCell.className = 'checkout-trip-qty';
    qtyCell.textContent = '1';
    const priceCell = document.createElement('div');
    priceCell.className = 'checkout-trip-price';
    priceCell.textContent = formatPrice(flight.price);
    const removeCell = document.createElement('div');
    removeCell.className = 'checkout-trip-remove';
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'checkout-remove-btn';
    removeBtn.setAttribute('aria-label', 'Remove flight');
    removeBtn.textContent = '×';
    removeBtn.onclick = () => {
      removeFlight(flight.id);
      syncCartDataLayerAfterFlightRemoval(flight.id);
      onRemove();
    };
    removeCell.appendChild(removeBtn);
    row.appendChild(nameCell);
    row.appendChild(qtyCell);
    row.appendChild(priceCell);
    row.appendChild(removeCell);
    table.appendChild(row);
  });
  container.appendChild(table);
  return getFlightsTotal(flights);
}

function renderUpgradeAndPreferences(mainCol) {
  const section = document.createElement('div');
  section.className = 'checkout-section';
  section.innerHTML = `
    <h3 class="checkout-section-title">Upgrade your trip</h3>
    <label class="checkout-checkbox"><input type="checkbox" name="upgrade-points"> Upgrade class with points</label>
    <label class="checkout-checkbox"><input type="checkbox" name="upgrade-luggage"> Add extra piece of checked-in luggage</label>
  `;
  mainCol.appendChild(section);
  const prefs = document.createElement('div');
  prefs.className = 'checkout-section';
  prefs.innerHTML = `
    <h3 class="checkout-section-title">Preferences</h3>
    <div class="checkout-prefs">
      <label>Seat <select name="seat"><option value="">Select...</option><option value="window">Window</option><option value="aisle">Aisle</option></select></label>
      <label>Section <select name="section"><option value="">Select...</option><option value="forward">Forward</option><option value="rear">Rear</option></select></label>
      <label>Meal <select name="meal"><option value="">Select...</option><option value="regular">Regular</option><option value="vegetarian">Vegetarian</option><option value="low-calories">Low Calories</option><option value="peanut-free">Peanut-Free</option><option value="non-lactose">Non-Lactose</option><option value="diabetic">Diabetic</option></select></label>
    </div>
  `;
  mainCol.appendChild(prefs);
}

/** Read value from input/select (text or checked for checkbox) */
function getFieldValue(block, name) {
  const el = block.querySelector(`[name="${name}"]`);
  if (!el) return el === null ? '' : undefined;
  if (el.type === 'checkbox') return el.checked;
  return (el.value || '').trim();
}

/** Push all checkout form fields to datalayer (passenger, payment, upgrade, preferences) */
function updateDataLayerFromCheckoutForm(block) {
  if (typeof window.updateDataLayer !== 'function') return;
  const v = (name) => getFieldValue(block, name);

  const yesNo = (x) => (typeof window.getDataLayerYesNo === 'function' ? window.getDataLayerYesNo(x) : (x ? 'y' : 'n'));
  const updates = {
    emailConsent: v('promo') ?? false,
    extraLuggage: v('upgrade-luggage') ?? false,
    upgradeWithPoints: yesNo(v('upgrade-points')),
    travelPreferences: {
      seat: v('seat') || 'noPreference',
      seatSection: v('section') || 'noPreference',
      meal: v('meal') || 'regularMeal',
    },
    person: {
      name: {
        firstName: v('firstName') || '',
        middleName: v('middleName') || '',
        lastName: v('lastName') || '',
      },
      gender: v('gender') || 'not_specified',
      birthDate: v('birthDate') || '',
      isMember: yesNo(v('wknd-club')),
    },
    personalEmail: { address: v('email') || '' },
    mobilePhone: { number: v('phone') || '' },
    smsConsent: yesNo(v('sms')),
    loyaltyConsent: yesNo(v('wknd-club')),
    payment: {
      nameOnCard: v('nameOnCard') || '',
      cardExpiration: v('expiration') || '',
      cardNumber: v('cardNumber') || '',
      cvv: v('cvv') || '',
    },
    consents: {
      marketing: {
        email: { val: yesNo(v('promo')) },
      },
    },
  };

  updates._demosystem4 = {
    identification: {
      core: { loyaltyId: v('frequentFlyerId') || '' },
    },
  };

  window.updateDataLayer(updates, true);
}

/** Attach listeners so datalayer stays in sync with all checkout form fields */
function attachCheckoutDataLayerListeners(block) {
  updateDataLayerFromCheckoutForm(block);
  const inputs = block.querySelectorAll('input, select');
  inputs.forEach((el) => {
    const name = el.getAttribute('name');
    if (!name) return;
    const event = el.type === 'checkbox' ? 'change' : 'blur';
    el.addEventListener(event, () => updateDataLayerFromCheckoutForm(block));
  });
}

function renderPassengerForm(mainCol) {
  const section = document.createElement('div');
  section.className = 'checkout-section';
  section.innerHTML = `
    <h3 class="checkout-section-title">Passenger Information</h3>
    <p class="checkout-description">Please make sure your full name is entered exactly as it appears on your government-issued identification. This information is required based on international regulations.</p>
    <div class="checkout-form">
      <label>First Name <input type="text" name="firstName"></label>
      <label>Middle Name (optional) <input type="text" name="middleName"></label>
      <label>Last Name <input type="text" name="lastName"></label>
      <label>Birth Date <input type="text" name="birthDate" placeholder="mm/dd/yyyy"></label>
      <label>Gender <select name="gender"><option value="">Not Specified</option><option value="male">Male</option><option value="female">Female</option></select></label>
      <label>Frequent Flyer ID <input type="text" name="frequentFlyerId"></label>
      <label>Email Address <input type="email" name="email"></label>
      <label>Phone Number <input type="text" name="phone"></label>
      <label class="checkout-checkbox"><input type="checkbox" name="wknd-club" checked> I want to sign up for WKND Fly Club</label>
      <label class="checkout-checkbox"><input type="checkbox" name="sms"> I want to get SMS with booking confirmation</label>
      <label class="checkout-checkbox"><input type="checkbox" name="promo"> I want to receive electronic mail with promotions and announcements</label>
    </div>
  `;
  mainCol.appendChild(section);
}

function renderPaymentForm(mainCol) {
  const section = document.createElement('div');
  section.className = 'checkout-section';
  section.innerHTML = `
    <h3 class="checkout-section-title">Payment Method</h3>
    <p class="checkout-description">Only credit/debit card payments are accepted. Ignore this section if you chose to pay with Frequent Flyer program points.</p>
    <div class="checkout-form">
      <label>Name on Card <input type="text" name="nameOnCard"></label>
      <label>Expiration <input type="text" name="expiration" placeholder="MM/YY"></label>
      <label>Card Number <input type="text" name="cardNumber" inputmode="numeric" pattern="[0-9]*" maxlength="19" placeholder="Digits only"></label>
      <label>CVV <input type="text" name="cvv" inputmode="numeric" pattern="[0-9]*" maxlength="4" placeholder="3 or 4 digits"></label>
    </div>
  `;
  mainCol.appendChild(section);
}

function renderTripTotal(sidebar, total, config) {
  sidebar.innerHTML = '';
  const box = document.createElement('div');
  box.className = 'checkout-total-box';
  const flights = getSelectedFlights();
  const passengerCount = 1;
  const flightsTotal = total || 0;
  box.innerHTML = `
    <h3 class="checkout-total-title">Trip Total</h3>
    <div class="checkout-total-row"><span>${passengerCount} Passenger</span></div>
    <div class="checkout-total-row"><span>Flights</span><span>${formatPrice(flightsTotal)}</span></div>
    <div class="checkout-total-row"><span>Taxes</span><span>included</span></div>
    <hr class="checkout-total-divider">
    <div class="checkout-total-row checkout-total-final"><span>Total</span><span>${formatPrice(flightsTotal)}</span></div>
    <button type="button" class="checkout-confirm-btn" data-button-webhook-url="${config.buttonwebhookurl}" data-button-form-id="${config.buttonformid}" data-button-data="${config.buttondata}">Confirm Purchase</button>
  `;
  const confirmBtn = box.querySelector('.checkout-confirm-btn');
  if (confirmBtn) {
    const block = document.querySelector('.checkout-block');
    confirmBtn.onclick = () => {
      if (flights.length === 0) {
        // eslint-disable-next-line no-alert
        alert('Please add at least one flight to your trip before confirming.');
        return;
      }
      const formData = block ? collectCheckoutFormData(block) : {};
      const bookingRef = generateBookingReference();
      const ticketNum = generateElectronicTicketNumber();
      const itineraryNum = generateItineraryNumber();
      const bookingData = {
        bookingReference: bookingRef,
        electronicTicketNumber: ticketNum,
        itineraryNumber: itineraryNum,
        total: flightsTotal,
        passengerCount: 1,
        flights: flights.map((f) => ({ ...f, route: formatRoute(f) })),
        formData,
      };
      try {
        sessionStorage.setItem(BOOKING_STORAGE_KEY, JSON.stringify(bookingData));
        // So Launch "Profile - Email from Storage" and Identity Map resolve when Confirm Purchase rule runs
        if (formData.email) {
          localStorage.setItem("com.adobe.reactor.dataElements.Profile - Email", formData.email);
          if (typeof window._satellite !== "undefined" && typeof window._satellite.setVar === "function") {
            window._satellite.setVar("Profile - Email", formData.email);
          }

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
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('Could not save booking to sessionStorage', e);
      }
      let orderId;
      if (typeof window.updateDataLayer === 'function') {
        orderId = generate10AlphaNumeric();
        const firstFlight = flights[0];
        updateDataLayerFromCheckoutForm(block);
        const bookingUpdates = {
          order: orderId,
          commerce: { order: { purchaseOrderNumber: orderId } },
          itineraryNumber: itineraryNum,
          bookingReference: bookingRef,
          ticketNumber: ticketNum,
          cart: { ...(typeof window.getDataLayerProperty === 'function' ? window.getDataLayerProperty('cart') : {}), total: flightsTotal },
          personalEmail: { address: formData.email || '' },
          _demosystem4: {
            identification: {
              core: {
                loyaltyId: formData.frequentFlyerId || (typeof window.getDataLayerProperty === 'function' ? (window.getDataLayerProperty('_demosystem4.identification.core')?.loyaltyId) : undefined) || '',
              },
            },
          },
        };
        if (firstFlight) {
          const dateVal = firstFlight.date;
          const todayISO = typeof window.getDataLayerDate === 'function' ? window.getDataLayerDate(new Date().toISOString().slice(0, 10)) : '';
          bookingUpdates.from = firstFlight.from || '';
          bookingUpdates.to = firstFlight.to || '';
          bookingUpdates.flightNumber = firstFlight.id || '';
          bookingUpdates.class = (typeof window.getDataLayerFlightClass === 'function' ? window.getDataLayerFlightClass(firstFlight.class) : (firstFlight.class || '')) || '';
          bookingUpdates.flightLength = (typeof window.getDataLayerFlightLength === 'function' ? window.getDataLayerFlightLength(firstFlight.flightLength) : (parseInt(firstFlight.flightLength, 10) || 0));
          bookingUpdates.date = (typeof window.getDataLayerDate === 'function' ? (window.getDataLayerDate(dateVal) || todayISO) : (dateVal || todayISO)) || '';
        }
        window.updateDataLayer(bookingUpdates, true);
        dispatchCustomEvent(config.buttoneventtype);
      }
      setTimeout(() => { window.location.href = getConfirmationPath()+ '?order='+orderId; }, 2000);
    };
  }
  sidebar.appendChild(box);
}

/** Fill the form data from datalayer object available in local storage */
function fillFormDataFromDataLayer(block) {
  try {
    const dataLayerKey = 'wkndfly_registered_user';
    const rawData = localStorage.getItem(dataLayerKey);
    if (!rawData) return;

    const userData = JSON.parse(rawData);
    const fields = [
      { name: 'firstName', value: userData?.firstName },
      { name: 'lastName', value: userData?.lastName },
      { name: 'email', value: userData?.email },
      { name: 'phone', value: userData?.phone },
    ];

    fields.forEach(({ name, value }) => {
      const el = block.querySelector(`[name="${name}"]`);
      if (!el) return;
      if (el.type === 'checkbox') {
        el.checked = !!value;
      } else {
        el.value = value || '';
      }
    });
  } catch (e) {
    console.warn('Could not fill form data from datalayer', e);
  }
}

export default async function decorate(block) {
  const config = readBlockConfig(block);
  /* Hide all config rows on live */
  [...block.children].forEach((row) => row.style.display = 'none');
  block.classList.add('checkout-block');
  const wrapper = document.createElement('div');
  wrapper.className = 'checkout-wrapper';
  const mainCol = document.createElement('div');
  mainCol.className = 'checkout-main';
  const sidebar = document.createElement('div');
  sidebar.className = 'checkout-sidebar';

  const header = document.createElement('div');
  header.className = 'checkout-header';
  header.innerHTML = '<h1 class="checkout-title">Trip Summary</h1>';
  mainCol.appendChild(header);

  const tripSection = document.createElement('div');
  tripSection.className = 'checkout-section checkout-trip-section';
  const tripTitle = document.createElement('h3');
  tripTitle.className = 'checkout-section-title';
  tripTitle.textContent = 'Trip Summary';
  tripSection.appendChild(tripTitle);
  const tripContainer = document.createElement('div');
  tripContainer.className = 'checkout-trip-container';
  tripSection.appendChild(tripContainer);
  mainCol.appendChild(tripSection);

  const refreshTripAndTotal = () => {
    const total = renderTripSummary(tripContainer, refreshTripAndTotal);
    renderTripTotal(sidebar, total, config);
  };

  refreshTripAndTotal();
  renderUpgradeAndPreferences(mainCol);
  renderPassengerForm(mainCol);
  renderPaymentForm(mainCol);

  wrapper.appendChild(mainCol);
  wrapper.appendChild(sidebar);
  block.appendChild(wrapper);

  restrictNumericFieldsToDigits(block);
  formatBirthDateInput(block);
  attachCheckoutDataLayerListeners(block);
  fillFormDataFromDataLayer(block);
}

/** Restrict phone, card number, CVV to digits only (strip non-numeric on input) */
function restrictNumericFieldsToDigits(block) {
  const numericNames = ['cardNumber', 'cvv'];
  numericNames.forEach((name) => {
    const el = block.querySelector(`[name="${name}"]`);
    if (!el || el.type === 'hidden') return;
    el.addEventListener('input', () => {
      const digits = el.value.replace(/\D/g, '');
      if (el.value !== digits) el.value = digits;
    });
  });
}

/** Birth date: accept digits only and auto-format to mm/dd/yyyy (works with or without slashes) */
function formatBirthDateInput(block) {
  const el = block.querySelector('[name="birthDate"]');
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
