const express = require('express');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { v4: uuidv4 } = require('uuid');
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
        const model = genAI.getGenerativeModel({
            model: "gemini-1.5-flash",
            // ¡Aquí cambiamos el rol del bot!
            systemInstruction: "Eres un asistente experto en repuestos de motos. Responde de forma concisa y útil, usando un lenguaje sencillo. Tu objetivo es identificar repuestos, recomendar alternativas y dar información técnica sobre motos. Responde en español."
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