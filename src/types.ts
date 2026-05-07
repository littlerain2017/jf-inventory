export interface Item {
  id: string
  item_code: string
  description: string
  length_mm: number
  min_order_strips: number // typically 840, 960, 1200, 1440
  strips_per_box: number  // typically 120
}

export interface MonthlySale {
  id: string
  item_code: string
  month_date: string // ISO date string, always 1st of month
  qty_sold: number
}

export interface StockPosition {
  id: string
  item_code: string
  current_stock: number
  on_order_qty: number
  on_order_arrival_date: string | null // ISO date string
  updated_at: string
}

export interface ShipSchedule {
  id: string
  vessel_name: string
  arrival_date: string   // ISO date string - when on-order stock arrives
  next_departure_date: string // ISO date string - deadline to place next order
  notes: string
  created_at: string
}

export interface SetupParam {
  key: string
  value: number
}

// Computed result per SKU
export interface ForecastRow {
  item_code: string
  description: string
  length_mm: number
  demand_pattern: 'GROWING' | 'DECLINING' | 'STABLE' | 'SLOW MOVER' | 'BATCH/SPIKE'
  wma3: number
  trend_3m: number
  adj_forecast: number
  overall_avg: number
  cv: number
  safety_months: number
  cover_target: number
  target_stock: number
  current_stock: number
  on_order_qty: number
  on_order_arrival_date: string | null
  // Ship-schedule adjusted
  effective_on_order: number  // on_order only counted if arriving before stockout
  available: number           // current_stock + effective_on_order
  months_cover: number
  rec_order_strips: number
  rec_order_boxes: number
  rec_order_meters: number
  status: 'ORDER NOW' | 'ORDER SOON' | 'OK' | 'EXCESS'
  order_by_date: string | null
  stockout_date: string | null
  min_order_strips: number
}

export interface SetupParams {
  production_lead_days: number
  shipping_months: number
  safety_stable: number
  safety_irregular: number
  safety_high_irregular: number
  cv_threshold_low: number
  cv_threshold_high: number
  order_now_threshold: number
  order_soon_threshold: number
}

export const DEFAULT_SETUP: SetupParams = {
  production_lead_days: 10,
  shipping_months: 1,
  safety_stable: 1.5,
  safety_irregular: 2.0,
  safety_high_irregular: 2.5,
  cv_threshold_low: 0.5,
  cv_threshold_high: 1.0,
  order_now_threshold: 1.5,
  order_soon_threshold: 2.5,
}
