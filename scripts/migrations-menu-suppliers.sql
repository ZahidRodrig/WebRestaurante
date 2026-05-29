-- Migraciones para menú, recetas y proveedores
-- Ejecutar sobre database.sqlite si la BD ya existía antes de estos cambios

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS menu_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS recipe_steps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  menu_item_id INTEGER NOT NULL,
  step_order INTEGER NOT NULL,
  description TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE CASCADE
);

ALTER TABLE menu_items ADD COLUMN image_path TEXT;
ALTER TABLE menu_items ADD COLUMN prep_time_minutes INTEGER DEFAULT 0;
ALTER TABLE menu_items ADD COLUMN menu_category_id INTEGER;
ALTER TABLE menu_items ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP;

-- Nota: ALTER TABLE ADD COLUMN fallará si la columna ya existe.
-- initDb.js aplica estas migraciones de forma idempotente al iniciar la app.
