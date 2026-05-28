# GUÍA RÁPIDA - Módulo de Proveedores

## 📌 Acceso al Módulo

**Usuarios autorizados**: Administradores únicamente

**Ruta**: Menu Principal → Botón "Proveedores" (al final del menú admin)

**URL Directa**: `/admin/proveedores`

---

## 🎯 Operaciones Principales

### 1️⃣ CREAR UN NUEVO PROVEEDOR

1. Click en **"+ Nuevo Proveedor"** (botón azul)
2. Completa los datos:
   - **Nombre** *(requerido)*: Ej: "Distribuidora López"
   - **Contacto**: Ej: "Juan García" (persona de contacto)
   - **Teléfono**: Ej: "+34 912 345 678"
   - **Email**: Ej: "contacto@distribulorialopez.com"
3. Click en **"Crear Proveedor"**

✅ Verás mensaje: "Proveedor creado correctamente."

---

### 2️⃣ EDITAR UN PROVEEDOR

1. En listado de proveedores, click en botón **"Editar"** (amarillo)
2. Modifica los campos necesarios
3. Click en **"Actualizar Proveedor"**

✅ Verás mensaje: "Proveedor actualizado correctamente."

---

### 3️⃣ ELIMINAR UN PROVEEDOR

1. En listado de proveedores, click en botón **"Eliminar"** (rojo)
2. Se pedirá confirmación: "¿Eliminar este proveedor?"
3. Click en "Sí"

⚠️ **Nota**: Al eliminar un proveedor, se eliminarán automáticamente sus relaciones con ingredientes (supplier_ingredients).

---

### 4️⃣ GESTIONAR INGREDIENTES DE UN PROVEEDOR

#### Ver Ingredientes Vinculados:

1. En listado de proveedores, click en **"Ingredientes"** (azul)
2. Verás tabla izquierda con ingredientes ya vinculados
3. Cada ingrediente muestra su "Costo Unitario"

#### Agregar Ingrediente:

1. En la columna derecha, selecciona un ingrediente del dropdown
2. Ingresa el **Costo Unitario** (opcional, puedes dejarlo en blanco)
3. Click en **"Agregar Ingrediente"**

✅ Verás mensaje: "Ingrediente agregado al proveedor."

#### Actualizar Costo Unitario:

1. En tabla de ingredientes vinculados (izquierda)
2. Modifica el valor en campo "Costo Unitario"
3. Click en botón **"Guardar"** de esa fila

✅ Verás mensaje: "Costo actualizado."

#### Remover Ingrediente:

1. En tabla de ingredientes (izquierda)
2. Click en botón **"Remover"** (rojo)
3. Confirma: "¿Remover este ingrediente?"

✅ Verás mensaje: "Ingrediente removido del proveedor."

---

## 🔍 BÚSQUEDA Y FILTRADO

**En listado de Proveedores**:

- Campo: "Buscar por nombre, email o teléfono..."
- Busca en tiempo real
- Limpia resultados con botón "Limpiar"

**Ejemplo búsquedas**:
- "López" → Busca proveedores con ese nombre
- "juan@" → Busca por email
- "912" → Busca por teléfono

---

## 💡 CASOS DE USO

### Caso 1: Registrar Proveedor Nuevo

```
Admin: "Necesito agregar a Distribuidora Central"
↓
1. Click "Nuevo Proveedor"
2. Nombre: "Distribuidora Central"
3. Contacto: "María Rodríguez"
4. Teléfono: "+34 911 222 333"
5. Email: "central@distrib.es"
6. Click "Crear Proveedor"
↓
✅ Proveedor creado y disponible para vincular ingredientes
```

### Caso 2: Vincular Ingredientes a Proveedor

```
Admin: "Este proveedor surte queso mozzarella a €8.50/kg"
↓
1. Click "Ingredientes" en el proveedor
2. Dropdown: Selecciona "Queso mozzarella"
3. Costo: 8.50
4. Click "Agregar Ingrediente"
↓
✅ Ahora el sistema sabe que Distribuidora Central vende queso a €8.50
```

### Caso 3: Comparar Costos de Proveedores

```
Admin: "¿Quién es más barato para tomate?"
↓
1. Proveedor A → Ingredientes → Tomate → €0.35/kg
2. Proveedor B → Ingredientes → Tomate → €0.42/kg
↓
✅ Proveedor A es más económico (€0.07 menos por kg)
```

---

## ⚙️ CAMPOS DE LA BASE DE DATOS

### Tabla `suppliers`:
```
id: Identificador único (auto-incremental)
name: Nombre del proveedor (UNIQUE - no hay duplicados)
contact_info: Nombre de persona de contacto
phone: Número de teléfono
email: Email del proveedor
created_at: Fecha de creación (automática)
updated_at: Fecha de última actualización (automática)
```

### Tabla `supplier_ingredients`:
```
id: Identificador único (auto-incremental)
supplier_id: ID del proveedor (FK)
ingredient_id: ID del ingrediente (FK)
unit_cost: Costo unitario en la unidad base del ingrediente
           (Ej: €8.50 para 1000g de queso)
created_at: Fecha de asociación
updated_at: Fecha de último cambio de costo
```

---

## 🔐 SEGURIDAD Y VALIDACIONES

✅ **Solo administradores** pueden acceder a este módulo

✅ **Validación de datos**:
- Nombre de proveedor es requerido y único
- Email y teléfono son opcionales
- Costo unitario es número decimal

✅ **Integridad referencial**:
- No se puede eliminar un ingrediente si está vinculado a un proveedor
- Al eliminar proveedor, se eliminan automáticamente sus ingredientes

✅ **Mensajes de error**:
- "Proveedor no encontrado" - Si tries acceder a un ID inválido
- "Error al crear proveedor: [detalles]" - Si hay problema en validación

---

## 📊 DATOS DE EJEMPLO

Para probar rápidamente, puedes crear:

**Proveedor 1: Distribuidora Central**
- Contacto: Juan Pérez
- Teléfono: +34 911 111 111
- Email: juan@distrib-central.es
- Ingredientes:
  - Queso mozzarella: €8.50/kg
  - Tomate: €0.35/kg
  - Pechuga pollo: €5.99/kg

**Proveedor 2: Lácteos del Norte**
- Contacto: María López
- Teléfono: +34 943 222 222
- Email: maria@lacteos-norte.es
- Ingredientes:
  - Queso mozzarella: €7.99/kg
  - Leche entera: €0.89/L

---

## 🔗 INTEGRACIÓN FUTURA

El módulo de proveedores está listo para integrarse con:

1. **Movimientos de Entrada**: Registrar qué proveedor surte cada compra
2. **Órdenes de Compra**: Crear órdenes automáticas desde aquí
3. **Reportes de Costos**: Análisis de gastos por proveedor
4. **Auditoría de Cambios**: Historial de variaciones de precios

---

## 📞 SOPORTE

Si encuentras problemas:

1. Verifica que seas **administrador**
2. Comprueba que los **datos sean válidos** (nombre no vacío)
3. Revisa los **mensajes de error** que aparecen en pantalla
4. Consulta los **logs** del servidor si hay error 500

---

**Última actualización**: 2026-05-28
**Versión**: 1.0
**Estado**: ✅ Producción
