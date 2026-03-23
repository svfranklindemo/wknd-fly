/*
import { patternDecorate } from '../../scripts/blockTemplate.js';

export default async function decorate(block) {
  patternDecorate(block);
}
*/

import { createOptimizedPicture } from '../../scripts/aem.js';
import { moveInstrumentation } from '../../scripts/scripts.js';
import { getSiteName, PATH_PREFIX } from '../../scripts/utils.js';
import { isAuthorEnvironment } from '../../scripts/scripts.js';

export default function decorate(block) {
  const ul = document.createElement('ul');
  [...block.children].forEach((row) => {
    const li = document.createElement('li');
    
    // Read card style from the third div (index 2)
    const styleDiv = row.children[2];
    const styleParagraph = styleDiv?.querySelector('p');
    const cardStyle = styleParagraph?.textContent?.trim() || 'default';
    if (cardStyle && cardStyle !== 'default') {
      li.className = cardStyle;
    }

    // Read CTA style by attribute so it works regardless of column order (AEM authoring)
    const ctaStyleEl = row.querySelector('p[data-aue-prop="ctastyle"]') || row.querySelector('[data-aue-prop="ctastyle"]');
    const ctaStyle = ctaStyleEl?.textContent?.trim() || 'default';
    
    // Read image style by attribute so it works regardless of column order (AEM authoring)
    const imageStyleParagraph = row.querySelector('p[data-aue-prop="imagestyle"]') || row.querySelector('[data-aue-prop="imagestyle"]');
    const imageStyle = imageStyleParagraph?.textContent?.trim() || '';

    const getCell = (idx) => (row.children[idx]?.querySelector?.('p')?.textContent?.trim()
      || row.children[idx]?.textContent?.trim() || '').toString();

    /** True if string looks like a hex color (#xxx, #xxxxxx, or 3/6 hex chars). */
    const isHexColor = (s) => {
      const t = String(s).trim();
      if (!t) return false;
      if (t.startsWith('#')) return /^#[0-9a-fA-F]{3}$|^#[0-9a-fA-F]{6}$/.test(t);
      return /^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(t);
    };
    const toHex = (s) => {
      const t = String(s).trim();
      if (t.startsWith('#')) return t;
      return /^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(t) ? `#${t}` : t;
    };

    // Background color: from data-aue-prop, or from any cell/link that contains only a hex value (UE may store it in link or button field)
    let bgColorRaw = (row.querySelector('p[data-aue-prop="backgroundcolor"]') || row.querySelector('[data-aue-prop="backgroundcolor"]'))?.textContent?.trim() || '';
    if (!bgColorRaw) {
      const hexLink = row.querySelector('a[href^="#"]');
      if (hexLink && isHexColor(hexLink.getAttribute('href') || '')) bgColorRaw = (hexLink.getAttribute('href') || '').replace(/^#/, '');
      if (!bgColorRaw && isHexColor(getCell(8))) bgColorRaw = getCell(8).trim();
      if (!bgColorRaw && isHexColor(getCell(5))) bgColorRaw = getCell(5).trim().replace(/^#/, '');
    }
    if (bgColorRaw) {
      li.style.backgroundColor = toHex(bgColorRaw);
      li.classList.add('cards-card--custom-bg');
    }

    const link = getCell(5);
    const selectable = getCell(6);
    const alignment = (getCell(7) || 'left').toLowerCase();
    let buttonEventType = getCell(8);
    const buttonWebhookUrl = getCell(9);
    const buttonFormId = getCell(10);
    const buttonData = getCell(11);
    const customStyles = getCell(12);

    if (customStyles && String(customStyles).trim()) {
      li.classList.add(String(customStyles).trim());
    }

    li.classList.add(`cards-card--alignment-${alignment}`);
    if (selectable.toLowerCase() === 'true') li.classList.add('cards-card--selectable');
    if (link && !isHexColor(link)) {
      li.dataset.sectionLink = link;
      li.addEventListener('click', async () => {
        const siteName = await getSiteName();
        const isAuthor = isAuthorEnvironment();
        const defaultPath = `/content/${siteName}${PATH_PREFIX}`;
        const sectionLink = link.replaceAll(defaultPath, '');
        if(isAuthor){
          window.location.href = link + '.html';
        } else {
          window.location.href = sectionLink;
        }
      });
    }


    moveInstrumentation(row, li);
    while (row.firstElementChild) li.append(row.firstElementChild);
    
    // Process the li children to identify and style them correctly
    let imageContainerDiv = null;
    [...li.children].forEach((div, index) => {
      // First div (index 0) - Image
      if (index === 0) {
        div.className = 'cards-card-image';
        imageContainerDiv = div; // Store reference for later
      }
      // Second div (index 1) - Content with button
      else if (index === 1) {
        div.className = 'cards-card-body';
      }
      // Indices 2-12 - Card link, selectable, alignment, button actions, custom styles
      else if (index >= 2 && index <= 12) {
        div.className = 'cards-config';
        const p = div.querySelector('p');
        if (p) p.style.display = 'none';
      }
      // Any other divs
      else {
        div.className = 'cards-card-body';
      }
    });
    
    // First, remove compact-style from ALL elements to prevent it from being on wrong elements
    li.querySelectorAll('*').forEach(el => {
      if (el.classList.contains('compact-style')) {
        el.classList.remove('compact-style');
      }
    });
    
    // Apply image style ONLY to the image container (Cover = default, no class needed)
    const imageStyleClass = (imageStyle || '').trim().toLowerCase();
    if (imageContainerDiv && imageStyleClass && imageStyleClass !== 'default') {
      imageContainerDiv.classList.add(imageStyleClass);
    }
    
    // Apply CTA styles to button containers
    const buttonContainers = li.querySelectorAll('p.button-container');
    buttonContainers.forEach(buttonContainer => {
      // Remove any existing CTA classes and ensure compact-style is NOT on button containers
      buttonContainer.classList.remove('default', 'cta-button', 'cta-button-secondary', 'cta-button-dark', 'cta-default', 'compact-style');
      // Add the correct CTA class
      buttonContainer.classList.add(ctaStyle);
    });

    const ctaLink = li.querySelector('p.button-container a, .button-container a');
    if (ctaLink) {
      if (ctaLink.dataset.buttonEventType && isHexColor(ctaLink.dataset.buttonEventType)) delete ctaLink.dataset.buttonEventType;
      if (buttonEventType && !isHexColor(buttonEventType)) ctaLink.dataset.buttonEventType = buttonEventType;
      if (buttonWebhookUrl) ctaLink.dataset.buttonWebhookUrl = buttonWebhookUrl;
      if (buttonFormId) ctaLink.dataset.buttonFormId = buttonFormId;
      if (buttonData) ctaLink.dataset.buttonData = buttonData;
    }

    // Final cleanup: ensure compact-style is ONLY on the image container
    if (imageStyle && imageStyle === 'compact-style') {
      li.querySelectorAll('*').forEach(el => {
        if (el !== imageContainerDiv && el.classList.contains('compact-style')) {
          el.classList.remove('compact-style');
        }
      });
      // Re-apply to image container if it was removed
      if (imageContainerDiv && !imageContainerDiv.classList.contains('compact-style')) {
        imageContainerDiv.classList.add('compact-style');
      }
    }
    
    ul.append(li);
  });
  ul.querySelectorAll('picture > img').forEach((img) => {
    const optimizedPic = createOptimizedPicture(img.src, img.alt, false, [{ width: '750' }]);
    moveInstrumentation(img, optimizedPic.querySelector('img'));
    img.closest('picture').replaceWith(optimizedPic);
  });
  
  // Final cleanup after image optimization: ensure compact-style is only on image containers
  ul.querySelectorAll('li').forEach((li) => {
    const imageContainer = li.querySelector('.cards-card-image');
    const buttonContainers = li.querySelectorAll('p.button-container');
    
    // Remove compact-style from button containers
    buttonContainers.forEach(buttonContainer => {
      if (buttonContainer.classList.contains('compact-style')) {
        buttonContainer.classList.remove('compact-style');
      }
    });
    
    // Ensure compact-style is on image container if it should be
    // Check if there's an image style config div with compact-style
    const imageStyleConfig = Array.from(li.querySelectorAll('.cards-config')).find(div => {
      const p = div.querySelector('p[data-aue-prop="imagestyle"]');
      return p && p.textContent.trim() === 'compact-style';
    });
    
    if (imageStyleConfig && imageContainer) {
      imageContainer.classList.add('compact-style');
    }
  });
 
  block.textContent = '';
  block.append(ul);
}
