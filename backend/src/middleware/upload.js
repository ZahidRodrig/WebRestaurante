const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Directorio donde se guardarán las imágenes de recetas
const recipeUploadsDir = path.join(
  __dirname,
  "../../../frontend/src/public/uploads/recipes"
);

if (!fs.existsSync(recipeUploadsDir)) {
  fs.mkdirSync(recipeUploadsDir, { recursive: true });
}

// Configurar almacenamiento
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, recipeUploadsDir);
  },
  filename: (req, file, cb) => {
    // Guardar con timestamp y extensión original
    const ext = path.extname(file.originalname);
    const name = `recipe_${Date.now()}${ext}`;
    cb(null, name);
  },
});

// Filtrar solo imágenes
const fileFilter = (req, file, cb) => {
  const allowedMimes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Solo se permiten imágenes (JPEG, PNG, GIF, WebP)"));
  }
};

module.exports = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});
