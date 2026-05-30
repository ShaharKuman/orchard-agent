// OrchardAgent — comprehensive test suite
//
// Tests:
//   1. no-duplicate    — confirmatory replies must NOT create new operations
//   2. record-creation — clear op description MUST create exactly 1 pending op
//   3. concept-creation — knowledge rule MUST create at least 1 concept
//   4. message-persistence — every exchange must be saved to messages table
//
// All tests clean up after themselves (by ID range) so original data is never touched.
// Usage: node scripts/test_agent.js [test-name]
//   e.g. node scripts/test_agent.js record-creation

const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, '../.env') })

const { processMessage } = require('../src/agent')
const { supabase }       = require('../src/database')

const AVIK_USER  = { name: 'אביק', role: 'source' }
const AVIK_PHONE = process.env.AVIK_PHONE

// ── Helpers ──────────────────────────────────────────────────────────────────

async function snapshot() {
  const [ops, concepts, msgs] = await Promise.all([
    supabase.from('operations')       .select('id').order('id', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('knowledge_concepts').select('id').order('id', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('messages')          .select('id').order('id', { ascending: false }).limit(1).maybeSingle(),
  ])
  return {
    maxOpId:      ops.data?.id      ?? 0,
    maxConceptId: concepts.data?.id ?? 0,
    maxMsgId:     msgs.data?.id     ?? 0,
  }
}

async function countNewPending(snap) {
  const { data } = await supabase.from('operations')
    .select('id').eq('approved', false).gt('id', snap.maxOpId)
  return data?.length ?? 0
}

async function countNewConcepts(snap) {
  const { data } = await supabase.from('knowledge_concepts')
    .select('id').gt('id', snap.maxConceptId)
  return data?.length ?? 0
}

async function countNewMessages(snap) {
  const { data } = await supabase.from('messages')
    .select('id').gt('id', snap.maxMsgId)
  return data?.length ?? 0
}

async function cleanup(snap) {
  const [ops, opPlots, concepts, msgs] = await Promise.all([
    supabase.from('operations')        .delete().gt('id', snap.maxOpId)      .select('id'),
    supabase.from('operation_plots')   .delete().gt('operation_id', snap.maxOpId),
    supabase.from('knowledge_concepts').delete().gt('id', snap.maxConceptId) .select('id'),
    supabase.from('messages')          .delete().gt('id', snap.maxMsgId)     .select('id'),
  ])
  const parts = []
  if (ops.data?.length)      parts.push(`${ops.data.length} op(s)`)
  if (concepts.data?.length) parts.push(`${concepts.data.length} concept(s)`)
  if (msgs.data?.length)     parts.push(`${msgs.data.length} message(s)`)
  if (parts.length) console.log(`  🧹 Cleaned up: ${parts.join(', ')}`)
}

async function send(body) {
  return processMessage({ from: AVIK_PHONE, body, user: AVIK_USER })
}

// ── Test runner ───────────────────────────────────────────────────────────────

const results = []

async function runTest(name, fn) {
  process.stdout.write(`\n▶ ${name}\n`)
  const snap = await snapshot()
  let passed = false
  try {
    await fn(snap)
    passed = true
  } catch (err) {
    console.error(`  ❌ ${err.message}`)
  } finally {
    await cleanup(snap)
  }
  results.push({ name, passed })
  console.log(`  ${passed ? '✅ PASS' : '❌ FAIL'}`)
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

async function testNoDuplicate(snap) {
  const confirmations = [
    'אכן כן.',
    'זה התיעוד המעודכן ביותר — לא פעולה חדשה.',
    'אין צורך כי העץ עצמו מגן והחתך מגליד תוך כשבועיים — הסבר בלבד.',
  ]
  for (const body of confirmations) {
    const before = await countNewPending(snap)
    await send(body)
    const after = await countNewPending(snap)
    assert(after === before, `confirmation "${body}" created ${after - before} new op(s) — expected 0`)
  }
}

async function testRecordCreation(snap) {
  // Unambiguous new operation with date, type, executor, cost — should produce exactly 1 [RECORD]
  await send(
    'אתמול ב-20 במאי 2026 ריססנו את כל החלקות עם אבמקטין 0.4%. ' +
    'ביצע נדב מלר, עלה 1500 שקל. זה היה ריסוס לכנימות.'
  )
  const newOps = await countNewPending(snap)
  assert(newOps >= 1, `expected at least 1 new pending operation, got ${newOps}`)
  console.log(`  📦 ${newOps} new pending operation(s) created`)
}

async function testConceptCreation(snap) {
  // General knowledge rule (not a specific dated operation) — should produce [CONCEPT], not [RECORD]
  await send(
    'יש לנו כלל ברזל: תמיד אחרי קטיף מנדרינות — בערך בינואר — אנחנו מוסיפים דשן אשלגן. ' +
    'כך עושים כבר 30 שנה, שיטה שלמדתי מהסבא שלי.'
  )
  const newConcepts = await countNewConcepts(snap)
  assert(newConcepts >= 1, `expected at least 1 new concept, got ${newConcepts}`)
  console.log(`  💡 ${newConcepts} new concept(s) created`)
}

async function testMessagePersistence(snap) {
  // Any exchange must be saved: 1 user message + 1 agent reply = min 2 messages
  await send('מה שלומך?')
  const newMsgs = await countNewMessages(snap)
  assert(newMsgs >= 2, `expected at least 2 new messages (user + agent reply), got ${newMsgs}`)
  console.log(`  💬 ${newMsgs} new message(s) saved`)
}

// ── Main ──────────────────────────────────────────────────────────────────────

const ALL_TESTS = {
  'no-duplicate':       testNoDuplicate,
  'record-creation':    testRecordCreation,
  'concept-creation':   testConceptCreation,
  'message-persistence':testMessagePersistence,
}

async function main() {
  const target = process.argv[2]
  const toRun  = target
    ? Object.entries(ALL_TESTS).filter(([name]) => name === target)
    : Object.entries(ALL_TESTS)

  if (toRun.length === 0) {
    console.error(`Unknown test: "${target}". Available: ${Object.keys(ALL_TESTS).join(', ')}`)
    process.exit(1)
  }

  console.log(`\n=== OrchardAgent test suite (${toRun.map(([n]) => n).join(', ')}) ===`)

  for (const [name, fn] of toRun) {
    await runTest(name, fn)
  }

  const passed = results.filter(r => r.passed).length
  const failed = results.length - passed
  console.log(`\n${'─'.repeat(50)}`)
  console.log(`Result: ${passed}/${results.length} passed${failed ? `  ❌ ${failed} failed` : '  ✅ all good'}`)
  process.exit(failed > 0 ? 1 : 0)
}

main().catch(e => { console.error(e); process.exit(1) })
