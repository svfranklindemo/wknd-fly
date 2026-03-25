// add delayed functionality here
import {
  getMetadata, loadScript, fetchPlaceholders,
  sampleRUM,
} from './aem.js';
import {
  a, span, i,
} from './dom-helpers.js';
import {
  isInternalPage,
} from './utils.js';

// Custom events for Launch (e.g. page-view)
import { initializeCustomEvents } from "./custom-events.js";

// Adobe Target - start

window.targetGlobalSettings = {
  bodyHidingEnabled: false,
};

function loadAT() {
  function targetPageParams() {
    return {
      "at_property": "549d426b-0bcc-be60-ce27-b9923bfcad4f"
    };
  }
    loadScript(window.hlx.codeBasePath+'/scripts/at-lsig.js');
  
}
// Adobe Target - end



// refactor tweetable links function
/**
 * Opens a popup for the Twitter links autoblock.
 */
function openPopUp(popUrl) {
  const popupParams = `height=450, width=550, top=${(window.innerHeight / 2 - 275)}`
   + `, left=${(window.innerWidth / 2 - 225)}`
   + ', toolbar=0, location=0, menubar=0, directories=0, scrollbars=0';
  window.open(popUrl, 'fbShareWindow', popupParams);
}

/**
 * Finds and embeds custom JS and css
 */
function embedCustomLibraries() {
  const externalLibs = getMetadata('js-files');
  const libsArray = externalLibs?.split(',').map((url) => url.trim()).filter(Boolean) || [];

  const maybeMarkLaunchReady = (url) => {
    const launchPattern = /(launch|satellite|reactor)/i;
    if (window._launchReady === true) return;
    if (window._satellite || launchPattern.test(url)) {
      window._launchReady = true;
      document.dispatchEvent(new CustomEvent('launchReady', { bubbles: true, detail: { src: url } }));
      console.debug('[Launch] Ready signal from external script:', url);
    }
  };

  libsArray.forEach((url, index) => {
    //console.log(`Loading script ${index + 1}: ${url}`);
    loadScript(`${url}`)
      .then(() => maybeMarkLaunchReady(url))
      .catch((error) => console.warn(`[Launch] Failed loading external script ${index + 1}:`, url, error));
  });
  
}

function watchLaunchReadiness(start = Date.now()) {
  if (window._launchReady === true) return;
  if (window._satellite) {
    window._launchReady = true;
    document.dispatchEvent(new CustomEvent('launchReady', { bubbles: true, detail: { src: 'head-launch-script' } }));
    console.debug('[Launch] Ready detected from _satellite');
    return;
  }
  if (Date.now() - start > 60000) return;
  setTimeout(() => watchLaunchReadiness(start), 100);
}

/**
 * Finds and decorates anchor elements with Twitter hrefs
 */
function buildTwitterLinks() {
  const main = document.querySelector('main');
  if (!main) return;

  // get all paragraph elements
  const paras = main.querySelectorAll('p');
  const url = window.location.href;
  const encodedUrl = encodeURIComponent(url);

  [...paras].forEach((paragraph) => {
    const tweetables = paragraph.innerHTML.match(/&lt;tweetable[^>]*&gt;([\s\S]*?)&lt;\/tweetable&gt;/g);
    if (tweetables) {
      tweetables.forEach((tweetableTag) => {
        const matchedContent = tweetableTag.match(
          /&lt;tweetable(?:[^>]*data-channel=['"]([^'"]*)['"])?(?:[^>]*data-hashtag=['"]([^'"]*)['"])?[^>]*&gt;([\s\S]*?)&lt;\/tweetable&gt;/,
        );
        const channel = matchedContent[1] || '';
        const hashtag = matchedContent[2] || '';
        const tweetContent = matchedContent[3];

        let modalURL = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetContent)}`
          + `&original_referrer=${encodedUrl}&source=tweetbutton`;
        if (channel) modalURL += `&via=${encodeURIComponent(channel.charAt(0) === '@' ? channel.substring(1) : channel)}`;
        if (hashtag) modalURL += `&hashtags=${encodeURIComponent(hashtag)}`;

        const tweetableEl = span(
          { class: 'tweetable' },
          a({ href: modalURL, target: '_blank', tabindex: 0 }, tweetContent, i({ class: 'lp lp-twit' })),
        );
        paragraph.innerHTML = paragraph.innerHTML.replace(tweetableTag, tweetableEl.outerHTML);
      });
    }
    [...paragraph.querySelectorAll('.tweetable > a')].forEach((twitterAnchor) => {
      twitterAnchor.addEventListener('click', (event) => {
        event.preventDefault();
        const apiURL = twitterAnchor.href;
        openPopUp(apiURL);
      });
    });
  });
}

if (!window.location.hostname.includes('localhost')) {
  
  embedCustomLibraries();
  watchLaunchReadiness();
  if (window.parent && !(window.parent.location.pathname.indexOf('/canvas/') > -1)) {
    loadAT();
  }
}
