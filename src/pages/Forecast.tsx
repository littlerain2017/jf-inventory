import { useState } from 'react'
import type { ForecastRow, StockPosition } from '../types'
import { format, parseISO } from 'date-fns'
import { upsertPosition } from '../lib/store'

interface Props {
  rows: ForecastRow[]
  loading: boolean
  onRefresh: () => void
}

function fmtDate(d: string | null) {
  if (!d) return '—'
  try { return format(parseISO(d), 'd MMM yy') } catch { return d }
}

function statusBadge(s: ForecastRow['status']) {
  const map: Record<string, string> = {
    'ORDER NOW':  'badge-danger',
    'ORDER SOON': 'badge-warning',
    'OK':         'badge-success',
    'EXCESS':     'badge-purple',
  }
  return <span className={`badge ${map[s]}`}>{s}</span>
}

function CoverBar({ months, target }: { months: number; target: number }) {
  const pct = Math.min(100, (months / Math.max(target, 1)) * 100)
  let color = 'var(--danger)'
  if (months >= 2.5) color = 'var(--warning)'
  if (months >= target) color = 'var(--success)'
  if (months > 6) color = 'var(--purple)'
  return (
    <div className="cover-bar">
      <div className="cover-bar-track">
        <div className="cover-bar-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="cover-bar-text">{months.toFixed(1)}m</span>
    </div>
  )
}

export default function Forecast({ rows, loading, onRefresh }: Props) {
  const [editRow, setEditRow] = useState<string | null>(null)
  const [editStock, setEditStock] = useState('')
  const [editOnOrder, setEditOnOrder] = useState('')
  const [editArrival, setEditArrival] = useState('')
  const [saving, setSaving] = useState(false)
  const [filter, setFilter] = useState<'all' | 'action'>('all')

  if (loading) return <div className="loading">Loading…</div>

  const displayed = filter === 'action'
    ? rows.filter(r => r.status === 'ORDER NOW' || r.status === 'ORDER SOON')
    : rows

  function startEdit(r: ForecastRow) {
    setEditRow(r.item_code)
    setEditStock(String(r.current_stock))
    setEditOnOrder(String(r.on_order_qty))
    setEditArrival(r.on_order_arrival_date ?? '')
  }

  async function saveEdit(r: ForecastRow) {
    setSaving(true)
    try {
      const pos: Omit<StockPosition, 'id' | 'updated_at'> = {
        item_code: r.item_code,
        current_stock: Number(editStock) || 0,
        on_order_qty: Number(editOnOrder) || 0,
        on_order_arrival_date: editArrival || null,
      }
      await upsertPosition(pos)
      setEditRow(null)
      onRefresh()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="toolbar">
        <button
          className={`btn ${filter === 'all' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setFilter('all')}
        >All SKUs ({rows.length})</button>
        <button
          className={`btn ${filter === 'action' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setFilter('action')}
        >Action Required ({rows.filter(r => r.status !== 'OK' && r.status !== 'EXCESS').length})</button>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Item Code</th>
              <th>Description</th>
              <th>Pattern</th>
              <th className="num">Adj Fcst/Mo</th>
              <th className="num">Target Stock</th>
              <th className="num">Current Stock</th>
              <th className="num">On Order</th>
              <th>Arrival Date</th>
              <th className="num">Effective Avail</th>
              <th>Cover</th>
              <th>Status</th>
              <th className="num">Rec Order (strips)</th>
              <th className="num">Boxes</th>
              <th>Order By</th>
              <th>Stockout</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {displayed.map(r => (
              editRow === r.item_code ? (
                <tr key={r.item_code} style={{ background: 'var(--accent-light)' }}>
                  <td><strong>{r.item_code}</strong></td>
                  <td className="muted">{r.description}</td>
                  <td colSpan={2}></td>
                  <td className="num">{r.target_stock.toLocaleString()}</td>
                  <td>
                    <input
                      type="number" className="input-sm" style={{ width: 90 }}
                      value={editStock} onChange={e => setEditStock(e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="number" className="input-sm" style={{ width: 90 }}
                      value={editOnOrder} onChange={e => setEditOnOrder(e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="date" className="input-sm" style={{ width: 130 }}
                      value={editArrival} onChange={e => setEditArrival(e.target.value)}
                    />
                  </td>
                  <td colSpan={4}></td>
                  <td colSpan={2}></td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn-primary" disabled={saving} onClick={() => saveEdit(r)}>
                        {saving ? '…' : 'Save'}
                      </button>
                      <button className="btn btn-ghost" onClick={() => setEditRow(null)}>Cancel</button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={r.item_code}>
                  <td><strong>{r.item_code}</strong></td>
                  <td className="muted">{r.description}</td>
                  <td>
                    <span className={`badge ${patternClass(r.demand_pattern)}`}>{r.demand_pattern}</span>
                  </td>
                  <td className="num">{r.adj_forecast.toLocaleString()}</td>
                  <td className="num">{r.target_stock.toLocaleString()}</td>
                  <td className="num">{r.current_stock.toLocaleString()}</td>
                  <td className="num text-muted">
                    {r.on_order_qty.toLocaleString()}
                    {r.on_order_qty > 0 && r.effective_on_order === 0 && (
                      <span title="Arrives after stockout — not counted" style={{ marginLeft: 4, color: 'var(--warning)' }}>⚠</span>
                    )}
                  </td>
                  <td className="muted">{fmtDate(r.on_order_arrival_date)}</td>
                  <td className="num">{r.available.toLocaleString()}</td>
                  <td>
                    <CoverBar months={r.months_cover} target={r.cover_target} />
                  </td>
                  <td>{statusBadge(r.status)}</td>
                  <td className="num">
                    {r.rec_order_strips > 0
                      ? <strong>{r.rec_order_strips.toLocaleString()}</strong>
                      : <span className="text-muted">—</span>}
                  </td>
                  <td className="num">{r.rec_order_boxes || '—'}</td>
                  <td style={{ color: r.status === 'ORDER NOW' ? 'var(--danger)' : 'var(--text-secondary)' }}>
                    {fmtDate(r.order_by_date)}
                  </td>
                  <td className="muted">{fmtDate(r.stockout_date)}</td>
                  <td>
                    <button className="btn btn-ghost" style={{ padding: '4px 8px' }} onClick={() => startEdit(r)}>
                      Edit
                    </button>
                  </td>
                </tr>
              )
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function patternClass(p: ForecastRow['demand_pattern']) {
  const map: Record<string, string> = {
    'GROWING':     'badge-success',
    'DECLINING':   'badge-danger',
    'STABLE':      'badge-accent',
    'SLOW MOVER':  'badge-neutral',
    'BATCH/SPIKE': 'badge-warning',
  }
  return map[p] ?? 'badge-neutral'
}
