# ✅ CHECKLIST DE VERIFICACIÓN - Sistema Completado

## 📋 Verificación de Implementación

Usa este checklist para validar que todas las funcionalidades están operacionales.

---

## 🔧 1. VERIFICACIÓN DEL BUG DE CONVERSIÓN

### Test 1: Conversión kg → g
```javascript
// En consola del navegador o backend test:
const unitConverter = require('./backend/src/helpers/unitConverter.js');

// Test 1: 5 kg → g
const result1 = unitConverter.convert(5, 'kg', 'g');
console.assert(result1 === 5000, `FAIL: Expected 5000, got ${result1}`);
// ✅ DEBE MOSTRAR: 5000 (exacto, sin decimales)
```

### Test 2: Conversión g → kg
```javascript
const result2 = unitConverter.convert(5000, 'g', 'kg');
console.assert(result2 === 5, `FAIL: Expected 5, got ${result2}`);
// ✅ DEBE MOSTRAR: 5 (exacto)
```

### Test 3: Conversión L → ml
```javascript
const result3 = unitConverter.convert(2.5, 'L', 'ml');
console.assert(result3 === 2500, `FAIL: Expected 2500, got ${result3}`);
// ✅ DEBE MOSTRAR: 2500 (exacto)
```

### Test 4: Conversión ml → L
```javascript
const result4 = unitConverter.convert(2500, 'ml', 'L');
console.assert(result4 === 2.5, `FAIL: Expected 2.5, got ${result4}`);
// ✅ DEBE MOSTRAR: 2.5 (exacto)
```

---

## 📊 2. VERIFICACIÓN DE ALERTAS DE BAJO STOCK

### Paso 1: Crear un Ingrediente de Prueba
```bash
1. Ir a: /admin/ingredientes
2. Click "+ Nuevo Ingrediente"
3. Rellenar:
   - Nombre: "Tomate de Test"
   - Categoría: Verduras
   - Cantidad: 100
   - Unidad: kg
   - Stock Mínimo: 50
4. Click "Crear Ingrediente"
✅ Debe mostrar: "Ingrediente creado correctamente."
```

### Paso 2: Registrar una Auditoría que Dispare Alerta
```bash
1. Ir a: /admin/auditoria/nueva
2. Seleccionar: "Tomate de Test"
3. Ingresar Stock Físico: 40 (menos que el mínimo de 50)
4. Click "Registrar Auditoría"
✅ Debe mostrar: "Auditoría registrada correctamente."
```

### Paso 3: Verificar Alerta en Dashboard
```bash
1. Ir a: /admin/dashboard
2. Buscar sección "Bajo stock (Alertas)"
3. Verificar que el contador aumentó
4. En tabla de ingredientes en alerta, debe aparecer "Tomate de Test"
✅ DEBE APARECER en lista de alertas
```

### Paso 4: Verificar en BD
```sql
SELECT * FROM low_stock_alerts 
WHERE ingredient_id = (SELECT id FROM ingredients WHERE name = 'Tomate de Test')
  AND status = 'active';
```
✅ DEBE RETORNAR: 1 fila con status = 'active'

### Paso 5: Resolver Alerta Subiendo Stock
```bash
1. Ir a: /admin/auditoria/nueva
2. Seleccionar: "Tomate de Test"
3. Ingresar Stock Físico: 55 (mayor que el mínimo de 50)
4. Click "Registrar Auditoría"
```

### Paso 6: Verificar que la Alerta se Resolvió
```sql
SELECT * FROM low_stock_alerts 
WHERE ingredient_id = (SELECT id FROM ingredients WHERE name = 'Tomate de Test')
  AND status = 'active';
```
✅ DEBE RETORNAR: 0 filas (alerta resuelta)

---

## 🎯 3. VERIFICACIÓN DE REDONDEO DE STOCK TEÓRICO

### Verificación Visual (sin Math.ceil)
```bash
# Si tuvieras stock teórico de 3.2 unidades:
1. Abre la vista de inventario
2. Si ve "3.2", el redondeo NO está activo
✅ Debería ver: "4" (redondeado hacia arriba)
```

### Verificación Técnica
```javascript
// En consola del navegador (en página con stock teórico):
const result = document.querySelector('[data-stock-type="theoretical"]');
if (result) {
  const value = result.querySelector('.stock-value').textContent;
  console.log('Stock mostrado:', value);
  // ✅ Debe ser un número entero (sin decimales)
}
```

---

## 🏭 4. VERIFICACIÓN DEL MÓDULO DE PROVEEDORES

