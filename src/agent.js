const Anthropic = require('@anthropic-ai/sdk');
const config = require('./config');
const db = require('./database');

const anthropic = new Anthropic({ apiKey: config.anthropic.apiKey });

// ─── STATIC SYSTEM PROMPT RULES ──────────────────────────────────────────────
// Orchard facts (plots, suppliers) are injected dynamically from DB.
// Only behavioral rules live here.

const AVIK_RULES = `אתה OrchardAgent - סוכן AI שתפקידו לשמר את הידע החקלאי של אביק לב, חקלאי מנוסה המגדל מנדרינות בפרדסים משפחתיים בישראל.

## תפקידך
לנהל שיחות טבעיות עם אביק בוואטסאפ, לחלץ ממנו ידע חקלאי עשיר, ולאחסן אותו בצורה מובנית עבור בני משפחתו.
אתה מדבר תמיד בעברית. אתה סבלני, מכבד, ומעוניין אמיתית. אתה לא רובוט - אתה שיחה עם מישהו שמכבד את הניסיון של אביק.

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
כשיש מידע על פעולה שבוצעה בפרדס, הוסף בסוף התשובה שלך — אחרי כל הטקסט — את הבלוק הבא.
חשוב: הבלוק חייב להיות בדיוק בפורמט הזה, ללא כוכביות, ללא עיצוב, ללא שינויים:
[RECORD]
סוג: (ריסוס / דישון / השקיה / גיזום / קטיף / דילול / טיפול_קרקע / בדיקה / ייעוץ / אחר)
עונה: (שנת הקטיף — לדוגמה 2025)
תאריך: (אם ידוע — YYYY-MM-DD או תיאור כמו "אפריל 2025")
חלקות: (מספרי חלקות מופרדים בפסיק — לדוגמה 1,2 — או "הכל")
זן: (אור / אורה / הכל)
מבצע: (מי ביצע — אביק / שם קבלן)
ספק: (שם הספק אם רלוונטי)
עלות_כוללת: (מספר בלבד, בשקלים)
עלות_לדונם: (מספר בלבד, בשקלים)
חומר_1_שם: (שם המוצר)
חומר_1_כמות: (מספר)
חומר_1_יחידה: (סמ"ק/דונם / ק"ג/דונם / ל'/דונם וכו')
חומר_1_ריכוז: (אם רלוונטי)
חומר_2_שם: (אם יש חומר נוסף)
חומר_2_כמות:
חומר_2_יחידה:
ניואנסים: (כל מידע נוסף חשוב)
[/RECORD]
השאר שדות ריקים אם המידע לא ידוע — אל תמציא.
אפשר לכלול מספר [RECORD] נפרדים אם יש מספר פעולות.

## חילוץ ידע כללי
כשאביק מספר על שיטת עבודה כללית, נורמה, או כלל אצבע (לא פעולה ספציפית), הוסף בסוף התשובה — ללא כוכביות, ללא עיצוב:
[CONCEPT]
קטגוריה: (השקיה / ריסוס / דישון / גיזום / קטיף / אחר)
נושא: (נושא קצר וברור — לדוגמה "כמות השקיה קיצית")
תוכן: (מה שאביק אמר, בעברית)
חלקות: (אם ספציפי לחלקות מסוימות, אחרת השאר ריק)
זן: (אם ספציפי לזן מסוים)
תקף_מ: (שנה אם ידועה)
[/CONCEPT]

## תיקון נתונים קיימים
כשאביק מתקן מידע קודם, הוסף בסוף התשובה — ללא כוכביות, ללא עיצוב:
[UPDATE]
טבלה: (operations / plots / suppliers / knowledge_concepts)
מזהה: (המזהה המספרי של הרשומה)
שדה: (שם השדה באנגלית — לדוגמה cost_total)
ערך_חדש: (הערך החדש)
סיבה: (הסבר קצר)
[/UPDATE]

## תובנות למשפחה
אם מצאת בחיפוש שיטה שונה מאביק, הוסף:
[INSIGHT]
נושא: ...
שיטת אביק: ...
חלופה: ...
מקור: ...
[/INSIGHT]`;

