const express = require("express");
const { all, get, run } = require("../config/inventoryDb");
const { ensureRole } = require("../middleware/auth");
const unitConverter = require("../helpers/unitConverter");

function safeToBaseUnit(quantity, unit) {
  try {
    return unitConverter.toBaseUnit(Number(quantity), unit);
  } catch (e) {
    return Number(quantity);
  }
}

const router = express.Router();
router.use(ensureRole("empleado", "admin"));

router.get("/dashboard", async (req, res) => {
  const lowStock = await all(
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

  const recentMovements = await all(
    `
    SELECT m.*, i.name AS ingredient_name, i.base_unit AS ingredient_unit
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
    SELECT
      i.*,
      c.name AS category_name,
      EXISTS (SELECT 1 FROM inventory_audits ia WHERE ia.ingredient_id = i.id) AS has_audit
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
  const newStockBase = safeToBaseUnit(newQuantity, ingredient.unit);

  await run(
    "UPDATE ingredients SET quantity = ?, stock_theoretical = ? WHERE id = ?",
    [newQuantity, newStockBase, ingredient_id]
  );

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

// ========== RUTAS PARA PUNTO DE VENTA / ÓRDENES ==========

router.get("/punto-de-venta", async (req, res) => {
  const menuItems = await all(
    `
    SELECT m.*, 
      COALESCE(
        (
          SELECT GROUP_CONCAT(i.name || ' (' || ri.quantity_required || ' ' || i.base_unit || ')', ', ')
          FROM recipe_ingredients ri
          JOIN ingredients i ON i.id = ri.ingredient_id
          WHERE ri.menu_item_id = m.id
        ),
        'Sin receta'
      ) AS ingredients_summary
    FROM menu_items m
    WHERE m.is_available = 1
    ORDER BY m.name
  `
  );

  res.render("employee/pos", { title: "Punto de Venta", menuItems });
});

router.post("/orden", async (req, res) => {
  const { items } = req.body;

  // items es un objeto como: { "1": 2, "3": 1 } (menu_item_id: quantity)
  if (!items || Object.keys(items).length === 0) {
    req.session.error = "Debes agregar al menos un artículo a la orden.";
    res.redirect("/empleado/punto-de-venta");
    return;
  }

  try {
    // Crear la orden
    const itemsArray = Object.entries(items).map(([itemId, qty]) => [Number(itemId), Number(qty)]);

    // Validar que todos los items existan y calcular total
    let totalItems = 0;
    const menuItemsData = [];

    for (const [menuItemId, quantity] of itemsArray) {
      const menuItem = await get("SELECT * FROM menu_items WHERE id = ? AND is_available = 1", [
        menuItemId,
      ]);

      if (!menuItem) {
        throw new Error(`Platillo con ID ${menuItemId} no encontrado o no disponible.`);
      }

      totalItems += quantity;
      menuItemsData.push({ ...menuItem, order_quantity: quantity });

      // Obtener receta y validar stock
      const recipeItems = await all(
        `
        SELECT ri.*, i.stock_theoretical, i.base_unit, i.name
        FROM recipe_ingredients ri
        JOIN ingredients i ON i.id = ri.ingredient_id
        WHERE ri.menu_item_id = ?
        `,
        [menuItemId]
      );

      for (const recipe of recipeItems) {
        const requiredAmount = recipe.quantity_required * quantity;
        if (recipe.stock_theoretical < requiredAmount) {
          throw new Error(
            `Stock insuficiente para ${recipe.name}. Se requieren ${requiredAmount} ${recipe.base_unit}, disponibles: ${recipe.stock_theoretical}`
          );
        }
      }
    }

    // Insertar orden
    const orderResult = await new Promise((resolve, reject) => {
      const db = require("../config/inventoryDb").db;
      db.run(
        "INSERT INTO sales_orders (user_id, total_items) VALUES (?, ?)",
        [req.session.user.id, totalItems],
        function (err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });

    // Insertar items de orden y descontar de stock
    for (const menuItem of menuItemsData) {
      await run(
        "INSERT INTO order_items (sales_order_id, menu_item_id, quantity, price_at_sale) VALUES (?, ?, ?, ?)",
        [orderResult, menuItem.id, menuItem.order_quantity, menuItem.price]
      );

      // Obtener receta y descontar del stock_theoretical
      const recipeItems = await all(
        `
        SELECT ri.*, i.id as ingredient_id, i.stock_theoretical
        FROM recipe_ingredients ri
        JOIN ingredients i ON i.id = ri.ingredient_id
        WHERE ri.menu_item_id = ?
        `,
        [menuItem.id]
      );

      for (const recipe of recipeItems) {
        const requiredAmount = recipe.quantity_required * menuItem.order_quantity;
        const newStock = recipe.stock_theoretical - requiredAmount;

        await run(
          "UPDATE ingredients SET stock_theoretical = ? WHERE id = ?",
          [newStock, recipe.ingredient_id]
        );

        // Registrar movimiento de salida
        await run(
          `
          INSERT INTO movements (type, ingredient_id, quantity, user_id, note)
          VALUES (?, ?, ?, ?, ?)
          `,
          [
            "salida",
            recipe.ingredient_id,
            requiredAmount,
            req.session.user.id,
            `Venta de ${menuItem.name} (Orden #${orderResult})`,
          ]
        );
      }
    }

    req.session.success = `Orden #${orderResult} registrada correctamente.`;
    res.redirect("/empleado/punto-de-venta");
  } catch (error) {
    req.session.error = error.message;
    res.redirect("/empleado/punto-de-venta");
  }
});

router.get("/ordenes", async (req, res) => {
  const orders = await all(
    `
    SELECT so.*, u.name AS user_name, COUNT(oi.id) AS item_count, SUM(oi.price_at_sale * oi.quantity) AS total_amount
    FROM sales_orders so
    JOIN users u ON u.id = so.user_id
    LEFT JOIN order_items oi ON oi.sales_order_id = so.id
    GROUP BY so.id
    ORDER BY so.created_at DESC
  `
  );

  res.render("employee/orders", { title: "Mis Órdenes", orders });
});

router.get("/ordenes/:order_id", async (req, res) => {
  const order = await get(
    `
    SELECT so.*, u.name AS user_name
    FROM sales_orders so
    JOIN users u ON u.id = so.user_id
    WHERE so.id = ? AND so.user_id = ?
    `,
    [req.params.order_id, req.session.user.id]
  );

  if (!order) {
    req.session.error = "Orden no encontrada.";
    res.redirect("/empleado/ordenes");
    return;
  }

  const items = await all(
    `
    SELECT oi.*, m.name AS menu_item_name, m.description
    FROM order_items oi
    JOIN menu_items m ON m.id = oi.menu_item_id
    WHERE oi.sales_order_id = ?
    ORDER BY oi.created_at
  `,
    [req.params.order_id]
  );

  res.render("employee/order-detail", {
    title: `Orden #${order.id}`,
    order,
    items,
  });
});

module.exports = router;
