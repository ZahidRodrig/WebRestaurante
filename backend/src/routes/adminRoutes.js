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

module.exports = router;
