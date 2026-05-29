const express = require("express");
const usersDb = require("../config/usersDb");
const inventoryDb = require("../config/inventoryDb");
const upload = require("../middleware/upload");
const { ensureRole } = require("../middleware/auth");
const unitConverter = require("../helpers/unitConverter");

function safeToBaseUnit(quantity, unit) {
  try {
    return unitConverter.toBaseUnit(Number(quantity), unit);
  } catch (e) {
    return Number(quantity);
  }
}

function safeFromBaseUnit(quantity, unit) {
  try {
    return unitConverter.fromBaseUnit(Number(quantity), unit);
  } catch (e) {
    return Number(quantity);
  }
}

function handleUpload(fieldName) {
  return (req, res, next) => {
    upload.single(fieldName)(req, res, (err) => {
      if (err) {
        req.session.error = err.message;
        const isEdit = req.path.includes("/editar");
        const redirectUrl = isEdit
          ? `/admin/menu/${req.params.id}/editar`
          : "/admin/menu/nuevo";
        return res.redirect(redirectUrl);
      }
      next();
    });
  };
}

const router = express.Router();
router.use(ensureRole("admin"));

const COUNTRY_CODES = [
  "+502",
  "+52",
  "+34",
  "+1",
  "+55",
  "+54",
  "+56",
  "+57",
  "+51",
  "+44",
  "+33",
  "+49",
  "+39",
  "+61",
  "+81",
];

function toArray(value) {
  if (value === undefined || value === null || value === "") return [];
  return Array.isArray(value) ? value : [value];
}

function parsePhone(fullPhone) {
  if (!fullPhone) return { country_code: "+52", number: "" };
  const str = String(fullPhone).trim();
  const code = COUNTRY_CODES.find((c) => str.startsWith(c));
  if (code) {
    return { country_code: code, number: str.slice(code.length).replace(/\D/g, "") };
  }
  return { country_code: "+52", number: str.replace(/\D/g, "") };
}

function buildFullPhone(countryCode, phone) {
  const number = (phone || "").replace(/\D/g, "");
  if (!number) return null;
  return `${countryCode || ""}${number}`;
}

async function saveRecipeRelations(menuItemId, ingredientIds, quantities, steps) {
  await inventoryDb.run("DELETE FROM recipe_ingredients WHERE menu_item_id = ?", [menuItemId]);
  await inventoryDb.run("DELETE FROM recipe_steps WHERE menu_item_id = ?", [menuItemId]);

  for (let i = 0; i < ingredientIds.length; i++) {
    const ingId = ingredientIds[i];
    const qty = quantities[i];
    if (ingId && qty !== undefined && qty !== "") {
      await inventoryDb.run(
        `
        INSERT INTO recipe_ingredients (menu_item_id, ingredient_id, quantity_required)
        VALUES (?, ?, ?)
        `,
        [menuItemId, ingId, Number(qty)]
      );
    }
  }

  const stepList = steps.map((s) => String(s || "").trim()).filter(Boolean);
  for (let i = 0; i < stepList.length; i++) {
    await inventoryDb.run(
      `
      INSERT INTO recipe_steps (menu_item_id, step_order, description)
      VALUES (?, ?, ?)
      `,
      [menuItemId, i + 1, stepList[i]]
    );
  }
}

async function saveSupplierIngredients(supplierId, ingredientIds, costs) {
  await inventoryDb.run("DELETE FROM supplier_ingredients WHERE supplier_id = ?", [supplierId]);
  for (let i = 0; i < ingredientIds.length; i++) {
    const ingId = ingredientIds[i];
    if (ingId) {
      await inventoryDb.run(
        `
        INSERT INTO supplier_ingredients (supplier_id, ingredient_id, unit_cost)
        VALUES (?, ?, ?)
        `,
        [supplierId, ingId, Number(costs[i]) || 0]
      );
    }
  }
}

