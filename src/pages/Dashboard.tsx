import type { ForecastRow } from '../types'
import { format, parseISO } from 'date-fns'

interface Props {
  rows: ForecastRow[]
  loading: boolean
}

function fmtDate(d: string | null) {
  if (!d) return '—'
  try { return format(parseISO(d), 'd MMM yyyy') } catch { return d }
}

function fmtNum(n: number) {
  return n.toLocaleString()
}

export default function Dashboard({ rows, loading }: Props) {
  if (loading) return <div className="loading">Loading…</div>

  const now    = rows.filter(r => r.status === 'ORDER NOW')
  const soon   = rows.filter(r => r.status === 'ORDER SOON')
  const ok     = rows.filter(r => r.status === 'OK')
  const excess = rows.filter(r => r.status === 'EXCESS')

  const totalStock   = rows.reduce((a, r) => a + r.current_stock, 0)
  const totalOnOrder = rows.reduce((a, r) => a + r.on_order_qty, 0)
  const totalFcst    = rows.reduce((a, r) => a + r.target_stock, 0)
  const totalRec     = rows.reduce((a, r) => a + r.rec_order_strips, 0)
  const totalRecBoxes = Math.round(totalRec / 120)

  const avgCover = rows.length
    ? rows.reduce((a, r) => a + Math.min(r.months_cover, 99), 0) / rows.length
    : 0

  const minCover = rows.length ? Math.min(...rows.map(r => r.months_cover)) : 0
  const lowStock = rows.filter(r => r.months_cover < 2).length
  const excessStock = excess.length

  return (
    <div>
      <div className="metric-grid">
        <div className="metric-card">
          <div className="label">Total Stock</div>
          <div className="value">{fmtNum(totalStock)}</div>
          <div className="sub">strips in hand</div>
        </div>
        <div className="metric-card">
          <div className="label">On Order</div>
          <div className="value">{fmtNum(totalOnOrder)}</div>
          <div className="sub">strips in transit</div>
        </div>
        <div className="metric-card">
          <div className="label">Total Fcst Need</div>
          <div className="value">{fmtNum(totalFcst)}</div>
          <div className="sub">strips target</div>
        </div>
        <div className="metric-card">
          <div className="label">Rec Order</div>
          <div className="value">{fmtNum(totalRec)}</div>
          <div className="sub">{totalRecBoxes} boxes</div>
        </div>
        <div className="metric-card">
          <div className="label">Avg Cover</div>
          <div className="value">{avgCover.toFixed(1)}</div>
          <div className="sub">months average</div>
        </div>
        <div className="metric-card">
          <div className="label">Min Cover</div>
          <div className="value" style={{ color: minCover < 1.5 ? 'var(--danger)' : 'var(--text)' }}>
            {minCover.toFixed(1)}
          </div>
          <div className="sub">months minimum</div>
        </div>
        <div className="metric-card">
          <div className="label">Low Stock SKUs</div>
          <div className="value" style={{ color: lowStock > 0 ? 'var(--danger)' : 'var(--text)' }}>
            {lowStock}
          </div>
          <div className="sub">under 2 months</div>
        </div>
        <div className="metric-card">
          <div className="label">Excess SKUs</div>
          <div className="value" style={{ color: excessStock > 0 ? 'var(--purple)' : 'var(--text)' }}>
            {excessStock}
          </div>
          <div className="sub">over 6 months</div>
        </div>
      </div>

      <div className="alert-grid">
        <div className="alert-item alert-now">
          <div>
            <div className="count">{now.length}</div>
            <div className="label">ORDER NOW</div>
          </div>
          <div style={{ fontSize: '1.8rem' }}>🔴</div>
        </div>
        <div className="alert-item alert-soon">
          <div>
            <div className="count">{soon.length}</div>
            <div className="label">ORDER SOON</div>
          </div>
          <div style={{ fontSize: '1.8rem' }}>🟡</div>
        </div>
        <div className="alert-item alert-ok">
          <div>
            <div className="count">{ok.length}</div>
            <div className="label">OK</div>
          </div>
          <div style={{ fontSize: '1.8rem' }}>🟢</div>
        </div>
        <div className="alert-item alert-excess">
          <div>
            <div className="count">{excess.length}</div>
            <div className="label">EXCESS</div>
          </div>
          <div style={{ fontSize: '1.8rem' }}>🟣</div>
        </div>
      </div>

      {now.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div className="section-header">
            <div className="section-title">🔴 Order Now — Action Required</div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Item Code</th>
                  <th>Description</th>
                  <th>Pattern</th>
                  <th className="num">Current Stock</th>
                  <th className="num">On Order</th>
                  <th className="num">Months Cover</th>
                  <th className="num">Rec Order (strips)</th>
                  <th className="num">Rec Order (boxes)</th>
                  <th>Order By</th>
                  <th>Stockout</th>
                </tr>
              </thead>
              <tbody>
                {now.map(r => (
                  <tr key={r.item_code}>
                    <td><strong>{r.item_code}</strong></td>
                    <td className="muted">{r.description}</td>
                    <td><PatternBadge p={r.demand_pattern} /></td>
                    <td className="num">{fmtNum(r.current_stock)}</td>
                    <td className="num text-muted">{fmtNum(r.on_order_qty)}</td>
                    <td className="num text-danger">{r.months_cover.toFixed(1)}</td>
                    <td className="num"><strong>{fmtNum(r.rec_order_strips)}</strong></td>
                    <td className="num">{r.rec_order_boxes}</td>
                    <td className="text-danger">{fmtDate(r.order_by_date)}</td>
                    <td className="text-danger">{fmtDate(r.stockout_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {soon.length > 0 && (
        <div>
          <div className="section-header">
            <div className="section-title">🟡 Order Soon</div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Item Code</th>
                  <th>Description</th>
                  <th className="num">Current Stock</th>
                  <th className="num">On Order</th>
                  <th className="num">Months Cover</th>
                  <th className="num">Rec Order (strips)</th>
                  <th>Order By</th>
                </tr>
              </thead>
              <tbody>
                {soon.map(r => (
                  <tr key={r.item_code}>
                    <td><strong>{r.item_code}</strong></td>
                    <td className="muted">{r.description}</td>
                    <td className="num">{fmtNum(r.current_stock)}</td>
                    <td className="num text-muted">{fmtNum(r.on_order_qty)}</td>
                    <td className="num text-warning">{r.months_cover.toFixed(1)}</td>
                    <td className="num"><strong>{fmtNum(r.rec_order_strips)}</strong></td>
                    <td className="text-warning">{fmtDate(r.order_by_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function PatternBadge({ p }: { p: ForecastRow['demand_pattern'] }) {
  const map: Record<string, string> = {
    'GROWING':     'badge-success',
    'DECLINING':   'badge-danger',
    'STABLE':      'badge-accent',
    'SLOW MOVER':  'badge-neutral',
    'BATCH/SPIKE': 'badge-warning',
  }
  return <span className={`badge ${map[p] ?? 'badge-neutral'}`}>{p}</span>
}
