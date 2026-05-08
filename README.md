# Inventario Restaurante (Node + Express + SQLite)

Aplicacion web completa para la gestion de inventario de restaurante, lista para ejecutar localmente o desplegar en Render.

## Tecnologias

- Backend: Node.js + Express
- Base de datos: SQLite
- Frontend: EJS, HTML, CSS, JavaScript, Bootstrap

## Funcionalidades incluidas

- Autenticacion con login y registro de usuarios
- Passwords encriptadas con bcrypt
- Roles: `admin` y `empleado`
- Proteccion de rutas por rol
- CRUD de ingredientes
- CRUD de categorias
- Gestion de usuarios (cambio de rol + alta)
- Registro de movimientos (entrada/salida)
- Historial global (admin) e historial propio (empleado)
- Alertas visuales para bajo stock
- Busqueda y filtro por categoria en ingredientes
- Dashboard con resumen

## Credenciales iniciales

- Admin:
  - correo: `admin@restaurante.com`
  - password: `admin123`
- Empleado:
  - correo: `empleado@restaurante.com`
  - password: `empleado123`

## Instalacion y ejecucion local

```bash
npm install
npm start
```

Luego abre [http://localhost:3000](http://localhost:3000).

## Deploy en Render

Este repositorio ya incluye `render.yaml`. Solo debes:

1. Subir cambios a GitHub.
2. En Render, crear servicio con **New + -> Blueprint**.
3. Seleccionar tu repo y desplegar.

Render usara:

- `npm install` para build
- `npm start` para iniciar
- En plan Free, almacenamiento temporal en `/tmp` para `database.sqlite` y `sessions.sqlite`
- Nota: en Free los datos pueden reiniciarse cuando el servicio se reinicia

## Estructura del proyecto

```text
backend/
  src/
    app.js
    config/
      connection.js
      usersDb.js
      inventoryDb.js
    middleware/
      auth.js
    models/
      initDb.js
    routes/
      authRoutes.js
      adminRoutes.js
      employeeRoutes.js
frontend/
  src/
    views/
      admin/
      auth/
      employee/
      partials/
    public/
      css/
      js/
```