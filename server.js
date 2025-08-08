const express = require('express');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { v4: uuidv4 } = require('uuid');
const sqlite3 = require('sqlite3').verbose();
const app = express();
const port = 3000;

const sessions = {};
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// --- LÓGICA PARA CREAR LA BASE DE DATOS Y LA TABLA ---
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
});
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

// FUNCIÓN DE BÚSQUEDA CORREGIDA Y FINAL (usa la base de datos)
async function searchParts(query) {
    const cleanedQuery = query.toLowerCase().replace('buscar', '').replace('precio', '').replace('dónde comprar', '').trim();

    return new Promise((resolve, reject) => {
        const sql = `SELECT nombre, precio, url FROM productos WHERE nombre LIKE ? LIMIT 1`;
        db.get(sql, [`%${cleanedQuery}%`], (err, row) => {
            if (err) {
                console.error('Error en la base de datos:', err.message);
                reject('Lo siento, no pude realizar la búsqueda en este momento.');
                return;
            }
            if (row) {
                const responseText = `He encontrado este repuesto en tu tienda:\n\n* **Producto:** ${row.nombre}\n* **Precio:** ${row.precio}\n* **Enlace:** ${row.url}`;
                resolve(responseText);
            } else {
                resolve(`No he encontrado resultados para "${cleanedQuery}" en tu tienda. Puedes intentar buscar en Mercado Libre: https://listado.mercadolibre.com.ar/${encodeURIComponent(cleanedQuery)}`);
            }
        });
    });
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