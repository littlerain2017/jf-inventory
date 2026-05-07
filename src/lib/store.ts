/**
 * Unified data store — uses Supabase when configured, localStorage otherwise.
 * Real-time sync via Supabase Realtime channels.
 */
import { supabase, isSupabaseConfigured } from './supabase'
import type { Item, MonthlySale, SetupParams, ShipSchedule, StockPosition } from '../types'
import { DEFAULT_SETUP } from '../types'

// ─── localStorage helpers ────────────────────────────────────────────────────

function lsGet<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}
function lsSet<T>(key: string, val: T) {
  localStorage.setItem(key, JSON.stringify(val))
}

// ─── Items ───────────────────────────────────────────────────────────────────

export async function fetchItems(): Promise<Item[]> {
  if (isSupabaseConfigured()) {
    const { data, error } = await supabase.from('items').select('*').order('item_code')
    if (error) throw error
    return data as Item[]
  }
  return lsGet<Item[]>('items', defaultItems())
}

export async function upsertItem(item: Item): Promise<void> {
  if (isSupabaseConfigured()) {
    const { error } = await supabase.from('items').upsert(item, { onConflict: 'item_code' })
    if (error) throw error
    return
  }
  const items = lsGet<Item[]>('items', [])
  const idx = items.findIndex(i => i.item_code === item.item_code)
  if (idx >= 0) items[idx] = item
  else items.push(item)
  lsSet('items', items)
}

export async function deleteItem(item_code: string): Promise<void> {
  if (isSupabaseConfigured()) {
    const { error } = await supabase.from('items').delete().eq('item_code', item_code)
    if (error) throw error
    return
  }
  const items = lsGet<Item[]>('items', []).filter(i => i.item_code !== item_code)
  lsSet('items', items)
}

// ─── Monthly Sales ───────────────────────────────────────────────────────────

export async function fetchSales(): Promise<MonthlySale[]> {
  if (isSupabaseConfigured()) {
    const { data, error } = await supabase
      .from('monthly_sales')
      .select('*')
      .order('month_date')
    if (error) throw error
    return data as MonthlySale[]
  }
  return lsGet<MonthlySale[]>('monthly_sales', [])
}

export async function upsertSale(sale: Omit<MonthlySale, 'id'> & { id?: string }): Promise<void> {
  if (isSupabaseConfigured()) {
    const { error } = await supabase
      .from('monthly_sales')
      .upsert(sale, { onConflict: 'item_code,month_date' })
    if (error) throw error
    return
  }
  const sales = lsGet<MonthlySale[]>('monthly_sales', [])
  const idx = sales.findIndex(
    s => s.item_code === sale.item_code && s.month_date === sale.month_date
  )
  const full: MonthlySale = { id: sale.id ?? crypto.randomUUID(), ...sale }
  if (idx >= 0) sales[idx] = full
  else sales.push(full)
  lsSet('monthly_sales', sales)
}

export async function bulkUpsertSales(
  sales: Array<Omit<MonthlySale, 'id'>>
): Promise<void> {
  if (isSupabaseConfigured()) {
    const { error } = await supabase
      .from('monthly_sales')
      .upsert(sales, { onConflict: 'item_code,month_date' })
    if (error) throw error
    return
  }
  for (const s of sales) await upsertSale(s)
}

// ─── Stock Positions ─────────────────────────────────────────────────────────

export async function fetchPositions(): Promise<StockPosition[]> {
  if (isSupabaseConfigured()) {
    const { data, error } = await supabase.from('stock_positions').select('*')
    if (error) throw error
    return data as StockPosition[]
  }
  return lsGet<StockPosition[]>('stock_positions', [])
}

export async function upsertPosition(pos: Omit<StockPosition, 'id' | 'updated_at'> & { id?: string }): Promise<void> {
  const full = { ...pos, updated_at: new Date().toISOString() }
  if (isSupabaseConfigured()) {
    const { error } = await supabase
      .from('stock_positions')
      .upsert(full, { onConflict: 'item_code' })
    if (error) throw error
    return
  }
  const positions = lsGet<StockPosition[]>('stock_positions', [])
  const idx = positions.findIndex(p => p.item_code === pos.item_code)
  const record: StockPosition = { id: pos.id ?? crypto.randomUUID(), ...full }
  if (idx >= 0) positions[idx] = record
  else positions.push(record)
  lsSet('stock_positions', positions)
}

