import { readBlockConfig } from '../../scripts/aem.js';

/**
 * @param {Element} block
 */
export default function decorate(block) {
  const config = readBlockConfig(block) || {};

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

  /* Text color: from config, data-aue-prop, or a[href="#..."] (UE may store color in link field) */
  let textColorRaw = (config.color ?? block.querySelector('[data-aue-prop="color"]')?.textContent?.trim() ?? '')?.toString?.()?.trim() ?? '';
  if (!textColorRaw) {
    const hexLink = block.querySelector('a[href^="#"]');
    const href = hexLink?.getAttribute('href')?.trim() || '';
    if (href && isHexColor(href)) textColorRaw = href.replace(/^#/, '');
  }
  if (textColorRaw && isHexColor(textColorRaw)) {
    block.style.setProperty('--text-block-text-color', toHex(textColorRaw));
    block.classList.add('text--custom-text-color');
  }
}
