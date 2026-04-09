const { createClient } = require('@supabase/supabase-js');
const config = require('./config');

const supabase = createClient(config.supabase.url, config.supabase.secretKey);

// Save incoming message to DB
async function saveMessage({ from, role, content, messageType = 'text' }) {
  const { data, error } = await supabase
    .from('messages')
    .insert([{ from_phone: from, role, content, message_type: messageType }])
    .select()
    .single();

  if (error) console.error('DB saveMessage error:', error);
  return data;
}

// Get last N messages for a phone number (conversation history)
async function getConversationHistory(phone, limit = 20) {
  const { data, error } = await supabase
    .from('messages')
    .select('role, content, created_at')
    .eq('from_phone', phone)
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

// Save extracted knowledge record
async function saveRecord(record) {
  const { data, error } = await supabase
    .from('knowledge_records')
    .insert([record])
    .select()
    .single();

  if (error) console.error('DB saveRecord error:', error);
  return data;
}

// Save insight for dashboard
async function saveInsight(insight) {
  const { data, error } = await supabase
    .from('insights')
    .insert([insight])
    .select()
    .single();

  if (error) console.error('DB saveInsight error:', error);
  return data;
}

// Get all pending records (not yet approved)
async function getPendingRecords() {
  const { data, error } = await supabase
    .from('knowledge_records')
    .select('*')
    .eq('approved', false)
    .order('created_at', { ascending: false });

  if (error) console.error('DB getPendingRecords error:', error);
  return data || [];
}

module.exports = {
  saveMessage,
  getConversationHistory,
  saveRecord,
  saveInsight,
  getPendingRecords,
  supabase,
};