// ─── Ship Schedules ──────────────────────────────────────────────────────────

export async function fetchSchedules(): Promise<ShipSchedule[]> {
  if (isSupabaseConfigured()) {
    const { data, error } = await supabase
      .from('ship_schedules')
      .select('*')
      .order('arrival_date')
    if (error) throw error
    return data as ShipSchedule[]
  }
  return lsGet<ShipSchedule[]>('ship_schedules', [])
}

export async function upsertSchedule(
  s: Omit<ShipSchedule, 'id' | 'created_at'> & { id?: string }
): Promise<void> {
  const full = { ...s, created_at: s.id ? undefined : new Date().toISOString() }
  if (isSupabaseConfigured()) {
    const { error } = await supabase.from('ship_schedules').upsert(full)
    if (error) throw error
    return
  }
  const list = lsGet<ShipSchedule[]>('ship_schedules', [])
  const idx = list.findIndex(x => x.id === s.id)
  const record: ShipSchedule = {
    id: s.id ?? crypto.randomUUID(),
    created_at: new Date().toISOString(),
    ...s,
  }
  if (idx >= 0) list[idx] = record
  else list.push(record)
  lsSet('ship_schedules', list)
}

export async function deleteSchedule(id: string): Promise<void> {
  if (isSupabaseConfigured()) {
    const { error } = await supabase.from('ship_schedules').delete().eq('id', id)
    if (error) throw error
    return
  }
  const list = lsGet<ShipSchedule[]>('ship_schedules', []).filter(x => x.id !== id)
  lsSet('ship_schedules', list)
}

// ─── Setup Params ─────────────────────────────────────────────────────────────

export async function fetchSetup(): Promise<SetupParams> {
  if (isSupabaseConfigured()) {
    const { data, error } = await supabase.from('setup_params').select('*')
    if (error) throw error
    if (!data || data.length === 0) return DEFAULT_SETUP
    const map: Record<string, number> = {}
    for (const row of data as Array<{ key: string; value: number }>) {
      map[row.key] = row.value
    }
    return { ...DEFAULT_SETUP, ...map } as SetupParams
  }
  return lsGet<SetupParams>('setup_params', DEFAULT_SETUP)
}

export async function saveSetup(params: SetupParams): Promise<void> {
  if (isSupabaseConfigured()) {
    const rows = Object.entries(params).map(([key, value]) => ({ key, value }))
    const { error } = await supabase.from('setup_params').upsert(rows, { onConflict: 'key' })
    if (error) throw error
    return
  }
  lsSet('setup_params', params)
}

// ─── Realtime subscription helper ────────────────────────────────────────────

export function subscribeToChanges(onchange: () => void): () => void {
  if (!isSupabaseConfigured()) return () => {}

  const channel = supabase
    .channel('db-changes')
    .on('postgres_changes', { event: '*', schema: 'public' }, onchange)
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}

// ─── Default seed data from Excel ────────────────────────────────────────────

export function seedLocalStorageFromExcel() {
  if (lsGet('_seeded', false)) return
  lsSet('items', defaultItems())
  lsSet('monthly_sales', defaultSales())
  lsSet('stock_positions', defaultPositions())
  lsSet('_seeded', true)
}

function defaultItems(): Item[] {
  return [
    { id: '1',  item_code: 'EQLB2500', description: 'DSTP351-1250-TT',      length_mm: 1250, min_order_strips: 840,  strips_per_box: 120 },
    { id: '2',  item_code: 'EQLB2501', description: 'DSTP351-1140-BK',      length_mm: 1140, min_order_strips: 960,  strips_per_box: 120 },
    { id: '3',  item_code: 'EQLB2502', description: 'DSTP43-1220-BK',       length_mm: 1220, min_order_strips: 840,  strips_per_box: 120 },
    { id: '4',  item_code: 'EQLB2503', description: 'DSTP351-915-BK',       length_mm: 915,  min_order_strips: 1200, strips_per_box: 120 },
    { id: '5',  item_code: 'EQLB2504', description: 'DSTP351-915-TT',       length_mm: 915,  min_order_strips: 1200, strips_per_box: 120 },
    { id: '6',  item_code: 'EQLB2505', description: 'DSTP351-1140-TT',      length_mm: 1140, min_order_strips: 960,  strips_per_box: 120 },
    { id: '7',  item_code: 'EQLB2507', description: 'DSTP20/47-720-BK',     length_mm: 720,  min_order_strips: 1440, strips_per_box: 120 },
    { id: '8',  item_code: 'EQLB2508', description: 'DSTP351-1220-BK',      length_mm: 1220, min_order_strips: 840,  strips_per_box: 120 },
    { id: '9',  item_code: 'EQLB2509', description: 'DSTP351-1475-PVC-BK-CF', length_mm: 1475, min_order_strips: 720, strips_per_box: 120 },
    { id: '10', item_code: 'EQLB2510', description: 'DSTP351-700-BK',       length_mm: 700,  min_order_strips: 1440, strips_per_box: 120 },
  ]
}

