/**
 * Helper para conversión bidireccional de unidades culinarias
 * Todo ingrediente se almacena en su unidad base en BD:
 * - Sólidos: gramos (g)
 * - Líquidos: mililitros (ml)
 * - Unidades discretas: piezas (pcs)
 */

// Factores de conversión a la unidad base
const CONVERSION_FACTORS = {
  // Sólidos a gramos
  g: 1,
  kg: 1000,
  lb: 453.592,
  oz: 28.3495,

  // Líquidos a mililitros
  ml: 1,
  L: 1000,
  gal: 3785.41,

  // Volumen de cocina (referencia aproximada)
  cups: 236.588,
  tbsp: 14.7868,
  tsp: 4.92892,

  // Unidades discretas
  pcs: 1,
};

// Validaciones de compatibilidad de unidades
const UNIT_CATEGORIES = {
  solids: ["g", "kg", "lb", "oz"],
  liquids: ["ml", "L", "gal"],
  cooking_volume: ["cups", "tbsp", "tsp"],
  discrete: ["pcs"],
};

// Mapear sinónimos (español, variantes) a las unidades estándar usadas arriba
const UNIT_ALIASES = {
  litros: "L",
  litro: "L",
  l: "L",
  ml: "ml",
  mililitros: "ml",
  mililitro: "ml",
  gramos: "g",
  gramo: "g",
  g: "g",
  kilogramos: "kg",
  kilogramo: "kg",
  kg: "kg",
  piezas: "pcs",
  pieza: "pcs",
  pcs: "pcs",
};

function normalizeUnit(unit) {
  if (!unit && unit !== 0) return unit;
  const u = String(unit).trim();
  // If exact match in conversion factors, return as-is
  if (u in CONVERSION_FACTORS) return u;
  const lower = u.toLowerCase();
  if (lower in UNIT_ALIASES) return UNIT_ALIASES[lower];
  // Accept uppercase L as liters
  if (lower === "l") return "L";
  return u;
}

/**
 * Valida si una unidad es válida
 * @param {string} unit - Unidad a validar
 * @returns {boolean}
 */
function isValidUnit(unit) {
  const u = normalizeUnit(unit);
  return u in CONVERSION_FACTORS;
}

/**
 * Obtiene la categoría de una unidad
 * @param {string} unit - Unidad
 * @returns {string|null} Categoría o null si no existe
 */
function getUnitCategory(unit) {
  const u = normalizeUnit(unit);
  for (const [category, units] of Object.entries(UNIT_CATEGORIES)) {
    if (units.includes(u)) {
      return category;
    }
  }
  return null;
}

/**
 * Convierte una cantidad de una unidad a otra
 * Usa aritmética especial para factores de 1000 para evitar errores de precisión de punto flotante.
 * @param {number} quantity - Cantidad a convertir
 * @param {string} fromUnit - Unidad origen
 * @param {string} toUnit - Unidad destino
 * @returns {number} Cantidad convertida
 * @throws {Error} Si las unidades son incompatibles
 */
function convert(quantity, fromUnit, toUnit) {
  const f = normalizeUnit(fromUnit);
  const t = normalizeUnit(toUnit);

  if (!isValidUnit(f)) {
    throw new Error(`Unidad origen inválida: ${fromUnit}`);
  }
  if (!isValidUnit(t)) {
    throw new Error(`Unidad destino inválida: ${toUnit}`);
  }

  const fromCategory = getUnitCategory(f);
  const toCategory = getUnitCategory(t);

  if (fromCategory !== toCategory) {
    throw new Error(
      `No se puede convertir entre ${fromUnit} (${fromCategory}) y ${toUnit} (${toCategory}). Categorías incompatibles.`
    );
  }

  if (f === t) {
    return quantity;
  }

  const factorFrom = CONVERSION_FACTORS[f];
  const factorTo = CONVERSION_FACTORS[t];

  // Manejo especial para conversiones con factor 1000 (kg↔g, L↔ml)
  // Usa aritmética entera para evitar errores de punto flotante
  if (factorFrom === 1000 && factorTo === 1) {
    // De unidad mayor (kg, L) a menor (g, ml): multiplicar por 1000
    return Math.round(quantity * 1000);
  }
  if (factorFrom === 1 && factorTo === 1000) {
    // De unidad menor (g, ml) a mayor (kg, L): dividir por 1000
    return Math.round(quantity) / 1000;
  }

  // Para otras conversiones, usar el método general
  const toBase = quantity * factorFrom;
  const fromBase = toBase / factorTo;

  // Redondear a 5 decimales para otras unidades (oz, lb, cups, etc.)
  return Math.round(fromBase * 100000) / 100000;
}

/**
 * Convierte una cantidad a su unidad base según la categoría
 * @param {number} quantity - Cantidad
 * @param {string} unit - Unidad actual
 * @returns {number} Cantidad en unidad base
 */
function toBaseUnit(quantity, unit) {
  const u = normalizeUnit(unit);
  const category = getUnitCategory(u);
  if (!category) {
    throw new Error(`Unidad inválida: ${unit}`);
  }

  const baseUnit = getBaseUnitByCategory(category);
  return convert(quantity, u, baseUnit);
}

/**
 * Convierte desde unidad base a la unidad especificada
 * @param {number} quantity - Cantidad en unidad base
 * @param {string} unit - Unidad destino
 * @returns {number} Cantidad convertida
 */
function fromBaseUnit(quantity, unit) {
  const u = normalizeUnit(unit);
  const category = getUnitCategory(u);
  if (!category) {
    throw new Error(`Unidad inválida: ${unit}`);
  }

  const baseUnit = getBaseUnitByCategory(category);
  return convert(quantity, baseUnit, u);
}

/**
 * Obtiene la unidad base para una categoría
 * @param {string} category - Categoría (solids, liquids, cooking_volume, discrete)
 * @returns {string} Unidad base
 */
function getBaseUnitByCategory(category) {
  const baseUnits = {
    solids: "g",
    liquids: "ml",
    cooking_volume: "tsp",
    discrete: "pcs",
  };
  return baseUnits[category];
}

/**
 * Obtiene todas las unidades de una categoría
 * @param {string} category - Categoría
 * @returns {string[]} Array de unidades
 */
function getUnitsInCategory(category) {
  return UNIT_CATEGORIES[category] || [];
}

/**
 * Valida que el base_unit sea compatible con la categoría del ingrediente
 * @param {string} baseUnit - Unidad base
 * @returns {string} Categoría del base_unit
 */
function validateAndGetCategory(baseUnit) {
  const u = normalizeUnit(baseUnit);
  const category = getUnitCategory(u);
  if (!category) {
    throw new Error(`Unidad base inválida: ${baseUnit}`);
  }
  return category;
}

module.exports = {
  convert,
  toBaseUnit,
  fromBaseUnit,
  isValidUnit,
  getUnitCategory,
  getBaseUnitByCategory,
  getUnitsInCategory,
  validateAndGetCategory,
  CONVERSION_FACTORS,
  UNIT_CATEGORIES,
};
