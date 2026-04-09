# OrchardAgent 🌿

Agricultural knowledge preservation system for Lev family orchards.

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
```
Edit `.env` and fill in all values:
- `ANTHROPIC_API_KEY` - from console.anthropic.com
- `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` - from console.twilio.com
- `SUPABASE_URL` + `SUPABASE_SECRET_KEY` - from supabase.com dashboard
- Phone numbers for Avik, Tomer, Shahar (format: `whatsapp:+972XXXXXXXXX`)

### 3. Create database tables
Go to Supabase → SQL Editor → paste contents of `supabase/schema.sql` → Run

### 4. Run locally
```bash
npm run dev
```

### 5. Expose to internet (for Twilio webhook)
```bash
npx ngrok http 3000
```
Copy the ngrok URL (e.g. `https://abc123.ngrok.io`)

### 6. Configure Twilio webhook
Go to Twilio Console → Messaging → Settings → WhatsApp Sandbox Settings
Set "When a message comes in" to: `https://YOUR_NGROK_URL/webhook/whatsapp`

### 7. Test
Send a WhatsApp message to the Twilio sandbox number from your phone.

## Deploy (Vercel)
```bash
npm install -g vercel
vercel
```
Set environment variables in Vercel dashboard.

## Architecture
- `index.js` - Express server, WhatsApp webhook
- `src/agent.js` - Claude AI logic, knowledge extraction
- `src/whatsapp.js` - Twilio integration
- `src/database.js` - Supabase operations
- `src/config.js` - Configuration
- `supabase/schema.sql` - Database tables