function defaultPositions(): StockPosition[] {
  const now = new Date().toISOString()
  return [
    { id: 'p1',  item_code: 'EQLB2500', current_stock: 1360,  on_order_qty: 840,  on_order_arrival_date: null, updated_at: now },
    { id: 'p2',  item_code: 'EQLB2501', current_stock: 680,   on_order_qty: 1440, on_order_arrival_date: null, updated_at: now },
    { id: 'p3',  item_code: 'EQLB2502', current_stock: 5400,  on_order_qty: 0,    on_order_arrival_date: null, updated_at: now },
    { id: 'p4',  item_code: 'EQLB2503', current_stock: 3420,  on_order_qty: 960,  on_order_arrival_date: null, updated_at: now },
    { id: 'p5',  item_code: 'EQLB2504', current_stock: 7960,  on_order_qty: 0,    on_order_arrival_date: null, updated_at: now },
    { id: 'p6',  item_code: 'EQLB2505', current_stock: 3460,  on_order_qty: 0,    on_order_arrival_date: null, updated_at: now },
    { id: 'p7',  item_code: 'EQLB2507', current_stock: 100,   on_order_qty: 1200, on_order_arrival_date: null, updated_at: now },
    { id: 'p8',  item_code: 'EQLB2508', current_stock: 0,     on_order_qty: 1440, on_order_arrival_date: null, updated_at: now },
    { id: 'p9',  item_code: 'EQLB2509', current_stock: 0,     on_order_qty: 360,  on_order_arrival_date: null, updated_at: now },
    { id: 'p10', item_code: 'EQLB2510', current_stock: 1900,  on_order_qty: 1440, on_order_arrival_date: null, updated_at: now },
  ]
}

function defaultSales(): MonthlySale[] {
  // From Excel Monthly Data sheet — months as ISO date strings
  const months = [
    '2024-10-01','2024-11-01','2024-12-01','2025-01-01','2025-02-01',
    '2025-03-01','2025-04-01','2025-05-01','2025-06-01','2025-07-01',
    '2025-08-01','2025-09-01','2025-10-01','2025-11-01','2025-12-01',
    '2026-01-01','2026-02-01',
  ]
  const data: Record<string, number[]> = {
    EQLB2500: [320,1340,100,180,380,1960,260,300,280,1800,320,60,420,1480,500,660,0],
    EQLB2501: [2200,2780,1180,760,1400,4840,1340,2340,1940,1420,280,1020,720,3400,1080,2940,0],
    EQLB2502: [2540,1760,2320,580,2700,740,2700,1340,2560,2680,420,220,0,580,580,3260,0],
    EQLB2503: [2360,2460,1160,740,1140,4960,1060,2740,260,3620,200,0,380,2880,900,2660,0],
    EQLB2504: [100,0,0,0,0,20,0,0,0,0,0,0,0,0,0,40,0],
    EQLB2505: [0,0,0,0,0,20,0,40,0,20,0,0,0,0,0,0,0],
    EQLB2507: [20,100,120,20,520,140,200,520,100,180,80,440,40,520,40,620,0],
    EQLB2508: [1040,680,800,220,820,1380,1000,1620,600,1500,240,960,1040,1400,1140,2040,0],
    EQLB2509: [0,0,0,0,0,0,0,0,400,0,0,0,0,340,160,160,0],
    EQLB2510: [540,780,700,420,1120,1760,1100,1340,620,1280,1400,1240,1040,1380,1080,1020,0],
  }
  const rows: MonthlySale[] = []
  let id = 1
  for (const [itemCode, qtys] of Object.entries(data)) {
    for (let i = 0; i < months.length && i < qtys.length; i++) {
      rows.push({ id: String(id++), item_code: itemCode, month_date: months[i], qty_sold: qtys[i] })
    }
  }
  return rows
}
