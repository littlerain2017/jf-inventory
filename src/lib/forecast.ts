import { addDays, parseISO, format } from 'date-fns'
import type { ForecastRow, Item, MonthlySale, SetupParams, ShipSchedule, StockPosition } from '../types'

// WMA3: weights 3,2,1 on last 3 months (most recent = 3)
function wma3(sales: number[]): number {
  if (sales.length === 0) return 0
  const s = sales.slice(-3)
  if (s.length === 1) return s[0]
  if (s.length === 2) return (s[1] * 3 + s[0] * 2) / 5
  return (s[2] * 3 + s[1] * 2 + s[0] * 1) / 6
}

function mean(arr: number[]): number {
  if (arr.length === 0) return 0
  return arr.reduce((a, b) => a + b, 0) / arr.length
}

function stdDev(arr: number[]): number {
  if (arr.length < 2) return 0
  const m = mean(arr)
  const variance = arr.reduce((acc, v) => acc + (v - m) ** 2, 0) / (arr.length - 1)
  return Math.sqrt(variance)
}

function coefficientOfVariation(arr: number[]): number {
  const m = mean(arr)
  if (m === 0) return 0
  return stdDev(arr) / m
}

// Trend = last 3 months avg / prior 3 months avg
function trend3m(sales: number[]): number {
  if (sales.length < 2) return 1
  const recent = sales.slice(-3)
  const prior = sales.slice(-6, -3)
  const recentAvg = mean(recent)
  const priorAvg = mean(prior)
  if (priorAvg === 0) return recentAvg > 0 ? 2 : 1
  return recentAvg / priorAvg
}

function demandPattern(
  cv: number,
  trend: number,
  sales: number[]
): ForecastRow['demand_pattern'] {
  const nonZero = sales.filter(s => s > 0).length
  const sparsity = nonZero / (sales.length || 1)
  if (sparsity < 0.4) return 'SLOW MOVER'
  if (cv > 1.0) return 'BATCH/SPIKE'
  if (trend >= 1.15) return 'GROWING'
  if (trend <= 0.85) return 'DECLINING'
  return 'STABLE'
}

