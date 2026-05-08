const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const isRender = process.env.RENDER === "true";
const renderDataPath = "/tmp/database.sqlite";
const dbPath = isRender
  ? renderDataPath
  : path.join(__dirname, "..", "..", "..", "database.sqlite");

const db = new sqlite3.Database(dbPath);

const run = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) {
        reject(err);
        return;
      }
      resolve(this);
    });
  });

const get = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(row);
    });
  });

const all = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(rows);
    });
  });

module.exports = { db, run, get, all };
