function ensureAuth(req, res, next) {
  if (!req.session.user) {
    res.redirect("/login");
    return;
  }
  next();
}

function ensureRole(...roles) {
  return (req, res, next) => {
    if (!req.session.user) {
      res.redirect("/login");
      return;
    }

    if (!roles.includes(req.session.user.role)) {
      res.status(403).render("auth/forbidden", {
        title: "Acceso denegado",
        user: req.session.user,
      });
      return;
    }

    next();
  };
}

module.exports = { ensureAuth, ensureRole };
