// Configuration reading is handled directly from block structure
import { getMetadata } from '../../scripts/aem.js';
import { isAuthorEnvironment } from '../../scripts/scripts.js';
import { getHostname } from '../../scripts/utils.js';

// Sample doctor data - in production, this would come from your data source
const GRAPHQL_DOCTORS_BY_FOLDER_QUERY = '/graphql/execute.json/ref-demo-eds/GetDoctorsFromFolder';

 const CONFIG = {
    WRAPPER_SERVICE_URL: 'https://3635370-refdemoapigateway-stage.adobeioruntime.net/api/v1/web/ref-demo-api-gateway/fetch-cf'
  };

function isAuthorEnvironmentSimple() {
  try {
    return typeof window !== 'undefined' && /(^|\.)author[-.]/.test(window.location.hostname);
  } catch (_) {
    return false;
  }
}

// Function to extract unique specialties from doctor data
function getUniqueSpecialties(doctors) {
  const specialties = new Set();
  doctors.forEach(doctor => {
    // Handle different possible specialty field names and formats
    const specialty = doctor.specialty || doctor.medicalSpecialty || doctor.speciality;
    if (specialty && typeof specialty === 'string' && specialty.trim()) {
      specialties.add(specialty.trim());
    } else if (Array.isArray(specialty)) {
      // Handle array of specialties (from Content Fragments)
      specialty.forEach(spec => {
        if (spec && typeof spec === 'string' && spec.trim()) {
          specialties.add(spec.trim());
        }
      });
    }
  });
  return Array.from(specialties).sort();
}

// Utility functions
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

function createElement(tag, className, content) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (content) element.innerHTML = content;
  return element;
}

// Appointment popup helpers
function ensureAppointmentStyles() {
  if (document.getElementById('find-doctor-appointment-styles')) return;
  const style = document.createElement('style');
  style.id = 'find-doctor-appointment-styles';
  style.textContent = `
    body.fd-modal-open { overflow: hidden; }
    .fd-modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 9999;
      padding: 1rem;
    }
    .fd-modal {
      background: #fff;
      color: inherit;
      border-radius: 12px;
      box-shadow: 0 10px 25px rgba(0,0,0,0.15);
      max-width: 520px;
      width: 100%;
      overflow: hidden;
      animation: fd-modal-in 160ms ease-out;
    }
    @keyframes fd-modal-in { from { transform: translateY(8px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
    .fd-modal-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 20px;
      border-bottom: 1px solid #eee;
    }
    .fd-modal-title {
      margin: 0;
      font-size: 1.125rem;
      font-weight: 600;
    }
    .fd-modal-close {
      background: transparent;
      border: none;
      font-size: 1.25rem;
      cursor: pointer;
      line-height: 1;
      padding: 6px;
      border-radius: 6px;
    }
    .fd-modal-close:focus { outline: 2px solid #2680eb; outline-offset: 2px; }
    .fd-modal-body { padding: 16px 20px; }
    .fd-modal-actions { display: flex; gap: 12px; margin-top: 16px; flex-wrap: wrap; }
    .fd-success {
      display: inline-block;
      background: #e6f4ea;
      color: #137333;
      border: 1px solid #c6e7d0;
      padding: 8px 12px;
      border-radius: 8px;
      font-weight: 600;
      margin-bottom: 12px;
    }
    .fd-btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 10px 14px;
      border-radius: 8px;
      border: 1px solid #ddd;
      text-decoration: none;
      color: inherit;
      background: #f8f9fa;
      cursor: pointer;
    }
    .fd-btn-primary { background: #1a73e8; color: #fff; border-color: #1a73e8; }
    .fd-contact-row { display: flex; flex-direction: column; gap: 6px; }
    .fd-contact-row a { color: #1a73e8; text-decoration: none; }
    .fd-contact-row a:hover { text-decoration: underline; }
  `;
  document.head.appendChild(style);
}

