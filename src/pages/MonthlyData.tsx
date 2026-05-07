import { useState } from 'react'
import { format, parseISO, startOfMonth } from 'date-fns'
import type { Item, MonthlySale } from '../types'
import { upsertSale } from '../lib/store'

interface Props {
  items: Item[]
  sales: MonthlySale[]
  loading: boolean
  onRefresh: () => void
}

function monthKey(d: string) {
  try { return format(parseISO(d), 'MMM yyyy') } catch { return d }
}

export default function MonthlyData({ items, sales, loading, onRefresh }: Props) {
  const [saving, setSaving] = useState(false)
  const [edits, setEdits] = useState<Record<string, string>>({}) // "itemCode|monthDate" -> qty string
  const [selectedMonth, setSelectedMonth] = useState<string>('')

  if (loading) return <div className="loading">Loading…</div>

  // Derive sorted list of months
  const allMonths = Array.from(new Set(sales.map(s => s.month_date)))
    .sort()
    .reverse()

  const displayMonth = selectedMonth || allMonths[0] || ''

  // Sales lookup
  const salesMap: Record<string, number> = {}
  for (const s of sales) {
    salesMap[`${s.item_code}|${s.month_date}`] = s.qty_sold
  }

  function getVal(itemCode: string, monthDate: string): string {
    const key = `${itemCode}|${monthDate}`
    if (key in edits) return edits[key]
    const v = salesMap[key]
    return v !== undefined ? String(v) : ''
  }

  function setVal(itemCode: string, monthDate: string, val: string) {
    setEdits(prev => ({ ...prev, [`${itemCode}|${monthDate}`]: val }))
  }

  async function saveAll() {
    if (!displayMonth) return
    setSaving(true)
    try {
      const toSave = items.map(item => ({
        item_code: item.item_code,
        month_date: displayMonth,
        qty_sold: Number(getVal(item.item_code, displayMonth)) || 0,
      }))
      for (const s of toSave) {
        await upsertSale(s)
      }
      setEdits({})
      onRefresh()
    } finally {
      setSaving(false)
    }
  }

  async function addNewMonth(dateStr: string) {
    if (!dateStr) return
    const iso = startOfMonth(new Date(dateStr + '-02')).toISOString().split('T')[0]
    // Pre-populate with zeros
    for (const item of items) {
      const key = `${item.item_code}|${iso}`
      if (salesMap[key] === undefined) {
        setVal(item.item_code, iso, '0')
      }
    }
  }

  const hasEdits = Object.keys(edits).length > 0

  return (
    <div>
      <div className="info-box">
        选择月份查看/编辑销量数据。蓝色格子可直接输入。输入完成后点击 <strong>保存</strong>。
        数据保存后，Xero Helper 导入的数据会自动同步到这里。
      </div>

      <div className="toolbar">
        <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <span className="form-label" style={{ whiteSpace: 'nowrap' }}>选择月份</span>
          <div className="month-grid" style={{ margin: 0 }}>
            {allMonths.slice(0, 12).map(m => (
              <button
                key={m}
                className={`month-chip ${displayMonth === m ? 'selected' : ''}`}
                onClick={() => setSelectedMonth(m)}
              >
                {monthKey(m)}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="month"
            className="input-sm"
            onChange={e => {
              const iso = e.target.value ? `${e.target.value}-01` : ''
              if (iso) { setSelectedMonth(iso); addNewMonth(e.target.value) }
            }}
            style={{ width: 140 }}
          />
          <button className="btn btn-ghost" style={{ whiteSpace: 'nowrap' }}>+ 新月份</button>
          {hasEdits && (
            <button className="btn btn-primary" disabled={saving} onClick={saveAll}>
              {saving ? '保存中…' : `保存 ${monthKey(displayMonth)}`}
            </button>
          )}
        </div>
      </div>

      {!displayMonth ? (
        <div className="empty-state">
          <div className="icon">📅</div>
          <h3>暂无数据</h3>
          <p>选择月份或通过 Xero Helper 导入数据</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Item Code</th>
                <th>Description</th>
                <th className="num">{monthKey(displayMonth)} 销量 (strips)</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => {
                const val = getVal(item.item_code, displayMonth)
                const isEdited = `${item.item_code}|${displayMonth}` in edits
                return (
                  <tr key={item.item_code}>
                    <td><strong>{item.item_code}</strong></td>
                    <td className="muted">{item.description}</td>
                    <td className="num">
                      <input
                        type="number"
                        className="input-sm"
                        style={{
                          width: 100,
                          textAlign: 'right',
                          background: isEdited ? 'var(--accent-light)' : undefined,
                          borderColor: isEdited ? 'var(--accent)' : undefined,
                        }}
                        value={val}
                        min={0}
                        onChange={e => setVal(item.item_code, displayMonth, e.target.value)}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
