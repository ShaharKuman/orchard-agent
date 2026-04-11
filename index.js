require('dotenv').config();
const express = require('express');
const { processMessage } = require('./src/agent');
const { sendMessage, parseIncoming, downloadMedia } = require('./src/whatsapp');
const config = require('./src/config');

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ status: 'ok', name: 'OrchardAgent', version: '1.0.0', timestamp: new Date().toISOString() });
});

app.post('/webhook/whatsapp', async (req, res) => {
  const incoming = parseIncoming(req.body);
  const { from, messageBody, mediaUrl, mediaContentType, numMedia } = incoming;

  console.log(`📱 Message from ${from}: ${messageBody || '[media]'}`);

  const user = config.getUserByPhone(from);
  if (!user) {
    console.log(`Unknown: ${from}`);
    return res.sendStatus(200);
  }

  console.log(`👤 ${user.name} (${user.role})`);

  try {
    if (!messageBody.trim() && numMedia === 0) return res.sendStatus(200);

    // Download media if present
    let media = null;
    if (numMedia > 0 && mediaUrl) {
      console.log(`📎 Media detected: ${mediaContentType}`);
      media = await downloadMedia(mediaUrl);
    }

    const reply = await processMessage({ from, body: messageBody, user, media, mediaContentType });
    await sendMessage(from, reply);
    console.log(`✅ Reply sent to ${user.name}`);
  } catch (error) {
    console.error('Error:', error);
    try { await sendMessage(from, 'סליחה, הייתה בעיה. נסה שוב.'); } catch(e) {}
  }

  res.sendStatus(200);
});

module.exports = app;
