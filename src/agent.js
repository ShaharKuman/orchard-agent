const Anthropic = require('@anthropic-ai/sdk');
const config = require('./config');
const db = require('./database');

const anthropic = new Anthropic({ apiKey: config.anthropic.apiKey });

// -─── STATIC SYSTEM PROMPT RULES ──────────────────────────────────────────────
// Orchard facts (plots, suppliers) are injected dynamically from DB.
// Only behavioral rules live here.

const AVIK_RULES = `אתה OrchardAgent - סוכן AI שתפקידו לשמר את הידע החקלאי של אביק לב, חקלאי מנוסה המגדל מנדרינות בפרדסים משפחתיים בישראל.

## תפקידך
לנהל שיחות טבעיות עם אביק בוואטסאפ, לחלץ ממנו ידע חקלאי עשיר, ולאחסן אותו בצורה מובנית עבור בני משפחתו.
אתה מדבר תמיד בעברית. אתה סבלני, מכבד, ומעוניין אמיתית. אתה לא רובוט - אתה שיחה עם מישהו שמכבד את הניסיון של אביק.

## פורמט תשובות
אתה מדבר בוואטסאפ — אל תשתמש במארקדאון (כוכביות, קווים תחתיים, כותרות). כתוב טקסט פשוט בלבד.
כשאתה שומר פעולה, כתוב תחילה סיכום קצר בעברית של מה שתיעדת, ואז הוסף את בלוק ה-[RECORD].
לדוגמה: "תיעדתי ריסוס אנטיו 2% באשכוליות ב-17/4, נדב מלר, עלות 1000 ש״ח. יש עוד פרטים להוסיף?"

## כללי שיחה
- שאלה אחת ברורה בכל הודעה - לא להציף
- להראות עניין אמיתי: "מעניין מאוד, ספר לי עוד על..."
- כשמזכיר פעולה - לשאול בעדינות: מה בדיוק? מתי? על אילו חלקות? ממי קונים? כמה עולה?
- לא להגיד לאביק שיש שיטה טובה יותר
- לא לתקן אותו - לא ישיר ולא עקיף
- לא לשאול יותר משאלה אחת בהודעה
- אם חסר מידע בפעולה — שאל עליו בשיחה הבאה, בצורה טבעית

## קבלת תמונות
אביק עשוי לשלוח תמונות מסוגים שונים:
- תמונה של בעיה בעץ או בפרי — תאר מה אתה רואה, שאל שאלה אחת על ההקשר
- צילום מסך של מסמך, חשבונית או הוראות — חלץ את המידע הרלוונטי
- תמונה של פעולה שבוצעה בפרדס — התייחס אליה כמו הודעת טקסט עם תוכן ויזואלי
תמיד ציין שראית את התמונה ותאר בקצרה מה זיהית לפני שאתה שואל.

## שימוש בחיפוש ברשת
יש לך כלי חיפוש ברשת. השתמש בו כאשר:
- אביק מזכיר חומר ריסוס או דשן — חפש מידע על הריכוז המומלץ
- אביק מזכיר מחלה או מזיק — חפש פרקטיקות טיפול
- רוצה להשוות שיטת אביק לפרקטיקה מקובלת בענף
אל תשתף את תוצאות החיפוש עם אביק — שמור אותן לדשבורד בלבד.

## חילוץ פעולה קונקרטית
כשיש מידע על פעולה שבוצעה בפרדס, הוסף בסוף התשובה שלך את הבלוק הבא בדיוק — ללא שינויים, ללא עיצוב, ללא כוכביות:
[RECORD]
{"operation_type":"","season_year":"","date_start":"","timing_desc":"","plots":"","variety":"","executor":"","supplier":"","cost_total":null,"cost_per_dunam":null,"notes":"","materials":[{"product_name":"","quantity":null,"unit":"","dilution":""}]}
[/RECORD]

מלא רק שדות שיש עליהם מידע. השאר שדות ריקים ("") או null אם לא ידוע.
operation_type: ריסוס / דישון / השקיה / גיזום / קטיף / דילול / טיפול_קרקע / בדיקה / ייעוץ / אחר
plots: מספרי חלקות מופרדים בפסיק כגון "1,2" או "הכל"
date_start: YYYY-MM-DD אם ידוע, אחרת השאר ריק ומלא timing_desc
materials: מערך של חומרים, כל אחד עם שם, כמות, יחידה וריכוז
אפשר לכלול מספר בלוקי [RECORD] נפרדים אם יש מספר פעולות.

## חילוץ ידע כללי
כשיש מידע על שיטת עבודה כללית, נורמה, או כלל אצבע (לא פעולה ספציפית), הוסף:
[CONCEPT]
{"category":"","topic":"","content":"","plots":"","variety":"","valid_from":""}
[/CONCEPT]

category: השקיה / ריסוס / דישון / גיזום / קטיף / אחר

## תיקון נתונים קיימים
כשמתקנים מידע קודם, הוסף:
[UPDATE]
{"table":"","id":null,"field":"","new_value":"","reason":""}
[/UPDATE]

table: operations / plots / suppliers / knowledge_concepts

## תובנות למשפחה
אם מצאת בחיפוש שיטה שונה, הוסף:
[INSIGHT]
{"topic":"","avik_method":"","alternative":"","source":""}
[/INSIGHT]`;

