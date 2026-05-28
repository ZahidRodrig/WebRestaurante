# MIGRACIONES DE BD - Documentación Técnica

## 📋 Resumen de Cambios

Se agregaron **2 nuevas tablas** a la base de datos:
1. `low_stock_alerts` - Sistema de alertas de bajo stock
2. `suppliers` - Gestión de proveedores
3. `supplier_ingredients` - Relación proveedores-ingredientes

**Base de datos**: SQLite (better-sqlite3)
**Status**: Se crean automáticamente en `initDb.js` si no existen

---

## 🗂️ TABLA 1: `low_stock_alerts`

### Propósito
Rastrear todas las alertas de bajo stock generadas en auditorías. Permite historial y gestión de alertas.

### Definición SQL
```sql
CREATE TABLE IF NOT EXISTS low_stock_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ingredient_id INTEGER NOT NULL,
  audit_id INTEGER,
  triggered_by_user_id INTEGER,
  physical_stock REAL NOT NULL,
  min_stock REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'acknowledged', 'resolved')),
  acknowledged_by_user_id INTEGER,
  acknowledged_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  resolved_at DATETIME,
  FOREIGN KEY (ingredient_id) REFERENCES ingredients(id) ON DELETE RESTRICT,
  FOREIGN KEY (audit_id) REFERENCES inventory_audits(id) ON DELETE SET NULL,
  FOREIGN KEY (triggered_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (acknowledged_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);
```

### Campos

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | INTEGER PK | Identificador único, auto-incremental |
| `ingredient_id` | INTEGER FK | Referencia al ingrediente (obligatorio) |
| `audit_id` | INTEGER FK | Auditoría que disparó la alerta (nullable) |
| `triggered_by_user_id` | INTEGER FK | Usuario que registró la auditoría |
| `physical_stock` | REAL | Stock físico al momento de alerta |
| `min_stock` | REAL | Stock mínimo configurado |
| `status` | TEXT | 'active' \| 'acknowledged' \| 'resolved' |
| `acknowledged_by_user_id` | INTEGER FK | Usuario que reconoció la alerta |
| `acknowledged_at` | DATETIME | Cuándo se reconoció |
| `created_at` | DATETIME | Cuándo se creó la alerta |
| `resolved_at` | DATETIME | Cuándo se resolvió |

### Restricciones
- `ingredient_id` es obligatorio (ON DELETE RESTRICT previene eliminación de ingredientes)
- `status` solo puede ser: 'active', 'acknowledged', 'resolved'
- `created_at` se establece automáticamente

### Flujo de Estados
```
created_at → status = 'active'
   ↓
[Admin reconoce] → status = 'acknowledged' + acknowledged_at + acknowledged_by_user_id
   ↓
[Stock sube] → status = 'resolved' + resolved_at
```

### Índices Recomendados (futuros)
```sql
CREATE INDEX idx_alerts_ingredient ON low_stock_alerts(ingredient_id);
CREATE INDEX idx_alerts_status ON low_stock_alerts(status);
CREATE INDEX idx_alerts_created ON low_stock_alerts(created_at DESC);
```

---

## 🗂️ TABLA 2: `suppliers`

### Propósito
Almacenar información de proveedores: nombre, contacto, teléfono, email.

