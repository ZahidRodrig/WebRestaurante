// Disable submit buttons on submit to avoid double-posts
document.querySelectorAll("form").forEach((form) => {
  form.addEventListener("submit", () => {
    const button = form.querySelector("button[type='submit']");
    if (button) {
      button.disabled = true;
      button.textContent = "Procesando...";
    }
  });
});

// --- Menu toggle for mobile ---
const menuToggle = document.getElementById('menu-toggle');
if (menuToggle) {
  menuToggle.addEventListener('click', () => {
    const mainMenu = document.getElementById('main-menu');
    if (mainMenu) mainMenu.classList.toggle('show');
  });
}

// --- Confirmation modal helper ---
window._confirmResolve = null;
const confirmModalEl = document.getElementById('confirmModal');
let bsConfirmModal = null;
if (confirmModalEl) bsConfirmModal = new bootstrap.Modal(confirmModalEl);

window.showConfirm = function(message) {
  return new Promise((resolve) => {
    if (!confirmModalEl) {
      // Fallback to native
      resolve(confirm(message));
      return;
    }
    document.getElementById('confirmModalBody').textContent = message;
    bsConfirmModal.show();
    const okBtn = document.getElementById('confirmModalOk');
    const handler = () => {
      okBtn.removeEventListener('click', handler);
      bsConfirmModal.hide();
      resolve(true);
    };
    okBtn.addEventListener('click', handler);
    // If modal dismissed otherwise, resolve false
    const onceHidden = () => {
      confirmModalEl.removeEventListener('hidden.bs.modal', onceHidden);
      resolve(false);
    };
    confirmModalEl.addEventListener('hidden.bs.modal', onceHidden);
  });
};

// Attach data-confirm handlers to forms/buttons
document.querySelectorAll('[data-confirm]').forEach((el) => {
  el.addEventListener('click', (ev) => {
    const message = el.getAttribute('data-confirm') || '¿Confirmar?';
    ev.preventDefault();
    window.showConfirm(message).then((ok) => {
      if (!ok) return;
      // If it's a button inside a form, submit the form
      const form = el.closest('form');
      if (form) form.submit();
      else {
        // Otherwise if it's a link, follow it
        const href = el.getAttribute('href');
        if (href) window.location = href;
      }
    });
  });
});

// Also handle forms that have class needs-confirm and a submit button
document.querySelectorAll('form.needs-confirm').forEach((form) => {
  form.addEventListener('submit', (ev) => {
    // find submitter
    const submitter = document.activeElement;
    const msg = (submitter && submitter.getAttribute && submitter.getAttribute('data-confirm')) || form.getAttribute('data-confirm');
    if (!msg) return; // no custom message, allow
    ev.preventDefault();
    window.showConfirm(msg).then((ok) => {
      if (ok) form.submit();
    });
  });
});

// --- Auto-submit inputs for categories (debounced) ---
function debounce(fn, wait){ let t; return (...a)=>{ clearTimeout(t); t = setTimeout(()=>fn(...a), wait); }; }
document.querySelectorAll('.auto-submit-input').forEach((input) => {
  const form = input.closest('form');
  const submitDebounced = debounce(() => { if (form) form.requestSubmit(); }, 600);
  input.addEventListener('input', submitDebounced);
});

// --- Unit system toggle (metric/imperial) ---
const unitSystemSelect = document.querySelector('#unit-system-select');
const CONV = {
  g_to_oz: (g) => g / 28.3495,
  g_to_lb: (g) => g / 453.592,
  ml_to_fl_oz: (ml) => ml / 29.5735,
  ml_to_gal: (ml) => ml / 3785.41,
  oz_to_g: (oz) => oz * 28.3495,
  lb_to_g: (lb) => lb * 453.592,
  fl_oz_to_ml: (fl) => fl * 29.5735,
  gal_to_ml: (gal) => gal * 3785.41,
};

function formatConverted(value, unit, system) {
  const u = String(unit || '').toLowerCase();
  if (system === 'imperial') {
    if (u === 'g' || u === 'kg') {
      const g = u === 'kg' ? value * 1000 : value;
      const lb = CONV.g_to_lb(g);
      if (lb >= 1) return { value: (Math.round(lb * 100) / 100).toString(), unit: 'lb' };
      const oz = CONV.g_to_oz(g);
      return { value: (Math.round(oz * 100) / 100).toString(), unit: 'oz' };
    }
    if (u === 'ml' || u === 'l' || u === 'litros' || u === 'litro') {
      const ml = u === 'l' || u === 'litros' || u === 'litro' ? value * 1000 : value;
      const gal = CONV.ml_to_gal(ml);
      if (gal >= 1) return { value: (Math.round(gal * 100) / 100).toString(), unit: 'gal' };
      const floz = CONV.ml_to_fl_oz(ml);
      return { value: (Math.round(floz * 100) / 100).toString(), unit: 'fl oz' };
    }
    return { value: value.toString(), unit: unit };
  }

  if (u === 'lb') {
    const g = CONV.lb_to_g(value);
    if (g >= 1000) return { value: (Math.round((g / 1000) * 100) / 100).toString(), unit: 'kg' };
    return { value: (Math.round(g * 100) / 100).toString(), unit: 'g' };
  }
  if (u === 'oz') {
    const g = CONV.oz_to_g(value);
    if (g >= 1000) return { value: (Math.round((g / 1000) * 100) / 100).toString(), unit: 'kg' };
    return { value: (Math.round(g * 100) / 100).toString(), unit: 'g' };
  }
  if (u === 'fl oz' || u === 'floz') {
    const ml = CONV.fl_oz_to_ml(value);
    if (ml >= 1000) return { value: (Math.round((ml / 1000) * 100) / 100).toString(), unit: 'L' };
    return { value: (Math.round(ml * 100) / 100).toString(), unit: 'ml' };
  }
  if (u === 'gal') {
    const ml = CONV.gal_to_ml(value);
    return { value: (Math.round((ml / 1000) * 100) / 100).toString(), unit: 'L' };
  }
  return { value: value.toString(), unit: unit };
}