router.get("/dashboard", async (req, res) => {
  const summary = await inventoryDb.get(
    `
    SELECT
      (SELECT COUNT(*) FROM ingredients) AS totalIngredients,
      (SELECT COUNT(*) FROM categories) AS totalCategories,
      (SELECT COUNT(*) FROM users) AS totalUsers,
      (SELECT COUNT(*) FROM movements) AS totalMovements,
      (SELECT COUNT(*) FROM low_stock_alerts WHERE status = 'active') AS lowStockCount,
      (
        SELECT COUNT(*) FROM ingredients i
        WHERE NOT EXISTS (
          SELECT 1 FROM inventory_audits ia WHERE ia.ingredient_id = i.id
        )
      ) AS unauditedCount
  `
  );

  const lowStock = await inventoryDb.all(
    `
    SELECT i.*, c.name AS category_name
    FROM ingredients i
    JOIN categories c ON c.id = i.category_id
    WHERE i.stock_physical < i.min_stock
      AND EXISTS (
        SELECT 1 FROM inventory_audits ia WHERE ia.ingredient_id = i.id
      )
    ORDER BY i.name
  `
  );

  const unauditedIngredients = await inventoryDb.all(
    `
    SELECT i.*, c.name AS category_name
    FROM ingredients i
    JOIN categories c ON c.id = i.category_id
    WHERE NOT EXISTS (
      SELECT 1 FROM inventory_audits ia WHERE ia.ingredient_id = i.id
    )
    ORDER BY i.created_at DESC, i.name
  `
  );

  res.render("admin/dashboard", {
    title: "Panel administrador",
    summary,
    lowStock,
    unauditedIngredients,
  });
});

router.get("/ingredientes", async (req, res) => {
  const search = req.query.search ? req.query.search.trim() : "";
  const category = req.query.category || "";

  let sql = `
    SELECT
      i.*,
      c.name AS category_name,
      EXISTS (SELECT 1 FROM inventory_audits ia WHERE ia.ingredient_id = i.id) AS has_audit
    FROM ingredients i
    JOIN categories c ON c.id = i.category_id
    WHERE 1 = 1
  `;
  const params = [];

  if (search) {
    sql += " AND i.name LIKE ? ";
    params.push(`%${search}%`);
  }
  if (category) {
    sql += " AND c.id = ? ";
    params.push(category);
  }
  sql += " ORDER BY i.name";

  const ingredients = await inventoryDb.all(sql, params);
  const categories = await inventoryDb.all("SELECT * FROM categories ORDER BY name");

  res.render("admin/ingredients", {
    title: "Ingredientes",
    ingredients,
    categories,
    filters: { search, category },
  });
});

router.get("/ingredientes/nuevo", async (req, res) => {
  const categories = await inventoryDb.all("SELECT * FROM categories ORDER BY name");
  res.render("admin/ingredient-form", {
    title: "Nuevo ingrediente",
    categories,
    ingredient: null,
  });
});

