// One-time migration: rename season_year 2025→2026, 2026→2027
const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, '../.env') })
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY)

async function migrate() {
  // Step 1: bump 2026 → 2027 first to avoid collision
  const r1 = await supabase.from('operations').update({ season_year: '2027' }).eq('season_year', '2026')
  if (r1.error) { console.error('2026→2027 failed:', r1.error.message); process.exit(1) }
  console.log('2026 → 2027 done')

  // Step 2: bump 2025 → 2026
  const r2 = await supabase.from('operations').update({ season_year: '2026' }).eq('season_year', '2025')
  if (r2.error) { console.error('2025→2026 failed:', r2.error.message); process.exit(1) }
  console.log('2025 → 2026 done')

  // Verify
  const { data } = await supabase.from('operations').select('id, operation_type, season_year').order('id')
  console.log('\nCurrent season_year values:')
  data?.forEach(o => console.log(`  id=${o.id}  ${o.operation_type}  season=${o.season_year}`))
}

migrate()
