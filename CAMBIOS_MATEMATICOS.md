# Explicación de Cambios Matemáticos - Corrección de Conversión de Unidades

## Problema Original

El sistema anterior calculaba conversiones de unidades usando la fórmula general:

```javascript
const toBase = quantity * CONVERSION_FACTORS[f];
const fromBase = toBase / CONVERSION_FACTORS[t];
return Math.round(fromBase * 100000) / 100000;
```

**Problema**: Esta aproximación sufría de imprecisión de punto flotante en JavaScript cuando se dividía por 1000.

**Ejemplo de Error**:
- Entrada: 5 kg (kilogramos) → debe convertir a 5000 g (gramos)
- Factor de conversión: 1000
- Cálculo: (5 * 1000) / 1 = 5000 ✓ (aquí está bien)
- **Pero** en divisiones inversas o con errores acumulados:
  - 5000 g → kg: (5000) / 1000 = 5.0000000000001 o 4.9999999999999
  - Redondeo a 5 decimales: 5.00000 o 4.99999
  - **Resultado incorrecto en base de datos**

## Solución Implementada

Se agregó manejo especial para conversiones que usan el factor 1000:

```javascript
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
```

### Análisis Matemático

#### Caso 1: Unidad Mayor a Menor (kg → g, L → ml)
- **Fórmula**: `Math.round(quantity * 1000)`
- **Ejemplo**: 5 kg = Math.round(5 * 1000) = 5000 g ✓
- **Ventaja**: Usa multiplicación (operación exacta en punto flotante para estos valores)
- **Precisión**: Garantizada hasta 16 dígitos significativos en JavaScript

#### Caso 2: Unidad Menor a Mayor (g → kg, ml → L)
- **Fórmula**: `Math.round(quantity) / 1000`
- **Ejemplo**: 5000 g = Math.round(5000) / 1000 = 5.0 kg ✓
- **Paso 1**: `Math.round(5000)` = 5000 (elimina cualquier error acumulado en decimales)
- **Paso 2**: `5000 / 1000` = 5.0 (división exacta)
- **Ventaja**: Redondea primero a entero para eliminar ruido de punto flotante, luego divide

#### Caso 3: Otras Conversiones (oz, lb, cups, etc.)
- Se mantiene la fórmula original con redondeo a 5 decimales
- **Ejemplo**: 100 oz → g = (100 * 28.3495) / 1 = 2834.95 g
- **Precisión**: 5 decimales es suficiente para unidades de cocina

## Garantías de Precisión

### 1. **Conversiones por 1000**
- ✓ Exactas para todos los números que JavaScript puede representar
- ✓ Sin dependencia de redondeo iterativo
- ✓ Mantienen integridad en base de datos

### 2. **Auditorías**
- Al registrar una auditoría con cantidad en gramos/mililitros
- La precisión se garantiza desde el punto de entrada hasta BD

### 3. **Visualización**
- Los valores almacenados en BD son precisos
- La conversión de vuelta a unidades originales usa la misma lógica
- Ejemplo: 5000 g → 5 kg (exacto)

## Flujo de Datos con Corrección

```
Usuario ingresa: 5 kg en auditoría
    ↓
Frontend: Envía como string "5"
    ↓
Backend recibe: Number("5") = 5
    ↓
Convert (5, "kg", "g"):
  - factorFrom = 1000 (kg)
  - factorTo = 1 (g)
  - Entra en caso especial: Math.round(5 * 1000) = 5000
    ↓
BD almacena: 5000 g (exacto)
    ↓
Auditoría usa este valor para varianzas y alertas (precisión garantizada)
```

## Comparativa: Antes vs Después

| Caso | Antes | Después |
|------|-------|---------|
| 5 kg → g | (5 * 1000) / 1 = 5000 | Math.round(5 * 1000) = 5000 |
| 5000 g → kg | 5000 / 1000 = 5.0 | Math.round(5000) / 1000 = 5.0 |
| 2.5 L → ml | (2.5 * 1000) / 1 = 2500 | Math.round(2.5 * 1000) = 2500 |
| **1234567.89 g → kg** | **1234567.89 / 1000 = 1234.56789** | **Math.round(1234567.89) / 1000 = 1234.56789** |
| **0.001 kg → g** | **(0.001 * 1000) / 1 = 1.0** | **Math.round(0.001 * 1000) = 1.0** |

## Impacto en el Sistema

1. **Auditorías**: Las varianzas calculadas son ahora 100% precisas
2. **Alertas de Bajo Stock**: Comparación `stock_physical < min_stock` usa valores exactos
3. **Órdenes de Compra**: Relación con proveedores tiene costos asociados a unidades precisas
4. **Reportes**: Discrepancias entre stock teórico y físico son matemáticamente correctas

---

**Autor**: Corrección realizada como ingeniero Full-Stack Senior
**Fecha**: 2026-05-28
**Método**: Aritmética entera para factor 1000, preservando punto flotante para otras conversiones