### Test 4.1: Acceso al Módulo
```bash
1. Login como administrador
2. En menú superior, buscar botón "Proveedores"
✅ DEBE APARECER al final del menú admin
3. Click en "Proveedores"
✅ DEBE CARGAR página: /admin/proveedores
```

### Test 4.2: Crear Proveedor
```bash
1. URL: /admin/proveedores
2. Click "+ Nuevo Proveedor"
3. Rellenar formulario:
   - Nombre: "Distribuidora Test" ← OBLIGATORIO
   - Contacto: "Juan Pérez"
   - Teléfono: "+34 912 345 678"
   - Email: "test@distribuidora.com"
4. Click "Crear Proveedor"
✅ Debe mostrar: "Proveedor creado correctamente."
✅ Debe redirigir a: /admin/proveedores
✅ Debe aparecer en lista
```

### Test 4.3: Editar Proveedor
```bash
1. En lista de proveedores, click "Editar" (amarillo)
2. Modificar email a: "newemail@distribuidora.com"
3. Click "Actualizar Proveedor"
✅ Debe mostrar: "Proveedor actualizado correctamente."
✅ Lista debe reflejar cambios
```

### Test 4.4: Gestionar Ingredientes
```bash
1. En lista, click "Ingredientes" (azul) de proveedor creado
2. En columna derecha, dropdown: Seleccionar ingrediente (ej: Tomate)
3. Costo Unitario: 0.35
4. Click "Agregar Ingrediente"
✅ Debe mostrar: "Ingrediente agregado al proveedor."
✅ Debe aparecer en tabla izquierda
```

### Test 4.5: Actualizar Costo
```bash
1. En tabla izquierda (ingredientes vinculados)
2. Modificar costo de 0.35 a 0.42
3. Click "Guardar"
✅ Debe mostrar: "Costo actualizado."
```

### Test 4.6: Remover Ingrediente
```bash
1. En tabla izquierda, click "Remover" (rojo)
2. Confirmar: "¿Remover este ingrediente?"
✅ Debe mostrar: "Ingrediente removido del proveedor."
✅ Debe desaparecer de tabla
```

### Test 4.7: Eliminar Proveedor
```bash
1. Volver a /admin/proveedores
2. Click "Eliminar" (rojo) en proveedor creado
3. Confirmar: "¿Eliminar este proveedor?"
✅ Debe mostrar: "Proveedor eliminado correctamente."
✅ Debe desaparecer de lista
```

### Test 4.8: Búsqueda de Proveedores
```bash
1. Crear varios proveedores:
   - "Distribuidora López"
   - "Lácteos del Norte"
   - "Carnes Selectas"
2. Campo búsqueda: "López"
✅ Debe mostrar solo: "Distribuidora López"
3. Campo búsqueda: "lacteos"
✅ Debe mostrar solo: "Lácteos del Norte"
```

---

## 💾 5. VERIFICACIÓN DE BD

### Test 5.1: Tablas Existen
```sql
-- Ejecutar en SQLite:
SELECT name FROM sqlite_master WHERE type='table' AND name IN ('suppliers', 'supplier_ingredients', 'low_stock_alerts');
```
✅ DEBE RETORNAR 3 filas

### Test 5.2: Estructura de Suppliers
```sql
PRAGMA table_info(suppliers);
```
✅ DEBE TENER: id, name (UNIQUE), contact_info, phone, email, created_at, updated_at

### Test 5.3: Estructura de Supplier_Ingredients
```sql
PRAGMA table_info(supplier_ingredients);
```
✅ DEBE TENER: id, supplier_id, ingredient_id, unit_cost, created_at, updated_at

### Test 5.4: Estructura de Low_Stock_Alerts
```sql
PRAGMA table_info(low_stock_alerts);
```
✅ DEBE TENER: id, ingredient_id, audit_id, triggered_by_user_id, physical_stock, min_stock, status, etc.

### Test 5.5: Foreign Keys Activos
```sql
PRAGMA foreign_keys;
```
✅ DEBE RETORNAR: 1 (activas)

### Test 5.6: Integridad Referencial
```sql
-- Intentar crear relación con proveedor inexistente:
INSERT INTO supplier_ingredients (supplier_id, ingredient_id, unit_cost) 
VALUES (99999, 1, 10);
```
✅ DEBE FALLAR (Foreign Key Constraint)

---

## 🖥️ 6. VERIFICACIÓN DE VISTAS

### Test 6.1: Menu Actualizado
```bash
1. Ir a: /admin/dashboard (como admin)
2. Verificar menú superior
✅ DEBE TENER botón "Proveedores" al final
```

