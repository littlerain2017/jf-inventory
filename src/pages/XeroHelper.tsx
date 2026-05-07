import { useState } from 'react'
import { format, startOfMonth } from 'date-fns'
import type { Item } from '../types'
import { bulkUpsertSales } from '../lib/store'

interface Props {
  items: Item[]
  onRefresh: () => void
}

interface ParsedRow {
  rawCode: string
  matchedCode: string | null
  qty: number
}

export default function XeroHelper({ items, onRefresh }: Props) {
  const [month, setMonth] = useState<string>(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [pasted, setPasted] = useState('')
  const [parsed, setParsed] = useState<ParsedRow[]>([])
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  // Build a lookup: xero code (or item_code) → item_code
  function findMatch(rawCode: string): string | null {
    const norm = rawCode.trim().toUpperCase()
    const direct = items.find(i => i.item_code.toUpperCase() === norm)
    if (direct) return direct.item_code
    // Partial match on item_code suffix
    const partial = items.find(i => norm.includes(i.item_code.toUpperCase()) || i.item_code.toUpperCase().includes(norm))
    return partial?.item_code ?? null
  }

  function parseText(text: string): ParsedRow[] {
    const rows: ParsedRow[] = []
    for (const line of text.split('\n')) {
      const parts = line.split(/[\t,]/)
      if (parts.length < 2) continue
      const rawCode = parts[0].trim()
      const qty = Number(parts[1].replace(/[^0-9.-]/g, ''))
      if (!rawCode || isNaN(qty)) continue
      rows.push({ rawCode, matchedCode: findMatch(rawCode), qty })
    }
    return rows
  }

  function handleParse() {
    const rows = parseText(pasted)
    setParsed(rows)
    setStep(2)
    setDone(false)
  }

  function updateMatch(idx: number, code: string) {
    setParsed(prev => prev.map((r, i) => i === idx ? { ...r, matchedCode: code || null } : r))
  }

  function updateQty(idx: number, qty: number) {
    setParsed(prev => prev.map((r, i) => i === idx ? { ...r, qty } : r))
  }

  async function handleSave() {
    const monthDate = startOfMonth(new Date(month + '-02')).toISOString().split('T')[0]
    setSaving(true)
    try {
      const toSave = parsed
        .filter(r => r.matchedCode !== null)
        .map(r => ({
          item_code: r.matchedCode!,
          month_date: monthDate,
          qty_sold: r.qty,
        }))
      await bulkUpsertSales(toSave)
      setDone(true)
      setStep(3)
      setPasted('')
      setParsed([])
      onRefresh()
    } finally {
      setSaving(false)
    }
  }

  const matched = parsed.filter(r => r.matchedCode !== null).length
  const unmatched = parsed.filter(r => r.matchedCode === null).length

  return (
    <div>
      <div className="info-box">
        从 Xero 导出 <strong>Reports → Sales → Sales by Item</strong>，选好月份范围，
        复制 Item Code 和 Quantity 两列，粘贴到下方。保存后数据自动同步到 Monthly Data。
      </div>

      {/* Step 1: Month + Paste */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="section-title" style={{ marginBottom: 12 }}>
          Step 1 — 选择月份并粘贴 Xero 数据
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 16 }}>
          <div className="form-group">
            <label className="form-label">月份</label>
            <input
              type="month"
              value={month}
              onChange={e => setMonth(e.target.value)}
            />
            <span className="text-muted" style={{ fontSize: '0.75rem', marginTop: 2 }}>
              {month ? format(new Date(month + '-02'), 'MMMM yyyy') : ''}
            </span>
          </div>
          <div className="form-group">
            <label className="form-label">粘贴 Xero 数据（Item Code + Quantity，用 Tab 或逗号分隔）</label>
            <textarea
              rows={8}
              placeholder={"EQLB2500\t320\nEQLB2501\t2200\n..."}
              value={pasted}
              onChange={e => setPasted(e.target.value)}
              style={{ fontFamily: 'monospace', fontSize: '0.8rem', resize: 'vertical' }}
            />
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <button className="btn btn-primary" disabled={!pasted.trim() || !month} onClick={handleParse}>
            解析数据 →
          </button>
        </div>
      </div>

      {/* Step 2: Review */}
      {step >= 2 && parsed.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="section-header">
            <div className="section-title">Step 2 — 核对匹配结果</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              ✅ {matched} 匹配 &nbsp; {unmatched > 0 && <span className="text-warning">⚠ {unmatched} 未匹配</span>}
            </div>
          </div>
          {unmatched > 0 && (
            <div className="warning-box">
              {unmatched} 行未能自动匹配 Item Code，请手动选择或忽略。
            </div>
          )}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Xero 代码</th>
                  <th>匹配到的 SKU</th>
                  <th className="num">数量 (strips)</th>
                  <th>状态</th>
                </tr>
              </thead>
              <tbody>
                {parsed.map((r, i) => (
                  <tr key={i}>
                    <td className="muted" style={{ fontFamily: 'monospace' }}>{r.rawCode}</td>
                    <td>
                      <select
                        value={r.matchedCode ?? ''}
                        onChange={e => updateMatch(i, e.target.value)}
                        style={{ width: 180 }}
                      >
                        <option value="">— 忽略 —</option>
                        {items.map(item => (
                          <option key={item.item_code} value={item.item_code}>
                            {item.item_code} — {item.description}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="num">
                      <input
                        type="number" className="input-sm" style={{ width: 90, textAlign: 'right' }}
                        value={r.qty} min={0}
                        onChange={e => updateQty(i, Number(e.target.value))}
                      />
                    </td>
                    <td>
                      {r.matchedCode
                        ? <span className="badge badge-success">✓ 已匹配</span>
                        : <span className="badge badge-warning">未匹配</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" disabled={saving || matched === 0} onClick={handleSave}>
              {saving ? '保存中…' : `保存 ${matched} 条到 ${format(new Date(month + '-02'), 'MMM yyyy')}`}
            </button>
            <button className="btn btn-ghost" onClick={() => { setStep(1); setParsed([]); setDone(false) }}>
              重新开始
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Done */}
      {done && (
        <div className="card" style={{ textAlign: 'center', padding: 32 }}>
          <div style={{ fontSize: '2rem', marginBottom: 8 }}>✅</div>
          <div style={{ fontWeight: 700, color: 'var(--success)', marginBottom: 4 }}>
            数据已保存到 Monthly Data
          </div>
          <div className="text-secondary" style={{ fontSize: '0.8rem' }}>
            Forecast 页面数据已自动更新
          </div>
          <button className="btn btn-ghost" style={{ marginTop: 16 }} onClick={() => { setStep(1); setDone(false) }}>
            继续导入下一个月
          </button>
        </div>
      )}
    </div>
  )
}
