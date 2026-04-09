require('dotenv').config();

const config = {
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: 'claude-sonnet-4-6',
  },
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    whatsappNumber: process.env.TWILIO_WHATSAPP_NUMBER,
  },
  supabase: {
    url: process.env.SUPABASE_URL,
    secretKey: process.env.SUPABASE_SECRET_KEY,
  },
  users: {
    avik:   { phone: process.env.AVIK_PHONE,   name: 'אביק',  role: 'source'  },
    tomer:  { phone: process.env.TOMER_PHONE,  name: 'תומר',  role: 'manager' },
    shahar: { phone: process.env.SHAHAR_PHONE, name: 'שחר',   role: 'manager' },
  },
  port: process.env.PORT || 3000,
};

// Resolve phone -> user
config.getUserByPhone = (phone) => {
  for (const [key, user] of Object.entries(config.users)) {
    if (user.phone === phone) return { ...user, id: key };
  }
  return null;
};

module.exports = config;
