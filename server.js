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

// FUNCIÓN DE BÚSQUEDA CORREGIDA Y FINAL
async function searchParts(query) {
    const cleanedQuery = query.toLowerCase().replace('buscar', '').replace('precio', '').replace('dónde comprar', '').trim();
    
    // Paso 1: Buscar en la página de resultados
    const searchUrl = `https://bybmotorepuestosnelson.tiendanegocio.com/productos/buscar?keywords=${encodeURIComponent(cleanedQuery)}`;
    
    try {
        const { data: searchData } = await axios.get(searchUrl);
        const $ = cheerio.load(searchData);
        
        // CORRECCIÓN: el selector busca directamente el enlace del producto en el contenedor principal
        const firstProductLink = $('.item-gift__content-title a').attr('href');

        if (firstProductLink) {
            const productPageUrl = `https://bybmotorepuestosnelson.tiendanegocio.com${firstProductLink}`;
            
            // Paso 2: Entrar en la página del producto para obtener detalles
            const { data: productData } = await axios.get(productPageUrl);
            const $$ = cheerio.load(productData);

            // Obtenemos el nombre, precio y descripción
            const name = $$('.product-title__name').text().trim();
            const price = $$('.product-title__price').text().trim();
            const description = $$('.product-description').text().trim();
            
            let responseText = `He encontrado este repuesto en tu tienda:\n\n`;
            responseText += `* **Producto:** ${name}\n`;
            responseText += `* **Precio:** ${price}\n`;
            responseText += `* **Descripción:** ${description}\n`;
            responseText += `* **Enlace:** ${productPageUrl}\n\n`;

            return responseText;
            
        } else {
            return `No he encontrado resultados para "${cleanedQuery}" en tu tienda. Puedes intentar buscar en Mercado Libre: https://listado.mercadolibre.com.ar/${encodeURIComponent(cleanedQuery)}`;
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