function showAppointmentPopup(doctor) {
  ensureAppointmentStyles();
  const overlay = document.createElement('div');
  overlay.className = 'fd-modal-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');

  const modal = document.createElement('div');
  modal.className = 'fd-modal';
  modal.innerHTML = `
    <div class="fd-modal-header">
      <h3 class="fd-modal-title">Contact ${doctor.name}</h3>
      <button class="fd-modal-close" aria-label="Close">×</button>
    </div>
    <div class="fd-modal-body">
      <div class="fd-success">Booking confirmed!</div>
      <div class="fd-contact-row">
        ${doctor.phone ? `<div><strong>Phone:</strong> <a href="tel:${doctor.phone}">${doctor.phone}</a></div>` : ''}
        ${doctor.email ? `<div><strong>Email:</strong> <a href="mailto:${doctor.email}">${doctor.email}</a></div>` : ''}
      </div>
    </div>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  document.body.classList.add('fd-modal-open');

  const cleanup = () => {
    document.removeEventListener('keydown', onKey);
    overlay.removeEventListener('click', onOverlayClick);
    overlay.remove();
    document.body.classList.remove('fd-modal-open');
  };
  const onKey = (e) => { if (e.key === 'Escape') cleanup(); };
  const onOverlayClick = (e) => { if (e.target === overlay) cleanup(); };
  document.addEventListener('keydown', onKey);
  overlay.addEventListener('click', onOverlayClick);
  modal.querySelector('.fd-modal-close')?.addEventListener('click', cleanup);
}

function createSearchInput(placeholder, className) {
  const input = createElement('input');
  input.type = 'text';
  input.className = className;
  input.placeholder = placeholder;
  return input;
}

function createSelect(options, placeholder, className) {
  const select = createElement('select', className);
  const defaultOption = createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = placeholder;
  select.appendChild(defaultOption);
  
  options.forEach(option => {
    const optionElement = createElement('option');
    optionElement.value = option.toLowerCase();
    optionElement.textContent = option;
    select.appendChild(optionElement);
  });
  
  return select;
}

function createDoctorCard(doctor) {
  const card = createElement('div', 'doctor-card');
  
  const cardContent = `
    <div class="doctor-image">
      <img src="${doctor.image}" alt="${doctor.name}" onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPgo8Y2lyY2xlIGN4PSIxMiIgY3k9IjEyIiByPSIxMCIgZmlsbD0iI2YzZjRmNiIvPgo8cGF0aCBkPSJNMTIgMTJhNCA0IDAgMSAwIDAtOCA0IDQgMCAwIDAgMCA4WiIgZmlsbD0iIzk5YTNhZiIvPgo8cGF0aCBkPSJNMTIgMTRjLTMuMzEzIDAtNiAyLjY4Ny02IDZ2MmgxMnYtMmMwLTMuMzEzLTIuNjg3LTYtNi02WiIgZmlsbD0iIzk5YTNhZiIvPgo8L3N2Zz4K'">
      ${doctor.acceptingNewPatients ? '<span class="accepting-patients">Accepting New Patients</span>' : '<span class="not-accepting">Not Accepting New Patients</span>'}
    </div>
    <div class="doctor-info">
      <h3 class="doctor-name">${doctor.name}</h3>
      <p class="doctor-specialty">${doctor.specialty}</p>
      <p class="doctor-experience">${doctor.experience} experience</p>
      <div class="doctor-rating">
        <span class="rating-stars">${'★'.repeat(Math.floor(doctor.rating))}${'☆'.repeat(5 - Math.floor(doctor.rating))}</span>
        <span class="rating-number">${doctor.rating}</span>
      </div>
      <p class="doctor-location">
        <svg class="location-icon" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
        </svg>
        ${doctor.location}
      </p>
      <p class="doctor-hospital">${doctor.hospital}</p>
      <div class="doctor-languages">
        <strong>Languages:</strong> ${doctor.languages.join(', ')}
      </div>
      <div class="doctor-contact">
        <a href="tel:${doctor.phone}" class="contact-phone">${doctor.phone}</a>
        <a href="mailto:${doctor.email}" class="contact-email">Contact</a>
      </div>
      <button class="book-appointment-btn" data-doctor-id="${doctor.id}" data-appointment-url="${doctor.bookAppointmentUrl || ''}">
        Book Appointment
      </button>
  
    </div>
  `;
  
  card.innerHTML = cardContent;
  return card;
}

function filterDoctors(doctors, filters) {
  return doctors.filter(doctor => {
    // Provider name search
    if (filters.nameSearch && filters.nameSearch.length >= 2) {
      const nameMatch = doctor.name.toLowerCase().includes(filters.nameSearch.toLowerCase());
      if (!nameMatch) return false;
    }
    
    // Specialty filter
    if (filters.specialty && filters.specialty !== '') {
      const specialtyMatch = doctor.specialty.toLowerCase() === filters.specialty.toLowerCase();
      if (!specialtyMatch) return false;
    }
    
    // Location filter
    if (filters.location && filters.location.length >= 2) {
      const locationMatch = doctor.location.toLowerCase().includes(filters.location.toLowerCase()) ||
                           doctor.zipCode.includes(filters.location);
      if (!locationMatch) return false;
    }
    
    return true;
  });
}

function renderResults(doctors, container) {
  container.innerHTML = '';
  
  if (doctors.length === 0) {
    const noResults = createElement('div', 'no-results');
    noResults.innerHTML = `
      <svg width="64" height="64" viewBox="0 0 24 24" fill="currentColor">
        <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
      </svg>
      <h3>No doctors found</h3>
      <p>Try adjusting your search criteria or location.</p>
    `;
    container.appendChild(noResults);
    return;
  }
  
  doctors.forEach(doctor => {
    const card = createDoctorCard(doctor);
    container.appendChild(card);
  });
}

function getCurrentLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by this browser.'));
      return;
    }
    
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        });
      },
      (error) => {
        reject(error);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 300000
      }
    );
  });
}

async function fetchDoctorData(config) {
  try {
    const { dataSourceType, contentFragmentFolder, apiUrl } = config;
    
    console.log('=== FETCH DOCTOR DATA DEBUG ===');
    console.log('Data source type:', dataSourceType);
    console.log('Content Fragment folder:', contentFragmentFolder);
    console.log('API URL:', apiUrl);
    console.log('Full config:', config);
    
    switch (dataSourceType) {
      case 'content-fragments':
        if (contentFragmentFolder) {
          console.log('Attempting to fetch from Content Fragment folder:', contentFragmentFolder);
          return await fetchFromContentFragmentFolder(contentFragmentFolder);
        } else {
          console.warn('Content Fragment folder not provided, falling back to sample data');
        }
        break;
        
      case 'api':
        if (apiUrl) {
          console.log('Attempting to fetch from API:', apiUrl);
          return await fetchFromAPI(apiUrl);
        } else {
          console.warn('API URL not provided, falling back to empty array');
        }
        break;
        
      default:
        console.warn('Unknown data source type:', dataSourceType, 'falling back to empty array');
        break;
    }
    
    console.log('No valid data source configured, returning empty array');
    return []; // Return empty array since static JSON support was removed
  } catch (error) {
    console.error('Error fetching doctor data:', error);
    console.log('Falling back to empty array due to error');
    return []; // Return empty array since static JSON support was removed
  }
}

async function fetchFromDAMJson(damPath) {
  try {
    // Convert DAM path to accessible URL
    let jsonUrl;
    if (damPath.startsWith('/content/dam/')) {
      // Remove .json extension if already present, then add it
      const cleanPath = damPath.replace(/\.json$/, '');
      jsonUrl = cleanPath + '.json';
    } else {
      jsonUrl = damPath;
    }
    
    console.log('Attempting to fetch DAM JSON from:', jsonUrl);
    const response = await fetch(jsonUrl);
    if (!response.ok) {
      console.warn(`Failed to fetch DAM JSON from ${jsonUrl}: ${response.status} ${response.statusText}`);
      throw new Error(`Failed to fetch DAM JSON: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    console.log('Successfully fetched DAM JSON data:', data);
    return Array.isArray(data) ? data : data.doctors || [];
  } catch (error) {
    console.error('Error fetching from DAM JSON:', error);
    throw error;
  }
}