const MANAGER_RULES = `אתה OrchardAgent - עוזר לתומר ושחר לב לנהל את פרויקט שימור הידע החקלאי של אביק (סבא).

## פורמט תשובות
אתה מדבר בוואטסאפ — אל תשתמש במארקדאון (כוכביות, קווים תחתיים, כותרות). כתוב טקסט פשוט בלבד.
כשאתה שומר פעולה, כתוב תחילה סיכום קצר של מה שתיעדת, ואז הוסף את בלוק ה-[RECORD].

## תפקידך עם תומר/שחר
- לענות על שאלות על הפרדס ועל הפרויקט
- לדווח על מה שנלמד מאביק עד כה
- לקבל ממך מידע ועדכונים ולשמור אותם (בדיוק כמו שאביק מספק מידע)
- לקבל הנחיות ושאלות המשך לשאול את אביק
- לדווח על נתונים שממתינים לאישור
- לחפש מידע ברשת על נושאים חקלאיים כשנשאל

## פקודות מיוחדות
- "שאל את אביק: [שאלה]" — אמר שתעביר לאביק
- "מה למדנו?" — סכם ידע שנאסף
- "מה ממתין?" — פרט נתונים לאישור
- "חפש: [נושא]" — חפש מידע חקלאי ברשת ודווח

## חילוץ נתונים
כשתומר או שחר מספקים מידע על פעולה או ידע כללי — חלץ אותו בדיוק כמו שאתה עושה עם אביק.
השתמש באותם בלוקי JSON — ללא כוכביות, ללא עיצוב, בדיוק בפורמט הזה:

[RECORD]
{"operation_type":"","season_year":"","date_start":"","timing_desc":"","plots":"","variety":"","executor":"","supplier":"","cost_total":null,"cost_per_dunam":null,"notes":"","materials":[{"product_name":"","quantity":null,"unit":"","dilution":""}]}
[/RECORD]

[CONCEPT]
{"category":"","topic":"","content":"","plots":"","variety":"","valid_from":""}
[/CONCEPT]

[UPDATE]
{"table":"","id":null,"field":"","new_value":"","reason":""}
[/UPDATE]

operation_type: ריסוס / דישון / השקיה / גיזום / קטיף / דילול / טיפול_קרקע / בדיקה / ייעוץ / אחר
plots: מספרי חלקות מופרדים בפסיק כגון "1,2" או "הכל"

יש לך כלי חיפוש ברשת — השתמש בו בחופשיות.
דבר בעברית, בגובה העיניים, כמו עמית לעבודה.`;

// ─── WEB SEARCH TOOL ─────────────────────────────────────────────────────────

const WEB_SEARCH_TOOL = {
  type: 'web_search_20250305',
  name: 'web_search',
};

// ─── BUILD DYNAMIC SYSTEM PROMPT ─────────────────────────────────────────────

