import { getMetadata } from '../../scripts/aem.js';
import { loadFragment } from '../fragment/fragment.js';
import { isAuthorEnvironment } from '../../scripts/scripts.js';

import {
  getLanguage, getSiteName, TAG_ROOT, PATH_PREFIX, fetchLanguageNavigation,
} from '../../scripts/utils.js';

function fireAdobeFooterBeacon() {
  const pageName = getMetadata('pagename') || document.title || '';
  const pageUrl = window.location.href;

  if (!pageName || !pageUrl || window.__securFooterAdobeBeaconSent) {
    return;
  }

  window.__securFooterAdobeBeaconSent = true;

  const beacon = new Image();
  beacon.src = `https://ssharedservices.sc.omtrdc.net/b/ss/adbess-livedemosysprod/1/JS-2.27.0-LGPQ/s02884369101364?AQB=1&ndh=1&pf=1&t=24%2F2%2F2026%2014%3A4%3A36%202%20-330&mid=43862339102679297631836999049016014710&aamlh=12&ce=UTF-8&pageName=${encodeURIComponent(pageName)}&g=${encodeURIComponent(pageUrl)}&r=${encodeURIComponent(document.referrer || '')}&cc=USD&events=event1&aamb=RKhpRz8krg2tLO6pguXWp5olkAcUniQYPHaMWWgdJ3xzPWQmdj0y&c2=${encodeURIComponent(pageUrl)}&v3=livedemo&v8=livedemo%40adobe.com&v20=${encodeURIComponent(pageName)}&v21=Live%20Demos%20Website&v250=Live%20Demo%3A%20Page%20View&s=1728x1117&c=30&j=1.6&v=N&k=Y&bw=1728&bh=421&mcorgid=60306A9C56F40F607F000101%40AdobeOrg&AQE=1`;
}

/**
 * loads and decorates the footer
 * @param {Element} block The footer block element
 */
export default async function decorate(block) {
  const footerMeta = getMetadata('footer');
  const langCode = getLanguage();
  const siteName = await getSiteName();
  const isAuthor = isAuthorEnvironment();
  let footerPath =`/${langCode}/footer`;

  if(isAuthor){
    footerPath = footerMeta
    ? new URL(footerMeta, window.location).pathname
    : `/content/${siteName}${PATH_PREFIX}/${langCode}/footer`;
  }

  /*
  // load footer as fragment
  const footerMeta = getMetadata('footer');
  //const footerPath = footerMeta ? new URL(footerMeta, window.location).pathname : '/footer';
  const pathSegments = window.location.pathname.split('/').filter(Boolean);
  //console.log("pathSegments footer: ", pathSegments);
  const parentPath = pathSegments.length > 2 ? `/${pathSegments.slice(0, 3).join('/')}` : '/';
  //console.log("parentPath footer: ", parentPath);
  const footerPath = parentPath=='/' ? footerMeta ? new URL(footerMeta, window.location).pathname : '/footer' : footerMeta ? new URL(footerMeta, window.location).pathname : parentPath+'/footer';
  //console.log("footerPath footer: ", footerPath);
  */
  
  const fragment = await loadFragment(footerPath);

  // decorate footer DOM
  block.textContent = '';
  const footer = document.createElement('div');
  while (fragment.firstElementChild) footer.append(fragment.firstElementChild);

  block.append(footer);
  fireAdobeFooterBeacon();
}
