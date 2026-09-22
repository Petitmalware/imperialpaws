(() => {
  const content = document.querySelector('.admin-content');
  if (content && !content.id) content.id = 'admin-main-content';
  if (content) content.setAttribute('tabindex', '-1');
  const sidebar = document.querySelector('[data-admin-sidebar]');
  const toggle = document.querySelector('[data-admin-menu-toggle]');
  if (sidebar && toggle) {
    sidebar.classList.add('is-collapsible');
    toggle.hidden = false;
    const setOpen = (open) => {
      sidebar.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', String(open));
    };
    toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
    sidebar.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && sidebar.classList.contains('is-open')) {
        setOpen(false);
        toggle.focus();
      }
    });
    window.matchMedia('(max-width: 760px)').addEventListener('change', () => setOpen(false));
  }
  document.querySelectorAll('form[data-submit-lock]').forEach((form) => {
    form.addEventListener('submit', (event) => {
      if (event.defaultPrevented) return;
      if (form.dataset.submitting === 'true') { event.preventDefault(); return; }
      // Keep named submit buttons enabled so the server receives their values.
      form.dataset.submitting = 'true';
      form.setAttribute('aria-busy', 'true');
      form.querySelectorAll('button[type="submit"]:not([name])').forEach((button) => {
        button.dataset.originalText = button.textContent;
        button.disabled = true;
        button.textContent = button.dataset.pendingLabel || 'Working…';
      });
    });
  });
  window.addEventListener('pageshow', () => {
    document.querySelectorAll('form[data-submitting]').forEach((form) => {
      delete form.dataset.submitting;
      form.removeAttribute('aria-busy');
      form.querySelectorAll('button[data-original-text]').forEach((button) => {
        button.textContent = button.dataset.originalText;
        button.disabled = false;
        delete button.dataset.originalText;
      });
    });
  });
  document.querySelectorAll('[data-table-search]').forEach((input) => {
    const table = document.getElementById(input.dataset.tableSearch);
    if (!table) return;
    const result = document.getElementById(input.dataset.searchCount);
    const empty = document.getElementById(input.dataset.searchEmpty);
    const rows = [...table.querySelectorAll('tbody tr')];
    input.addEventListener('input', () => {
      const query = input.value.trim().toLocaleLowerCase();
      let count = 0;
      rows.forEach((row) => {
        const matches = (row.dataset.searchText || row.textContent).toLocaleLowerCase().includes(query);
        row.hidden = !matches;
        if (matches) count++;
      });
      if (result) result.textContent = `${count} ${count === 1 ? 'result' : 'results'}`;
      if (empty) empty.hidden = count !== 0;
    });
  });
})();
