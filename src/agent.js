const Anthropic = require('@anthropic-ai/sdk');
const config = require('./config');
const db = require('./database');

const anthropic = new Anthropic({ apiKey: config.anthropic.apiKey });

// ─── System Prompts ──────────────────────────────────────────────────────────

const AVIK_SYSTEM_PROMPT = `אתה OrchardAgent - סוכן AI שתפקידו לשמר את הידע החקלאי של אביק לב, חקלאי מנוסה המגדל מנדרינות בפרדסים משפחתיים בישראל.

## תפקידך
לנהל שיחות טבעיות עם אביק בוואטסאפ, לחלץ ממנו ידע חקלאי עשיר, ולאחסן אותו בצורה מובנית עבור בני משפחתו.
אתה מדבר תמיד בעברית. אתה סבלני, מכבד, ומעוניין אמיתית. אתה לא רובוט - אתה שיחה עם מישהו שמכבד את הניסיון של אביק.

## מידע על הפרדס
- 6 חלקות, סה"כ 17 דונם, זני מנדרינות אור ואורה
- חלקה 1: ב' עליון - 2.5 דונם - זן אור (קבוצה א', סמוכה לחלקה 2)
- חלקה 2: ב' תחתון - 2.5 דונם - זן אורה+אור מעורב (קבוצה א', טיפולים נפרדים לפי זן)
- חלקה 3: אשכוליות - 6 דונם - זן אור (עצמאית, לא סמוכה לאחרות)
- חלקה 4: אפרסמון - 2.5 דונם - זן אור (קבוצה ב', סמוכות 4+5+6)
- חלקה 5: טמפל - 2.5 דונם - זן אור (קבוצה ב')
- חלקה 6: הום תומר - 1 דונם - זן אור (קבוצה ב')

## ספקים ידועים
- נדב מלר קדרון: ריסוס, 0505247243
- יאיר ארנר: ייעוץ מקצועי, 0528422555
- צביקה כהן: מים, 0525268883
- מטיב כימיקלים: דשן

## כללי שיחה
- שאלה אחת ברורה בכל הודעה - לא להציף
- להראות עניין אמיתי: "מעניין מאוד, ספר לי עוד על..."
- כשמזכיר פעולה - לשאול: מה בדיוק? מתי? על אילו חלקות? ממי קונים? כמה עולה?
- לא להגיד לאביק שיש שיטה טובה יותר
- לא לתקן אותו - לא ישיר ולא עקיף
- לא לשאול יותר משאלה אחת בהודעה

## חילוץ נתונים
כשיש מספיק מידע על פעולה, הוסף בסוף התשובה שלך (בשורה נפרדת):
[RECORD]
פעולה: ...
תזמון: ...
חלקה: ...
זן: ...
חומרים: ...
ספק: ...
עלות: ...
ניואנסים: ...
[/RECORD]

## תובנות למשפחה
אם שיטת אביק שונה מפרקטיקה מקובלת, הוסף:
[INSIGHT]
נושא: ...
שיטת אביק: ...
חלופה: ...
[/INSIGHT]`;

const MANAGER_SYSTEM_PROMPT = `אתה OrchardAgent - עוזר לתומר ושחר לב לנהל את פרויקט שימור הידע החקלאי של אביק (סבא).

## תפקידך עם תומר/שחר
- לענות על שאלות על הפרדס ועל הפרויקט
- לדווח על מה שנלמד מאביק עד כה
- לקבל הנחיות ושאלות המשך לשאול את אביק
- לדווח על נתונים שממתינים לאישור

## מידע על הפרדס
אותו מידע כמו עם אביק - 6 חלקות, 17 דונם, זני אור ואורה.

## פקודות מיוחדות
אם תומר/שחר כותבים "שאל את אביק: [שאלה]" - אמר להם שתעביר את השאלה לאביק בשיחה הבאה.
אם כותבים "מה למדנו?" - תסכם את הידע שנאסף עד כה.
אם כותבים "מה ממתין?" - תפרט נתונים שממתינים לאישור.

דבר בעברית, בגובה העיניים, כמו עמית לעבודה.`;

// ─── Main agent function ─────────────────────────────────────────────────────

async function processMessage({ from, body, user }) {
  // Choose system prompt based on user role
  const systemPrompt = user.role === 'source' ? AVIK_SYSTEM_PROMPT : MANAGER_SYSTEM_PROMPT;

  // Save incoming message
  await db.saveMessage({ from, role: 'user', content: body });

  // Get conversation history
  const history = await db.getConversationHistory(from, 20);

  // Build messages for Claude (history already includes current message)
  const messages = history.length > 0 ? history : [{ role: 'user', content: body }];

  try {
    const response = await anthropic.messages.create({
      model: config.anthropic.model,
      max_tokens: 1024,
      system: systemPrompt,
      messages,
    });

    const fullResponse = response.content[0].text;

    // Extract clean reply (without [RECORD] and [INSIGHT] blocks)
    const replyText = extractReply(fullResponse);

    // Parse and save any extracted records
    const records = extractRecords(fullResponse);
    for (const record of records) {
      await db.saveRecord({ ...record, source_phone: from, approved: false });
      console.log('Saved record:', record.action);
    }

    // Parse and save any insights
    const insights = extractInsights(fullResponse);
    for (const insight of insights) {
      await db.saveInsight({ ...insight, source_phone: from });
      console.log('Saved insight:', insight.topic);
    }

    // Save agent response
    await db.saveMessage({ from, role: 'assistant', content: replyText });

    return replyText;

  } catch (error) {
    console.error('Claude API error:', error);
    return 'סליחה, הייתה בעיה טכנית. נסה שוב בעוד רגע.';
  }
}

// ─── Parsing helpers ─────────────────────────────────────────────────────────

function extractReply(text) {
  // Remove [RECORD]...[/RECORD] and [INSIGHT]...[/INSIGHT] blocks
  return text
    .replace(/\[RECORD\][\s\S]*?\[\/RECORD\]/g, '')
    .replace(/\[INSIGHT\][\s\S]*?\[\/INSIGHT\]/g, '')
    .trim();
}

function extractRecords(text) {
  const records = [];
  const regex = /\[RECORD\]([\s\S]*?)\[\/RECORD\]/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    const block = match[1];
    const record = parseBlock(block);
    if (record.action) records.push(record);
  }

  return records;
}

function extractInsights(text) {
  const insights = [];
  const regex = /\[INSIGHT\]([\s\S]*?)\[\/INSIGHT\]/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    const block = match[1];
    const insight = parseBlock(block);
    if (insight.topic) insights.push(insight);
  }

  return insights;
}

function parseBlock(block) {
  const result = {};
  const lines = block.trim().split('\n');

  for (const line of lines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;

    const rawKey = line.substring(0, colonIdx).trim();
    const value = line.substring(colonIdx + 1).trim();

    // Map Hebrew keys to English DB field names
    const keyMap = {
      'פעולה': 'action',
      'תזמון': 'timing',
      'חלקה': 'plot',
      'זן': 'variety',
      'חומרים': 'materials',
      'ספק': 'supplier',
      'עלות': 'cost',
      'ניואנסים': 'nuances',
      'נושא': 'topic',
      'שיטת אביק': 'avik_method',
      'חלופה': 'alternative',
    };

    const key = keyMap[rawKey] || rawKey;
    if (value) result[key] = value;
  }

  return result;
}

module.exports = { processMessage };
