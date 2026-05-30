const { createClient } = require('@supabase/supabase-js');
const config = require('./config');

const supabase = createClient(config.supabase.url, config.supabase.secretKey);

// ─── SESSION CONFIG ───────────────────────────────────────────────────────────

const SESSION_GAP_HOURS = 4;

// ─── MESSAGES ────────────────────────────────────────────────────────────────

// Save incoming or outgoing message to DB
// Returns the saved message with its ID (used for message_id linking)
async function saveMessage({ from, role, content, messageType = 'text' }) {
  const { data, error } = await supabase
    .from('messages')
    .insert([{ from_phone: from, role, content, message_type: messageType }])
    .select()
    .single();

  if (error) console.error('DB saveMessage error:', error);
  return data;
}

// Get messages from current session only.
// A session ends after SESSION_GAP_HOURS of silence.
// If last message was more than SESSION_GAP_HOURS ago — return [] (fresh session).
async function getConversationHistory(phone, limit = 20) {
  const sessionCutoff = new Date(
    Date.now() - SESSION_GAP_HOURS * 60 * 60 * 1000
  ).toISOString();

  // Check when last message was sent
  const { data: lastMsg } = await supabase
    .from('messages')
    .select('created_at')
    .eq('from_phone', phone)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // No messages or last message was too long ago — fresh session
  if (!lastMsg || lastMsg.created_at < sessionCutoff) {
    return [];
  }

  // Fetch messages from current session
  const { data, error } = await supabase
    .from('messages')
    .select('role, content, created_at')
    .eq('from_phone', phone)
    .gte('created_at', sessionCutoff)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('DB getHistory error:', error);
    return [];
  }

  // Return in chronological order for Claude
  return (data || []).reverse().map(m => ({
    role: m.role,
    content: m.content,
  }));
}

// ─── ORCHARD CONTEXT ─────────────────────────────────────────────────────────

// Fetch plots and suppliers from DB — replaces hardcoded system prompt data
async function getOrchardContext() {
  const [plotsResult, suppliersResult] = await Promise.all([
    supabase.from('plots').select('*').order('id'),
    supabase.from('suppliers').select('*').order('id'),
  ]);

  if (plotsResult.error) console.error('DB getPlots error:', plotsResult.error);
  if (suppliersResult.error) console.error('DB getSuppliers error:', suppliersResult.error);

  const plots = plotsResult.data || [];
  const suppliers = suppliersResult.data || [];

  const plotsText = plots.map(p =>
    `- חלקה ${p.id}: ${p.name} — ${p.area_dunam} דונם — זן ${p.variety} — ${p.geo_group}${p.notes ? ` — ${p.notes}` : ''}`
  ).join('\n');

  const totalDunam = plots.reduce((sum, p) => sum + parseFloat(p.area_dunam || 0), 0);

  const suppliersText = suppliers.map(s =>
    `- ${s.name}: ${s.service_type}${s.phone ? `, ${s.phone}` : ''}${s.notes ? ` — ${s.notes}` : ''}`
  ).join('\n');

  return { plots, suppliers, plotsText, suppliersText, totalDunam: totalDunam.toFixed(1) };
}

// ─── KNOWLEDGE CONTEXT ───────────────────────────────────────────────────────

// Fetch approved general knowledge concepts (non-superseded)
async function getRelevantConcepts() {
  const { data, error } = await supabase
    .from('current_concepts')
    .select('*')
    .order('category');

  if (error) {
    console.error('DB getConcepts error:', error);
    return '';
  }

  if (!data || data.length === 0) return '';

  return data.map(c =>
    `[${c.category}] ${c.topic}: ${c.content}${c.plot_names ? ` (חלקות: ${c.plot_names})` : ''}${c.valid_from ? ` (מ-${c.valid_from})` : ''}`
  ).join('\n');
}

// Fetch last N approved operations for context injection
async function getRelevantOperations(limit = 10) {
  const { data, error } = await supabase
    .from('gantt_operations')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('DB getOperations error:', error);
    return '';
  }

  if (!data || data.length === 0) return '';

  return data.map(op => formatOpLine(op, true)).join('\n');
}