function applyUnitSystem(system) {
  document.querySelectorAll('.unit-cell').forEach((cell) => {
    const baseUnit = cell.dataset.baseUnit || cell.querySelector('.unit-unit')?.textContent || 'unidad';
    let rawValue = parseFloat(cell.dataset.rawValue);
    if (Number.isNaN(rawValue)) {
      const currentValue = cell.querySelector('.unit-value')?.textContent || '0';
      rawValue = parseFloat(currentValue) || 0;
      cell.dataset.rawValue = rawValue;
    }

    const converted = formatConverted(rawValue, baseUnit, system);
    const valueEl = cell.querySelector('.unit-value');
    const unitEl = cell.querySelector('.unit-unit');
    if (valueEl) valueEl.textContent = converted.value;
    if (unitEl) unitEl.textContent = converted.unit;
  });
}

function initUnitSystemToggle() {
  const select = document.querySelector('#unit-system-select');
  if (!select) return;

  const saved = localStorage.getItem('unitSystem') || 'metric';
  select.value = saved;
  applyUnitSystem(saved);
  select.addEventListener('change', (e) => {
    const v = e.target.value;
    localStorage.setItem('unitSystem', v);
    applyUnitSystem(v);
  });
}

initUnitSystemToggle();

// --- APLICAR REDONDEO MATH.CEIL() AL STOCK TEÓRICO EN VISUALIZACIÓN ---
// Encuentra todos los elementos con data-attribute para stock teórico y aplica Math.ceil()
function applyCeilToTheoreticalStock() {
  document.querySelectorAll('[data-stock-type="theoretical"]').forEach((cell) => {
    const rawValue = parseFloat(cell.dataset.rawValue);
    if (!Number.isNaN(rawValue)) {
      const ceiledValue = Math.ceil(rawValue);
      const valueEl = cell.querySelector('.stock-value');
      if (valueEl) {
        valueEl.textContent = ceiledValue.toString();
      }
    }
  });
}

// Ejecutar cuando el documento esté listo
document.addEventListener('DOMContentLoaded', applyCeilToTheoreticalStock);

// --- Auto-dismiss SOLO para alertas explícitamente "dismissibles" (mensajes flash) ---
// Importante: las alertas informativas dentro de formularios (p.ej. Stock Teórico
// y Stock Físico Anterior en /admin/auditoria/nueva) NO llevan .alert-dismissible
// y por tanto permanecen visibles en todo momento.
function scheduleAlertDismiss(alert) {
  if (!alert || alert.dataset.dismissScheduled === 'true') return;
  if (!alert.classList.contains('alert-dismissible')) return;
  alert.dataset.dismissScheduled = 'true';
  if (!alert.classList.contains('fade')) alert.classList.add('fade', 'show');

  setTimeout(() => {
    if (!alert.isConnected) return;
    alert.classList.remove('show');
    alert.addEventListener(
      'transitionend',
      () => {
        alert.remove();
      },
      { once: true }
    );
    try {
      const bsAlert = bootstrap.Alert.getOrCreateInstance(alert);
      bsAlert.close();
    } catch (_) {
    }
  }, 3000);
}

function autoDismissFlashAlerts() {
  document.querySelectorAll('.alert.alert-dismissible').forEach(scheduleAlertDismiss);
}

document.addEventListener('DOMContentLoaded', autoDismissFlashAlerts);

const flashAlertObserver = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => {
    mutation.addedNodes.forEach((node) => {
      if (node.nodeType !== 1) return;
      if (node.classList?.contains('alert') && node.classList.contains('alert-dismissible')) {
        scheduleAlertDismiss(node);
      }
      node.querySelectorAll?.('.alert.alert-dismissible').forEach(scheduleAlertDismiss);
    });
  });
});
flashAlertObserver.observe(document.body, { childList: true, subtree: true });