export function computeForecast(
  items: Item[],
  sales: MonthlySale[],
  positions: StockPosition[],
  schedules: ShipSchedule[],
  setup: SetupParams
): ForecastRow[] {
  const today = new Date()

  // Next arriving ship (soonest arrival_date >= today)
  const futureArrivals = schedules
    .filter(s => parseISO(s.arrival_date) >= today)
    .sort((a, b) => parseISO(a.arrival_date).getTime() - parseISO(b.arrival_date).getTime())

  const nextArrival = futureArrivals[0] ?? null
  const nextDeparture = schedules
    .filter(s => parseISO(s.next_departure_date) >= today)
    .sort((a, b) =>
      parseISO(a.next_departure_date).getTime() - parseISO(b.next_departure_date).getTime()
    )[0] ?? null

  const totalLeadMonths = setup.shipping_months + setup.production_lead_days / 30

  return items.map(item => {
    const itemSales = sales
      .filter(s => s.item_code === item.item_code)
      .sort((a, b) => a.month_date.localeCompare(b.month_date))
      .map(s => s.qty_sold)

    const pos = positions.find(p => p.item_code === item.item_code)
    const currentStock = pos?.current_stock ?? 0
    const onOrderQty = pos?.on_order_qty ?? 0
    const arrivalDateStr = pos?.on_order_arrival_date ?? null

    // Demand calculations
    const wma = wma3(itemSales)
    const trend = trend3m(itemSales)
    const overallAvg = mean(itemSales)
    const cv = coefficientOfVariation(itemSales)
    const adjForecast = wma * trend

    // Safety months based on CV
    let safetyMonths: number
    if (cv < setup.cv_threshold_low) safetyMonths = setup.safety_stable
    else if (cv < setup.cv_threshold_high) safetyMonths = setup.safety_irregular
    else safetyMonths = setup.safety_high_irregular

    const coverTarget = totalLeadMonths + safetyMonths
    const targetStock = Math.round(adjForecast * coverTarget)

    // --- Ship-schedule adjusted available stock ---
    // On-order only counts if it arrives before we'd run out of current stock
    const daysUntilStockout =
      adjForecast > 0
        ? (currentStock / adjForecast) * 30
        : Infinity

    const stockoutDate =
      adjForecast > 0
        ? addDays(today, Math.round(daysUntilStockout))
        : null

    let effectiveOnOrder = 0
    if (onOrderQty > 0 && arrivalDateStr) {
      const arrival = parseISO(arrivalDateStr)
      // Count on-order if it arrives before or on stockout date
      // (still gives stock before we run out)
      if (stockoutDate === null || arrival <= stockoutDate) {
        effectiveOnOrder = onOrderQty
      }
    } else if (onOrderQty > 0 && !arrivalDateStr) {
      // No arrival date given — use next scheduled ship arrival if available
      if (nextArrival) {
        const arrival = parseISO(nextArrival.arrival_date)
        if (stockoutDate === null || arrival <= stockoutDate) {
          effectiveOnOrder = onOrderQty
        }
      }
    }

    const available = currentStock + effectiveOnOrder
    const monthsCover = adjForecast > 0 ? available / adjForecast : 999

    // Recommended order
    let recStrips = Math.max(0, targetStock - available)
    // Round up to whole boxes
    const stripsPerBox = item.strips_per_box || 120
    if (recStrips > 0) {
      recStrips = Math.ceil(recStrips / stripsPerBox) * stripsPerBox
      // Enforce minimum order
      if (recStrips < item.min_order_strips) recStrips = item.min_order_strips
    }
    const recBoxes = recStrips / stripsPerBox
    const recMeters = Math.round((recStrips * item.length_mm) / 1000)

    // Status
    let status: ForecastRow['status']
    if (monthsCover < setup.order_now_threshold) status = 'ORDER NOW'
    else if (monthsCover < setup.order_soon_threshold) status = 'ORDER SOON'
    else if (monthsCover > 6) status = 'EXCESS'
    else status = 'OK'

    // Order-by date: when must we order to not stockout
    // Account for lead time + next ship departure as hard deadline
    let orderByDate: Date | null = null
    if (adjForecast > 0 && recStrips > 0) {
      const daysOfStock = (available / adjForecast) * 30
      const rawOrderBy = addDays(today, Math.round(daysOfStock - totalLeadMonths * 30))

      // If next ship departure is sooner, use that as the hard deadline
      if (nextDeparture) {
        const dep = parseISO(nextDeparture.next_departure_date)
        orderByDate = dep < rawOrderBy ? dep : rawOrderBy
      } else {
        orderByDate = rawOrderBy
      }
    }

    const pattern = demandPattern(cv, trend, itemSales)

    return {
      item_code: item.item_code,
      description: item.description,
      length_mm: item.length_mm,
      demand_pattern: pattern,
      wma3: Math.round(wma),
      trend_3m: +trend.toFixed(2),
      adj_forecast: Math.round(adjForecast),
      overall_avg: Math.round(overallAvg),
      cv: +cv.toFixed(2),
      safety_months: safetyMonths,
      cover_target: +coverTarget.toFixed(2),
      target_stock: targetStock,
      current_stock: currentStock,
      on_order_qty: onOrderQty,
      on_order_arrival_date: arrivalDateStr,
      effective_on_order: effectiveOnOrder,
      available,
      months_cover: +monthsCover.toFixed(2),
      rec_order_strips: recStrips,
      rec_order_boxes: recBoxes,
      rec_order_meters: recMeters,
      status,
      order_by_date: orderByDate ? format(orderByDate, 'yyyy-MM-dd') : null,
      stockout_date: stockoutDate ? format(stockoutDate, 'yyyy-MM-dd') : null,
      min_order_strips: item.min_order_strips,
    } satisfies ForecastRow
  })
}
