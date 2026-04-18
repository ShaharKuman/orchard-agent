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
- חלקה 1: ב' עליון - 5 דונם - זן אור (קבוצה א', סמוכה לחלקה 2)
- חלקה 2: ב' תחתון - 5 דונם - זן אורה+אור מעורב (קבוצה א', טיפולים נפרדים לפי זן)
- חלקה 3: אשכוליות - 6.5 דונם - זן אור (עצמאית, לא סמוכה לאחרות)
- חלקה 4: אפרסמון - 2.5 דונם - זן אור (קבוצה ב', סמוכות 4+5+6)
- חלקה 5: מורקוט - 2.5 דונם - זן אור (קבוצה ב')
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

## שימוש בחיפוש ברשת
יש לך כלי חיפוש ברשת. השתמש בו כאשר:
- אביק מזכיר חומר ריסוס או דשן - חפש מידע על הריכוז המומלץ
- אביק מזכיר מחלה או מזיק - חפש פרקטיקות טיפול
- רוצה להשוות שיטת אביק לפרקטיקה מקובלת בענף
אל תשתף את תוצאות החיפוש עם אביק - שמור אותן לדשבורד בלבד.

## קבלת תמונות
אביק עשוי לשלוח תמונות מסוגים שונים:
- תמונה של בעיה בעץ או בפרי - תאר מה אתה רואה, שאל שאלה אחת על ההקשר
- צילום מסך של מסמך, חשבונית או הוראות - חלץ את המידע הרלוונטי
- תמונה של פעולה שבוצעה בפרדס - התייחס אליה כמו הודעת טקסט עם תוכן ויזואלי
תמיד ציין שראית את התמונה ותאר בקצרה מה זיהית לפני שאתה שואל.

## חילוץ נתונים
כשיש מספיק מידע על פעולה, הוסף בסוף התשובה שלך:
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
אם מצאת בחיפוש שיטה שונה מאביק, הוסף:
[INSIGHT]
נושא: ...
שיטת אביק: ...
חלופה: ...
מקור: ...
[/INSIGHT]`;

const MANAGER_SYSTEM_PROMPT = `אתה OrchardAgent - עוזר לתומר ושחר לב לנהל את פרויקט שימור הידע החקלאי של אביק (סבא).

## תפקידך עם תומר/שחר
- לענות על שאלות על הפרדס ועל הפרויקט
- לדווח על מה שנלמד מאביק עד כה
- לקבל הנחיות ושאלות המשך לשאול את אביק
- לדווח על נתונים שממתינים לאישור
- לחפש מידע ברשת על נושאים חקלאיים כשנשאל

## מידע על הפרדס
6 חלקות, 17 דונם, זני אור ואורה. ספקים: נדב מלר (ריסוס), יאיר ארנר (ייעוץ), צביקה כהן (מים).

## פקודות מיוחדות
- "שאל את אביק: [שאלה]" - אמר שתעביר לאביק
- "מה למדנו?" - סכם ידע שנאסף
- "מה ממתין?" - פרט נתונים לאישור
- "חפש: [נושא]" - חפש מידע חקלאי ברשת ודווח

יש לך כלי חיפוש ברשת - השתמש בו בחופשיות עם תומר ושחר.
דבר בעברית, בגובה העיניים, כמו עמית לעבודה.`;

// ─── Web search tool definition ──────────────────────────────────────────────

const WEB_SEARCH_TOOL = {
  type: 'web_search_20250305',
  name: 'web_search',
};

// ─── Main agent function ─────────────────────────────────────────────────────

async function processMessage({ from, body, user, media = null, mediaContentType = null }) {
  const isAvik = user.role === 'source';

  // Fetch pending questions saved by Tomer/Shahar via dashboard — these are questions
  // intended for Avik. Only inject when Avik is the one messaging so the agent
  // can weave them naturally into the conversation with him.
  let pendingQuestion = null;
  if (isAvik) {
    const questions = await db.getPendingQuestions();
    if (questions.length > 0) {
      pendingQuestion = questions[0]; // Ask one question at a time
    }
  }

  // Build system prompt, optionally injecting the pending question
  let systemPrompt = isAvik ? AVIK_SYSTEM_PROMPT : MANAGER_SYSTEM_PROMPT;
  if (pendingQuestion) {
    systemPrompt += `\n\n## שאלה ממתינה מתומר/שחר\nבשיחה הזו, מצא רגע טבעי לשאול את אביק: "${pendingQuestion.question}"\nשאל אותה כשאלה אחת ברורה, כחלק מהשיחה הטבעית. אל תאמר שהיא הגיעה מתומר או שחר.`;
  }

  const history = await db.getConversationHistory(from, 20);

  // Build the user message content — text only, or text + image
  let userMessageContent;
  if (media && mediaContentType && mediaContentType.startsWith('image/')) {
    console.log(`🖼️ Processing image: ${mediaContentType}`);
    userMessageContent = [
      {
        type: 'image',
        source: {
          type: 'base64',
          media_type: mediaContentType,
          data: media.base64,
        },
      },
    ];
    // Append caption text if Avik wrote one alongside the image
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
    // First call - may use web search tool
    const response = await anthropic.messages.create({
      model: config.anthropic.model,
      max_tokens: 1024,
      system: systemPrompt,
      tools: [WEB_SEARCH_TOOL],
      messages,
    });

    let fullResponse = '';

    // Handle built-in web search: Anthropic runs the search internally.
    // We just keep calling the API with the updated conversation until
    // Claude stops searching and gives a final answer.
    let currentResponse = response;

    while (currentResponse.stop_reason === 'tool_use') {
      console.log(`🔍 Web search triggered`);

      const continueMessages = [
        ...messages,
        { role: 'assistant', content: currentResponse.content },
      ];

      currentResponse = await anthropic.messages.create({
        model: config.anthropic.model,
        max_tokens: 1024,
        system: systemPrompt,
        tools: [WEB_SEARCH_TOOL],
        messages: continueMessages,
      });
    }

    fullResponse = currentResponse.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('');

    const replyText = extractReply(fullResponse);

    // Save records and insights
    const records = extractRecords(fullResponse);
    for (const record of records) {
      await db.saveRecord({ ...record, source_phone: from, approved: false });
      console.log('Saved record:', record.action);
    }

    const insights = extractInsights(fullResponse);
    for (const insight of insights) {
      await db.saveInsight({ ...insight, source_phone: from });
      console.log('Saved insight:', insight.topic);
    }

    await db.saveMessage({ from, role: 'user', content: body || '[image]', messageType });
    await db.saveMessage({ from, role: 'assistant', content: replyText });

    // Mark pending question as asked now that reply was sent successfully
    if (pendingQuestion) {
      await db.markQuestionAsked(pendingQuestion.id);
      console.log(`✅ Pending question marked as asked: "${pendingQuestion.question}"`);
    }

    return replyText;

  } catch (error) {
    console.error('Claude API error:', error);
    return 'סליחה, הייתה בעיה טכנית. נסה שוב בעוד רגע.';
  }
}

// ─── Parsing helpers ─────────────────────────────────────────────────────────

function extractReply(text) {
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
    const record = parseBlock(match[1]);
    if (record.action) records.push(record);
  }
  return records;
}

function extractInsights(text) {
  const insights = [];
  const regex = /\[INSIGHT\]([\s\S]*?)\[\/INSIGHT\]/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const insight = parseBlock(match[1]);
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
    const keyMap = {
      'פעולה': 'action', 'תזמון': 'timing', 'חלקה': 'plot',
      'זן': 'variety', 'חומרים': 'materials', 'ספק': 'supplier',
      'עלות': 'cost', 'ניואנסים': 'nuances', 'נושא': 'topic',
      'שיטת אביק': 'avik_method', 'חלופה': 'alternative', 'מקור': 'source',
    };
    const key = keyMap[rawKey] || rawKey;
    if (value) result[key] = value;
  }
  return result;
}

module.exports = { processMessage };