router.post("/ingredientes", async (req, res) => {
  const { name, category_id, quantity, unit, min_stock } = req.body;
  const qtyNumber = Number(quantity);
  const stockBase = safeToBaseUnit(qtyNumber, unit);
  await inventoryDb.run(
    `
      INSERT INTO ingredients (name, category_id, quantity, unit, min_stock, stock_theoretical, stock_physical)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [name.trim(), category_id, qtyNumber, unit, Number(min_stock), stockBase, 0]
  );
  req.session.success = "Ingrediente creado correctamente.";
  res.redirect("/admin/ingredientes");
});

router.get("/ingredientes/:id/editar", async (req, res) => {
  const ingredient = await inventoryDb.get("SELECT * FROM ingredients WHERE id = ?", [req.params.id]);
  const categories = await inventoryDb.all("SELECT * FROM categories ORDER BY name");

  if (!ingredient) {
    req.session.error = "Ingrediente no encontrado.";
    res.redirect("/admin/ingredientes");
    return;
  }

  res.render("admin/ingredient-form", {
    title: "Editar ingrediente",
    categories,
    ingredient,
  });
});

router.post("/ingredientes/:id/editar", async (req, res) => {
  const { name, category_id, quantity, unit, min_stock } = req.body;
  const qtyNumber = Number(quantity);
  const stockBase = safeToBaseUnit(qtyNumber, unit);
  await inventoryDb.run(
    `
      UPDATE ingredients
      SET name = ?, category_id = ?, quantity = ?, unit = ?, min_stock = ?, stock_theoretical = ?
      WHERE id = ?
    `,
    [name.trim(), category_id, qtyNumber, unit, Number(min_stock), stockBase, req.params.id]
  );
  req.session.success = "Ingrediente actualizado.";
  res.redirect("/admin/ingredientes");
});

router.post("/ingredientes/:id/eliminar", async (req, res) => {
  await inventoryDb.run("DELETE FROM ingredients WHERE id = ?", [req.params.id]);
  req.session.success = "Ingrediente eliminado.";
  res.redirect("/admin/ingredientes");
});

router.get("/categorias", async (req, res) => {
  const categories = await inventoryDb.all(
    `
    SELECT c.*, COUNT(i.id) AS ingredients_count
    FROM categories c
    LEFT JOIN ingredients i ON i.category_id = c.id
    GROUP BY c.id
    ORDER BY c.name
  `
  );
  res.render("admin/categories", { title: "Categorias", categories });
});

router.post("/categorias", async (req, res) => {
  const { name } = req.body;
  await inventoryDb.run("INSERT INTO categories (name) VALUES (?)", [name.trim()]);
  req.session.success = "Categoria creada.";
  res.redirect("/admin/categorias");
});

router.post("/categorias/:id/editar", async (req, res) => {
  const { name } = req.body;
  await inventoryDb.run("UPDATE categories SET name = ? WHERE id = ?", [name.trim(), req.params.id]);
  req.session.success = "Categoria actualizada.";
  res.redirect("/admin/categorias");
});

router.post("/categorias/:id/eliminar", async (req, res) => {
  const used = await inventoryDb.get("SELECT id FROM ingredients WHERE category_id = ? LIMIT 1", [
    req.params.id,
  ]);
  if (used) {
    req.session.error = "No puedes eliminar una categoria con ingredientes asociados.";
    res.redirect("/admin/categorias");
    return;
  }

  await inventoryDb.run("DELETE FROM categories WHERE id = ?", [req.params.id]);
  req.session.success = "Categoria eliminada.";
  res.redirect("/admin/categorias");
});

router.get("/usuarios", async (req, res) => {
  const users = await usersDb.all(
    "SELECT id, name, email, role, created_at FROM users ORDER BY created_at DESC"
  );
  res.render("admin/users", { title: "Usuarios", users });
});

router.post("/usuarios/:id/rol", async (req, res) => {
  const { role } = req.body;
  if (!["admin", "empleado"].includes(role)) {
    req.session.error = "Rol invalido.";
    res.redirect("/admin/usuarios");
    return;
  }

  await usersDb.run("UPDATE users SET role = ? WHERE id = ?", [role, req.params.id]);
  req.session.success = "Rol actualizado.";
  res.redirect("/admin/usuarios");
});

router.get("/movimientos", async (req, res) => {
  const movements = await inventoryDb.all(
    `
    SELECT
      m.*,
      i.name AS ingredient_name,
      i.unit AS ingredient_unit,
      u.name AS user_name
    FROM movements m
    JOIN ingredients i ON i.id = m.ingredient_id
    JOIN users u ON u.id = m.user_id
    ORDER BY m.created_at DESC
  `
  );

  res.render("admin/movements", { title: "Historial de movimientos", movements });
});

router.post("/movimientos", async (req, res) => {
  const { type, ingredient_id, quantity, note } = req.body;
  const amount = Number(quantity);

  const ingredient = await inventoryDb.get("SELECT * FROM ingredients WHERE id = ?", [ingredient_id]);
  if (!ingredient) {
    req.session.error = "Ingrediente no encontrado.";
    res.redirect("/admin/ingredientes");
    return;
  }

  if (type === "salida" && ingredient.quantity < amount) {
    req.session.error = "Stock insuficiente para registrar salida.";
    res.redirect("/admin/ingredientes");
    return;
  }

  const newQuantity = type === "entrada" ? ingredient.quantity + amount : ingredient.quantity - amount;
  const newStockBase = safeToBaseUnit(newQuantity, ingredient.unit);

  await inventoryDb.run(
    "UPDATE ingredients SET quantity = ?, stock_theoretical = ? WHERE id = ?",
    [newQuantity, newStockBase, ingredient_id]
  );
  await inventoryDb.run(
    `
      INSERT INTO movements (type, ingredient_id, quantity, user_id, note)
      VALUES (?, ?, ?, ?, ?)
    `,
    [type, ingredient_id, amount, req.session.user.id, note || null]
  );

  req.session.success = "Movimiento registrado.";
  res.redirect("/admin/ingredientes");
});

// ========== ENDPOINTS AJAX CATEGORÍAS DE MENÚ (antes de rutas con :id) ==========

router.get("/categorias-menu", async (req, res) => {
  const categories = await inventoryDb.all("SELECT * FROM menu_categories ORDER BY name");
  res.json(categories);
});

router.post("/categorias-menu", async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: "El nombre es requerido" });
  }

  try {
    const result = await inventoryDb.run("INSERT INTO menu_categories (name) VALUES (?)", [
      name.trim(),
    ]);
    res.json({ success: true, id: result.lastID, name: name.trim() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put("/categorias-menu/:id", async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: "El nombre es requerido" });
  }

  try {
    await inventoryDb.run("UPDATE menu_categories SET name = ? WHERE id = ?", [name.trim(), req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete("/categorias-menu/:id", async (req, res) => {
  try {
    const used = await inventoryDb.get("SELECT id FROM menu_items WHERE menu_category_id = ? LIMIT 1", [
      req.params.id,
    ]);
    if (used) {
      return res.status(400).json({ error: "No puedes eliminar una categoría con platillos asociados" });
    }

    await inventoryDb.run("DELETE FROM menu_categories WHERE id = ?", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ========== RUTAS PARA MENÚ DE PLATILLOS ==========

router.get("/menu", async (req, res) => {
  const search = req.query.search ? req.query.search.trim() : "";
  const category = req.query.category || "";
  const minPrice = req.query.minPrice ? parseFloat(req.query.minPrice) : null;
  const maxPrice = req.query.maxPrice ? parseFloat(req.query.maxPrice) : null;

  let sql = `
    SELECT m.*, mc.name AS category_name, COUNT(ri.id) AS total_ingredients
    FROM menu_items m
    LEFT JOIN menu_categories mc ON mc.id = m.menu_category_id
    LEFT JOIN recipe_ingredients ri ON ri.menu_item_id = m.id
    WHERE 1 = 1
  `;
  const params = [];

  if (search) {
    sql += " AND m.name LIKE ? ";
    params.push(`%${search}%`);
  }
  if (category) {
    sql += " AND m.menu_category_id = ? ";
    params.push(category);
  }
  if (minPrice !== null) {
    sql += " AND m.price >= ? ";
    params.push(minPrice);
  }
  if (maxPrice !== null) {
    sql += " AND m.price <= ? ";
    params.push(maxPrice);
  }

  sql += " GROUP BY m.id ORDER BY m.name";

  const menuItems = await inventoryDb.all(sql, params);
  const menuCategories = await inventoryDb.all("SELECT * FROM menu_categories ORDER BY name");

  res.render("admin/menu", {
    title: "Menú de Platillos",
    menuItems,
    menuCategories,
    filters: { search, category, minPrice, maxPrice },
  });
});

router.get("/menu/nuevo", async (req, res) => {
  const menuCategories = await inventoryDb.all("SELECT * FROM menu_categories ORDER BY name");
  const ingredients = await inventoryDb.all("SELECT id, name, base_unit FROM ingredients ORDER BY name");
  res.render("admin/menu-form", {
    title: "Nuevo Platillo",
    menuItem: null,
    menuCategories,
    ingredients,
    recipeIngredients: [],
    recipeSteps: [],
  });
});

router.post("/menu", handleUpload("image"), async (req, res) => {
  const { name, description, price, prep_time_minutes, menu_category_id } = req.body;
  const imagePath = req.file ? req.file.filename : null;
  const ingredientIds = toArray(req.body.ingredient_ids);
  const quantities = toArray(req.body.ingredient_quantities);
  const steps = toArray(req.body.recipe_steps);

  try {
    await inventoryDb.run("BEGIN TRANSACTION");
    const result = await inventoryDb.run(
      `
      INSERT INTO menu_items (name, description, price, is_available, image_path, prep_time_minutes, menu_category_id)
      VALUES (?, ?, ?, 1, ?, ?, ?)
      `,
      [
        name.trim(),
        description?.trim() || null,
        Number(price),
        imagePath,
        parseInt(prep_time_minutes, 10) || 0,
        menu_category_id || null,
      ]
    );

    await saveRecipeRelations(result.lastID, ingredientIds, quantities, steps);
    await inventoryDb.run("COMMIT");

    req.session.success = "Platillo creado correctamente.";
    res.redirect("/admin/menu");
  } catch (err) {
    await inventoryDb.run("ROLLBACK");
    req.session.error = "Error al crear platillo: " + err.message;
    res.redirect("/admin/menu/nuevo");
  }
});

router.get("/menu/:id/editar", async (req, res) => {
  const menuItem = await inventoryDb.get("SELECT * FROM menu_items WHERE id = ?", [req.params.id]);
  const menuCategories = await inventoryDb.all("SELECT * FROM menu_categories ORDER BY name");
  const ingredients = await inventoryDb.all("SELECT id, name, base_unit FROM ingredients ORDER BY name");

  if (!menuItem) {
    req.session.error = "Platillo no encontrado.";
    res.redirect("/admin/menu");
    return;
  }

  const recipeIngredients = await inventoryDb.all(
    `
    SELECT ri.ingredient_id, ri.quantity_required, i.name, i.base_unit
    FROM recipe_ingredients ri
    JOIN ingredients i ON i.id = ri.ingredient_id
    WHERE ri.menu_item_id = ?
    ORDER BY i.name
    `,
    [req.params.id]
  );

  const recipeSteps = await inventoryDb.all(
    `
    SELECT id, step_order, description
    FROM recipe_steps
    WHERE menu_item_id = ?
    ORDER BY step_order
    `,
    [req.params.id]
  );

  res.render("admin/menu-form", {
    title: "Editar Platillo",
    menuItem,
    menuCategories,
    ingredients,
    recipeIngredients,
    recipeSteps,
  });
});

router.post("/menu/:id/editar", handleUpload("image"), async (req, res) => {
  const { name, description, price, prep_time_minutes, menu_category_id, is_available } = req.body;
  const ingredientIds = toArray(req.body.ingredient_ids);
  const quantities = toArray(req.body.ingredient_quantities);
  const steps = toArray(req.body.recipe_steps);

  const menuItem = await inventoryDb.get("SELECT * FROM menu_items WHERE id = ?", [req.params.id]);
  if (!menuItem) {
    req.session.error = "Platillo no encontrado.";
    res.redirect("/admin/menu");
    return;
  }

  const imagePath = req.file ? req.file.filename : menuItem.image_path;

  try {
    await inventoryDb.run("BEGIN TRANSACTION");
    await inventoryDb.run(
      `
      UPDATE menu_items
      SET name = ?, description = ?, price = ?, is_available = ?, image_path = ?, prep_time_minutes = ?, menu_category_id = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
      `,
      [
        name.trim(),
        description?.trim() || null,
        Number(price),
        is_available ? 1 : 0,
        imagePath,
        parseInt(prep_time_minutes, 10) || 0,
        menu_category_id || null,
        req.params.id,
      ]
    );

    await saveRecipeRelations(req.params.id, ingredientIds, quantities, steps);
    await inventoryDb.run("COMMIT");

    req.session.success = "Platillo actualizado.";
    res.redirect("/admin/menu");
  } catch (err) {
    await inventoryDb.run("ROLLBACK");
    req.session.error = "Error al actualizar platillo: " + err.message;
    res.redirect(`/admin/menu/${req.params.id}/editar`);
  }
});

router.post("/menu/:id/eliminar", async (req, res) => {
  await inventoryDb.run("DELETE FROM menu_items WHERE id = ?", [req.params.id]);
  req.session.success = "Platillo eliminado.";
  res.redirect("/admin/menu");
});

// ========== RUTAS PARA AUDITORÍA DE INVENTARIO ==========

router.get("/auditoria", async (req, res) => {
  const audits = await inventoryDb.all(
    `
    SELECT ia.*, i.name AS ingredient_name, i.base_unit, i.unit AS ingredient_unit, u.name AS user_name
    FROM inventory_audits ia
    JOIN ingredients i ON i.id = ia.ingredient_id
    JOIN users u ON u.id = ia.user_id
    ORDER BY ia.created_at DESC
  `
  );

  res.render("admin/audits", { title: "Auditoría de Inventario", audits });
});

router.get("/auditoria/nueva", async (req, res) => {
  const ingredients = await inventoryDb.all(
    "SELECT id, name, base_unit, stock_theoretical, stock_physical FROM ingredients ORDER BY name"
  );

  res.render("admin/audit-form", {
    title: "Nueva Auditoría",
    ingredients,
  });
});

router.post("/auditoria", async (req, res) => {
  const { ingredient_id, new_physical_stock } = req.body;

  const ingredient = await inventoryDb.get("SELECT * FROM ingredients WHERE id = ?", [ingredient_id]);
  if (!ingredient) {
    req.session.error = "Ingrediente no encontrado.";
    res.redirect("/admin/auditoria/nueva");
    return;
  }

  const newPhysical = Number(new_physical_stock);
  const variance = newPhysical - ingredient.stock_physical;

  // Registrar en auditoría
  const auditResult = await inventoryDb.run(
    `
    INSERT INTO inventory_audits (ingredient_id, user_id, previous_physical_stock, new_physical_stock, variance)
    VALUES (?, ?, ?, ?, ?)
    `,
    [ingredient_id, req.session.user.id, ingredient.stock_physical, newPhysical, variance]
  );

  // La auditoría es la fuente de verdad: sincronizamos stock_physical y quantity
  // (newPhysical viene en base_unit; lo convertimos a la unit del ingrediente para "quantity")
  const newQuantityUserUnit = safeFromBaseUnit(newPhysical, ingredient.unit);
  await inventoryDb.run(
    "UPDATE ingredients SET stock_physical = ?, quantity = ? WHERE id = ?",
    [newPhysical, newQuantityUserUnit, ingredient_id]
  );

  // LÓGICA DE ALERTAS: Disparar alerta si stock_physical < min_stock
  if (newPhysical < ingredient.min_stock) {
    // Verificar si ya existe una alerta activa para este ingrediente
    const existingAlert = await inventoryDb.get(
      "SELECT id FROM low_stock_alerts WHERE ingredient_id = ? AND status = 'active' LIMIT 1",
      [ingredient_id]
    );

    // Solo crear alerta si no existe una activa
    if (!existingAlert) {
      await inventoryDb.run(
        `
        INSERT INTO low_stock_alerts (ingredient_id, audit_id, triggered_by_user_id, physical_stock, min_stock)
        VALUES (?, ?, ?, ?, ?)
        `,
        [ingredient_id, auditResult.lastID, req.session.user.id, newPhysical, ingredient.min_stock]
      );
    }
  } else {
    // Si stock >= min_stock, resolver alertas activas anteriores
    await inventoryDb.run(
      "UPDATE low_stock_alerts SET status = 'resolved', resolved_at = CURRENT_TIMESTAMP WHERE ingredient_id = ? AND status = 'active'",
      [ingredient_id]
    );
  }

  req.session.success = "Auditoría registrada correctamente.";
  res.redirect("/admin/auditoria");
});

// ========== ACTUALIZAR DASHBOARD CON PANEL DE DISCREPANCIAS ==========

router.get("/discrepancias", async (req, res) => {
  const discrepancies = await inventoryDb.all(
    `
    SELECT 
      i.id,
      i.name,
      i.stock_theoretical,
      i.stock_physical,
      i.base_unit,
      i.unit AS ingredient_unit,
      ROUND((i.stock_physical - i.stock_theoretical) / NULLIF(i.stock_theoretical, 0) * 100, 2) AS variance_percentage,
      c.name AS category_name
    FROM ingredients i
    JOIN categories c ON c.id = i.category_id
    WHERE i.stock_theoretical > 0
      AND ABS(i.stock_physical - i.stock_theoretical) / NULLIF(i.stock_theoretical, 0) > 0.05
    ORDER BY variance_percentage DESC
  `
  );

  res.render("admin/discrepancies", { title: "Panel de Discrepancias", discrepancies });
});

// ========== RUTAS PARA MÓDULO DE PROVEEDORES ==========

router.get("/proveedores", async (req, res) => {
  const search = req.query.search ? req.query.search.trim() : "";
  
  let sql = "SELECT * FROM suppliers WHERE 1 = 1";
  const params = [];
  
  if (search) {
    sql += " AND (name LIKE ? OR email LIKE ? OR phone LIKE ?)";
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  
  sql += " ORDER BY name";
  
  const suppliers = await inventoryDb.all(sql, params);
  
  res.render("admin/suppliers", {
    title: "Proveedores",
    suppliers,
    filters: { search },
  });
});

router.get("/proveedores/nuevo", async (req, res) => {
  const ingredients = await inventoryDb.all("SELECT id, name FROM ingredients ORDER BY name");
  res.render("admin/supplier-form", {
    title: "Nuevo Proveedor",
    supplier: null,
    ingredients,
    linkedIngredients: [],
    phoneData: { country_code: "+52", number: "" },
  });
});

router.post("/proveedores", async (req, res) => {
  const { name, contact_info, phone, country_code, email } = req.body;
  const supplierIngredients = toArray(req.body.supplier_ingredients);
  const supplierCosts = toArray(req.body.supplier_costs);
  const fullPhone = buildFullPhone(country_code, phone);

  try {
    await inventoryDb.run("BEGIN TRANSACTION");
    const result = await inventoryDb.run(
      `
      INSERT INTO suppliers (name, contact_info, phone, email)
      VALUES (?, ?, ?, ?)
      `,
      [name.trim(), contact_info?.trim() || null, fullPhone, email?.trim() || null]
    );

    await saveSupplierIngredients(result.lastID, supplierIngredients, supplierCosts);
    await inventoryDb.run("COMMIT");

    req.session.success = "Proveedor creado correctamente.";
    res.redirect("/admin/proveedores");
  } catch (err) {
    await inventoryDb.run("ROLLBACK");
    req.session.error = "Error al crear proveedor: " + err.message;
    res.redirect("/admin/proveedores/nuevo");
  }
});

router.get("/proveedores/:id/editar", async (req, res) => {
  const supplier = await inventoryDb.get("SELECT * FROM suppliers WHERE id = ?", [req.params.id]);
  
  if (!supplier) {
    req.session.error = "Proveedor no encontrado.";
    res.redirect("/admin/proveedores");
    return;
  }

  const ingredients = await inventoryDb.all("SELECT id, name FROM ingredients ORDER BY name");
  const linkedIngredients = await inventoryDb.all(
    `
    SELECT si.ingredient_id, si.unit_cost
    FROM supplier_ingredients si
    WHERE si.supplier_id = ?
    `,
    [req.params.id]
  );
  
  const phoneData = parsePhone(supplier.phone);

  res.render("admin/supplier-form", {
    title: "Editar Proveedor",
    supplier,
    ingredients,
    linkedIngredients,
    phoneData,
  });
});

router.post("/proveedores/:id/editar", async (req, res) => {
  const { name, contact_info, phone, country_code, email } = req.body;
  const supplierIngredients = toArray(req.body.supplier_ingredients);
  const supplierCosts = toArray(req.body.supplier_costs);
  const fullPhone = buildFullPhone(country_code, phone);

  try {
    await inventoryDb.run("BEGIN TRANSACTION");
    await inventoryDb.run(
      `
      UPDATE suppliers
      SET name = ?, contact_info = ?, phone = ?, email = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
      `,
      [name.trim(), contact_info?.trim() || null, fullPhone, email?.trim() || null, req.params.id]
    );

    await saveSupplierIngredients(req.params.id, supplierIngredients, supplierCosts);
    await inventoryDb.run("COMMIT");

    req.session.success = "Proveedor actualizado correctamente.";
    res.redirect("/admin/proveedores");
  } catch (err) {
    await inventoryDb.run("ROLLBACK");
    req.session.error = "Error al actualizar proveedor: " + err.message;
    res.redirect(`/admin/proveedores/${req.params.id}/editar`);
  }
});

router.post("/proveedores/:id/eliminar", async (req, res) => {
  try {
    await inventoryDb.run("DELETE FROM suppliers WHERE id = ?", [req.params.id]);
    req.session.success = "Proveedor eliminado correctamente.";
    res.redirect("/admin/proveedores");
  } catch (err) {
    req.session.error = "Error al eliminar proveedor: " + err.message;
    res.redirect("/admin/proveedores");
  }
});

// ========== RUTAS PARA VINCULAR PROVEEDORES CON INGREDIENTES ==========

router.get("/proveedores/:id/ingredientes", async (req, res) => {
  const supplier = await inventoryDb.get("SELECT * FROM suppliers WHERE id = ?", [req.params.id]);
  
  if (!supplier) {
    req.session.error = "Proveedor no encontrado.";
    res.redirect("/admin/proveedores");
    return;
  }
  
  const linkedIngredients = await inventoryDb.all(
    `
    SELECT i.*, si.unit_cost, si.id AS link_id
    FROM supplier_ingredients si
    JOIN ingredients i ON i.id = si.ingredient_id
    WHERE si.supplier_id = ?
    ORDER BY i.name
    `,
    [req.params.id]
  );
  
  const allIngredients = await inventoryDb.all(
    `
    SELECT i.* FROM ingredients i
    WHERE i.id NOT IN (
      SELECT ingredient_id FROM supplier_ingredients WHERE supplier_id = ?
    )
    ORDER BY i.name
    `,
    [req.params.id]
  );
  
  res.render("admin/supplier-ingredients", {
    title: `Ingredientes del Proveedor: ${supplier.name}`,
    supplier,
    linkedIngredients,
    allIngredients,
  });
});

router.post("/proveedores/:supplier_id/agregar-ingrediente", async (req, res) => {
  const { ingredient_id, unit_cost } = req.body;
  
  try {
    const supplier = await inventoryDb.get("SELECT id FROM suppliers WHERE id = ?", [
      req.params.supplier_id,
    ]);
    const ingredient = await inventoryDb.get("SELECT id FROM ingredients WHERE id = ?", [ingredient_id]);
    
    if (!supplier || !ingredient) {
      req.session.error = "Proveedor o ingrediente no encontrado.";
      res.redirect(`/admin/proveedores/${req.params.supplier_id}/ingredientes`);
      return;
    }
    
    await inventoryDb.run(
      `
      INSERT OR REPLACE INTO supplier_ingredients (supplier_id, ingredient_id, unit_cost)
      VALUES (?, ?, ?)
      `,
      [req.params.supplier_id, ingredient_id, Number(unit_cost) || 0]
    );
    
    req.session.success = "Ingrediente agregado al proveedor.";
    res.redirect(`/admin/proveedores/${req.params.supplier_id}/ingredientes`);
  } catch (err) {
    req.session.error = "Error al agregar ingrediente: " + err.message;
    res.redirect(`/admin/proveedores/${req.params.supplier_id}/ingredientes`);
  }
});

router.post("/proveedores/:supplier_id/actualizar-costo/:link_id", async (req, res) => {
  const { unit_cost } = req.body;
  
  try {
    await inventoryDb.run(
      `
      UPDATE supplier_ingredients
      SET unit_cost = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND supplier_id = ?
      `,
      [Number(unit_cost) || 0, req.params.link_id, req.params.supplier_id]
    );
    
    req.session.success = "Costo actualizado.";
    res.redirect(`/admin/proveedores/${req.params.supplier_id}/ingredientes`);
  } catch (err) {
    req.session.error = "Error al actualizar costo: " + err.message;
    res.redirect(`/admin/proveedores/${req.params.supplier_id}/ingredientes`);
  }
});

router.post("/proveedores/:supplier_id/quitar-ingrediente/:link_id", async (req, res) => {
  try {
    await inventoryDb.run(
      "DELETE FROM supplier_ingredients WHERE id = ? AND supplier_id = ?",
      [req.params.link_id, req.params.supplier_id]
    );
    
    req.session.success = "Ingrediente removido del proveedor.";
    res.redirect(`/admin/proveedores/${req.params.supplier_id}/ingredientes`);
  } catch (err) {
    req.session.error = "Error al remover ingrediente: " + err.message;
    res.redirect(`/admin/proveedores/${req.params.supplier_id}/ingredientes`);
  }
});

// ========== ENDPOINTS AJAX PARA INGREDIENTES DE RECETAS ==========

router.get("/menu/:id/ingredientes", async (req, res) => {
  const ingredients = await inventoryDb.all(
    `
    SELECT ri.*, i.name, i.base_unit
    FROM recipe_ingredients ri
    JOIN ingredients i ON i.id = ri.ingredient_id
    WHERE ri.menu_item_id = ?
    ORDER BY i.name
    `,
    [req.params.id]
  );
  res.json(
    ingredients.map((ing) => ({
      recipe_ingredient_id: ing.id,
      ingredient_id: ing.ingredient_id,
      quantity_required: ing.quantity_required,
      name: ing.name,
      base_unit: ing.base_unit,
    }))
  );
});

router.post("/menu/:id/ingredientes", async (req, res) => {
  const { ingredient_id, quantity_required } = req.body;
  try {
    const result = await inventoryDb.run(
      `
      INSERT OR REPLACE INTO recipe_ingredients (menu_item_id, ingredient_id, quantity_required)
      VALUES (?, ?, ?)
      `,
      [req.params.id, ingredient_id, Number(quantity_required)]
    );
    res.json({ success: true, linkId: result.lastID });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete("/menu/:id/ingredientes/:link_id", async (req, res) => {
  try {
    await inventoryDb.run("DELETE FROM recipe_ingredients WHERE id = ?", [req.params.link_id]);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ========== ENDPOINTS AJAX PARA PASOS DE RECETAS ==========

router.get("/menu/:id/pasos", async (req, res) => {
  const steps = await inventoryDb.all(
    `
    SELECT * FROM recipe_steps
    WHERE menu_item_id = ?
    ORDER BY step_order
    `,
    [req.params.id]
  );
  res.json(steps);
});

router.post("/menu/:id/pasos", async (req, res) => {
  const { description, step_order } = req.body;
  try {
    const maxOrder = await inventoryDb.get(
      `
      SELECT MAX(step_order) AS max_order FROM recipe_steps WHERE menu_item_id = ?
      `,
      [req.params.id]
    );
    const order = parseInt(step_order) || (maxOrder?.max_order || 0) + 1;

    const result = await inventoryDb.run(
      `
      INSERT INTO recipe_steps (menu_item_id, step_order, description)
      VALUES (?, ?, ?)
      `,
      [req.params.id, order, description.trim()]
    );

    res.json({ success: true, stepId: result.lastID });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete("/menu/:id/pasos/:step_id", async (req, res) => {
  try {
    await inventoryDb.run("DELETE FROM recipe_steps WHERE id = ? AND menu_item_id = ?", [
      req.params.step_id,
      req.params.id,
    ]);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;

