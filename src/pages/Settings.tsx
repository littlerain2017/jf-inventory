import { useState } from 'react'
import type { Item, SetupParams } from '../types'
import { saveSetup, upsertItem, deleteItem } from '../lib/store'
import { isSupabaseConfigured } from '../lib/supabase'

interface Props {
  setup: SetupParams
  items: Item[]
  loading: boolean
  onRefresh: () => void
}

const emptyItem: Omit<Item, 'id'> = {
  item_code: '', description: '', length_mm: 0,
  min_order_strips: 840, strips_per_box: 120,
}

export default function Settings({ setup, items, loading, onRefresh }: Props) {
  const [params, setParams] = useState<SetupParams>(setup)
  const [savingSetup, setSavingSetup] = useState(false)
  const [newItem, setNewItem] = useState(emptyItem)
  const [savingItem, setSavingItem] = useState(false)
  const [tab, setTab] = useState<'params' | 'items' | 'db'>('params')

  if (loading) return <div className="loading">Loading…</div>

  function setParam(key: keyof SetupParams, val: string) {
    setParams(p => ({ ...p, [key]: Number(val) }))
  }

  async function handleSaveSetup() {
    setSavingSetup(true)
    try { await saveSetup(params); onRefresh() }
    finally { setSavingSetup(false) }
  }

  async function handleAddItem(e: React.FormEvent) {
    e.preventDefault()
    if (!newItem.item_code || !newItem.description) return
    setSavingItem(true)
    try {
      await upsertItem({ id: crypto.randomUUID(), ...newItem })
      setNewItem(emptyItem)
      onRefresh()
    } finally { setSavingItem(false) }
  }

  async function handleDeleteItem(code: string) {
    if (!confirm(`确认删除 ${code}？相关销量数据不会删除。`)) return
    await deleteItem(code)
    onRefresh()
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {(['params', 'items', 'db'] as const).map(t => (
          <button key={t} className={`btn ${tab === t ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab(t)}>
            {{ params: '⚙️ 计算参数', items: '📦 SKU 管理', db: '🗄️ Supabase 设置' }[t]}
          </button>
        ))}
      </div>

      {tab === 'params' && (
        <div className="card">
          <div className="section-title" style={{ marginBottom: 16 }}>预测计算参数</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 24 }}>

            <section>
              <div style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 10, fontSize: '0.8rem', textTransform: 'uppercase' }}>交货周期</div>
              <ParamRow label="生产周期 (天)" value={params.production_lead_days}
                onChange={v => setParam('production_lead_days', v)} />
              <ParamRow label="海运时间 (月)" value={params.shipping_months}
                onChange={v => setParam('shipping_months', v)} step="0.5" />
              <div className="text-muted" style={{ fontSize: '0.75rem', marginTop: 4 }}>
                总交货期：{(params.shipping_months + params.production_lead_days / 30).toFixed(2)} 月
              </div>
            </section>

            <section>
              <div style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 10, fontSize: '0.8rem', textTransform: 'uppercase' }}>安全库存 (月)</div>
              <ParamRow label="稳定品 (CV 阈值以下)" value={params.safety_stable}
                onChange={v => setParam('safety_stable', v)} step="0.5" />
              <ParamRow label="波动品 (CV 中等)" value={params.safety_irregular}
                onChange={v => setParam('safety_irregular', v)} step="0.5" />
              <ParamRow label="高波动品 (CV 阈值以上)" value={params.safety_high_irregular}
                onChange={v => setParam('safety_high_irregular', v)} step="0.5" />
              <ParamRow label="CV 低阈值" value={params.cv_threshold_low}
                onChange={v => setParam('cv_threshold_low', v)} step="0.1" />
              <ParamRow label="CV 高阈值" value={params.cv_threshold_high}
                onChange={v => setParam('cv_threshold_high', v)} step="0.1" />
            </section>

            <section>
              <div style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 10, fontSize: '0.8rem', textTransform: 'uppercase' }}>预警阈值 (月覆盖率)</div>
              <ParamRow label="ORDER NOW（低于）" value={params.order_now_threshold}
                onChange={v => setParam('order_now_threshold', v)} step="0.5" />
              <ParamRow label="ORDER SOON（低于）" value={params.order_soon_threshold}
                onChange={v => setParam('order_soon_threshold', v)} step="0.5" />
            </section>
          </div>

          <button
            className="btn btn-primary" style={{ marginTop: 20 }}
            onClick={handleSaveSetup} disabled={savingSetup}
          >
            {savingSetup ? '保存中…' : '保存参数'}
          </button>
        </div>
      )}

      {tab === 'items' && (
        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="section-title" style={{ marginBottom: 12 }}>添加新 SKU</div>
            <form onSubmit={handleAddItem}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 10 }}>
                <div className="form-group">
                  <label className="form-label">Item Code *</label>
                  <input type="text" placeholder="EQLB2XXX" value={newItem.item_code}
                    onChange={e => setNewItem(n => ({ ...n, item_code: e.target.value.toUpperCase() }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">描述 *</label>
                  <input type="text" placeholder="DSTP351-1250-TT" value={newItem.description}
                    onChange={e => setNewItem(n => ({ ...n, description: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">长度 (mm)</label>
                  <input type="number" min={0} value={newItem.length_mm}
                    onChange={e => setNewItem(n => ({ ...n, length_mm: Number(e.target.value) }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">最小下单量 (strips)</label>
                  <input type="number" min={0} step={120} value={newItem.min_order_strips}
                    onChange={e => setNewItem(n => ({ ...n, min_order_strips: Number(e.target.value) }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">每箱 strips</label>
                  <input type="number" min={1} value={newItem.strips_per_box}
                    onChange={e => setNewItem(n => ({ ...n, strips_per_box: Number(e.target.value) }))} />
                </div>
              </div>
              <button type="submit" className="btn btn-primary" disabled={savingItem}>
                {savingItem ? '添加中…' : '添加 SKU'}
              </button>
            </form>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Item Code</th>
                  <th>描述</th>
                  <th className="num">长度 (mm)</th>
                  <th className="num">最小下单 (strips)</th>
                  <th className="num">每箱 strips</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map(item => (
                  <tr key={item.item_code}>
                    <td><strong>{item.item_code}</strong></td>
                    <td className="muted">{item.description}</td>
                    <td className="num">{item.length_mm}</td>
                    <td className="num">{item.min_order_strips}</td>
                    <td className="num">{item.strips_per_box}</td>
                    <td>
                      <button className="btn btn-danger" style={{ padding: '4px 8px' }}
                        onClick={() => handleDeleteItem(item.item_code)}>删除</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'db' && (
        <div className="card">
          <div className="section-title" style={{ marginBottom: 12 }}>Supabase 数据库连接</div>
          <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 8, background: isSupabaseConfigured() ? 'var(--success-light)' : 'var(--warning-light)', border: `1px solid ${isSupabaseConfigured() ? '#86efac' : '#fcd34d'}` }}>
            <strong style={{ color: isSupabaseConfigured() ? 'var(--success)' : 'var(--warning)' }}>
              {isSupabaseConfigured() ? '✅ 已连接 Supabase — 实时同步已启用' : '⚠️ 未连接 Supabase — 使用本地存储（仅当前浏览器）'}
            </strong>
          </div>

          {!isSupabaseConfigured() && (
            <div>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 16 }}>
                要让 3 人实时共享数据，需要连接 Supabase。按以下步骤操作：
              </p>
              <ol style={{ fontSize: '0.85rem', color: 'var(--text)', lineHeight: 2, paddingLeft: 20 }}>
                <li>访问 <strong>supabase.com</strong> → 注册/登录 → 新建 Project</li>
                <li>进入 Project → <strong>Settings → API</strong>，复制 URL 和 anon public key</li>
                <li>在项目根目录创建 <code style={{ background: 'var(--surface-2)', padding: '1px 6px', borderRadius: 4 }}>.env</code> 文件：</li>
              </ol>
              <pre style={{ background: 'var(--surface-2)', padding: 14, borderRadius: 8, fontSize: '0.8rem', marginTop: 8, marginBottom: 16, overflowX: 'auto' }}>
{`VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...`}
              </pre>
              <ol style={{ fontSize: '0.85rem', color: 'var(--text)', lineHeight: 2, paddingLeft: 20 }} start={4}>
                <li>在 Supabase SQL Editor 中运行 <strong>supabase/schema.sql</strong></li>
                <li>重新启动开发服务器：<code style={{ background: 'var(--surface-2)', padding: '1px 6px', borderRadius: 4 }}>npm run dev</code></li>
                <li>部署到 Vercel 时，将环境变量添加到 Project Settings → Environment Variables</li>
              </ol>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ParamRow({
  label, value, onChange, step = '1'
}: { label: string; value: number; onChange: (v: string) => void; step?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
      <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{label}</label>
      <input
        type="number" step={step} value={value} onChange={e => onChange(e.target.value)}
        style={{ width: 80, textAlign: 'right', padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 6, fontSize: '0.825rem', color: 'var(--text)', background: 'var(--surface)' }}
      />
    </div>
  )
}
