document.addEventListener('DOMContentLoaded', () => {
  const filters = document.querySelector('[data-puppy-filters]');
  if (filters) {
    const cards = Array.from(document.querySelectorAll('[data-puppy-card]'));
    const summary = document.querySelector('[data-puppy-count]');
    const empty = document.querySelector('[data-puppy-empty]');
    const fields = ['q', 'breed', 'gender', 'status'];
    const params = new URLSearchParams(window.location.search);
    fields.forEach(name => {
      const input = filters.elements.namedItem(name);
      const value = params.get(name) || '';
      if (input.tagName === 'INPUT' || Array.from(input.options).some(option => option.value === value)) input.value = value;
    });
    function filterPuppies() {
      const values = Object.fromEntries(fields.map(name => [name, filters.elements.namedItem(name).value.trim().toLowerCase()]));
      let count = 0;
      cards.forEach(card => {
        const match = (!values.q || values.q.split(/\s+/).every(word => card.dataset.search.includes(word))) &&
          ['breed', 'gender', 'status'].every(name => !values[name] || card.dataset[name] === values[name]);
        card.hidden = !match;
        if (match) count++;
      });
      summary.textContent = count + (count === 1 ? ' puppy' : ' puppies') + ' to get to know';
      empty.hidden = count > 0;
      const url = new URL(window.location.href);
      fields.forEach(name => {
        const value = filters.elements.namedItem(name).value.trim();
        if (value) url.searchParams.set(name, value); else url.searchParams.delete(name);
      });
      window.history.replaceState(null, '', url);
    }
    filters.hidden = false;
    filters.addEventListener('submit', event => event.preventDefault());
    filters.addEventListener('input', filterPuppies);
    filters.addEventListener('change', filterPuppies);
    filters.addEventListener('reset', () => { setTimeout(filterPuppies, 0); });
    document.querySelector('[data-reset-puppies]')?.addEventListener('click', () => { filters.reset(); filters.elements.q.focus(); });
    filterPuppies();
  }

  document.querySelectorAll('[data-copy-target]').forEach(button => {
    const target = document.getElementById(button.dataset.copyTarget);
    const feedback = button.parentElement.querySelector('[data-copy-feedback]');
    if (!target || !navigator.clipboard?.writeText) return;
    button.hidden = false;
    button.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(target.textContent.trim()); feedback.textContent = 'Code copied. Keep it somewhere safe.'; }
      catch { feedback.textContent = 'Please select and copy the code above.'; }
    });
  });

  const applicationForm = document.querySelector('[data-application-form]');
  if (applicationForm) {
    const button = applicationForm.querySelector('button[type="submit"]');
    const resetSubmit = () => {
      button.disabled = false;
      button.removeAttribute('aria-busy');
      applicationForm.querySelector('.form-submit-status').textContent = '';
    };
    applicationForm.addEventListener('submit', () => {
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      applicationForm.querySelector('.form-submit-status').textContent = 'Sending your application…';
    });
    window.addEventListener('pageshow', resetSubmit);
    document.querySelector('[data-form-error]')?.focus();
  }
});
