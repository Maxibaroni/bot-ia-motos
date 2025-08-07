const express = require('express');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const cheerio = require('cheerio');
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

// FUNCIÓN PARA BUSCAR REPUESTOS EN TU TIENDA
async function searchParts(query) {
    const searchUrl = `https://bybmotorepuestosnelson.tiendanegocio.com/buscar?q=${encodeURIComponent(query)}`;
    
    try {
        const { data } = await axios.get(searchUrl);
        const $ = cheerio.load(data);
        
        const results = [];
        // Lógica para encontrar productos en el HTML de tiendas de Tienda Negocio
        $('.product-block').each((i, el) => {
          const name = $(el).find('.product-block__name').text().trim();
          const price = $(el).find('.product-block__price').text().trim();
          const url = `https://bybmotorepuestosnelson.tiendanegocio.com${$(el).find('.product-block__link').attr('href')}`;
          if (name && url) {
            results.push({ name, price, url });
          }
        });
        
        if (results.length > 0) {
            let responseText = `He encontrado estos resultados en tu tienda para "${query}":\n\n`;
            results.slice(0, 3).forEach(item => {
                responseText += `* ${item.name} ${item.price ? `(${item.price})` : ''}\n  Enlace: ${item.url}\n\n`;
            });
            return responseText;
        } else {
            return `No he encontrado resultados para "${query}" en tu tienda. Puedes intentar buscar en Mercado Libre: https://listado.mercadolibre.com.ar/${encodeURIComponent(query)}`;
        }
    } catch (error) {
        console.error('Error al buscar repuestos:', error.message);
        return 'Lo siento, no pude realizar la búsqueda en tu tienda en este momento. Inténtalo más tarde.';
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
            systemInstruction: "Eres un asistente experto en repuestos de motos, especializado en modelos de baja y media cilindrada. Responde de forma profesional y técnica. Ahora puedes buscar repuestos en la tienda ByB Nelson si el usuario te lo pide. Si te preguntan por otro tema, responde: 'Lo siento, mi conocimiento se limita a los repuestos de motos.'"
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