import { useCallback, useEffect, useState } from 'react'
import './index.css'
import type { ForecastRow, Item, MonthlySale, SetupParams, ShipSchedule } from './types'
import { DEFAULT_SETUP } from './types'
import {
  fetchItems, fetchSales, fetchPositions,
  fetchSchedules, fetchSetup, subscribeToChanges
} from './lib/store'
import { computeForecast } from './lib/forecast'
import Dashboard from './pages/Dashboard'
import Forecast from './pages/Forecast'
import MonthlyData from './pages/MonthlyData'
import XeroHelper from './pages/XeroHelper'
import ShipSchedulePage from './pages/ShipSchedule'
import Settings from './pages/Settings'

type Page = 'dashboard' | 'forecast' | 'monthly' | 'xero' | 'ships' | 'settings'

const NAV: { key: Page; icon: string; label: string }[] = [
  { key: 'dashboard', icon: '📊', label: 'Dashboard' },
  { key: 'forecast',  icon: '📈', label: 'Forecast' },
  { key: 'monthly',  icon: '📅', label: 'Monthly Data' },
  { key: 'xero',     icon: '📋', label: 'Xero Helper' },
  { key: 'ships',    icon: '🚢', label: 'Ship Schedule' },
  { key: 'settings', icon: '⚙️',  label: 'Settings' },
]

const PAGE_META: Record<Page, { title: string; desc: string }> = {
  dashboard: { title: 'Dashboard', desc: 'Stock health overview and order alerts' },
  forecast:  { title: 'Forecast', desc: 'WMA3 demand forecast + recommended order quantities' },
  monthly:   { title: 'Monthly Data', desc: 'Historical monthly sales by SKU' },
  xero:      { title: 'Xero Helper', desc: 'Paste Xero Sales by Item — auto-syncs to Monthly Data' },
  ships:     { title: 'Ship Schedule', desc: 'Vessel arrival & next departure dates — affects order calculations' },
  settings:  { title: 'Settings', desc: 'Forecast parameters, SKU list, and database setup' },
}

export default function App() {
  const [page, setPage] = useState<Page>('dashboard')
  const [loading, setLoading] = useState(true)

  const [items, setItems]         = useState<Item[]>([])
  const [sales, setSales]         = useState<MonthlySale[]>([])
  const [schedules, setSchedules] = useState<ShipSchedule[]>([])
  const [setup, setSetup]         = useState<SetupParams>(DEFAULT_SETUP)
  const [rows, setRows]           = useState<ForecastRow[]>([])

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const [i, sa, po, sc, se] = await Promise.all([
        fetchItems(), fetchSales(), fetchPositions(), fetchSchedules(), fetchSetup()
      ])
      setItems(i)
      setSales(sa)
      setSchedules(sc)
      setSetup(se)
      setRows(computeForecast(i, sa, po, sc, se))
    } catch (err) {
      console.error('Load error', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadAll()
    const unsub = subscribeToChanges(loadAll)
    return unsub
  }, [loadAll])

  const meta = PAGE_META[page]

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <h1>JF Inventory</h1>
          <p>Datastrip Forecast System</p>
        </div>
        <nav className="sidebar-nav">
          {NAV.map(n => (
            <button
              key={n.key}
              className={`nav-item ${page === n.key ? 'active' : ''}`}
              onClick={() => setPage(n.key)}
            >
              <span className="icon">{n.icon}</span>
              {n.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          {new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
        </div>
      </aside>

      <main className="main">
        <div className="page-header">
          <h2>{meta.title}</h2>
          <p>{meta.desc}</p>
        </div>
        <div className="page-content">
          {page === 'dashboard' && <Dashboard rows={rows} loading={loading} />}
          {page === 'forecast'  && <Forecast  rows={rows} loading={loading} onRefresh={loadAll} />}
          {page === 'monthly'   && <MonthlyData items={items} sales={sales} loading={loading} onRefresh={loadAll} />}
          {page === 'xero'      && <XeroHelper items={items} onRefresh={loadAll} />}
          {page === 'ships'     && <ShipSchedulePage schedules={schedules} loading={loading} onRefresh={loadAll} />}
          {page === 'settings'  && <Settings setup={setup} items={items} loading={loading} onRefresh={loadAll} />}
        </div>
      </main>
    </div>
  )
}
