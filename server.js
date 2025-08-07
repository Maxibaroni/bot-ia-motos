const express = require('express');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios'); // NUEVO: Importa axios
const cheerio = require('cheerio'); // NUEVO: Importa cheerio
const app = express();
const port = 3000;

const sessions = {};
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

app.use(express.static('public'));
app.use(express.json({ limit: '50mb' }));

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

// NUEVO: Función para buscar repuestos en una página web
async function searchParts(query) {
    const searchUrl = `https://www.ejemplo-repuestos.com/buscar?q=${encodeURIComponent(query)}`;
    
    try {
        const { data } = await axios.get(searchUrl);
        const $ = cheerio.load(data);
        
        const results = [];
        // Aquí debes encontrar los elementos HTML correctos para los resultados
        // Ejemplo: $('.producto').each((i, el) => {
        //   const name = $(el).find('.nombre-producto').text();
        //   const price = $(el).find('.precio').text();
        //   results.push({ name, price });
        // });
        
        return `He encontrado algunos repuestos para "${query}" en el sitio web de ejemplo.`; // Respuesta de ejemplo
    } catch (error) {
        console.error('Error al buscar repuestos:', error);
        return 'Lo siento, no pude realizar la búsqueda en este momento. Inténtalo más tarde.';
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
        // NUEVA LÓGICA: Decide si usar la IA o la función de búsqueda
        const lowerCaseMessage = message.toLowerCase();
        if (lowerCaseMessage.includes('buscar') || lowerCaseMessage.includes('precio') || lowerCaseMessage.includes('dónde comprar')) {
            const searchResponse = await searchParts(message);
            res.json({ response: searchResponse });
            return; // Termina la función aquí
        }

        const model = genAI.getGenerativeModel({
            model: "gemini-1.5-flash",
            systemInstruction: "Eres un asistente experto en repuestos de motos, especializado en modelos de baja y media cilindrada. Responde de forma profesional y técnica. Ahora puedes buscar repuestos en tiempo real si el usuario te lo pide. Si te preguntan por otro tema, responde: 'Lo siento, mi conocimiento se limita a los repuestos de motos.'"
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