const bcrypt = require("bcryptjs");
const usersDb = require("../config/usersDb");
const inventoryDb = require("../config/inventoryDb");

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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT
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

    await inventoryDb.run(
      `
      INSERT INTO ingredients (name, category_id, quantity, unit, min_stock)
      VALUES
      ('Queso mozzarella', 1, 4, 'kg', 3),
      ('Pechuga de pollo', 2, 10, 'kg', 5),
      ('Tomate', 3, 12, 'kg', 6),
      ('Leche entera', 1, 8, 'litros', 4),
      ('Huevos', 3, 30, 'piezas', 20)
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
