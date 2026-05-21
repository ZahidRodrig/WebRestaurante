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

/**
 * Valida si una unidad es válida
 * @param {string} unit - Unidad a validar
 * @returns {boolean}
 */
function isValidUnit(unit) {
  return unit in CONVERSION_FACTORS;
}

/**
 * Obtiene la categoría de una unidad
 * @param {string} unit - Unidad
 * @returns {string|null} Categoría o null si no existe
 */
function getUnitCategory(unit) {
  for (const [category, units] of Object.entries(UNIT_CATEGORIES)) {
    if (units.includes(unit)) {
      return category;
    }
  }
  return null;
}

/**
 * Convierte una cantidad de una unidad a otra
 * @param {number} quantity - Cantidad a convertir
 * @param {string} fromUnit - Unidad origen
 * @param {string} toUnit - Unidad destino
 * @returns {number} Cantidad convertida
 * @throws {Error} Si las unidades son incompatibles
 */
function convert(quantity, fromUnit, toUnit) {
  if (!isValidUnit(fromUnit)) {
    throw new Error(`Unidad origen inválida: ${fromUnit}`);
  }
  if (!isValidUnit(toUnit)) {
    throw new Error(`Unidad destino inválida: ${toUnit}`);
  }

  const fromCategory = getUnitCategory(fromUnit);
  const toCategory = getUnitCategory(toUnit);

  if (fromCategory !== toCategory) {
    throw new Error(
      `No se puede convertir entre ${fromUnit} (${fromCategory}) y ${toUnit} (${toCategory}). Categorías incompatibles.`
    );
  }

  if (fromUnit === toUnit) {
    return quantity;
  }

  // Convertir a unidad base de la categoría, luego a unidad destino
  const toBase = quantity * CONVERSION_FACTORS[fromUnit];
  const fromBase = toBase / CONVERSION_FACTORS[toUnit];

  return Math.round(fromBase * 100000) / 100000; // Redondear a 5 decimales
}

/**
 * Convierte una cantidad a su unidad base según la categoría
 * @param {number} quantity - Cantidad
 * @param {string} unit - Unidad actual
 * @returns {number} Cantidad en unidad base
 */
function toBaseUnit(quantity, unit) {
  const category = getUnitCategory(unit);
  if (!category) {
    throw new Error(`Unidad inválida: ${unit}`);
  }

  const baseUnit = getBaseUnitByCategory(category);
  return convert(quantity, unit, baseUnit);
}

/**
 * Convierte desde unidad base a la unidad especificada
 * @param {number} quantity - Cantidad en unidad base
 * @param {string} unit - Unidad destino
 * @returns {number} Cantidad convertida
 */
function fromBaseUnit(quantity, unit) {
  const category = getUnitCategory(unit);
  if (!category) {
    throw new Error(`Unidad inválida: ${unit}`);
  }

  const baseUnit = getBaseUnitByCategory(category);
  return convert(quantity, baseUnit, unit);
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
  const category = getUnitCategory(baseUnit);
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
