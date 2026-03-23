const NODE_NAMES = {
  IMG(elem, p) { const goodies = elem.querySelector('picture'); p.replaceWith(goodies); },
  H3(elem, p) { const goodies = elem.querySelector('h3'); p.replaceWith(goodies); },
  P(elem, p) { const goodies = elem.querySelector('p'); p.replaceWith(goodies); },
  UL(elem, p) { const goodies = elem.querySelector('ul'); p.replaceWith(goodies); },
  A(elem, p) { const goodies = elem.querySelector('a'); p.href = goodies.href; goodies.classList.add('_delete'); },
};

const buildOutPattern = (len, pattern) => {
  const doc = document.createElement('div');
  doc.innerHTML = pattern;
  const patternDom = doc.firstElementChild;
  const dataRow = patternDom.querySelector('[data-row]');

  if (dataRow.getAttribute('data-row') === 'n-length') {
    dataRow.setAttribute('data-row', 0);
    for (let i = 1; i < len; i += 1) {
      const rowCopy = dataRow.cloneNode(true);
      rowCopy.setAttribute('data-row', i);
      dataRow.insertAdjacentElement('afterend', rowCopy);
    }
  }
  return patternDom;
};

const cleanUp = () => {
  const dels = document.querySelectorAll('._delete');
  dels.forEach((item) => {
    item.remove();
  });
};

export const patternDecorate = async (block) => {
  const pattern = await fetchTemplate(block);
  const patternDom = buildOutPattern(block.children.length, pattern);
  const blockAttr = block.attributes;
  const attrObj = {};
  Object.values(blockAttr).forEach((item) => attrObj[item.name] = item.value);
  attrObj.class += ` ${patternDom.getAttribute('class')}`;

  let x = 0;
  [...block.children].forEach((row) => {
    // get the row
    const dataRow = patternDom.querySelector(`[data-row="${x}"]`);

    // get the elements in the row
    const data = dataRow.querySelectorAll('[data-inject]');
    const patternElems = [].forEach.call(data, (p) => {
      NODE_NAMES[p.nodeName](row, p);
    });
    x += 1;
  });

  /** ammend block element */
  Object.entries(attrObj).forEach(([key, value]) => block.setAttribute(key, value));
  block.innerHTML = patternDom.innerHTML;
  cleanUp();
};

const fetchTemplate = async (block) => {
  const { blockName } = block.dataset;
  try {
    const resp = await fetch(`https://raw.githubusercontent.com/AdobeHOLs/universal-demo/refs/heads/demo73/blocks/cards/_default.html`);
    //const resp = await fetch(`${window.hlx.codeBasePath}/blocks/${blockName}/_default.html`);
    const templateText = await resp.text();
    return templateText;
  } catch {
    // no template found
    return '';
  }
};