// Fetch all pending (unapproved) operations for context injection
async function getPendingOperations() {
  const { data, error } = await supabase
    .from('operations')
    .select('id, operation_type, season_year, date_start, date_end, timing_desc, variety, executor, notes')
    .eq('approved', false)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('DB getPendingOperations error:', error);
    return '';
  }

  if (!data || data.length === 0) return '';

  return data.map(op => formatOpLine(op, false)).join('\n');
}

function formatOpLine(op, approved) {
  const parts = [
    `[מזהה: ${op.id}]${approved ? '' : ' [ממתין לאישור]'}`,
    `סוג: ${op.operation_type}`,
    op.season_year  ? `עונה: ${op.season_year}`  : null,
    op.date_start   ? `תאריך: ${op.date_start}`  : null,
    op.timing_desc  ? `תזמון: ${op.timing_desc}` : null,
    op.plot_names   ? `חלקות: ${op.plot_names}`  : null,
    op.variety      ? `זן: ${op.variety}`         : null,
    op.executor     ? `מבצע: ${op.executor}`      : null,
    op.notes        ? `הערות: ${op.notes}`        : null,
  ].filter(Boolean);
  return parts.join(' | ');
}

// ─── SAVE OPERATIONS ─────────────────────────────────────────────────────────

async function saveOperation({ operation, plotIds, materials, messageId, source }) {
  // Deduplication: skip if same type + season already exists (pending or approved)
  // with the same or no date (prevents re-recording from follow-up messages)
  const dupQuery = supabase
    .from('operations')
    .select('id')
    .eq('operation_type', operation.operation_type)
    .eq('season_year', operation.season_year || '');

  if (operation.date_start) {
    dupQuery.eq('date_start', operation.date_start);
  } else {
    dupQuery.is('date_start', null);
  }

  const { data: existing } = await dupQuery.limit(1).maybeSingle();
  if (existing) {
    console.log(`⏭️  Duplicate operation skipped: ${operation.operation_type} season=${operation.season_year} date=${operation.date_start} (existing id=${existing.id})`);
    return null;
  }

  const { data: op, error: opError } = await supabase
    .from('operations')
    .insert([{
      season_year:    operation.season_year    || null,
      operation_type: operation.operation_type,
      date_start:     operation.date_start     || null,
      date_end:       operation.date_end       || null,
      timing_desc:    operation.timing_desc    || null,
      variety:        operation.variety        || null,
      executor:       operation.executor       || null,
      supplier_id:    operation.supplier_id    || null,
      cost_total:     operation.cost_total     || null,
      cost_per_dunam: operation.cost_per_dunam || null,
      notes:          operation.notes          || null,
      source,
      message_id:     messageId || null,
      approved:       false,
    }])
    .select()
    .single();

  if (opError) {
    console.error('DB saveOperation error (full):', JSON.stringify(opError));
    return null;
  }

  if (plotIds && plotIds.length > 0) {
    const plotLinks = plotIds.map(plotId => ({ operation_id: op.id, plot_id: plotId }));
    const { error: plotError } = await supabase.from('operation_plots').insert(plotLinks);
    if (plotError) console.error('DB operation_plots error:', plotError);
  }

  if (materials && materials.length > 0) {
    const materialRows = materials.map(m => ({
      operation_id:   op.id,
      product_name:   m.product_name,
      quantity:       m.quantity       || null,
      unit:           m.unit           || null,
      quantity_total: m.quantity_total || null,
      unit_total:     m.unit_total     || null,
      dilution:       m.dilution       || null,
      notes:          m.notes          || null,
    }));
    const { error: matError } = await supabase.from('operation_materials').insert(materialRows);
    if (matError) console.error('DB operation_materials error:', matError);
  }

  console.log(`✅ Operation saved: ${op.id} — ${operation.operation_type}`);
  return op;
}

// ─── SAVE CONCEPTS ───────────────────────────────────────────────────────────