### Definición SQL
```sql
CREATE TABLE IF NOT EXISTS suppliers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  contact_info TEXT,
  phone TEXT,
  email TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Campos

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | INTEGER PK | Identificador único |
| `name` | TEXT | Nombre del proveedor (único, obligatorio) |
| `contact_info` | TEXT | Nombre de persona de contacto (opcional) |
| `phone` | TEXT | Teléfono (opcional) |
| `email` | TEXT | Email (opcional) |
| `created_at` | DATETIME | Fecha de creación |
| `updated_at` | DATETIME | Fecha última modificación |

### Restricciones
- `name` es UNIQUE (no hay proveedores duplicados)
- `name` es TEXT NOT NULL (obligatorio)
- Otros campos son opcionales

### Relaciones
- **1 a N**: Un proveedor puede suministrar múltiples ingredientes
- **Tabla intermedia**: `supplier_ingredients`

### Índices Recomendados (futuros)
```sql
CREATE INDEX idx_suppliers_name ON suppliers(name);
CREATE INDEX idx_suppliers_email ON suppliers(email);
```

---

## 🗂️ TABLA 3: `supplier_ingredients`

### Propósito
Tabla intermedia que relaciona proveedores con ingredientes que suministran, incluyendo costo unitario.

### Definición SQL
```sql
CREATE TABLE IF NOT EXISTS supplier_ingredients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier_id INTEGER NOT NULL,
  ingredient_id INTEGER NOT NULL,
  unit_cost REAL NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE,
  FOREIGN KEY (ingredient_id) REFERENCES ingredients(id) ON DELETE CASCADE,
  UNIQUE(supplier_id, ingredient_id)
);
```

### Campos

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | INTEGER PK | Identificador único |
| `supplier_id` | INTEGER FK | ID del proveedor |
| `ingredient_id` | INTEGER FK | ID del ingrediente |
| `unit_cost` | REAL | Costo unitario en moneda |
| `created_at` | DATETIME | Fecha de vinculación |
| `updated_at` | DATETIME | Fecha última actualización de costo |

### Restricciones
- **UNIQUE(supplier_id, ingredient_id)**: Un proveedor no puede aparecer 2x para el mismo ingrediente
- **ON DELETE CASCADE**: Si elimina proveedor o ingrediente, se elimina la relación
- `unit_cost` es REAL NOT NULL (obligatorio)

### Ejemplo de Datos
```
supplier_id=1 (Distribuidora López)
ingredient_id=5 (Queso mozzarella, base_unit=g)
unit_cost=8.50  (€8.50 por 1000g)

supplier_id=1 (Distribuidora López)
ingredient_id=8 (Tomate, base_unit=g)
unit_cost=0.35  (€0.35 por 1000g)

supplier_id=2 (Lácteos del Norte)
ingredient_id=5 (Queso mozzarella)
unit_cost=7.99  (€7.99 por 1000g) ← Más barato
```

### Índices Recomendados (futuros)
```sql
CREATE INDEX idx_supplier_ing_supplier ON supplier_ingredients(supplier_id);
CREATE INDEX idx_supplier_ing_ingredient ON supplier_ingredients(ingredient_id);
```

---

## 🔄 RELACIONES ENTRE TABLAS

```
┌─────────────┐
│  suppliers  │
│   (1)       │
└──────┬──────┘
       │ (1 a N)
       │
    supplier_ingredients
       │
       │ (N a 1)
┌──────┴──────┐
│ ingredients │
│   (N)       │
└─────────────┘
       │
       │ (1 a N) referencia en:
       │ - inventory_audits
       │ - recipe_ingredients
       │ - movements
       │ - low_stock_alerts
       │
    [otras tablas]
```

### Cardinalidad
- **1 Proveedor → N Ingredientes**: Un proveedor puede suministrar múltiples ingredientes
- **1 Ingrediente → N Proveedores**: Un ingrediente puede ser suministrado por múltiples proveedores
- **M:N**: Relación muchos-a-muchos a través de `supplier_ingredients`

---

## 📝 QUERIES ÚTILES

### Obtener Todos los Proveedores de un Ingrediente

```sql
SELECT s.*, si.unit_cost
FROM suppliers s
JOIN supplier_ingredients si ON s.id = si.supplier_id
WHERE si.ingredient_id = ?
ORDER BY si.unit_cost ASC;
```

### Comparar Costos de Proveedores para un Ingrediente

```sql
SELECT 
  s.name,
  s.phone,
  s.email,
  si.unit_cost,
  i.base_unit
FROM suppliers s
JOIN supplier_ingredients si ON s.id = si.supplier_id
JOIN ingredients i ON si.ingredient_id = i.id
WHERE i.id = ?
ORDER BY si.unit_cost ASC;
```

### Obtener Ingredientes Ofrecidos por un Proveedor

```sql
SELECT i.*, si.unit_cost
FROM ingredients i
JOIN supplier_ingredients si ON i.id = si.ingredient_id
WHERE si.supplier_id = ?
ORDER BY i.name;
```

### Contar Alertas Activas por Ingrediente

```sql
SELECT 
  i.name,
  COUNT(lsa.id) as alert_count
