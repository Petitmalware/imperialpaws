document.querySelectorAll('[data-reply-form]').forEach(form => {
  const data = JSON.parse(document.getElementById('reply-data').textContent);
  const select = form.elements.templateId;
  const subject = form.elements.subject;
  const message = form.elements.messageBody;
  const invoiceSelect = form.elements.invoiceNumber;
  const contractSelect = form.elements.contractId;
  const deliveryDetails = form.elements.deliveryDetails;
  const paymentDetails = form.elements.paymentDetails;
  const fillButton = form.querySelector('[data-fill-reply]');
  const hint = form.querySelector('[data-draft-hint]');
  const requirements = form.querySelector('[data-template-requirements]');
  let filledSelection = select.value;
  let lastGenerated = '';
  let draftDirty = false;
  const chosen = () => data.templates.find(template => template.id === select.value);
  const chosenInvoice = () => data.invoices.find(invoice => invoice.number === invoiceSelect.value);
  const showHint = text => { hint.hidden = !text; hint.textContent = text; };
  const tokens = value => [...new Set(value.match(/\{\{\s*[a-zA-Z][a-zA-Z0-9_]*\s*\}\}/g) || [])];
  const problems = () => {
    const required = chosen()?.requires || [];
    const issues = [];
    if (required.includes('approved') && !['Approved', 'Sold'].includes(data.status)) issues.push('Approve this application first.');
    if (required.includes('completed') && data.status !== 'Sold') issues.push('Mark the adoption as completed first.');
    if (required.includes('invoice') && (!chosenInvoice() || !form.elements.attachInvoice.checked)) issues.push('Select and attach this family’s invoice.');
    if (required.includes('contract') && !contractSelect.value) issues.push('Select an agreement to attach.');
    if (required.includes('paid_invoice') && !chosenInvoice()?.paid) issues.push('Select an invoice with payment recorded.');
    if (required.includes('delivery_details') && !deliveryDetails.value.trim()) issues.push('Add the confirmed collection or delivery arrangements.');
    return issues;
  };
  const update = () => {
    const template = chosen();
    fillButton.disabled = !template;
    form.querySelector('[data-template-description]').textContent = template?.description || 'Write a personal message below. You can attach an invoice or agreement to it.';
    const issues = problems();
    requirements.textContent = issues.join(' ');
    requirements.hidden = !issues.length;
    if ((template?.requires || []).some(requirement => ['invoice', 'contract', 'paid_invoice'].includes(requirement))) form.querySelector('[data-reply-documents]').open = true;
    if (/\{\{\s*delivery_details\s*\}\}/.test(template?.body || '')) form.querySelector('[data-delivery-details]').open = true;
    if (/\{\{\s*payment_details\s*\}\}/.test(template?.body || '')) form.querySelector('[data-payment-details]').open = true;
  };
  select.addEventListener('change', () => {
    update();
    if (!select.value) {
      filledSelection = '';
      draftDirty = false;
      showHint('Your message is now a custom reply. Review the wording and attachments before sending.');
    } else {
      draftDirty = true;
      showHint('Select “Fill draft from this email” to use your chosen template. Your current wording is still below.');
    }
  });
  for (const control of [invoiceSelect, contractSelect, form.elements.attachInvoice, deliveryDetails, paymentDetails]) {
    control.addEventListener([deliveryDetails, paymentDetails].includes(control) ? 'input' : 'change', () => {
      update();
      if (select.value && message.value.trim() && [invoiceSelect, deliveryDetails, paymentDetails].includes(control)) {
        draftDirty = true;
        showHint('Details changed. Fill the draft again so its amounts and arrangements match your selection.');
      }
    });
  }
  fillButton.addEventListener('click', () => {
    const template = chosen();
    if (!template) return;
    if (message.value.trim() && subject.value + '\n' + message.value !== lastGenerated && !window.confirm('Replace this draft with the selected saved email?')) return;
    const values = { ...data.values, ...chosenInvoice()?.values, delivery_details: deliveryDetails.value.trim(), payment_details: paymentDetails.value.trim() };
    const replace = text => text.replace(/\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g, (token, key) => {
      return Object.prototype.hasOwnProperty.call(values, key) && String(values[key] ?? '').trim() ? String(values[key]) : token;
    });
    subject.value = replace(template.subject);
    message.value = replace(template.body);
    lastGenerated = subject.value + '\n' + message.value;
    filledSelection = select.value;
    draftDirty = false;
    const missing = tokens(lastGenerated);
    showHint(missing.length ? 'Finish these details in the draft: ' + missing.join(', ') : 'Your draft is ready to review. You can edit any wording before sending.');
    message.focus();
  });
  // Run before the shared submit lock, so a validation message never locks the composer.
  form.addEventListener('submit', event => {
    let issue = problems().join(' ');
    if (select.value && (filledSelection !== select.value || draftDirty)) issue = 'Fill the draft again to use your selected email and current details.';
    const missing = tokens(subject.value + '\n' + message.value);
    if (missing.length) issue = 'Fill these details before sending: ' + missing.join(', ');
    if (subject.value.length > 160 || message.value.length > 5000) issue = 'Keep the subject under 160 characters and the message under 5,000 characters.';
    if (issue) {
      event.preventDefault();
      showHint(issue);
      hint.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, true);
  update();
});

document.querySelectorAll('[data-template-reset]').forEach(form => {
  form.addEventListener('submit', event => {
    if (!window.confirm('Restore the original wording for this email? Your saved changes to this template will be replaced.')) event.preventDefault();
  }, true);
});
function openTemplateFromHash() {
  const target = document.getElementById(location.hash.slice(1));
  if (target?.classList.contains('reply-template-card')) target.open = true;
}
openTemplateFromHash();
window.addEventListener('hashchange', openTemplateFromHash);
