/**
 * One-time backfill: extract season-2025 operations from saved Avik messages.
 * Run from the repo root:  node scripts/backfill_2025.js
 *
 * What it does:
 *   1. Fetches all messages from Avik's phone (both his words and agent replies)
 *   2. Sends the full conversation to Claude with a focused extraction prompt
 *   3. Parses [RECORD] blocks from the response
 *   4. Saves each operation with approved=false and source='backfill_2025'
 *   5. Prints a summary of what was saved
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const Anthropic = require('@anthropic-ai/sdk');
const db = require('../src/database');
const config = require('../src/config');

const anthropic = new Anthropic({ apiKey: config.anthropic.apiKey });

// ─── PARSING (same helpers as agent.js) ──────────────────────────────────────

function extractJsonBlocks(text, tag) {
  const results = [];
  const regex = new RegExp(`\\*{0,2}\\[${tag}\\]\\*{0,2}([\\s\\S]*?)\\*{0,2}\\[\\/${tag}\\]\\*{0,2}`, 'g');
  let match;
  while ((match = regex.exec(text)) !== null) {
    const raw = match[1].trim();
    const cleaned = raw
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/, '')
      .replace(/```\s*$/, '')
      .trim();
    try {
      results.push(JSON.parse(cleaned));
    } catch (e) {
      console.warn(`  ⚠️  JSON parse failed for [${tag}] block:`, e.message, '\n  raw:', cleaned);
    }
  }
  return results;
}

function parsePlotIds(plotsStr) {
  if (!plotsStr) return [];
  const str = String(plotsStr).trim();
  if (str === 'הכל' || str === 'all') return [1, 2, 3, 4, 5, 6];
  return str.split(',')
    .map(s => parseInt(s.trim()))
    .filter(n => !isNaN(n) && n >= 1 && n <= 6);
}

function parseOperations(text) {
  return extractJsonBlocks(text, 'RECORD').map(obj => ({
    operation_type: obj.operation_type || 'אחר',
    season_year:    obj.season_year    || null,
    date_start:     obj.date_start     || null,
    date_end:       obj.date_end       || null,
    timing_desc:    obj.timing_desc    || null,
    variety:        obj.variety        || null,
    executor:       obj.executor       || null,
    supplier:       obj.supplier       || null,
    cost_total:     obj.cost_total     || null,
    cost_per_dunam: obj.cost_per_dunam || null,
    notes:          obj.notes          || null,
    plot_ids:       parsePlotIds(obj.plots),
    materials:      Array.isArray(obj.materials)
      ? obj.materials.filter(m => m.product_name).map(m => ({
          product_name: m.product_name,
          quantity:     m.quantity  || null,
          unit:         m.unit      || null,
          dilution:     m.dilution  || null,
        }))
      : [],
  }));
}

// ─── FETCH MESSAGES ───────────────────────────────────────────────────────────

async function fetchAvikMessages() {
  const avikPhone = config.users.avik.phone;
  if (!avikPhone) throw new Error('AVIK_PHONE not set in .env');

  console.log(`📱 Fetching messages for Avik (${avikPhone})...`);

  const { data, error } = await db.supabase
    .from('messages')
    .select('id, role, content, created_at')
    .eq('from_phone', avikPhone)
    .order('created_at', { ascending: true });

  if (error) throw new Error(`Supabase fetch error: ${JSON.stringify(error)}`);

  console.log(`   Found ${data.length} messages`);
  return data;
}

// ─── BUILD EXTRACTION PROMPT ──────────────────────────────────────────────────

function buildExtractionPrompt(messages) {
  const orchardContext = `
הפרדס של אביק לב:
- חלקה 1: שדמות — 6.5 דונם — מנדרינה — צפון
- חלקה 2: בית — 8 דונם — מנדרינה — מרכז
- חלקה 3: אשכוליות — 5 דונם — אשכולית — דרום
- חלקה 4: הר — 10 דונם — מנדרינה — הרים
- חלקה 5: עמק — 7 דונם — קלמנטינה — עמק
- חלקה 6: גן — 4 דונם — מנדרינה — גן
`.trim();

  const conversation = messages
    .map(m => `[${m.role === 'user' ? 'אביק' : 'סוכן'} | ${m.created_at.slice(0, 10)}]\n${m.content}`)
    .join('\n\n---\n\n');

  return `להלן שיחה בין אביק לב (חקלאי) לבין סוכן AI. קרא את כל השיחה ומצא את כל הפעולות החקלאיות שבוצעו בעונת 2025 (שנת הגידול 2025).

${orchardContext}

עבור כל פעולה שמצאת, הוצא [RECORD] בדיוק בפורמט הזה:
[RECORD]
{"operation_type":"","season_year":"","date_start":"","date_end":"","timing_desc":"","plots":"","variety":"","executor":"","supplier":"","cost_total":null,"cost_per_dunam":null,"notes":"","materials":[{"product_name":"","quantity":null,"unit":"","dilution":""}]}
[/RECORD]

כללים:
- operation_type: ריסוס / דישון / השקיה / גיזום / קטיף / דילול / טיפול_קרקע / בדיקה / ייעוץ / אחר
- season_year: תמיד "2025"
- plots: מספרי חלקות (1-6) מופרדים בפסיק, או "הכל"
- date_start: YYYY-MM-DD אם ידוע
- timing_desc: תיאור זמן אם אין תאריך מדויק
- מלא רק שדות שיש עליהם מידע בשיחה
- אם חומר ריסוס/דישון מוזכר — הוסף אותו ב-materials
- הוצא [RECORD] נפרד לכל פעולה
- אל תמציא מידע שלא מופיע בשיחה

השיחה:
---
${conversation}
---

הוצא עכשיו את כל פעולות 2025:`;
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🌳 OrchardAgent — Backfill 2025 operations\n');

  // 1. Fetch messages
  const messages = await fetchAvikMessages();
  if (messages.length === 0) {
    console.log('No messages found. Exiting.');
    return;
  }

  // 2. Ask Claude to extract all 2025 operations
  console.log('\n🤖 Sending conversation to Claude for extraction...');
  const prompt = buildExtractionPrompt(messages);

  const response = await anthropic.messages.create({
    model: config.anthropic.model,
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  });

  const rawText = response.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('');

  console.log('\n📄 Claude response:\n');
  console.log(rawText);
  console.log('\n' + '─'.repeat(60) + '\n');

  // 3. Parse operations
  const operations = parseOperations(rawText);
  console.log(`📦 Parsed ${operations.length} operation(s)`);

  if (operations.length === 0) {
    console.log('Nothing to save.');
    return;
  }

  // 4. Save each operation
  console.log('\n💾 Saving to Supabase...\n');
  let saved = 0;
  for (const op of operations) {
    console.log(`  → ${op.operation_type} | ${op.date_start || op.timing_desc || '?'} | plots: ${op.plot_ids.join(',') || '?'}`);
    const supplierId = await db.findSupplierByName(op.supplier);
    const result = await db.saveOperation({
      operation: {
        season_year:    op.season_year    || '2025',
        operation_type: op.operation_type,
        date_start:     op.date_start     || null,
        date_end:       op.date_end       || null,
        timing_desc:    op.timing_desc    || null,
        variety:        op.variety        || null,
        executor:       op.executor       || null,
        supplier_id:    supplierId,
        cost_total:     op.cost_total     || null,
        cost_per_dunam: op.cost_per_dunam || null,
        notes:          op.notes          || null,
      },
      plotIds:   op.plot_ids,
      materials: op.materials,
      messageId: null,
      source:    'backfill_2025',
    });
    if (result) saved++;
  }

  console.log(`\n✅ Done — saved ${saved}/${operations.length} operations (approved=false, source=backfill_2025)`);
  console.log('   Review and approve them in the Supabase dashboard.\n');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
