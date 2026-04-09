require('dotenv').config();
const express = require('express');
const { processMessage } = require('./src/agent');
const { sendMessage, parseIncoming, twimlResponse } = require('./src/whatsapp');
const config = require('./src/config');

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// ─── Health check ────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    name: 'OrchardAgent',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// ─── WhatsApp Webhook ─────────────────────────────────────────────────────────
app.post('/webhook/whatsapp', async (req, res) => {
  // Respond to Twilio immediately (required within 15 seconds)
  res.type('text/xml').send(twimlResponse());

  const incoming = parseIncoming(req.body);
  const { from, messageBody } = incoming;

  console.log(`\n📱 Message from ${from}: ${messageBody}`);

  // Identify user
  const user = config.getUserByPhone(from);

  if (!user) {
    console.log(`Unknown number: ${from} - ignoring`);
    return;
  }

  console.log(`👤 User identified: ${user.name} (${user.role})`);

  try {
    // Handle voice notes (audio)
    if (incoming.numMedia > 0 && incoming.mediaContentType?.startsWith('audio/')) {
      console.log('🎙️ Voice note received - transcription coming soon');
      await sendMessage(from,
        `קיבלתי את ההקלטה שלך ${user.name}! כרגע אני עדיין לומד לטפל בהקלטות קוליות. בינתיים אפשר לכתוב לי?`
      );
      return;
    }

    // Skip empty messages
    if (!messageBody.trim()) {
      console.log('Empty message - skipping');
      return;
    }

    // Process with Claude
    const reply = await processMessage({
      from,
      body: messageBody,
      user,
    });

    // Send reply back via WhatsApp
    await sendMessage(from, reply);
    console.log(`✅ Reply sent to ${user.name}`);

  } catch (error) {
    console.error('Webhook processing error:', error);
    await sendMessage(from, 'סליחה, הייתה בעיה טכנית. נסה שוב בעוד רגע.');
  }
});

// ─── Start server ─────────────────────────────────────────────────────────────
const PORT = config.port;
app.listen(PORT, () => {
  console.log(`
🌿 OrchardAgent is running!
   Port: ${PORT}
   Webhook: http://localhost:${PORT}/webhook/whatsapp
   
   Users configured:
   - אביק:  ${config.users.avik.phone  || '⚠️ not set'}
   - תומר:  ${config.users.tomer.phone || '⚠️ not set'}
   - שחר:   ${config.users.shahar.phone || '⚠️ not set'}
  `);
});
