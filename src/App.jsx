import { useState, useEffect, useRef } from 'react'
import './App.css'

const WEBHOOK_URL = 'http://localhost:5678/webhook/start-outreach'
const SSE_URL = 'http://localhost:3033/progress'
const STATUS = { IDLE: 'idle', RUNNING: 'running', SUCCESS: 'success', ERROR: 'error' }

const PIPELINE = [
  { name: 'Google Sheets', desc: 'lead.source', key: 'sheets' },
  { name: 'DataPrism API', desc: 'profile.scraper', key: 'scraper' },
  { name: 'Follow User', desc: 'instagram.action', key: 'follow' },
  { name: 'Gemini AI', desc: 'message.gen', key: 'ai' },
  { name: 'Playwright DM', desc: 'browser.agent', key: 'dm' },
  { name: 'Sheet Update', desc: 'status.logger', key: 'update' },
]

export default function App() {
  const [status, setStatus] = useState(STATUS.IDLE)
  const [logLines, setLogLines] = useState([])
  const [elapsed, setElapsed] = useState(0)
  const [pipelineStatus, setPipelineStatus] = useState({})
  const [metrics, setMetrics] = useState({ total: 217, sent: 0, skipped: 0, failed: 0 })
  const [currentLead, setCurrentLead] = useState(null)
  const [history, setHistory] = useState([
    { time: '09:15:02', lead: '@retailco_pune', result: 'sent' },
    { time: '09:23:18', lead: '@thepremiumstore', result: 'sent' },
    { time: '09:31:44', lead: '@fashionhub_kalyan', result: 'skipped' },
  ])
  const timerRef = useRef(null)
  const logRef = useRef(null)
  const eseRef = useRef(null)

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [logLines])

  useEffect(() => {
    if (status === STATUS.RUNNING) {
      timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000)
    } else {
      clearInterval(timerRef.current)
      if (status === STATUS.IDLE) setElapsed(0)
    }
    return () => clearInterval(timerRef.current)
  }, [status])

  const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
  const addLog = (text, type = 'info') => setLogLines(p => [...p, { text, type, time: new Date().toLocaleTimeString('en-IN', { hour12: false }) }])

  const startSSE = () => {
    if (eseRef.current) eseRef.current.close()
    const es = new EventSource(SSE_URL)
    eseRef.current = es
    es.onmessage = (e) => {
      const d = JSON.parse(e.data)
      if (d.step) {
        setPipelineStatus(p => ({ ...p, [d.step]: d.state }))
        addLog(d.message, d.state === 'error' ? 'error' : d.state === 'done' ? 'success' : 'info')
        if (d.lead) setCurrentLead(d.lead)
      }
      if (d.done) {
        setStatus(STATUS.SUCCESS)
        if (d.skipped) {
          const lead = d.lead ? `@${d.lead}` : currentLead || '@unknown'
          setMetrics(p => ({ ...p, skipped: p.skipped + 1 }))
          setHistory(p => [{ time: new Date().toLocaleTimeString('en-IN', { hour12: false }), lead, result: 'skipped' }, ...p.slice(0, 9)])
        } else if (!d.error) {
          setMetrics(p => ({ ...p, sent: p.sent + 1 }))
          setHistory(p => [{ time: new Date().toLocaleTimeString('en-IN', { hour12: false }), lead: currentLead || '@unknown', result: 'sent' }, ...p.slice(0, 9)])
        }
        es.close()
        setTimeout(() => { setStatus(STATUS.IDLE); setPipelineStatus({}) }, 5000)
      }
    }
    es.onerror = () => es.close()
  }

  const trigger = async () => {
    if (status === STATUS.RUNNING) return
    setStatus(STATUS.RUNNING); setPipelineStatus({})
    addLog('sequence.init → operator triggered', 'action')
    startSSE()
    try {
      const res = await fetch(WEBHOOK_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'dm_automation_start', timestamp: Date.now() }) })
      if (res.ok) { addLog('webhook.ack → n8n engine online', 'info'); addLog('workflow.exec → dispatching pipeline', 'info') }
      else throw new Error(`HTTP ${res.status}`)
    } catch (err) {
      addLog(`conn.fail → ${err.message}`, 'error')
      addLog('check → n8n running + workflow active', 'warn')
      setStatus(STATUS.ERROR)
      setTimeout(() => setStatus(STATUS.IDLE), 5000)
    }
  }

  const ss = (k) => pipelineStatus[k] || 'idle'
  const done = Object.values(pipelineStatus).filter(s => s === 'done').length

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <div className="logo">
            <div className="logo-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div>
              <div className="logo-text">Outreach<span>OS</span></div>
              <div className="logo-sub">instagram.dm.automation</div>
            </div>
          </div>
        </div>
        <div className="header-center">
          <div className={`status-pill ${status}`}>
            <div className={`pill-dot ${status}`} />
            {status === STATUS.RUNNING ? `running · ${fmt(elapsed)}` : status === STATUS.SUCCESS ? 'completed' : status === STATUS.ERROR ? 'error detected' : 'system.ready'}
          </div>
        </div>
        <div className="header-right">
          <div className="header-meta">
            <span>n8n</span><span className="meta-val">v2.11</span>
            <span className="meta-dot" />
            <span>playwright</span><span className="meta-val">active</span>
            <span className="meta-dot" />
            <span>v1.0.0</span>
          </div>
        </div>
      </header>

      <div className="metrics-bar">
        {[
          { label: 'TOTAL_LEADS', key: 'total', cls: 'teal' },
          { label: 'DMS_SENT', key: 'sent', cls: 'green' },
          { label: 'SKIPPED', key: 'skipped', cls: 'amber' },
          { label: 'FAILED', key: 'failed', cls: 'red' },
        ].map(m => (
          <div key={m.key} className={`metric-card ${m.cls}`}>
            <div className="metric-eyebrow">{m.label}</div>
            <div className="metric-value">{metrics[m.key]}</div>
            {m.key === 'sent' && <div className="metric-bar"><div className="metric-fill" style={{ width: `${(metrics.sent / metrics.total) * 100}%` }} /></div>}
          </div>
        ))}
        <button className={`trigger-btn ${status}`} onClick={trigger} disabled={status === STATUS.RUNNING}>
          <div className="btn-content">
            {status === STATUS.RUNNING ? <><span className="spinner" /><span>running...</span></> :
              status === STATUS.SUCCESS ? <><span>✓</span><span>completed</span></> :
                <><span>▶</span><span>start automation</span></>}
          </div>
          {status === STATUS.RUNNING && <div className="btn-progress" style={{ width: `${(done / 6) * 100}%` }} />}
        </button>
      </div>

      <main className="main">
        <aside className="sidebar">
          <div className="sidebar-block">
            <div className="block-label">Pipeline</div>
            <div className="pipeline-list">
              {PIPELINE.map((step, i) => {
                const state = ss(step.key)
                return (
                  <div key={i} className={`pipe-item ${state}`}>
                    {i < PIPELINE.length - 1 && <div className={`pipe-connector ${state}`} />}
                    <div className={`pipe-node ${state}`}>
                      {state === 'done' ? '✓' : state === 'error' ? '✕' : state === 'active' ? <span className="node-spin">↻</span> : i + 1}
                    </div>
                    <div className="pipe-body">
                      <div className="pipe-name">{step.name}</div>
                      <div className="pipe-desc">{step.desc}</div>
                    </div>
                    <div className={`pipe-badge ${state}`}>
                      {state === 'idle' ? '—' : state === 'active' ? 'NOW' : state === 'done' ? 'DONE' : 'ERR'}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {status === STATUS.RUNNING && currentLead && (
            <div className="current-card">
              <div className="block-label">Current lead</div>
              <div className="current-handle">{currentLead}</div>
              <div className="current-substep">step.{done + 1} → {PIPELINE[Math.min(done, 5)]?.desc}</div>
              <div className="progress-track"><div className="progress-fill" style={{ width: `${(done / 6) * 100}%` }} /></div>
            </div>
          )}

          <div className="sidebar-block">
            <div className="block-label">Recent activity</div>
            <div className="history-list">
              {history.slice(0, 6).map((h, i) => (
                <div key={i} className="history-row">
                  <div className={`h-dot ${h.result}`} />
                  <div className="h-body">
                    <div className="h-lead">{h.lead}</div>
                    <div className="h-time">{h.time}</div>
                  </div>
                  <div className={`h-badge ${h.result}`}>{h.result}</div>
                </div>
              ))}
            </div>
          </div>
        </aside>

        <section className="log-panel">
          <div className="log-toolbar">
            <div className="block-label" style={{ marginBottom: 0 }}>Execution log</div>
            <div className="toolbar-right">
              <span className="log-count">{logLines.length} entries</span>
              <button className="clear-btn" onClick={() => setLogLines([])}>CLEAR</button>
            </div>
          </div>
          <div className="log-body" ref={logRef}>
            {logLines.length === 0 && (
              <div className="log-empty">
                <div className="empty-glyph">{'> _'}</div>
                <div className="empty-text">awaiting trigger</div>
                <div className="empty-sub">start automation to initialize log</div>
              </div>
            )}
            {logLines.map((line, i) => (
              <div key={i} className={`log-row ${line.type}`}>
                <span className="log-idx">{String(i + 1).padStart(3, '0')}</span>
                <span className="log-ts">{line.time}</span>
                <span className={`log-tag ${line.type}`}>
                  {line.type === 'action' ? 'TRIG' : line.type === 'success' ? 'DONE' : line.type === 'error' ? 'ERR' : line.type === 'warn' ? 'WARN' : 'INFO'}
                </span>
                <span className="log-msg">{line.text}</span>
              </div>
            ))}
            {status === STATUS.RUNNING && (
              <div className="log-row blink">
                <span className="log-idx">···</span>
                <span className="log-ts">——:——:——</span>
                <span className="log-tag warn">LIVE</span>
                <span className="log-msg">workflow.exec → n8n engine processing...</span>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  )
}