async function fetchFromContentFragments(cfPath) {
  try {
    // Fetch Content Fragment data
    const cfUrl = cfPath.endsWith('.json') ? cfPath : cfPath + '.json';
    const response = await fetch(cfUrl);
    if (!response.ok) throw new Error('Failed to fetch Content Fragment');
    
    const data = await response.json();
    
    // Transform Content Fragment data to doctor format
    if (data[':type'] === 'weHealthcare/doctor') {
      return [transformContentFragmentToDoctor(data)];
    } else if (Array.isArray(data)) {
      return data.map(item => transformContentFragmentToDoctor(item));
    } else if (data.doctors && Array.isArray(data.doctors)) {
      return data.doctors.map(item => transformContentFragmentToDoctor(item));
    }
    
    return [];
  } catch (error) {
    console.error('Error fetching from Content Fragments:', error);
    throw error;
  }
}

async function fetchFromContentFragmentFolder(folderPath) {
  try {
    console.log('Fetching doctors via GraphQL from folder:', folderPath);

    // Decode URL-encoded path to convert %2F back to /
    const decodedFolderPath = decodeURIComponent(folderPath);
    console.log('Decoded folder path:', decodedFolderPath);

    const hostnameFromPlaceholders = await getHostname();
    const hostname = hostnameFromPlaceholders ? hostnameFromPlaceholders : getMetadata('hostname');
    const aemauthorurl = getMetadata('authorurl') || '';
    const aempublishurl = hostname?.replace('author', 'publish')?.replace(/\/$/, '') || '';

    const isAuthor = isAuthorEnvironment();

    const requestConfig = isAuthor
      ? {
          url: `${aemauthorurl}${GRAPHQL_DOCTORS_BY_FOLDER_QUERY};path=${decodedFolderPath};ts=${Date.now()}`,
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        }
      : {
          url: `${CONFIG.WRAPPER_SERVICE_URL}`,
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            graphQLPath: `${aempublishurl}${GRAPHQL_DOCTORS_BY_FOLDER_QUERY}`,
            cfPath: decodedFolderPath,
            variation: `main;ts=${Date.now()}`
          })
        };

    const response = await fetch(requestConfig.url, {
      method: requestConfig.method,
      headers: requestConfig.headers,
      ...(requestConfig.body && { body: requestConfig.body })
    });

    if (!response.ok) {
      console.error(`error making doctors graphql request:${response.status}`, { folderPath, isAuthor });
      throw new Error(`Failed GraphQL folder query: ${response.status}`);
    }

    let payload;
    try {
      payload = await response.json();
    } catch (parseError) {
      console.error('Error parsing GraphQL JSON:', { folderPath, isAuthor });
      throw parseError;
    }

    const items = payload?.data?.doctorProfile_healthcare_List?.items || [];
    console.log('GraphQL items received:', items?.length || 0);

    const doctors = items.map((item) => transformGraphQLDoctorItem(item, isAuthor));
    console.log('Total doctors loaded from GraphQL folder:', doctors.length);
    return doctors;
    
  } catch (error) {
    console.error('Error fetching from Content Fragment folder:', error);
    throw error;
  }
}