### Test 6.2: Dashboard Admin Actualizado
```bash
1. Ir a: /admin/dashboard
2. Verificar tarjeta "Bajo stock (Alertas)"
✅ DEBE MOSTRAR contador de alertas activas
```

### Test 6.3: Dashboard Empleado Actualizado
```bash
1. Ir a: /empleado/dashboard
2. En tabla de alertas de bajo stock
✅ DEBE MOSTRAR stock_physical con base_unit (ej: "45.50 g")
```

### Test 6.4: Inventario Empleado Actualizado
```bash
1. Ir a: /empleado/inventario
2. Columna "Stock Físico"
✅ DEBE MOSTRAR stock_physical con base_unit
✅ NO debe mostrar campo "quantity"
```

### Test 6.5: Vistas de Proveedores
```bash
1. /admin/proveedores
   ✅ Debe cargar tabla con proveedores
2. /admin/proveedores/nuevo
   ✅ Debe mostrar formulario
3. /admin/proveedores/:id/ingredientes
   ✅ Debe mostrar gestión de ingredientes
```

---

## 📊 7. VERIFICACIÓN DE PRECISIÓN MATEMÁTICA

### Test Completo de Conversión
```javascript
// Test suite completo
const tests = [
  { quantity: 1, from: 'kg', to: 'g', expected: 1000 },
  { quantity: 5, from: 'kg', to: 'g', expected: 5000 },
  { quantity: 0.5, from: 'L', to: 'ml', expected: 500 },
  { quantity: 2500, from: 'g', to: 'kg', expected: 2.5 },
  { quantity: 1500, from: 'ml', to: 'L', expected: 1.5 },
];

tests.forEach(test => {
  const result = unitConverter.convert(test.quantity, test.from, test.to);
  if (result !== test.expected) {
    console.error(`FAIL: ${test.quantity} ${test.from} → ${test.to}. Expected ${test.expected}, got ${result}`);
  } else {
    console.log(`✅ PASS: ${test.quantity} ${test.from} → ${test.to} = ${result}`);
  }
});
```
✅ TODOS deben pasar

---

## 🎯 RESUMEN DE VERIFICACIÓN

| Característica | Test | Estado |
|---|---|---|
| Conversión kg→g | 5 kg = 5000 g | [ ] |
| Conversión g→kg | 5000 g = 5 kg | [ ] |
| Conversión L→ml | 2.5 L = 2500 ml | [ ] |
| Conversión ml→L | 2500 ml = 2.5 L | [ ] |
| Alerta cuando stock < min | Crea automáticamente | [ ] |
| Alerta se resuelve | Cuando stock >= min | [ ] |
| Redondeo Math.ceil | 3.2 → 4 en vista | [ ] |
| CRUD Proveedores | Crear/Editar/Eliminar | [ ] |
| Relación Proveedor-Ingredientes | Vincular y costo | [ ] |
| Búsqueda Proveedores | Filtra por datos | [ ] |
| Vistas Actualizadas | Menu, Dashboard, Inventory | [ ] |
| Integridad BD | Foreign keys activos | [ ] |

---

## 🚀 DESPUÉS DE VERIFICAR TODO

Una vez que todos los checkpoints ✅ pasen:

1. ✅ El sistema está listo para producción
2. ✅ Puedes entrenar a los usuarios
3. ✅ Puedes migrar datos históricos
4. ✅ Puedes activar en producción

---

## 📞 TROUBLESHOOTING

### Problema: Las tablas no se crean

**Solución**:
```bash
1. Verificar que initDb.js se ejecute: 
   - npm start
   - Debe ejecutar initDb() automáticamente
2. Verificar que database.sqlite se cree
3. Revisar logs para errores SQL
```

### Problema: Botón Proveedores no aparece

**Solución**:
```bash
1. Verificar que sea usuario admin
2. Limpiar cache del navegador (Ctrl+F5)
3. Revisar menu.ejs está actualizado
```

### Problema: Alertas no se crean

**Solución**:
```bash
1. Verificar que stock_physical < min_stock
2. Revisar que low_stock_alerts tabla existe
3. Revisar logs del servidor (console.log)
```

### Problema: Conversiones incorrectas

**Solución**:
```bash
1. Verificar que unitConverter.js tiene cambios
2. Reiniciar servidor (npm start)
3. Probar conversión en consola
```

---

**Checklist creado**: 2026-05-28
**Versión**: 1.0
**Objetivo**: Validación Pre-Producción

Marca cada checkbox [ ] cuando verifiques cada funcionalidad.