async function buildSystemPrompt(isAvik, orchardContext, pendingQuestion) {
  const rules = isAvik ? AVIK_RULES : MANAGER_RULES;

  // Inject live orchard data from DB
  let orchardSection = `\n\n## הפרדס — נתונים עדכניים\n`;
  orchardSection += `סה"כ: ${orchardContext.totalDunam} דונם | 6 חלקות\n`;
  orchardSection += orchardContext.plotsText + '\n\n';
  orchardSection += `### ספקים ידועים\n${orchardContext.suppliersText}`;

  // Inject accumulated knowledge
  const concepts = await db.getRelevantConcepts();
  let conceptsSection = '';
  if (concepts) {
    conceptsSection = `\n\n## ידע שנצבר — פרקטיקות כלליות\n${concepts}`;
  }

  // Inject recent approved operations
  const operations = await db.getRelevantOperations(10);
  let operationsSection = '';
  if (operations) {
    operationsSection = `\n\n## פעולות אחרונות שתועדו (לשימושך בלבד — אל תקרא אותן לאביק)\n${operations}`;
  }

  // Inject pending question if exists
  let pendingSection = '';
  if (pendingQuestion) {
    pendingSection = `\n\n## שאלה ממתינה מתומר/שחר\nבשיחה הזו, מצא רגע טבעי לשאול את אביק: "${pendingQuestion.question}"\nשאל אותה כשאלה אחת ברורה, כחלק מהשיחה הטבעית. אל תאמר שהיא הגיעה מתומר או שחר.`;
  }

  return rules + orchardSection + conceptsSection + operationsSection + pendingSection;
}

// ─── DETERMINE SOURCE ─────────────────────────────────────────────────────────

function determineSource(user, mediaContentType) {
  const sender = user.id; // avik / tomer / shahar
  if (!mediaContentType) return `text_${sender}`;
  if (mediaContentType.startsWith('image/')) return `image_${sender}`;
  if (mediaContentType.startsWith('audio/')) return `voice_${sender}`;
  return `media_${sender}`;
}

// ─── MAIN AGENT FUNCTION ─────────────────────────────────────────────────────

async function processMessage({ from, body, user, media = null, mediaContentType = null }) {
  const isAvik = user.role === 'source';
  const source = determineSource(user, mediaContentType);

  // Fetch all context in parallel
  const [orchardContext, history, pendingQuestions] = await Promise.all([
    db.getOrchardContext(),
    db.getConversationHistory(from, 20),
    isAvik ? db.getPendingQuestions() : Promise.resolve([]),
  ]);

  const pendingQuestion = pendingQuestions.length > 0 ? pendingQuestions[0] : null;

  // Build dynamic system prompt
  const systemPrompt = await buildSystemPrompt(isAvik, orchardContext, pendingQuestion);

  // Build user message content — text only, or text + image
  let userMessageContent;
  if (media && mediaContentType && mediaContentType.startsWith('image/')) {
    console.log(`🖼️ Processing image: ${mediaContentType}`);
    userMessageContent = [
      {
        type: 'image',
        source: { type: 'base64', media_type: mediaContentType, data: media.base64 },
      },
    ];
    if (body && body.trim()) {
      userMessageContent.push({ type: 'text', text: body });
    }
  } else {
    userMessageContent = body;
  }

  const messageType = media
    ? (mediaContentType && mediaContentType.startsWith('image/') ? 'image' : 'media')
    : 'text';

  const messages = [...history, { role: 'user', content: userMessageContent }];

  try {
    // Call Claude — may trigger web search
    let currentResponse = await anthropic.messages.create({
      model: config.anthropic.model,
      max_tokens: 1500,
      system: systemPrompt,
      tools: [WEB_SEARCH_TOOL],
      messages,
    });

    // Handle built-in web search loop
    while (currentResponse.stop_reason === 'tool_use') {
      console.log(`🔍 Web search triggered`);
      const continueMessages = [
        ...messages,
        { role: 'assistant', content: currentResponse.content },
      ];
      currentResponse = await anthropic.messages.create({
        model: config.anthropic.model,
        max_tokens: 1500,
        system: systemPrompt,
        tools: [WEB_SEARCH_TOOL],
        messages: continueMessages,
      });
    }

    const fullResponse = currentResponse.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('');

    const replyText = extractReply(fullResponse);

    // Save user message first — get its ID for linking
    const savedUserMsg = await db.saveMessage({
      from, role: 'user', content: body || '[media]', messageType,
    });
    const messageId = savedUserMsg ? savedUserMsg.id : null;

    // Extract and save operations
    const operations = extractOperations(fullResponse);
    console.log(`📦 Extracted ${operations.length} operation(s), ${extractConcepts(fullResponse).length} concept(s)`);
    for (const op of operations) {
      const supplierId = await db.findSupplierByName(op.supplier);
      await db.saveOperation({
        operation: {
          season_year:    op.season_year    || null,
          operation_type: op.operation_type || 'אחר',
          date_start:     op.date_start     || null,
          timing_desc:    op.timing_desc    || null,
          variety:        op.variety        || null,
          executor:       op.executor       || null,
          supplier_id:    supplierId,
          cost_total:     op.cost_total     || null,
          cost_per_dunam: op.cost_per_dunam || null,
          notes:          op.notes          || null,
        },
        plotIds:   op.plot_ids || [],
        materials: op.materials || [],
        messageId,
        source,
      });
    }

    // Extract and save concepts
    const concepts = extractConcepts(fullResponse);
    for (const concept of concepts) {
      await db.saveConcept({
        concept,
        plotIds: concept.plot_ids || [],
        messageId,
        source,
      });
    }

    // Extract and apply updates
    const updates = extractUpdates(fullResponse);
    for (const update of updates) {
      await db.updateRecord({ ...update, source });
    }

    // Extract and save insights
    const insights = extractInsights(fullResponse);
    for (const insight of insights) {
      await db.saveInsight({ ...insight, source_phone: from });
    }

    // Save assistant reply
    await db.saveMessage({ from, role: 'assistant', content: replyText });

    // Mark pending question as asked
    if (pendingQuestion) {
      await db.markQuestionAsked(pendingQuestion.id);
      console.log(`✅ Pending question asked: "${pendingQuestion.question}"`);
    }

    return replyText;

  } catch (error) {
    console.error('Claude API error:', error);
    return 'סליחה, הייתה בעיה טכנית. נסה שוב בעוד רגע.';
  }
}

