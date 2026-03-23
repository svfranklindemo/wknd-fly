export default async function decorate(block) {
  // Read title from the first child div (authorable field from Universal Editor)
  const title = block.querySelector(':scope > div:nth-child(1) > div')?.textContent?.trim() || 'BECOME A MEMBER';

  // Build Adaptive Form definition for Membership
  const formDef = {
    id: 'membership-form',
    fieldType: 'form',
    appliedCssClassNames: 'membership-form',
    items: [
      {
        id: 'panel-main',
        name: 'main',
        fieldType: 'panel',
        appliedCssClassNames: 'membership-panel',
        items: [
          {
            id: 'firstName',
            name: 'firstName',
            fieldType: 'text-input',
            label: { value: 'First Name' },
            required: true,
            properties: { colspan: 6 },
          },
          {
            id: 'lastName',
            name: 'lastName',
            fieldType: 'text-input',
            label: { value: 'Last Name' },
            required: true,
            properties: { colspan: 6 },
          },
          {
            id: 'email',
            name: 'email',
            fieldType: 'email',
            label: { value: 'Email' },
            required: true,
            properties: { colspan: 6 },
          },
          {
            id: 'phone',
            name: 'phone',
            fieldType: 'text-input',
            label: { value: 'Phone number' },
            required: true,
            properties: { colspan: 6 },
          },
          {
            id: 'submit',
            name: 'submit',
            fieldType: 'button',
            buttonType: 'submit',
            label: { value: 'JOIN' },
            appliedCssClassNames: 'submit-wrapper col-12',
          },
        ],
      },
    ],
  };

  // Create a child form block that reuses the existing form renderer
  const formContainer = document.createElement('div');
  formContainer.className = 'form membership';

  const pre = document.createElement('pre');
  const code = document.createElement('code');
  code.textContent = JSON.stringify(formDef);
  pre.append(code);
  formContainer.append(pre);

  // Create title element outside the form
  const titleElement = document.createElement('h2');
  titleElement.className = 'membership-title';
  titleElement.textContent = title;

  // Add title before form
  block.replaceChildren(titleElement, formContainer);

  const formModule = await import('../form/form.js');
  await formModule.default(formContainer);
}
