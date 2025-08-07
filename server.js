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
            // INSTRUCCIÓN CLAVE: Aquí es donde defines la personalidad del bot
            systemInstruction: "Eres un asistente experto en repuestos de motos, especializado en modelos de baja y media cilindrada. Responde de manera profesional y técnica, pero con lenguaje simple. No respondas preguntas fuera de este tema. Si te preguntan por otro tema, responde: 'Lo siento, mi conocimiento se limita a los repuestos de motos.'"
        });

        // INCLUYE LOS EJEMPLOS DE CONVERSACIÓN AQUÍ
        const chat = model.startChat({
            history: [
                {
                    role: "user",
                    parts: [{ text: "¿Cuál es el filtro de aire para una Yamaha FZ 16?" }]
                },
                {
                    role: "model",
                    parts: [{ text: "El filtro de aire es el número de parte 123-456-789. Es importante revisarlo cada 5,000 km." }]
                },
                {
                    role: "user",
                    parts: [{ text: "¿Qué aceite me recomiendas para una Honda Tornado 250?" }]
                },
                {
                    role: "model",
                    parts: [{ text: "Para la Honda Tornado 250 se recomienda un aceite 10W-30. Te sugiero un Motul 5100 o un Castrol Power 1." }]
                },
                {
                    role: "user",
                    parts: [{ text: "Necesito un kit de arrastre para mi Bajaj Rouser 200." }]
                },
                {
                    role: "model",
                    parts: [{ text: "Para una Bajaj Rouser 200 (NS200), necesitas un kit de arrastre con cadena 520H y piñón de 14 dientes. Las marcas más recomendadas son DID y Riffel." }]
                },
                {
                    role: "user",
                    parts: [{ text: "¿Cada cuánto se cambia la bujía de una Zanella RX 150?" }]
                },
                {
                    role: "model",
                    parts: [{ text: "La bujía de una Zanella RX 150 debe revisarse cada 3.000 km y cambiarse cada 6.000 km. Usa el modelo NGK C7HSA." }]
                },
                // El resto del historial de la sesión del usuario se agrega después de estos ejemplos
                ...history
            ]
        });
        
        const parts = [];
        if (message) {
            parts.push({ text: message });
        }
        if (imageData) {
            parts.push(fileToGenerativePart(imageData));
        }

        const result = await chat.sendMessage(parts);
        const botResponse = result.response.text();

        // Almacena el historial para la próxima interacción
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