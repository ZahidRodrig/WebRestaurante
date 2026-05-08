const path = require("path");
const express = require("express");
const session = require("express-session");
const SQLiteStore = require("connect-sqlite3")(session);

const initDb = require("./models/initDb");
const authRoutes = require("./routes/authRoutes");
const adminRoutes = require("./routes/adminRoutes");
const employeeRoutes = require("./routes/employeeRoutes");

const app = express();
const PORT = process.env.PORT || 3000;

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "..", "..", "frontend", "src", "views"));

app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "..", "..", "frontend", "src", "public")));

app.use(
  session({
    store: new SQLiteStore({
      db: "sessions.sqlite",
      dir: path.join(__dirname, "..", "..", ".."),
    }),
    secret: process.env.SESSION_SECRET || "inventario-restaurante-seguro",
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 1000 * 60 * 60 * 8,
    },
  })
);

app.use((req, res, next) => {
  const cleanPath = (req.originalUrl || req.path || "").split("?")[0];
  res.locals.user = req.session.user || null;
  res.locals.error = req.session.error || null;
  res.locals.success = req.session.success || null;
  res.locals.currentPath = cleanPath;
  res.locals.isActivePath = (targetPath) =>
    cleanPath === targetPath || cleanPath.startsWith(`${targetPath}/`);
  delete req.session.error;
  delete req.session.success;
  next();
});

app.get("/", (req, res) => {
  if (!req.session.user) {
    res.redirect("/login");
    return;
  }

  if (req.session.user.role === "admin") {
    res.redirect("/admin/dashboard");
    return;
  }

  res.redirect("/empleado/dashboard");
});

app.use("/", authRoutes);
app.use("/admin", adminRoutes);
app.use("/empleado", employeeRoutes);

app.use((req, res) => {
  res.status(404).render("auth/not-found", { title: "No encontrado" });
});

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Servidor iniciado en http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error("Error iniciando la aplicacion:", error);
    process.exit(1);
  });
