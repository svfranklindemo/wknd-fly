// eslint-disable-next-line import/no-unresolved
import { moveInstrumentation } from '../../scripts/scripts.js';

// keep track globally of the number of tab blocks on the page
let tabBlockCnt = 0;

export default async function decorate(block) {
  // Get the tabs style from data-aue-prop
  const tabsStyleParagraph = block.querySelector('p[data-aue-prop="tabsstyle"]');
  const tabsStyle = tabsStyleParagraph?.textContent?.trim() || '';
  
  // Add the style class to block
  if (tabsStyle && tabsStyle !== 'default' && tabsStyle !== '') {
    block.classList.add(tabsStyle);
  }
  
  // Fallback for Live where style may be a plain <p> row like "card-style-tab"
  if (!block.classList.contains('card-style-tab')) {
    const knownStyles = new Set(['card-style-tab']);
    const styleContainerFallback = [...block.children].find((child) => (
      [...child.querySelectorAll('p')].some((p) => knownStyles.has(p.textContent?.trim()))
    ));
    if (styleContainerFallback) {
      const detected = [...styleContainerFallback.querySelectorAll('p')]
        .map((p) => p.textContent?.trim())
        .find((txt) => knownStyles.has(txt));
      if (detected) {
        block.classList.add(detected);
        styleContainerFallback.remove();
      }
    }
  }
  
  // Proactively remove any style-config node so it doesn't become a tab (UE/Live)
  const styleNodes = block.querySelectorAll('p[data-aue-prop="tabsstyle"]');
  styleNodes.forEach((node) => {
    // find the nearest direct child of the block that contains this node
    let container = node;
    while (container && container.parentElement !== block) {
      container = container.parentElement;
    }
    if (container && container.parentElement === block) {
      container.remove();
    } else {
      node.remove();
    }
  });

  // Remove any stray top-level title nodes that UE may render under Tabs root
  [...block.children]
    .filter((child) => child.matches && child.matches('p[data-aue-prop="title"]'))
    .forEach((titleNode) => titleNode.remove());

  // Check if card-style-tab variant is requested
  const cardStyleVariant = block.classList.contains('card-style-tab');
  
  // build tablist
  const tablist = document.createElement('div');
  tablist.className = 'tabs-list';
  tablist.setAttribute('role', 'tablist');
  tablist.id = `tablist-${tabBlockCnt += 1}`;

  // the first cell of each row is the title of the tab
  // Build tab items, skipping children without a valid title
  const tabItems = [];
  [...block.children].forEach((child) => {
    if (!child || !child.firstElementChild) return;
    // ignore any container that is just the style selector (already removed earlier)
    if (child.querySelector && child.querySelector('p[data-aue-prop="tabsstyle"]')) return;
    const heading = child.firstElementChild;
    const explicitTitle = child.querySelector && child.querySelector('p[data-aue-prop="title"]');
    const labelText = (explicitTitle?.textContent || heading?.textContent || '').trim();
    if (!labelText) return; // skip items with empty labels to avoid blank tabs
    tabItems.push({ tabpanel: child, heading });
  });

  // Hide any other stray authoring nodes at the root level that are not tab items
  const allowedChildren = new Set(tabItems.map((i) => i.tabpanel));
  [...block.children].forEach((child) => {
    if (!allowedChildren.has(child)) {
      // Hide rather than remove to avoid interfering with UE selection
      child.style.display = 'none';
    }
  });

  tabItems.forEach((item, i) => {
    const id = `tabpanel-${tabBlockCnt}-tab-${i + 1}`;
    const { tabpanel, heading: tab } = item;
    
    // Prefer explicit title field from authoring if available
    const titleEl = tabpanel.querySelector('p[data-aue-prop="title"]');
    // Store title/heading content before any DOM manipulation
    const headingContent = (titleEl ? titleEl.innerHTML : tab.innerHTML);
    
    // For card-style-tab variant, reorganize content first
    if (cardStyleVariant) {
      // Create wrapper for content (always)
      const contentWrapper = document.createElement('div');
      contentWrapper.className = 'tabs-panel-content';

      // Optional image wrapper if a picture is present
      const picture = tabpanel.querySelector('picture');
      let imageWrapper = null;
      if (picture) {
        imageWrapper = document.createElement('div');
        imageWrapper.className = 'tabs-panel-image';

        // Extract picture - handle if it's wrapped in a p tag
        const pictureParent = picture.parentElement;
        const pictureElement = (pictureParent && pictureParent.tagName === 'P') ? pictureParent : picture;
        imageWrapper.appendChild(pictureElement);
      }

      // Move all remaining children to content wrapper, excluding the heading and title field
      const children = Array.from(tabpanel.children);
      children.forEach((child) => {
        if (child !== tab && child !== imageWrapper && child !== titleEl) {
          contentWrapper.appendChild(child);
        }
      });

      // Clear tabpanel and add wrappers back
      tabpanel.innerHTML = '';
      if (imageWrapper) {
        tabpanel.appendChild(imageWrapper);
        tabpanel.classList.remove('no-image');
      } else {
        tabpanel.classList.add('no-image');
      }
      tabpanel.appendChild(contentWrapper);
    }
    
    tabpanel.className = 'tabs-panel';
    tabpanel.id = id;
    tabpanel.setAttribute('aria-hidden', !!i);
    tabpanel.setAttribute('aria-labelledby', `tab-${id}`);
    tabpanel.setAttribute('role', 'tabpanel');

    // build tab button
    const button = document.createElement('button');
    button.className = 'tabs-tab';
    button.id = `tab-${id}`;

    button.innerHTML = headingContent;

    button.setAttribute('aria-controls', id);
    button.setAttribute('aria-selected', !i);
    button.setAttribute('role', 'tab');
    button.setAttribute('type', 'button');

    button.addEventListener('click', () => {
      block.querySelectorAll('[role=tabpanel]').forEach((panel) => {
        panel.setAttribute('aria-hidden', true);
      });
      tablist.querySelectorAll('button').forEach((btn) => {
        btn.setAttribute('aria-selected', false);
      });
      tabpanel.setAttribute('aria-hidden', false);
      button.setAttribute('aria-selected', true);
    });

    // Ensure the button itself carries no instrumentation so it doesn't show as a separate item in UE
    if (button.firstElementChild) {
      moveInstrumentation(button.firstElementChild, null);
    }
    // Hide the authored title field inside the panel (kept for editing within the tab item)
    if (titleEl) {
      titleEl.style.display = 'none';
    }

    // add the new tab list button, to the tablist
    tablist.append(button);

    // remove the tab heading element from the panel
    if (tab && tab.parentElement === tabpanel) {
      tab.remove();
    }

  });

  block.prepend(tablist);
}