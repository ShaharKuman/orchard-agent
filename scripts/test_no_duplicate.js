// Verifies that short confirmatory replies don't create duplicate operations.
// Simulates the exact pattern that caused the problem: Avik says "אכן כן" while
// חיגור is already in the pending queue.
//
// Usage: node scripts/test_no_duplicate.js

const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, '../.env') })

const { processMessage } = require('../src/agent')
const { supabase } = require('../src/database')

const AVIK_PHONE = process.env.AVIK_PHONE

async function countPending() {
  const { data } = await supabase.from('operations').select('id').eq('approved', false)
  return data ? data.length : 0
}

async function maxMessageId() {
  const { data } = await supabase.from('messages').select('id').order('id', { ascending: false }).limit(1).maybeSingle()
  return data ? data.id : 0
}

async function cleanupTestMessages(fromId) {
  const { data, error } = await supabase.from('messages').delete().gt('id', fromId).select('id')
  if (!error && data?.length) console.log(`🧹 Cleaned up ${data.length} test message(s) (ids: ${data.map(m => m.id).join(', ')})`)
}

async function run() {
  console.log('=== Duplicate-prevention test ===\n')

  const before = await countPending()
  const msgIdBefore = await maxMessageId()
  console.log(`Pending ops before: ${before} | Max message id: ${msgIdBefore}`)

  const testMessages = [
    { label: 'one-word confirmation',     body: 'אכן כן.' },
    { label: 'elaboration without new op', body: 'זה התיעוד המעודכן ביותר — לא פעולה חדשה.' },
    { label: 'follow-up answer',           body: 'אין צורך כי העץ עצמו מגן והחתך מגליד תוך כשבועיים — הסבר בלבד.' },
  ]

  let failures = 0

  for (const msg of testMessages) {
    const pendingBefore = await countPending()

    console.log(`\n--- Sending: "${msg.body}" (${msg.label}) ---`)
    await processMessage({
      from: AVIK_PHONE,
      body: msg.body,
      user: { id: 'avik', role: 'source' },
    })

    const pendingAfter = await countPending()
    const delta = pendingAfter - pendingBefore

    if (delta > 0) {
      console.error(`❌ FAIL: ${delta} new operation(s) created for "${msg.label}"`)
      failures++
    } else {
      console.log(`✅ PASS: no new operations created`)
    }
  }

  // Always clean up only the messages this test run created (by ID range)
  await cleanupTestMessages(msgIdBefore)

  console.log(`\n=== Result: ${failures === 0 ? '✅ All passed' : `❌ ${failures} failure(s)`} ===`)
  process.exit(failures > 0 ? 1 : 0)
}

run().catch(e => { console.error(e); process.exit(1) })
