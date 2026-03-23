/**
 * Confirmation block – shows Electronic Ticket booked after checkout.
 * Data is stored in sessionStorage (wknd-fly-booking-confirmation) when user clicks Confirm Purchase.
 */

const BOOKING_STORAGE_KEY = 'wknd-fly-booking-confirmation';

function getBookingData() {
  try {
    const raw = sessionStorage.getItem(BOOKING_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function resetCartFromDataLayer() {
  if (typeof window.updateDataLayer !== 'function') return;
  window.updateDataLayer({
    cart: {
      products: {},
      productCount: 0,
      subTotal: 0,
      total: 0,
    },
  }, true);
}

function renderConfirmation(block, data) {
  if (!data) {
    block.innerHTML = `
      <div class="confirmation-block">
        <p class="confirmation-empty">No booking found. Complete a purchase on the checkout page to see your confirmation here.</p>
      </div>
    `;
    return;
  }

  const {
    bookingReference = '—',
    electronicTicketNumber = '—',
    itineraryNumber = '—',
  } = data;

  block.classList.add('confirmation-block');
  block.innerHTML = `
    <h1 class="confirmation-title">Electronic Ticket booked</h1>
    <p class="confirmation-subtitle">Your electronic ticket number is <strong class="confirmation-eticket-inline">${electronicTicketNumber}</strong>. Please refer this number in future communication with WKND Fly customer service.</p>

    <div class="confirmation-card">
      <h2 class="confirmation-card-title">Booking Details</h2>
      <div class="confirmation-details">
        <div class="confirmation-detail-row">
          <span class="confirmation-detail-label">Booking Reference</span>
          <span class="confirmation-detail-value">${bookingReference}</span>
        </div>
        <div class="confirmation-detail-row">
          <span class="confirmation-detail-label">Electronic Ticket #</span>
          <span class="confirmation-detail-value">${electronicTicketNumber}</span>
        </div>
        <div class="confirmation-detail-row">
          <span class="confirmation-detail-label">Itinerary #</span>
          <span class="confirmation-detail-value">${itineraryNumber}</span>
        </div>
      </div>
    </div>

    <div class="confirmation-card">
      <h2 class="confirmation-card-title">Keep in mind</h2>
      <div class="confirmation-keep-in-mind">
        <div class="confirmation-keep-column">
          <h3 class="confirmation-keep-heading">Departure</h3>
          <p class="confirmation-keep-text">Gate closes 30 minutes before planned take off.</p>
          <p class="confirmation-keep-text">Baggage Check-In closes 45 minutes before take off.</p>
        </div>
        <div class="confirmation-keep-column">
          <h3 class="confirmation-keep-heading">Arrival</h3>
          <p class="confirmation-keep-text">Time of landing may depend on actual departure time and conditions at the airport.</p>
        </div>
      </div>
    </div>
  `;
}

export default async function decorate(block) {
  const data = getBookingData();
  renderConfirmation(block, data);
  sessionStorage.removeItem('wknd-fly-selected-flights');
  sessionStorage.removeItem('wknd-fly-booking-confirmation');
  resetCartFromDataLayer();
}
