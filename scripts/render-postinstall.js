const { execSync } = require("child_process");

const isRender = process.env.RENDER === "true";

if (!isRender) {
  console.log("Postinstall: entorno local detectado, sin rebuild forzado.");
  process.exit(0);
}

try {
  console.log("Postinstall: Render detectado, recompilando sqlite3...");
  execSync("npm rebuild sqlite3 --build-from-source", { stdio: "inherit" });
  console.log("Postinstall: sqlite3 recompilado correctamente.");
} catch (error) {
  console.error("Postinstall: error recompilando sqlite3 en Render.");
  process.exit(1);
}
