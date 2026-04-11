const twilio = require('twilio');
const config = require('./config');

const client = twilio(config.twilio.accountSid, config.twilio.authToken);

async function sendMessage(to, body) {
  try {
    const message = await client.messages.create({
      from: config.twilio.whatsappNumber,
      to,
      body,
    });
    console.log(`Message sent to ${to}: ${message.sid}`);
    return message;
  } catch (error) {
    console.error('Twilio send error:', error);
    throw error;
  }
}

// Parse incoming Twilio webhook
function parseIncoming(body) {
  return {
    from: body.From,
    to: body.To,
    messageBody: body.Body || '',
    numMedia: parseInt(body.NumMedia || '0'),
    mediaUrl: body.MediaUrl0 || null,
    mediaContentType: body.MediaContentType0 || null,
  };
}

// Download media from Twilio (requires Basic Auth — Twilio media URLs are protected)
async function downloadMedia(mediaUrl) {
  const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));
  const credentials = Buffer.from(
    `${config.twilio.accountSid}:${config.twilio.authToken}`
  ).toString('base64');

  const response = await fetch(mediaUrl, {
    headers: { Authorization: `Basic ${credentials}` },
  });

  if (!response.ok) {
    throw new Error(`Failed to download media: ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get('content-type') || 'application/octet-stream';
  const buffer = await response.buffer();
  const base64 = buffer.toString('base64');

  return { base64, contentType };
}

// Generate TwiML response (empty - we reply async)
function twimlResponse() {
  const MessagingResponse = twilio.twiml.MessagingResponse;
  const twiml = new MessagingResponse();
  return twiml.toString();
}

module.exports = { sendMessage, parseIncoming, twimlResponse, downloadMedia };
