const express = require('express');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { v4: uuidv4 } = require('uuid');
const Database = require('better-sqlite3');
const app = express();
const port = 3000;

const sessions = {};
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// --- CONEXIÓN Y CREACIÓN DE LA TABLA DE LA BASE DE DATOS ---
const db = new Database('tienda.db');
db.prepare(`
  CREATE TABLE IF NOT EXISTS productos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    precio TEXT,
    descripcion TEXT,
    url TEXT
  )
`).run();
console.log("Tabla 'productos' creada o ya existente.");

// --- EJEMPLO DE CÓMO AGREGAR UN PRODUCTO ---
const productoEjemplo = {
    nombre: 'Filtro de Aire Honda XR 250 Tornado',
    precio: '$9.478',
    descripcion: 'Filtro de aire de calidad original para Honda XR 250 Tornado. Hecho en Argentina.',
    url: 'https://ejemplo.com/filtro-aire-honda-xr-250'
};

const existingProduct = db.prepare('SELECT nombre FROM productos WHERE nombre = ?').get(productoEjemplo.nombre);
if (!existingProduct) {
    db.prepare('INSERT INTO productos (nombre, precio, descripcion, url) VALUES (@nombre, @precio, @descripcion, @url)').run(productoEjemplo);
    console.log(`Producto '${productoEjemplo.nombre}' agregado a la base de datos.`);
} else {
    console.log(`El producto '${productoEjemplo.nombre}' ya existe. No se ha agregado.`);
}
// ----------------------------------------------------

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '50mb' }));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

function fileToGenerativePart(base64Data) {
  const data = base64Data.split(',')[1];
  const mimeType = base64Data.split(',')[0].split(':')[1].split(';')[0];
  return {
    inlineData: {
      data: data,
      mimeType: mimeType,
    },
  };
}

// FUNCIÓN DE BÚSQUEDA CORREGIDA (usa better-sqlite3)
async function searchParts(query) {
  const cleanedQuery = query.toLowerCase()
                             .replace('buscar', '')
                             .replace('precio', '')
                             .replace('dónde comprar', '')
                             .replace(/"/g, '') // Elimina comillas
                             .trim();
  const sql = `SELECT nombre, precio, url FROM productos WHERE nombre LIKE ? LIMIT 1`;
  
  try {
    const row = db.prepare(sql).get(`%${cleanedQuery}%`);
    if (row) {
      const responseText = `He encontrado este repuesto en tu tienda:\n\n* **Producto:** ${row.nombre}\n* **Precio:** ${row.precio}\n* **Enlace:** ${row.url}`;
      return responseText;
    } else {
      return `No he encontrado resultados para "${cleanedQuery}" en tu tienda. Puedes intentar buscar en Mercado Libre: https://listado.mercadolibre.com.ar/${encodeURIComponent(cleanedQuery)}`;
    }
  } catch (err) {
    console.error('Error en la base de datos:', err.message);
    return 'Lo siento, no pude realizar la búsqueda en este momento.';
  }
}

app.get('/start-session', (req, res) => {
  const sessionId = uuidv4();
  sessions[sessionId] = [];
  console.log(`Nueva sesión iniciada: ${sessionId}`);
  res.json({ sessionId: sessionId });
});

app.post('/chat', async (req, res) => {
  const { sessionId, message, imageData } = req.body;
  console.log(`Mensaje del usuario en sesión ${sessionId}: ${message}`);

  if (!sessionId || !sessions[sessionId]) {
    return res.status(400).json({ response: 'ID de sesión inválido o no encontrado.' });
  }

  const history = sessions[sessionId];

  try {
    const lowerCaseMessage = message.toLowerCase();
    if (lowerCaseMessage.includes('buscar') || lowerCaseMessage.includes('precio') || lowerCaseMessage.includes('dónde comprar')) {
      const searchResponse = await searchParts(message);
      res.json({ response: searchResponse });
      return;
    }

    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      systemInstruction: "Eres un asistente experto en repuestos de motos, especializado en modelos de baja y media cilindrada. Responde de forma profesional y técnica. Si te preguntan por otro tema, responde: 'Lo siento, mi conocimiento se limita a los repuestos de motos.'"
    });

    const chat = model.startChat({ history: history });
    const parts = [];
    if (message) {
      parts.push({ text: message });
    }
    if (imageData) {
      parts.push(fileToGenerativePart(imageData));
    }

    const result = await chat.sendMessage(parts);
    const botResponse = result.response.text();

    history.push({ role: 'user', parts: parts });
    history.push({ role: 'model', parts: [{ text: botResponse }] });

    res.json({ response: botResponse });
  } catch (error) {
    console.error('Error al comunicarse con la API de Gemini:', error);
    res.status(500).json({ response: 'Lo siento, hubo un problema al procesar tu solicitud.' });
  }
});

app.listen(port, () => {
  console.log(`Servidor escuchando en http://localhost:${port}`);
});