function toTitleCase(text) {
  if (!text) return '';
  return text.replace(/[-_]/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}

function extractTagLabel(tagId) {
  // Example: "healthcare:department/cardiology" -> "Cardiology"
  if (!tagId || typeof tagId !== 'string') return '';
  const last = tagId.split('/').pop();
  return toTitleCase(last);
}

function transformGraphQLDoctorItem(item, isAuthorEnv) {
  const imageUrl = item?.image?.[isAuthorEnv ? '_authorUrl' : '_publishUrl'] || item?.image?._dynamicUrl || '';
  const specialty = Array.isArray(item?.speciality) && item.speciality.length > 0
    ? extractTagLabel(item.speciality[0])
    : '';
  const languages = Array.isArray(item?.languages)
    ? item.languages.map(extractTagLabel)
    : [];

  return {
    id: item?._path || Math.random().toString(36).slice(2),
    name: item?.name || 'Dr. Unknown',
    specialty: specialty || 'General Medicine',
    location: item?.location || 'Location not specified',
    zipCode: item?.zipcode || '',
    phone: item?.phone || '',
    email: item?.email || '',
    image: imageUrl || '/images/doctors/default-doctor.jpg',
    rating: typeof item?.rating === 'number' ? item.rating : 4.5,
    experience: typeof item?.experience === 'number' ? `${item.experience} years` : (item?.experience || '5 years'),
    languages: languages.length ? languages : ['English'],
    acceptingNewPatients: !!item?.acceptingNewPatients,
    hospital: item?.hospital || 'Medical Center',
    latitude: 0,
    longitude: 0,
    bookAppointmentUrl: item?.bookAppointmentUrl || item?.appointmentUrl || item?.bookingUrl || item?.bookUrl || ''
  };
}

function transformAPIDataToDoctor(apiData) {
  // Transform API data to match our doctor structure
  return {
    id: apiData.id || apiData.doctorId || Math.random().toString(36).substr(2, 9),
    name: apiData.name || apiData.doctorName || apiData.fullName || 'Dr. Unknown',
    specialty: apiData.specialty || apiData.medicalSpecialty || apiData.speciality || 'General Medicine',
    location: apiData.location || apiData.practiceLocation || apiData.address || 'Location not specified',
    zipCode: apiData.zipCode || apiData.postalCode || apiData.zip || '',
    phone: apiData.phone || apiData.phoneNumber || apiData.contactNumber || '',
    email: apiData.email || apiData.emailAddress || apiData.contactEmail || '',
    image: apiData.image || apiData.profileImage || apiData.photo || apiData.avatar || '/images/doctors/default-doctor.jpg',
    rating: parseFloat(apiData.rating || apiData.starRating || apiData.score || 4.5),
    experience: apiData.experience || apiData.yearsExperience || apiData.experienceYears || '5 years',
    languages: Array.isArray(apiData.languages) ? apiData.languages : 
               (apiData.languages ? apiData.languages.split(',').map(lang => lang.trim()) : ['English']),
    acceptingNewPatients: apiData.acceptingNewPatients === true || apiData.acceptingNewPatients === 'true' || apiData.acceptingPatients === true,
    hospital: apiData.hospital || apiData.affiliatedHospital || apiData.practiceName || apiData.clinic || 'Medical Center',
    latitude: parseFloat(apiData.latitude || apiData.lat || 0),
    longitude: parseFloat(apiData.longitude || apiData.lng || apiData.lon || 0),
    bookAppointmentUrl: apiData.bookAppointmentUrl || apiData.appointmentUrl || apiData.bookingUrl || apiData.bookUrl || apiData.scheduleUrl || ''
  };
}

async function fetchFromAPI(apiUrl) {
  try {
    const response = await fetch(apiUrl);
    if (!response.ok) throw new Error('Failed to fetch from API');
    const data = await response.json();
    const rawData = Array.isArray(data) ? data : data.doctors || [];
    
    // Transform API data to match our doctor structure
    return rawData.map(item => transformAPIDataToDoctor(item));
  } catch (error) {
    console.error('Error fetching from API:', error);
    throw error;
  }
}

async function fetchFromStaticJson(staticPath) {
  try {
    const response = await fetch(staticPath);
    if (!response.ok) throw new Error('Failed to fetch static JSON');
    const data = await response.json();
    return Array.isArray(data) ? data : data.doctors || [];
  } catch (error) {
    console.error('Error fetching static JSON:', error);
    throw error;
  }
}

function transformContentFragmentToDoctor(cfData) {
  // Transform Content Fragment data to match our doctor structure
  return {
    id: cfData.id || cfData[':path'] || Math.random().toString(36).substr(2, 9),
    name: cfData.doctorName || cfData.name || 'Dr. Unknown',
    specialty: cfData.specialty || cfData.medicalSpecialty || 'General Medicine',
    location: cfData.location || cfData.practiceLocation || 'Location not specified',
    zipCode: cfData.zipCode || cfData.postalCode || '',
    phone: cfData.phone || cfData.phoneNumber || '',
    email: cfData.email || cfData.emailAddress || '',
    image: cfData.image || cfData.profileImage || cfData.imageRef || '/images/doctors/default-doctor.jpg',
    rating: parseFloat(cfData.rating || cfData.ratingScore || 4.5),
    experience: cfData.experience || cfData.yearsExperience || '5 years',
    languages: Array.isArray(cfData.languages) ? cfData.languages : 
               (cfData.languages ? cfData.languages.split(',').map(l => l.trim()) : ['English']),
    acceptingNewPatients: cfData.acceptingNewPatients === 'true' || cfData.acceptingNewPatients === true,
    hospital: cfData.hospital || cfData.affiliatedHospital || cfData.practiceName || 'Medical Center',
    latitude: parseFloat(cfData.latitude || 0),
    longitude: parseFloat(cfData.longitude || 0),
    bookAppointmentUrl: cfData.bookAppointmentUrl || cfData.appointmentUrl || cfData.bookingUrl || cfData.bookUrl || ''
  };
}

function getDataSourceInfo(config) {
  const { dataSourceType, contentFragmentFolder, apiUrl } = config;
  
  switch (dataSourceType) {
    case 'content-fragments':
      return contentFragmentFolder ? `Content Fragment Folder (${contentFragmentFolder})` : 'Content Fragments (not configured)';
    case 'api':
      return apiUrl ? `External API (${apiUrl})` : 'External API (not configured)';
    default:
      return 'Unknown data source';
  }
}

function createSearchForm(config, doctors = []) {
  const form = createElement('form', 'find-doctor-form');
  
  const searchRow = createElement('div', 'search-row');
  
  // Provider name search
  if (config.enableProviderNameSearch !== false) {
    const nameGroup = createElement('div', 'search-group');
    const nameLabel = createElement('label', '', 'Search by Provider Name');
    const nameInput = createSearchInput('Enter doctor\'s name...', 'provider-name-search');
    nameGroup.appendChild(nameLabel);
    nameGroup.appendChild(nameInput);
    searchRow.appendChild(nameGroup);
  }
  
  // Specialty filter
  if (config.enableSpecialtyFilter !== false) {
    const specialtyGroup = createElement('div', 'search-group');
    const specialtyLabel = createElement('label', '', 'Specialty');
    // Get dynamic specialties from doctor data
    const dynamicSpecialties = getUniqueSpecialties(doctors);
    const specialtySelect = createSelect(dynamicSpecialties, 'All Specialties', 'specialty-filter');
    specialtyGroup.appendChild(specialtyLabel);
    specialtyGroup.appendChild(specialtySelect);
    searchRow.appendChild(specialtyGroup);
  }
  
  // Location search
  if (config.enableLocationSearch !== false) {
    const locationGroup = createElement('div', 'search-group');
    const locationLabel = createElement('label', '', 'Location');
    const subLocation = createElement('div', 'sub-location');
    const locationInput = createSearchInput('City, State, or ZIP code...', 'location-search');
    const locationButton = createElement('button', 'location-button', '📍');
    locationButton.title = 'my location';
    locationButton.setAttribute('aria-label', 'my location');
    locationButton.type = 'button';
    locationGroup.appendChild(locationLabel);
    subLocation.appendChild(locationInput);
    subLocation.appendChild(locationButton);
    locationGroup.appendChild(subLocation);
    searchRow.appendChild(locationGroup);
  }
  
  form.appendChild(searchRow);
  return form;
}

export default async function decorate(block) {
  // Debug log with timestamp to track re-decoration
  const timestamp = new Date().toLocaleTimeString();
  console.log(`🏥 Find-a-doctor block decorating at ${timestamp}`);
  console.log('Block data-aue-resource:', block.getAttribute('data-aue-resource'));
  
  // Debug: Log all div contents to see what we're reading
  console.log('=== CONFIG DEBUG ===');
  for (let i = 1; i <= 11; i++) {
    const div = block.querySelector(`:scope div:nth-child(${i}) > div`);
    console.log(`Position ${i}:`, div?.textContent?.trim() || 'empty');
  }
  
  // Read configuration using key-based approach (works with Universal Editor)
  let title = 'Find a Doctor';
  let subtitle = 'Search for healthcare providers in your area';
  let layout = 'default';
  let dataSourceType = 'content-fragments';
  let contentFragmentFolder = '';
  let apiUrl = '';
  let enableLocationSearch = true;
  let enableSpecialtyFilter = true;
  let enableProviderNameSearch = true;
  let enableSubmitAction = true;
  let submitUrl = '';
  
  // Parse config from block structure (key-value pairs)
  const rows = Array.from(block.querySelectorAll(':scope > div'));
  rows.forEach((row) => {
    const cells = row.querySelectorAll(':scope > div');
    if (cells.length < 2) return;
    
    const key = cells[0].textContent?.trim()?.toLowerCase();
    const valueCell = cells[1];
    const link = valueCell.querySelector('a');
    const value = (link?.getAttribute('title') || link?.textContent || valueCell.textContent || '').trim();
    
    if (!key || !value) return;
    
    console.log(`Reading config: "${key}" = "${value}"`);
    
            switch (key) {
              case 'title': title = value; break;
              case 'subtitle': subtitle = value; break;
              case 'layout': layout = value; break;
              case 'layout style': layout = value; break;
              case 'data source type': 
              case 'datasourcetype': dataSourceType = value; break;
              case 'content fragment folder':
              case 'contentfragmentfolder': contentFragmentFolder = value; break;
              case 'api url':
              case 'apiurl': apiUrl = value; break;
              case 'enable location search':
              case 'enablelocationsearch': enableLocationSearch = value !== 'false'; break;
              case 'enable specialty filter':
              case 'enablespecialtyfilter': enableSpecialtyFilter = value !== 'false'; break;
              case 'enable provider name search':
              case 'enableprovidernamesearch': enableProviderNameSearch = value !== 'false'; break;
              case 'enable submit action':
              case 'enablesubmitaction': enableSubmitAction = value !== 'false'; break;
              case 'submit url':
              case 'submiturl': submitUrl = value; break;
            }
  });

  // Hide config rows but keep them in DOM (like cards block)
  const configRows = Array.from(block.children);
  configRows.forEach((row) => {
    row.style.display = 'none';
  });

  // Set layout class
  block.className = `find-doctor ${layout}`;
  
  // Create config object for compatibility
  const config = {
    title,
    subtitle,
    layout,
    dataSourceType,
    contentFragmentFolder,
    apiUrl,
    enableLocationSearch,
    enableSpecialtyFilter,
    enableProviderNameSearch,
    enableSubmitAction,
    submitUrl
  };
  
  console.log('=== FINAL CONFIG VALUES ===');
  console.log('Title:', title);
  console.log('Subtitle:', subtitle);
  console.log('Layout:', layout);
  console.log('Data Source Type:', dataSourceType);
  console.log('Content Fragment Folder:', contentFragmentFolder);
  console.log('API URL:', apiUrl);
    
  // --- Build UI ---
  const header = createElement('div', 'find-doctor-header');
  const dataSourceInfo = getDataSourceInfo(config);
  
  console.log('=== HEADER CREATION DEBUG ===');
  console.log('Creating header with title:', title);
  console.log('Creating header with subtitle:', subtitle);
  console.log('Data source info:', dataSourceInfo);
  
  header.innerHTML = `
    <h2 class="find-doctor-title">${title}</h2>
    <p class="find-doctor-subtitle">${subtitle}</p>
    <div class="data-source-info">
      <small>Data Source: ${dataSourceInfo}</small>
    </div>
  `;
  block.appendChild(header);
  
  console.log('Header HTML created:', header.innerHTML);
  
  const resultsContainer = createElement('div', 'doctor-results');
    resultsContainer.innerHTML = '<div class="loading-state">Loading doctors...</div>';
  block.appendChild(resultsContainer);
  
    // Load data
  let doctors = await fetchDoctorData(config);
  
    // Build search form
  const searchForm = createSearchForm(config, doctors);
  block.insertBefore(searchForm, resultsContainer);
  
    // Add loading styles (only if not already added)
    if (!document.querySelector('#find-doctor-loading-styles')) {
  const loadingStyle = document.createElement('style');
      loadingStyle.id = 'find-doctor-loading-styles';
  loadingStyle.textContent = `
    .loading-state {
      text-align: center;
      padding: 2rem;
      color: var(--text-color-secondary, #666);
      font-size: 1.1rem;
    }
    .error-state {
      text-align: center;
      padding: 2rem;
      color: var(--error-color, #dc3545);
      background: var(--error-background, #f8d7da);
      border: 1px solid var(--error-border, #f5c6cb);
      border-radius: 8px;
      margin: 1rem 0;
    }
  `;
  document.head.appendChild(loadingStyle);
    }

    // Hook up filters + listeners
    const filters = { nameSearch: '', specialty: '', location: '' };
  const performSearch = debounce(() => {
    const filteredDoctors = filterDoctors(doctors, filters);
    renderResults(filteredDoctors, resultsContainer);
  }, 300);
  
    const nameInput = block.querySelector('.provider-name-search');
  if (nameInput) {
    nameInput.addEventListener('input', (e) => {
      filters.nameSearch = e.target.value;
      performSearch();
    });
  }
  
    const specialtySelect = block.querySelector('.specialty-filter');
  if (specialtySelect) {
    specialtySelect.addEventListener('change', (e) => {
      filters.specialty = e.target.value;
      performSearch();
    });
  }
  
    const locationInput = block.querySelector('.location-search');
  if (locationInput) {
    locationInput.addEventListener('input', (e) => {
      filters.location = e.target.value;
      performSearch();
    });
  }
  
  // Location button functionality
    const locationButton = block.querySelector('.location-button');
  if (locationButton) {
    locationButton.addEventListener('click', async () => {
      try {
        locationButton.textContent = '📍';
        locationButton.disabled = true;
        
        const position = await getCurrentLocation();
        
        // In a real implementation, you would reverse geocode the coordinates
        // For now, we'll just show a success message
        locationInput.value = 'Current location detected';
        filters.location = 'Current location detected';
        performSearch();
        
        locationButton.textContent = '📍';
        setTimeout(() => {
          locationButton.textContent = '📍';
          locationButton.disabled = false;
        }, 2000);
        
      } catch (error) {
        console.error('Error getting location:', error);
        locationButton.textContent = '📍';
        setTimeout(() => {
          locationButton.textContent = '📍';
          locationButton.disabled = false;
        }, 2000);
      }
    });
  }
  
  // Book appointment functionality
  block.addEventListener('click', (e) => {
    if (e.target.classList.contains('book-appointment-btn')) {
      const doctorId = e.target.dataset.doctorId;
      const appointmentUrl = e.target.dataset.appointmentUrl;
      const doctor = doctors.find(d => d.id === doctorId);
      
      if (doctor) {
        if (config.enableSubmitAction && config.submitUrl && config.submitUrl.trim()) {
          // Redirect to the configured submit URL
          window.location.href = config.submitUrl;
        } else if (appointmentUrl && appointmentUrl.trim()) {
          // Open the appointment URL in a new tab
          window.open(appointmentUrl, '_blank');
        } else {
          // Fallback: show contact information in a modal if no URL is provided
          showAppointmentPopup(doctor);
        }
      }
    }
  });
  
  // Initial render
  renderResults(doctors, resultsContainer);
  
  console.log(`✅ Find-a-doctor block decoration completed at ${timestamp}`);
  
  // Add Universal Editor auto-reload support
  const blockResource = block.getAttribute('data-aue-resource');
  if (blockResource) {
    const handleUEEvent = (event) => {
      const eventResource = event.detail?.request?.target?.resource;
      if (eventResource === blockResource) {
        console.log('🔄 Find-a-doctor config change detected, will reload in 1 second...');
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      }
    };
    
    // Listen for Universal Editor events (only add listener once)
    if (!block._ueListenerAdded) {
      document.querySelector('main')?.addEventListener('aue:content-patch', handleUEEvent);
      document.querySelector('main')?.addEventListener('aue:content-update', handleUEEvent);
      block._ueListenerAdded = true;
    }
  }
}