FROM ingredients i
LEFT JOIN low_stock_alerts lsa ON i.id = lsa.ingredient_id 
  AND lsa.status = 'active'
GROUP BY i.id
HAVING alert_count > 0;
```

### Listar Todas las Alertas Activas con Detalles

```sql
SELECT 
  lsa.id,
  i.name AS ingredient,
  lsa.physical_stock,
  lsa.min_stock,
  (lsa.min_stock - lsa.physical_stock) AS deficit,
  u.name AS triggered_by,
  lsa.created_at
FROM low_stock_alerts lsa
JOIN ingredients i ON lsa.ingredient_id = i.id
JOIN users u ON lsa.triggered_by_user_id = u.id
WHERE lsa.status = 'active'
ORDER BY lsa.created_at DESC;
```

---

## 🚀 MIGRACIONES AUTOMÁTICAS

Las tablas se crean automáticamente en el método `initDb()` del archivo:
- **Ubicación**: `backend/src/models/initDb.js`
- **Trigger**: Se ejecuta al iniciar la aplicación
- **Seguridad**: Usa `CREATE TABLE IF NOT EXISTS` (idempotente)

### Flujo de Inicialización

```
1. require("../models/initDb") en app.js
   ↓
2. initDb() ejecuta PRAGMA foreign_keys = ON
   ↓
3. CREATE TABLE IF NOT EXISTS para cada tabla
   ↓
4. Si es primera vez, inserta datos de demo:
   - 2 usuarios (admin, empleado)
   - 3 categorías
   - 5 ingredientes
   - 3 menús
   - Relaciones de recetas
   ↓
5. Aplicación lista para usar
```

---

## ⚠️ CONSIDERACIONES IMPORTANTES

### 1. Integridad Referencial
- `PRAGMA foreign_keys = ON` está activo
- No se puede eliminar ingrediente si tiene alertas (RESTRICT)
- Al eliminar proveedor, se eliminan sus ingredientes vinculados (CASCADE)

### 2. Timestamp Automático
- `created_at` se establece con `DEFAULT CURRENT_TIMESTAMP`
- `updated_at` debe ser actualizado manualmente en UPDATE (futura mejora)

### 3. Precisión de Datos
- `unit_cost` es REAL (punto flotante) - aceptable para dinero con 2 decimales
- `physical_stock` y `min_stock` son REAL - precisión garantizada por unitConverter.js

### 4. Escalabilidad
- Índices recomendados no están creados (mejor hacerlo en migración formal)
- Las queries pueden optimizarse si hay millones de registros

---

## 🔧 PRÓXIMAS MEJORAS (Futuros)

1. **Audit Log**:
   - Registrar quién modificó cada proveedor y cuándo
   - Historial de cambios de precios

2. **Performance**:
   - Crear índices en foreign keys
   - Vistas (VIEWs) para queries complejas

3. **Funcionalidad**:
   - Tabla `purchase_orders` para órdenes de compra
   - Tabla `supplier_delivery_history` para rastrear entregas
   - Calificación de proveedores

4. **Data Integrity**:
   - Usar `updated_at` automáticamente en actualizaciones
   - Soft deletes para proveedores

---

## 📊 Estadísticas Iniciales

Después de `initDb()`:

| Tabla | Registros |
|-------|-----------|
| `suppliers` | 0 (vacío, se agregan manual) |
| `supplier_ingredients` | 0 (vacío, se agregan manual) |
| `low_stock_alerts` | 0 (se generan con auditorías) |

Tablas existentes (no modificadas):
| Tabla | Registros |
|-------|-----------|
| `users` | 2 (admin, empleado) |
| `categories` | 3 |
| `ingredients` | 5 |
| `menu_items` | 3 |
| `recipe_ingredients` | 3 |
| `movements` | 5 (carga inicial) |

---

**Documentación completa**: 2026-05-28
**Schema versión**: 3.0
**Compatibilidad**: SQLite 3.8+, better-sqlite3 9.0+