// --- Utilidad: limpiar backdrops huérfanos de Bootstrap ---
function cleanModalBackdrops() {
  document.querySelectorAll('.modal-backdrop').forEach((el) => el.remove());
  if (!document.querySelector('.modal.show')) {
    document.body.classList.remove('modal-open');
    document.body.style.removeProperty('overflow');
    document.body.style.removeProperty('padding-right');
  }
}

function ensureModalAtBodyRoot(modalEl) {
  if (modalEl && modalEl.parentElement !== document.body) {
    document.body.appendChild(modalEl);
  }
}

document.addEventListener('hidden.bs.modal', cleanModalBackdrops);

// --- Modal de categorías de menú (página /admin/menu) ---
function refreshCategoryFilter() {
  const filter = document.getElementById('menuFilterCategory');
  const formSelect = document.getElementById('menuCategorySelect');
  if (!filter && !formSelect) return;

  fetch('/admin/categorias-menu')
    .then((r) => r.json())
    .then((data) => {
      const current = filter ? filter.value : '';

      if (filter) {
        filter.innerHTML = '<option value="">Todas las categorías</option>';
        data.forEach((cat) => {
          const opt = document.createElement('option');
          opt.value = cat.id;
          opt.textContent = cat.name;
          if (String(current) === String(cat.id)) opt.selected = true;
          filter.appendChild(opt);
        });
      }

      if (formSelect) {
        const selected = formSelect.value;
        formSelect.innerHTML = '<option value="">-- Sin categoría --</option>';
        data.forEach((cat) => {
          const opt = document.createElement('option');
          opt.value = cat.id;
          opt.textContent = cat.name;
          if (String(selected) === String(cat.id)) opt.selected = true;
          formSelect.appendChild(opt);
        });
      }
    })
    .catch(() => {});
}

function initCategoriesModal() {
  const modalEl = document.getElementById('categoriesModal');
  const categoriesList = document.getElementById('categoriesList');
  const newCategoryInput = document.getElementById('newCategoryName');
  const addCategoryBtn = document.getElementById('addCategoryBtn');

  if (!modalEl || !categoriesList) return;

  ensureModalAtBodyRoot(modalEl);

  function loadCategories() {
    fetch('/admin/categorias-menu')
      .then((r) => r.json())
      .then((data) => {
        categoriesList.innerHTML = '<h6 class="mb-2">Categorías existentes:</h6>';

        if (!data.length) {
          categoriesList.innerHTML += '<p class="text-muted small mb-0">No hay categorías registradas.</p>';
          return;
        }

        data.forEach((cat) => {
          const row = document.createElement('div');
          row.className = 'd-flex justify-content-between align-items-center p-2 border-bottom';
          row.innerHTML = `
            <span>${cat.name}</span>
            <div class="d-flex gap-1">
              <button type="button" class="btn btn-sm btn-outline-warning edit-cat-btn">Editar</button>
              <button type="button" class="btn btn-sm btn-outline-danger delete-cat-btn">Eliminar</button>
            </div>
          `;

          row.querySelector('.edit-cat-btn').addEventListener('click', () => {
            const newName = prompt('Nuevo nombre:', cat.name);
            if (!newName || !newName.trim()) return;

            fetch(`/admin/categorias-menu/${cat.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name: newName.trim() }),
            })
              .then(async (r) => {
                const body = await r.json();
                if (!r.ok) throw new Error(body.error || 'No se pudo actualizar');
                loadCategories();
                refreshCategoryFilter();
              })
              .catch((e) => alert('Error: ' + e.message));
          });

          row.querySelector('.delete-cat-btn').addEventListener('click', () => {
            if (!confirm('¿Eliminar esta categoría?')) return;

            fetch(`/admin/categorias-menu/${cat.id}`, { method: 'DELETE' })
              .then(async (r) => {
                const body = await r.json();
                if (!r.ok) throw new Error(body.error || 'No se pudo eliminar');
                loadCategories();
                refreshCategoryFilter();
              })
              .catch((e) => alert('Error: ' + e.message));
          });

          categoriesList.appendChild(row);
        });
      })
      .catch(() => {
        categoriesList.innerHTML = '<p class="text-danger small">No se pudieron cargar las categorías.</p>';
      });
  }

  modalEl.addEventListener('show.bs.modal', loadCategories);
  modalEl.addEventListener('hidden.bs.modal', cleanModalBackdrops);

  if (addCategoryBtn && newCategoryInput) {
    addCategoryBtn.addEventListener('click', () => {
      const name = newCategoryInput.value.trim();
      if (!name) {
        alert('Ingresa un nombre');
        return;
      }

      fetch('/admin/categorias-menu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
        .then(async (r) => {
          const body = await r.json();
          if (!r.ok) throw new Error(body.error || 'No se pudo crear');
          newCategoryInput.value = '';
          loadCategories();
          refreshCategoryFilter();
        })
        .catch((e) => alert('Error: ' + e.message));
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  ensureModalAtBodyRoot(document.getElementById('confirmModal'));
  initCategoriesModal();
});