async function saveConcept({ concept, plotIds, messageId, source }) {
  // Check for existing non-superseded concept with same category + topic
  const { data: existing } = await supabase
    .from('knowledge_concepts')
    .select('id')
    .eq('category', concept.category)
    .eq('topic', concept.topic)
    .is('superseded_by', null)
    .eq('approved', true)
    .maybeSingle();

  const { data: newConcept, error: insertError } = await supabase
    .from('knowledge_concepts')
    .insert([{
      category:   concept.category,
      topic:      concept.topic,
      content:    concept.content,
      variety:    concept.variety    || null,
      valid_from: concept.valid_from || null,
      source,
      message_id: messageId || null,
      approved:   false,
    }])
    .select()
    .single();

  if (insertError) {
    console.error('DB saveConcept error:', insertError);
    return null;
  }

  if (plotIds && plotIds.length > 0) {
    const plotLinks = plotIds.map(plotId => ({ concept_id: newConcept.id, plot_id: plotId }));
    const { error: plotError } = await supabase.from('concept_plots').insert(plotLinks);
    if (plotError) console.error('DB concept_plots error:', plotError);
  }

  if (existing) {
    await supabase
      .from('knowledge_concepts')
      .update({ superseded_by: newConcept.id })
      .eq('id', existing.id);
    console.log(`♻️  Concept superseded: ${existing.id} → ${newConcept.id}`);
  }

  console.log(`✅ Concept saved: ${newConcept.id} — ${concept.topic}`);
  return newConcept;
}

// ─── UPDATE EXISTING RECORDS ─────────────────────────────────────────────────

async function updateRecord({ table, id, field, newValue, reason, source }) {
  const allowedTables = ['operations', 'plots', 'suppliers', 'knowledge_concepts'];
  if (!allowedTables.includes(table)) {
    console.error(`DB updateRecord: disallowed table "${table}"`);
    return null;
  }

  const update = { [field]: newValue, updated_at: new Date().toISOString() };

  const { data, error } = await supabase
    .from(table)
    .update(update)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error(`DB updateRecord error (${table} #${id}):`, error);
    return null;
  }

  console.log(`✏️  Updated ${table} #${id}: ${field} → ${newValue}${reason ? ` (${reason})` : ''}`);
  return data;
}

// ─── INSIGHTS ────────────────────────────────────────────────────────────────

async function saveInsight(insight) {
  const { source, ...row } = insight;  // 'source' column doesn't exist in insights table
  const { data, error } = await supabase
    .from('insights')
    .insert([row])
    .select()
    .single();

  if (error) console.error('DB saveInsight error:', error);
  return data;
}

// ─── PENDING QUESTIONS ───────────────────────────────────────────────────────

async function getPendingQuestions() {
  const { data, error } = await supabase
    .from('pending_questions')
    .select('*')
    .eq('asked', false)
    .order('created_at', { ascending: true });

  if (error) console.error('DB getPendingQuestions error:', error);
  return data || [];
}

async function markQuestionAsked(id) {
  const { error } = await supabase
    .from('pending_questions')
    .update({ asked: true })
    .eq('id', id);

  if (error) console.error('DB markQuestionAsked error:', error);
}

// ─── SUPPLIER LOOKUP ─────────────────────────────────────────────────────────

// Find supplier ID by name (fuzzy match for Claude-emitted names)
async function findSupplierByName(name) {
  if (!name) return null;
  const { data } = await supabase
    .from('suppliers')
    .select('id, name')
    .ilike('name', `%${name}%`)
    .limit(1)
    .maybeSingle();
  return data ? data.id : null;
}

// ─── EXPORTS ─────────────────────────────────────────────────────────────────

module.exports = {
  saveMessage,
  getConversationHistory,
  getOrchardContext,
  getRelevantConcepts,
  getRelevantOperations,
  getPendingOperations,
  saveOperation,
  saveConcept,
  updateRecord,
  saveInsight,
  getPendingQuestions,
  markQuestionAsked,
  findSupplierByName,
  supabase,
};