// ─── PARSING HELPERS ─────────────────────────────────────────────────────────

function extractReply(text) {
  return text
    .replace(/\*?\[RECORD\]\*?[\s\S]*?\*?\[\/RECORD\]\*?/g, '')
    .replace(/\*?\[CONCEPT\]\*?[\s\S]*?\*?\[\/CONCEPT\]\*?/g, '')
    .replace(/\*?\[UPDATE\]\*?[\s\S]*?\*?\[\/UPDATE\]\*?/g, '')
    .replace(/\*?\[INSIGHT\]\*?[\s\S]*?\*?\[\/INSIGHT\]\*?/g, '')
    .trim();
}

// Extract JSON from inside a block tag, handling markdown asterisks
function extractJsonBlocks(text, tag) {
  const results = [];
  const regex = new RegExp(`\\*?\\[${tag}\\]\\*?([\\s\\S]*?)\\*?\\[\\/${tag}\\]\\*?`, 'g');
  let match;
  while ((match = regex.exec(text)) !== null) {
    const raw = match[1].trim();
    // Strip any markdown formatting Claude might add around the JSON
    const cleaned = raw.replace(/^```json\s*/, '').replace(/```\s*$/, '').trim();
    try {
      const parsed = JSON.parse(cleaned);
      results.push(parsed);
    } catch (e) {
      console.error(`Failed to parse ${tag} JSON:`, cleaned, e.message);
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

function extractOperations(text) {
  return extractJsonBlocks(text, 'RECORD').map(obj => ({
    operation_type: obj.operation_type || 'אחר',
    season_year:    obj.season_year    || null,
    date_start:     obj.date_start     || null,
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
          product_name: m.product_name || null,
          quantity:     m.quantity     || null,
          unit:         m.unit         || null,
          dilution:     m.dilution     || null,
        }))
      : [],
  }));
}

function extractConcepts(text) {
  return extractJsonBlocks(text, 'CONCEPT').map(obj => ({
    category:   obj.category   || null,
    topic:      obj.topic      || null,
    content:    obj.content    || null,
    variety:    obj.variety    || null,
    valid_from: obj.valid_from || null,
    plot_ids:   parsePlotIds(obj.plots),
  })).filter(c => c.category && c.topic && c.content);
}

function extractUpdates(text) {
  return extractJsonBlocks(text, 'UPDATE').map(obj => ({
    table:    obj.table     || null,
    id:       parseInt(obj.id),
    field:    obj.field     || null,
    newValue: obj.new_value || null,
    reason:   obj.reason    || null,
  })).filter(u => u.table && u.id && u.field && u.newValue);
}

function extractInsights(text) {
  return extractJsonBlocks(text, 'INSIGHT').map(obj => ({
    topic:       obj.topic       || null,
    avik_method: obj.avik_method || null,
    alternative: obj.alternative || null,
    source:      obj.source      || null,
  })).filter(i => i.topic);
}

module.exports = { processMessage };
