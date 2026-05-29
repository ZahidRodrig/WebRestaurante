const bcrypt = require("bcryptjs");
const usersDb = require("../config/usersDb");
const inventoryDb = require("../config/inventoryDb");
const unitConverter = require("../helpers/unitConverter");

async function addColumnIfMissing(table, column, definition) {
  const info = await inventoryDb.all(`PRAGMA table_info(${table})`);
  if (!info.some((col) => col.name === column)) {
    await inventoryDb.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

async function syncIngredientStocks() {
  const rows = await inventoryDb.all(
    "SELECT id, quantity, unit, stock_theoretical FROM ingredients WHERE quantity > 0 AND (stock_theoretical IS NULL OR stock_theoretical = 0)"
  );
  for (const row of rows) {
    try {
      const stockBase = unitConverter.toBaseUnit(Number(row.quantity), row.unit);
      await inventoryDb.run(
        "UPDATE ingredients SET stock_theoretical = ? WHERE id = ?",
        [stockBase, row.id]
      );
    } catch (e) {
      // Si la unidad no es convertible, dejamos el valor como está
    }
  }
}

async function runMigrations() {
  await addColumnIfMissing("menu_items", "image_path", "TEXT");
  await addColumnIfMissing("menu_items", "prep_time_minutes", "INTEGER DEFAULT 0");
  await addColumnIfMissing("menu_items", "menu_category_id", "INTEGER");
  await addColumnIfMissing("menu_items", "updated_at", "DATETIME DEFAULT CURRENT_TIMESTAMP");
  await syncIngredientStocks();
}

async function initDb() {
  await inventoryDb.run("PRAGMA foreign_keys = ON");

  await usersDb.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'empleado')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await inventoryDb.run(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await inventoryDb.run(`
    CREATE TABLE IF NOT EXISTS ingredients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category_id INTEGER NOT NULL,
      quantity REAL NOT NULL DEFAULT 0,
      unit TEXT NOT NULL CHECK(unit IN ('kg', 'litros', 'piezas')),
      min_stock REAL NOT NULL DEFAULT 0,
      base_unit TEXT CHECK(base_unit IN ('g', 'ml', 'pcs')) DEFAULT 'g',
      stock_theoretical REAL NOT NULL DEFAULT 0,
      stock_physical REAL NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT
    )
  `);

  await inventoryDb.run(`
    CREATE TABLE IF NOT EXISTS menu_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await inventoryDb.run(`
    CREATE TABLE IF NOT EXISTS menu_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      price REAL NOT NULL,
      is_available INTEGER NOT NULL DEFAULT 1,
      image_path TEXT,
      prep_time_minutes INTEGER DEFAULT 0,
      menu_category_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (menu_category_id) REFERENCES menu_categories(id) ON DELETE SET NULL
    )
  `);

  await inventoryDb.run(`
    CREATE TABLE IF NOT EXISTS recipe_ingredients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      menu_item_id INTEGER NOT NULL,
      ingredient_id INTEGER NOT NULL,
      quantity_required REAL NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE CASCADE,
      FOREIGN KEY (ingredient_id) REFERENCES ingredients(id) ON DELETE RESTRICT,
      UNIQUE(menu_item_id, ingredient_id)
    )
  `);

  await inventoryDb.run(`
    CREATE TABLE IF NOT EXISTS recipe_steps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      menu_item_id INTEGER NOT NULL,
      step_order INTEGER NOT NULL,
      description TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE CASCADE
    )
  `);

  await inventoryDb.run(`
    CREATE TABLE IF NOT EXISTS inventory_audits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ingredient_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      previous_physical_stock REAL NOT NULL,
      new_physical_stock REAL NOT NULL,
      variance REAL NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (ingredient_id) REFERENCES ingredients(id) ON DELETE RESTRICT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
    )
  `);

  await inventoryDb.run(`
    CREATE TABLE IF NOT EXISTS sales_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      total_items INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
    )
  `);

  await inventoryDb.run(`
    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sales_order_id INTEGER NOT NULL,
      menu_item_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      price_at_sale REAL NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (sales_order_id) REFERENCES sales_orders(id) ON DELETE CASCADE,
      FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE RESTRICT
    )
  `);

  await inventoryDb.run(`
    CREATE TABLE IF NOT EXISTS movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK(type IN ('entrada', 'salida')),
      ingredient_id INTEGER NOT NULL,
      quantity REAL NOT NULL CHECK(quantity > 0),
      user_id INTEGER NOT NULL,
      note TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (ingredient_id) REFERENCES ingredients(id) ON DELETE RESTRICT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
    )
  `);

  await inventoryDb.run(`
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
    )
  `);

  // ========== TABLAS PARA MÓDULO DE PROVEEDORES ==========

  await inventoryDb.run(`
    CREATE TABLE IF NOT EXISTS suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      contact_info TEXT,
      phone TEXT,
      email TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await inventoryDb.run(`
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
    )
  `);

  await runMigrations();

  const adminExists = await usersDb.get(
    "SELECT id FROM users WHERE role = 'admin' LIMIT 1"
  );

  if (!adminExists) {
    const adminPassword = await bcrypt.hash("admin123", 10);
    const employeePassword = await bcrypt.hash("empleado123", 10);

    await usersDb.run(
      "INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)",
      ["Administrador", "admin@restaurante.com", adminPassword, "admin"]
    );

    await usersDb.run(
      "INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)",
      ["Juan Cocina", "empleado@restaurante.com", employeePassword, "empleado"]
    );

    await inventoryDb.run("INSERT INTO categories (name) VALUES (?)", ["Lacteos"]);
    await inventoryDb.run("INSERT INTO categories (name) VALUES (?)", ["Carnes"]);
    await inventoryDb.run("INSERT INTO categories (name) VALUES (?)", ["Verduras"]);

    // Insertar categorías de menú
    await inventoryDb.run("INSERT INTO menu_categories (name) VALUES (?)", ["Entradas"]);
    await inventoryDb.run("INSERT INTO menu_categories (name) VALUES (?)", ["Platos Principales"]);
    await inventoryDb.run("INSERT INTO menu_categories (name) VALUES (?)", ["Ensaladas"]);

    // Definir base_unit según el tipo de ingrediente
    const unitConverter = require("../helpers/unitConverter");

    const ingredientsToInsert = [
      { name: "Queso mozzarella", category_id: 1, quantity: 4, unit: "kg", min_stock: 3, base_unit: "g" },
      { name: "Pechuga de pollo", category_id: 2, quantity: 10, unit: "kg", min_stock: 5, base_unit: "g" },
      { name: "Tomate", category_id: 3, quantity: 12, unit: "kg", min_stock: 6, base_unit: "g" },
      { name: "Leche entera", category_id: 1, quantity: 8, unit: "litros", min_stock: 4, base_unit: "ml" },
      { name: "Huevos", category_id: 3, quantity: 30, unit: "piezas", min_stock: 20, base_unit: "pcs" }
    ];

    for (const ing of ingredientsToInsert) {
      // Convertir quantity a base_unit
      let stock_theoretical = unitConverter.toBaseUnit(ing.quantity, ing.unit);
      
      await inventoryDb.run(
        `
        INSERT INTO ingredients (name, category_id, quantity, unit, min_stock, base_unit, stock_theoretical, stock_physical)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [ing.name, ing.category_id, ing.quantity, ing.unit, ing.min_stock, ing.base_unit, stock_theoretical, stock_theoretical]
      );
    }

    // Insertar algunos items de menú de ejemplo
    await inventoryDb.run(
      `
      INSERT INTO menu_items (name, description, price, is_available, menu_category_id, prep_time_minutes)
      VALUES
      ('Pasta Carbonara', 'Pasta fresca con salsa de queso y jamón', 12.99, 1, 2, 15),
      ('Pechuga Rellena', 'Pechuga de pollo rellena de jamón y queso', 15.50, 1, 2, 20),
      ('Ensalada Fresca', 'Ensalada verde con tomate y queso', 8.99, 1, 3, 5)
      `
    );

    // Insertar recetas de ejemplo (vinculando menu_items con ingredients)
    // Pasta Carbonara: 200g queso mozzarella
    await inventoryDb.run(
      `
      INSERT INTO recipe_ingredients (menu_item_id, ingredient_id, quantity_required)
      VALUES (1, 1, 200)
      `
    );

    // Pechuga Rellena: 300g pechuga de pollo, 50g queso
    await inventoryDb.run(
      `
      INSERT INTO recipe_ingredients (menu_item_id, ingredient_id, quantity_required)
      VALUES (2, 2, 300), (2, 1, 50)
      `
    );

    // Ensalada Fresca: 200g tomate, 100g queso, 100ml leche
    await inventoryDb.run(
      `
      INSERT INTO recipe_ingredients (menu_item_id, ingredient_id, quantity_required)
      VALUES (3, 3, 200), (3, 1, 100), (3, 4, 100)
      `
    );

    await inventoryDb.run(
      `
      INSERT INTO movements (type, ingredient_id, quantity, user_id, note)
      VALUES
      ('entrada', 1, 4, 1, 'Carga inicial'),
      ('entrada', 2, 10, 1, 'Carga inicial'),
      ('entrada', 3, 12, 1, 'Carga inicial'),
      ('entrada', 4, 8, 1, 'Carga inicial'),
      ('entrada', 5, 30, 1, 'Carga inicial')
      `
    );
  }
}

module.exports = initDb;
