const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./tienda.db');

db.serialize(() => {
  // Crear la tabla 'productos' si no existe
  db.run(`
    CREATE TABLE IF NOT EXISTS productos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      precio TEXT,
      descripcion TEXT,
      url TEXT
    )
  `);

  console.log("Tabla 'productos' creada o ya existente.");

  // Ejemplo de cómo agregar un producto
  const stmt = db.prepare("INSERT INTO productos (nombre, precio, descripcion, url) VALUES (?, ?, ?, ?)");
  stmt.run("Filtro De Aire Honda Xr Tornado 250", "$9.478", "Filtro de aire de calidad original para Honda XR Tornado 250.", "https://bybmotorepuestosnelson.tiendanegocio.com/productos/filtro-de-aire-honda-xr-tornado-250-calidad-original");
  stmt.finalize();

});

db.close();