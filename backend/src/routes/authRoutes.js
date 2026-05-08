const express = require("express");
const bcrypt = require("bcryptjs");
const { get, run } = require("../config/usersDb");
const { ensureAuth } = require("../middleware/auth");

const router = express.Router();

router.get("/login", (req, res) => {
  if (req.session.user) {
    res.redirect("/");
    return;
  }
  res.render("auth/login", { title: "Iniciar sesion" });
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    req.session.error = "Correo y contrasena son obligatorios.";
    res.redirect("/login");
    return;
  }

  const user = await get("SELECT * FROM users WHERE email = ?", [email.trim()]);

  if (!user) {
    req.session.error = "Credenciales invalidas.";
    res.redirect("/login");
    return;
  }

  const matches = await bcrypt.compare(password, user.password);
  if (!matches) {
    req.session.error = "Credenciales invalidas.";
    res.redirect("/login");
    return;
  }

  req.session.user = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };
  req.session.success = `Bienvenido, ${user.name}.`;
  res.redirect("/");
});

router.get("/registro", ensureAuth, (req, res) => {
  res.render("auth/register", { title: "Registrar empleado" });
});

router.post("/registro", ensureAuth, async (req, res) => {
  const { name, email, password, role } = req.body;
  const cleanRole = role === "admin" ? "admin" : "empleado";

  if (!name || !email || !password) {
    req.session.error = "Todos los campos son obligatorios.";
    res.redirect("/registro");
    return;
  }

  const exists = await get("SELECT id FROM users WHERE email = ?", [email.trim()]);
  if (exists) {
    req.session.error = "El correo ya esta registrado.";
    res.redirect("/registro");
    return;
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  await run(
    "INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)",
    [name.trim(), email.trim(), hashedPassword, cleanRole]
  );

  req.session.success = "Usuario registrado correctamente.";
  if (req.session.user.role === "admin") {
    res.redirect("/admin/usuarios");
    return;
  }
  res.redirect("/");
});

router.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/login");
  });
});

module.exports = router;