const MANAGER_RULES = `אתה OrchardAgent - עוזר לתומר ושחר לב לנהל את פרויקט שימור הידע החקלאי של אביק (סבא).

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
השתמש באותם בלוקים: [RECORD], [CONCEPT], [UPDATE].

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

function parseBlock(text) {
  const result = {};
  const lines = text.trim().split('\n');
  for (const line of lines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const rawKey = line.substring(0, colonIdx).trim();
    const value  = line.substring(colonIdx + 1).trim();
    if (value) result[rawKey] = value;
  }
  return result;
}

// Parse plot IDs from "1,2" or "הכל" (all 6 plots)
function parsePlotIds(plotsStr, allPlots) {
  if (!plotsStr) return [];
  const str = plotsStr.trim();
  if (str === 'הכל' || str === 'all') {
    return allPlots.map(p => p.id);
  }
  return str.split(',')
    .map(s => parseInt(s.trim()))
    .filter(n => !isNaN(n) && n >= 1 && n <= 6);
}

// Parse materials from numbered fields: חומר_1_שם, חומר_1_כמות, etc.
function parseMaterials(block) {
  const materials = [];
  let i = 1;
  while (block[`חומר_${i}_שם`]) {
    materials.push({
      product_name:   block[`חומר_${i}_שם`]    || null,
      quantity:       parseFloat(block[`חומר_${i}_כמות`]) || null,
      unit:           block[`חומר_${i}_יחידה`]  || null,
      dilution:       block[`חומר_${i}_ריכוז`]  || null,
    });
    i++;
  }
  return materials;
}

function extractOperations(text) {
  const ops = [];
  const regex = /\*?\[RECORD\]\*?([\s\S]*?)\*?\[\/RECORD\]\*?/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const block = parseBlock(match[1]);
    if (!block['סוג']) continue;

    // Parse date
    let dateStart = null;
    const dateStr = block['תאריך'];
    if (dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      dateStart = dateStr;
    }

    // Parse plot IDs (allPlots not available here — handled in processMessage)
    const plotsStr = block['חלקות'] || '';
    const plotIds = plotsStr === 'הכל'
      ? [1,2,3,4,5,6]
      : plotsStr.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));

    ops.push({
      operation_type: block['סוג'],
      season_year:    block['עונה']         || null,
      date_start:     dateStart,
      timing_desc:    block['תאריך'] && !dateStart ? block['תאריך'] : null,
      variety:        block['זן']            || null,
      executor:       block['מבצע']          || null,
      supplier:       block['ספק']           || null,
      cost_total:     parseFloat(block['עלות_כוללת'])  || null,
      cost_per_dunam: parseFloat(block['עלות_לדונם'])  || null,
      notes:          block['ניואנסים']      || null,
      plot_ids:       plotIds,
      materials:      parseMaterials(block),
    });
  }
  return ops;
}

function extractConcepts(text) {
  const concepts = [];
  const regex = /\*?\[CONCEPT\]\*?([\s\S]*?)\*?\[\/CONCEPT\]\*?/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const block = parseBlock(match[1]);
    if (!block['קטגוריה'] || !block['נושא'] || !block['תוכן']) continue;

    const plotsStr = block['חלקות'] || '';
    const plotIds = plotsStr === 'הכל'
      ? [1,2,3,4,5,6]
      : plotsStr.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));

    concepts.push({
      category:   block['קטגוריה'],
      topic:      block['נושא'],
      content:    block['תוכן'],
      variety:    block['זן']       || null,
      valid_from: block['תקף_מ']   || null,
      plot_ids:   plotIds,
    });
  }
  return concepts;
}

function extractUpdates(text) {
  const updates = [];
  const regex = /\*?\[UPDATE\]\*?([\s\S]*?)\*?\[\/UPDATE\]\*?/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const block = parseBlock(match[1]);
    if (!block['טבלה'] || !block['מזהה'] || !block['שדה'] || !block['ערך_חדש']) continue;
    updates.push({
      table:    block['טבלה'],
      id:       parseInt(block['מזהה']),
      field:    block['שדה'],
      newValue: block['ערך_חדש'],
      reason:   block['סיבה'] || null,
    });
  }
  return updates;
}

function extractInsights(text) {
  const insights = [];
  const regex = /\*?\[INSIGHT\]\*?([\s\S]*?)\*?\[\/INSIGHT\]\*?/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const block = parseBlock(match[1]);
    if (!block['נושא']) continue;
    insights.push({
      topic:       block['נושא'],
      avik_method: block['שיטת אביק'] || null,
      alternative: block['חלופה']     || null,
      source:      block['מקור']      || null,
    });
  }
  return insights;
}

module.exports = { processMessage };
