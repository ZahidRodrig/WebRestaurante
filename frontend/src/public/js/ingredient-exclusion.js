/**
 * Exclusión mutua en selects de ingredientes (recetas y proveedores).
 * Deshabilita en cada <select> las opciones ya elegidas en otro campo del mismo contenedor.
 */
(function (global) {
  function initIngredientMutualExclusion(container, selectSelector, options) {
    if (!container) return null;

    const selector = selectSelector || ".mutual-ingredient-select";
    const opts = options || {};

    function syncDisabledOptions() {
      const selectedById = new Map();

      container.querySelectorAll(selector).forEach((select) => {
        const value = select.value;
        if (value) selectedById.set(value, select);
      });

      container.querySelectorAll(selector).forEach((select) => {
        select.querySelectorAll("option").forEach((option) => {
          if (!option.value) {
            option.disabled = false;
            return;
          }
          const takenElsewhere =
            selectedById.has(option.value) && selectedById.get(option.value) !== select;
          option.disabled = takenElsewhere;
        });
      });
    }

    function handleChange(event) {
      const select = event.target.closest(selector);
      if (!select || !container.contains(select)) return;

      syncDisabledOptions();

      if (typeof opts.onSelectChange === "function") {
        opts.onSelectChange(select, event);
      }
    }

    function handleClick(event) {
      const removeBtn = event.target.closest("[data-remove-ingredient-row]");
      if (!removeBtn) return;

      event.preventDefault();
      const row = removeBtn.closest("[data-ingredient-row], .ingredient-row, .supplier-ingredient-row");
      if (row) row.remove();

      syncDisabledOptions();

      if (typeof opts.onRowRemoved === "function") {
        opts.onRowRemoved(row);
      }
    }

    container.addEventListener("change", handleChange);
    container.addEventListener("click", handleClick);

    syncDisabledOptions();

    return { sync: syncDisabledOptions };
  }

  global.IngredientExclusion = {
    init: initIngredientMutualExclusion,
  };
})(window);
