import { useState } from 'react'
import { format, parseISO, isPast } from 'date-fns'
import type { ShipSchedule } from '../types'
import { deleteSchedule, upsertSchedule } from '../lib/store'

interface Props {
  schedules: ShipSchedule[]
  loading: boolean
  onRefresh: () => void
}

function fmtDate(d: string) {
  try { return format(parseISO(d), 'd MMM yyyy') } catch { return d }
}

const emptyForm = { vessel_name: '', arrival_date: '', next_departure_date: '', notes: '' }

export default function ShipSchedulePage({ schedules, loading, onRefresh }: Props) {
  const [form, setForm] = useState(emptyForm)
  const [editId, setEditId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  if (loading) return <div className="loading">Loading…</div>

  const upcoming = schedules.filter(s => !isPast(parseISO(s.arrival_date)))
  const past     = schedules.filter(s =>  isPast(parseISO(s.arrival_date)))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.arrival_date || !form.next_departure_date) {
      setError('到港日期和下班船开船日期为必填项')
      return
    }
    if (form.arrival_date > form.next_departure_date === false &&
        form.next_departure_date < form.arrival_date) {
      setError('下班船开船日期不能早于到港日期')
      return
    }
    setError('')
    setSaving(true)
    try {
      await upsertSchedule({ ...(editId ? { id: editId } : {}), ...form })
      setForm(emptyForm)
      setEditId(null)
      onRefresh()
    } finally {
      setSaving(false)
    }
  }

  function startEdit(s: ShipSchedule) {
    setEditId(s.id)
    setForm({
      vessel_name: s.vessel_name,
      arrival_date: s.arrival_date,
      next_departure_date: s.next_departure_date,
      notes: s.notes,
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleDelete(id: string) {
    if (!confirm('确认删除这条船期记录？')) return
    await deleteSchedule(id)
    onRefresh()
  }

  return (
    <div>
      <div className="info-box">
        <strong>船期影响下单计算</strong>：
        On Order 货物只有在「到港日期」之前到达才计入可用库存。
        「下班船开船日期」是下次下单的截止日期——系统会将其作为 Order By Date 的上限。
      </div>

      {/* Form */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="section-title" style={{ marginBottom: 14 }}>
          {editId ? '编辑船期' : '新增船期'}
        </div>
        {error && <div className="warning-box" style={{ marginBottom: 12 }}>{error}</div>}
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">船名 / 批次（可选）</label>
              <input
                type="text" placeholder="e.g. CMA CGM Batch 1"
                value={form.vessel_name}
                onChange={e => setForm(f => ({ ...f, vessel_name: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label className="form-label">On Order 货物到港日期 *</label>
              <input
                type="date" required
                value={form.arrival_date}
                onChange={e => setForm(f => ({ ...f, arrival_date: e.target.value }))}
              />
              <span className="text-muted" style={{ fontSize: '0.72rem', marginTop: 2 }}>
                到港前 On Order 不算库存
              </span>
            </div>
            <div className="form-group">
              <label className="form-label">下班船预计开船日期 *</label>
              <input
                type="date" required
                value={form.next_departure_date}
                onChange={e => setForm(f => ({ ...f, next_departure_date: e.target.value }))}
              />
              <span className="text-muted" style={{ fontSize: '0.72rem', marginTop: 2 }}>
                下单截止日期上限
              </span>
            </div>
            <div className="form-group">
              <label className="form-label">备注</label>
              <input
                type="text" placeholder="可选"
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? '保存中…' : editId ? '更新' : '添加船期'}
            </button>
            {editId && (
              <button
                type="button" className="btn btn-ghost"
                onClick={() => { setEditId(null); setForm(emptyForm) }}
              >
                取消
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Upcoming */}
      {upcoming.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div className="section-header">
            <div className="section-title">🚢 即将到港</div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>船名 / 批次</th>
                  <th>到港日期</th>
                  <th>下班船开船日期</th>
                  <th>备注</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {upcoming.map(s => (
                  <tr key={s.id}>
                    <td><strong>{s.vessel_name || '—'}</strong></td>
                    <td style={{ color: 'var(--success)', fontWeight: 600 }}>{fmtDate(s.arrival_date)}</td>
                    <td style={{ color: 'var(--warning)', fontWeight: 600 }}>{fmtDate(s.next_departure_date)}</td>
                    <td className="muted">{s.notes || '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-ghost" style={{ padding: '4px 8px' }} onClick={() => startEdit(s)}>编辑</button>
                        <button className="btn btn-danger" style={{ padding: '4px 8px' }} onClick={() => handleDelete(s.id)}>删除</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {upcoming.length === 0 && (
        <div className="empty-state">
          <div className="icon">🚢</div>
          <h3>暂无船期</h3>
          <p>添加船期后，系统会自动调整库存计算和下单日期</p>
        </div>
      )}

      {/* Past */}
      {past.length > 0 && (
        <div>
          <div className="section-header">
            <div className="section-title" style={{ color: 'var(--text-muted)' }}>已到港（历史记录）</div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>船名 / 批次</th>
                  <th>到港日期</th>
                  <th>下班船开船日期</th>
                  <th>备注</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {past.map(s => (
                  <tr key={s.id} style={{ opacity: 0.6 }}>
                    <td>{s.vessel_name || '—'}</td>
                    <td className="muted">{fmtDate(s.arrival_date)}</td>
                    <td className="muted">{fmtDate(s.next_departure_date)}</td>
                    <td className="muted">{s.notes || '—'}</td>
                    <td>
                      <button className="btn btn-danger" style={{ padding: '4px 8px' }} onClick={() => handleDelete(s.id)}>删除</button>
                    </td>
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
