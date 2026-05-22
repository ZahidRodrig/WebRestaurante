const express = require("express");
const usersDb = require("../config/usersDb");
const inventoryDb = require("../config/inventoryDb");
const { ensureRole } = require("../middleware/auth");

const router = express.Router();
router.use(ensureRole("admin"));

router.get("/dashboard", async (req, res) => {
  const summary = await inventoryDb.get(
    `
    SELECT
      (SELECT COUNT(*) FROM ingredients) AS totalIngredients,
      (SELECT COUNT(*) FROM categories) AS totalCategories,
      (SELECT COUNT(*) FROM users) AS totalUsers,
      (SELECT COUNT(*) FROM movements) AS totalMovements,
      (SELECT COUNT(*) FROM ingredients WHERE quantity < min_stock) AS lowStockCount
  `
  );

  const lowStock = await inventoryDb.all(
    `
    SELECT i.*, c.name AS category_name
    FROM ingredients i
    JOIN categories c ON c.id = i.category_id
    WHERE i.quantity < i.min_stock
    ORDER BY i.name
  `
  );

  res.render("admin/dashboard", { title: "Panel administrador", summary, lowStock });
});

router.get("/ingredientes", async (req, res) => {
  const search = req.query.search ? req.query.search.trim() : "";
  const category = req.query.category || "";

  let sql = `
    SELECT i.*, c.name AS category_name
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
  await inventoryDb.run(
    `
      INSERT INTO ingredients (name, category_id, quantity, unit, min_stock)
      VALUES (?, ?, ?, ?, ?)
    `,
    [name.trim(), category_id, Number(quantity), unit, Number(min_stock)]
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
  await inventoryDb.run(
    `
      UPDATE ingredients
      SET name = ?, category_id = ?, quantity = ?, unit = ?, min_stock = ?
      WHERE id = ?
    `,
    [name.trim(), category_id, Number(quantity), unit, Number(min_stock), req.params.id]
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

  await inventoryDb.run("UPDATE ingredients SET quantity = ? WHERE id = ?", [newQuantity, ingredient_id]);
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

// ========== RUTAS PARA MENÚ DE PLATILLOS ==========

router.get("/menu", async (req, res) => {
  const menuItems = await inventoryDb.all(
    `
    SELECT m.*, COUNT(ri.id) AS total_ingredients
    FROM menu_items m
    LEFT JOIN recipe_ingredients ri ON ri.menu_item_id = m.id
    GROUP BY m.id
    ORDER BY m.name
  `
  );

  res.render("admin/menu", { title: "Menú de Platillos", menuItems });
});

router.get("/menu/nuevo", async (req, res) => {
  res.render("admin/menu-form", {
    title: "Nuevo Platillo",
    menuItem: null,
  });
});

router.post("/menu", async (req, res) => {
  const { name, description, price } = req.body;

  await inventoryDb.run(
    `
    INSERT INTO menu_items (name, description, price, is_available)
    VALUES (?, ?, ?, 1)
    `,
    [name.trim(), description.trim() || null, Number(price)]
  );

  req.session.success = "Platillo creado correctamente.";
  res.redirect("/admin/menu");
});

router.get("/menu/:id/editar", async (req, res) => {
  const menuItem = await inventoryDb.get("SELECT * FROM menu_items WHERE id = ?", [req.params.id]);

  if (!menuItem) {
    req.session.error = "Platillo no encontrado.";
    res.redirect("/admin/menu");
    return;
  }

  res.render("admin/menu-form", {
    title: "Editar Platillo",
    menuItem,
  });
});

router.post("/menu/:id/editar", async (req, res) => {
  const { name, description, price, is_available } = req.body;

  await inventoryDb.run(
    `
    UPDATE menu_items
    SET name = ?, description = ?, price = ?, is_available = ?
    WHERE id = ?
    `,
    [name.trim(), description.trim() || null, Number(price), is_available ? 1 : 0, req.params.id]
  );

  req.session.success = "Platillo actualizado.";
  res.redirect("/admin/menu");
});

router.post("/menu/:id/eliminar", async (req, res) => {
  await inventoryDb.run("DELETE FROM menu_items WHERE id = ?", [req.params.id]);
  req.session.success = "Platillo eliminado.";
  res.redirect("/admin/menu");
});

// ========== RUTAS PARA RECETAS ==========

router.get("/recetas", async (req, res) => {
  const menuItems = await inventoryDb.all(
    `
    SELECT m.*, COUNT(ri.id) AS total_ingredients
    FROM menu_items m
    LEFT JOIN recipe_ingredients ri ON ri.menu_item_id = m.id
    GROUP BY m.id
    ORDER BY m.name
  `
  );

  res.render("admin/recipes", { title: "Recetario", menuItems });
});

router.get("/recetas/:menu_item_id", async (req, res) => {
  const menuItem = await inventoryDb.get("SELECT * FROM menu_items WHERE id = ?", [
    req.params.menu_item_id,
  ]);

  if (!menuItem) {
    req.session.error = "Platillo no encontrado.";
    res.redirect("/admin/recetas");
    return;
  }

  const ingredients = await inventoryDb.all(
    `
    SELECT i.*, ri.quantity_required, ri.id AS recipe_ingredient_id
    FROM recipe_ingredients ri
    JOIN ingredients i ON i.id = ri.ingredient_id
    WHERE ri.menu_item_id = ?
    ORDER BY i.name
  `,
    [req.params.menu_item_id]
  );

  const allIngredients = await inventoryDb.all("SELECT id, name, base_unit FROM ingredients ORDER BY name");

  res.render("admin/recipe-detail", {
    title: `Receta: ${menuItem.name}`,
    menuItem,
    ingredients,
    allIngredients,
  });
});

router.post("/recetas/:menu_item_id/agregar-ingrediente", async (req, res) => {
  const { ingredient_id, quantity_required } = req.body;

  const ingredient = await inventoryDb.get("SELECT * FROM ingredients WHERE id = ?", [ingredient_id]);
  if (!ingredient) {
    req.session.error = "Ingrediente no encontrado.";
    res.redirect(`/admin/recetas/${req.params.menu_item_id}`);
    return;
  }

  await inventoryDb.run(
    `
    INSERT OR REPLACE INTO recipe_ingredients (menu_item_id, ingredient_id, quantity_required)
    VALUES (?, ?, ?)
    `,
    [req.params.menu_item_id, ingredient_id, Number(quantity_required)]
  );

  req.session.success = "Ingrediente agregado a la receta.";
  res.redirect(`/admin/recetas/${req.params.menu_item_id}`);
});

router.post("/recetas/:menu_item_id/quitar-ingrediente/:recipe_ingredient_id", async (req, res) => {
  await inventoryDb.run("DELETE FROM recipe_ingredients WHERE id = ?", [
    req.params.recipe_ingredient_id,
  ]);

  req.session.success = "Ingrediente removido de la receta.";
  res.redirect(`/admin/recetas/${req.params.menu_item_id}`);
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
  await inventoryDb.run(
    `
    INSERT INTO inventory_audits (ingredient_id, user_id, previous_physical_stock, new_physical_stock, variance)
    VALUES (?, ?, ?, ?, ?)
    `,
    [ingredient_id, req.session.user.id, ingredient.stock_physical, newPhysical, variance]
  );

  // Actualizar stock_physical
  await inventoryDb.run(
    "UPDATE ingredients SET stock_physical = ? WHERE id = ?",
    [newPhysical, ingredient_id]
  );

  req.session.success = "Auditoría registrada correctamente.";
  res.redirect("/admin/auditoria");
});

// ========== ACTUALIZAR DASHBOARD CON PANEL DE DISCREPANCIAS ==========

router.get("/dashboard/discrepancias", async (req, res) => {
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

module.exports = router;

