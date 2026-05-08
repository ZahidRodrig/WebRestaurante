const express = require("express");
const { all, get, run } = require("../config/inventoryDb");
const { ensureRole } = require("../middleware/auth");

const router = express.Router();
router.use(ensureRole("empleado", "admin"));

router.get("/dashboard", async (req, res) => {
  const lowStock = await all(
    `
    SELECT i.*, c.name AS category_name
    FROM ingredients i
    JOIN categories c ON c.id = i.category_id
    WHERE i.quantity < i.min_stock
    ORDER BY i.name
  `
  );

  const recentMovements = await all(
    `
    SELECT m.*, i.name AS ingredient_name, i.unit AS ingredient_unit
    FROM movements m
    JOIN ingredients i ON i.id = m.ingredient_id
    WHERE m.user_id = ?
    ORDER BY m.created_at DESC
    LIMIT 10
  `,
    [req.session.user.id]
  );

  res.render("employee/dashboard", {
    title: "Panel empleado",
    lowStock,
    recentMovements,
  });
});

router.get("/inventario", async (req, res) => {
  const ingredients = await all(
    `
    SELECT i.*, c.name AS category_name
    FROM ingredients i
    JOIN categories c ON c.id = i.category_id
    ORDER BY i.name
  `
  );

  res.render("employee/inventory", { title: "Inventario", ingredients });
});

router.post("/movimiento", async (req, res) => {
  const { ingredient_id, quantity, note, type } = req.body;
  const amount = Number(quantity);
  const ingredient = await get("SELECT * FROM ingredients WHERE id = ?", [ingredient_id]);

  if (!ingredient) {
    req.session.error = "Ingrediente no encontrado.";
    res.redirect("/empleado/inventario");
    return;
  }

  if (amount <= 0) {
    req.session.error = "Cantidad invalida.";
    res.redirect("/empleado/inventario");
    return;
  }

  if (!["entrada", "salida"].includes(type)) {
    req.session.error = "Tipo de movimiento invalido.";
    res.redirect("/empleado/inventario");
    return;
  }

  if (type === "salida" && ingredient.quantity < amount) {
    req.session.error = "Stock insuficiente para la salida.";
    res.redirect("/empleado/inventario");
    return;
  }

  const newQuantity =
    type === "entrada" ? ingredient.quantity + amount : ingredient.quantity - amount;

  await run("UPDATE ingredients SET quantity = ? WHERE id = ?", [
    newQuantity,
    ingredient_id,
  ]);

  await run(
    `
      INSERT INTO movements (type, ingredient_id, quantity, user_id, note)
      VALUES (?, ?, ?, ?, ?)
    `,
    [
      type,
      ingredient_id,
      amount,
      req.session.user.id,
      note || (type === "entrada" ? "Entrada inventario" : "Salida cocina"),
    ]
  );

  req.session.success =
    type === "entrada" ? "Entrada registrada correctamente." : "Salida registrada.";
  res.redirect("/empleado/inventario");
});

router.get("/mis-movimientos", async (req, res) => {
  const movements = await all(
    `
    SELECT m.*, i.name AS ingredient_name, i.unit AS ingredient_unit
    FROM movements m
    JOIN ingredients i ON i.id = m.ingredient_id
    WHERE m.user_id = ?
    ORDER BY m.created_at DESC
  `,
    [req.session.user.id]
  );

  res.render("employee/my-movements", { title: "Mis movimientos", movements });
});

module.exports = router;
