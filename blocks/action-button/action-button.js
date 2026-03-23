import { div, a, span } from '../../scripts/dom-helpers.js';

export default function decorate(block) {
  const children = [...block.children];
  
  const linkDiv = children[0];
  const linkElement = linkDiv?.querySelector('a');
  const buttonLink = linkElement?.href || '#';
  
  const labelDiv = children[1];
  const labelElement = labelDiv?.querySelector('p');
  const buttonLabel = labelElement?.textContent?.trim() || 'Button';
  
  const titleDiv = children[2];
  const titleElement = titleDiv?.querySelector('p');
  const buttonTitle = titleElement?.textContent?.trim() || '';
  
  const styleDiv = children[3];
  const styleElement = styleDiv?.querySelector('p');
  const buttonStyle = styleElement?.textContent?.trim() || 'default-button';
  
  const buttonElement = div({ class: `button-container ${buttonStyle}` },
    a({ 
      href: buttonLink, 
      class: 'button',
      title: buttonTitle || buttonLabel
    },
      span({ class: 'button-text' }, buttonLabel)
    )
  );

  /* Hide config rows (index >= 4) on published/live, same as hero (index >= 7) and cards (.cards-config) */
  [...block.children].forEach((row, index) => {
    if (index >= 4) row.style.display = 'none';
  });

  /* Replace first 4 rows with the rendered button */
  for (let i = 0; i < 4 && block.firstChild; i++) block.removeChild(block.firstChild);
  block.insertBefore(buttonElement, block.firstChild);
}
