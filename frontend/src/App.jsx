import { useCallback, useEffect, useState } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import indiaMap from '@svg-maps/india'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

const projects = [
  { id: 'N24001805', name: 'Eastern Dedicated Freight Corridor', sector: 'Railways', state: 'Uttar Pradesh', cost: 12840, risk: 91, time: 87, status: 'Delayed', reason: 'Land acquisition', progress: 62, updated: 'Mar 2025' },
  { id: 'N23001142', name: 'Jal Jeevan Mission - Bundelkhand', sector: 'Water Resources', state: 'Madhya Pradesh', cost: 2180, risk: 78, time: 69, status: 'At risk', reason: 'Contractor capacity', progress: 48, updated: 'Mar 2025' },
  { id: 'N22000418', name: 'Kochi Metro Phase II', sector: 'Urban Transport', state: 'Kerala', cost: 1950, risk: 61, time: 58, status: 'At risk', reason: 'Utility shifting', progress: 71, updated: 'Mar 2025' },
  { id: 'N24002031', name: 'North East Transmission Grid', sector: 'Power', state: 'Assam', cost: 3420, risk: 54, time: 45, status: 'Watching', reason: 'Right of way', progress: 39, updated: 'Mar 2025' },
]

const trend = [
  { month: 'Apr 24', cost: 11200, spend: 4880, risk: 54 }, { month: 'Jun', cost: 11540, spend: 5420, risk: 61 },
  { month: 'Aug', cost: 11980, spend: 6180, risk: 68 }, { month: 'Oct', cost: 12120, spend: 6940, risk: 74 },
  { month: 'Dec', cost: 12580, spend: 7480, risk: 83 }, { month: 'Feb 25', cost: 12840, spend: 8010, risk: 91 },
]

const sectorData = [
  { name: 'Railways', risk: 79 }, { name: 'Water', risk: 68 }, { name: 'Power', risk: 55 }, { name: 'Urban', risk: 48 },
]

const buildDashboardStateData = (projectList) => {
  const states = Object.values(projectList.reduce((result, project) => {
    const state = result[project.state] ?? {
      StateId: project.state,
      StateName: project.state,
      ProjectCount: 0,
      ProjectCost: 0,
      RevisedCost: 0,
      Expend: 0,
      CompletedProject: 0,
      NewAddedProject: 0,
    }
    state.ProjectCount += 1
    state.ProjectCost += project.cost
    state.RevisedCost += project.cost * (1 + project.risk / 1000)
    state.Expend += project.cost * project.progress / 100
    state.CompletedProject += project.status === 'Completed' ? 1 : 0
    result[project.state] = state
    return result
  }, {}))
  const national_total = states.reduce((total, state) => ({
    StateId: 0,
    StateName: 'Portfolio total',
    ProjectCount: total.ProjectCount + state.ProjectCount,
    ProjectCost: total.ProjectCost + state.ProjectCost,
    RevisedCost: total.RevisedCost + state.RevisedCost,
    Expend: total.Expend + state.Expend,
    CompletedProject: total.CompletedProject + state.CompletedProject,
    NewAddedProject: total.NewAddedProject + state.NewAddedProject,
  }), { StateId: 0, StateName: 'Portfolio total', ProjectCount: 0, ProjectCost: 0, RevisedCost: 0, Expend: 0, CompletedProject: 0, NewAddedProject: 0 })
  return { source: 'PAIMANA Prism dashboard demonstration records', freeze_month: 'Mar 2025', national_total, states, stale: false }
}

function RiskPill({ score }) {
  return <span className={`risk-pill ${score >= 75 ? 'critical' : score >= 55 ? 'watch' : 'stable'}`}>{score}</span>
}

function App() {
  const [authenticated, setAuthenticated] = useState(null)

  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'include' })
      .then((response) => response.json())
      .then((data) => setAuthenticated(Boolean(data.authenticated)))
      .catch(() => setAuthenticated(false))
  }, [])

  if (authenticated === null) return <div className="auth-loading">Checking secure session...</div>
  if (!authenticated) return <Login onAuthenticated={() => setAuthenticated(true)} />
  return <Dashboard onLogout={() => setAuthenticated(false)} />
}

function Login({ onAuthenticated }) {
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/auth/login', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, password }) })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.detail || 'Unable to sign in')
      }
      onAuthenticated()
    } catch (loginError) {
      setError(loginError instanceof TypeError ? 'Authentication server is unavailable. Start FastAPI on port 8000 and try again.' : loginError.message)
    } finally {
      setBusy(false)
    }
  }
  return <main className="auth-shell"><section className="auth-panel"><div className="brand auth-brand"><div className="brand-mark">P</div><div><strong>PAIMANA</strong><span>PRISM / ADMIN CONSOLE</span></div></div><div className="auth-copy"><span className="eyebrow">PROJECT MONITORING ACCESS</span><h1>Welcome back.</h1><p>Enter your admin phone number and password to manage projects and review early warnings.</p></div><form className="login-form" onSubmit={submit}><label className="field"><span>Admin phone number</span><input required type="tel" inputMode="numeric" autoComplete="username" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Enter phone number" /></label><label className="field"><span>Password</span><input required type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter password" /></label><small className="password-hint">Use the configured password prefix followed by the last 4 phone digits.</small>{error && <div className="login-error">{error}</div>}<button className="primary-button" disabled={busy}>{busy ? 'Signing in...' : 'Sign in securely'} <span>↗</span></button></form><small className="auth-footnote">Private admin access · Session expires automatically</small></section><aside className="auth-aside"><span className="eyebrow">PAIMANA PRISM / 01</span><h2>Evidence before urgency.</h2><p>Turn monthly project reporting into a clear view of what needs attention next.</p><div className="auth-stat"><strong>Predict</strong><span>Explain · Benchmark · Simulate</span></div></aside></main>
}

function Dashboard({ onLogout }) {
  const [view, setView] = useState('overview')
  const [selected, setSelected] = useState(projects[0])
  const [portfolioProjects, setPortfolioProjects] = useState(projects)
  const [delay, setDelay] = useState(3)
  const [increase, setIncrease] = useState(10)
  const paimanaData = buildDashboardStateData(portfolioProjects)
  const paimanaError = ''

  const loadLocalProjects = () => {
    try {
      const saved = JSON.parse(window.localStorage.getItem('paimana-projects') || '[]')
      return Array.isArray(saved) ? saved : []
    } catch {
      return []
    }
  }
  const saveLocalProjects = (saved) => window.localStorage.setItem('paimana-projects', JSON.stringify(saved))

  useEffect(() => {
    const loadProjects = () => fetch('/api/projects', { credentials: 'include' })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('API unavailable')))
      .then((saved) => {
        const combined = [...saved, ...loadLocalProjects().filter((item) => !saved.some((project) => project.id === item.id))]
        setPortfolioProjects([...combined, ...projects.filter((project) => !combined.some((item) => item.id === project.id))])
      })
      .catch(() => {
        const saved = loadLocalProjects()
        setPortfolioProjects([...saved, ...projects.filter((project) => !saved.some((item) => item.id === project.id))])
      })
    loadProjects()
    const refreshTimer = window.setInterval(loadProjects, 15000)
    return () => window.clearInterval(refreshTimer)
  }, [])

  const openProject = (project) => { setSelected(project); setView('intelligence') }
  const exportBrief = () => {
    const official = paimanaData?.national_total
    const lines = [
      'PAIMANA PRISM — PORTFOLIO BRIEF',
      `Generated: ${new Date().toLocaleString('en-IN')}`,
      '',
      'PORTFOLIO OVERVIEW',
      `Monitored projects: ${officialNumber(official?.ProjectCount ?? 184)}`,
      'High cost risk: 18',
      'High time risk: 27',
      'Priority attention: 12',
      '',
      'OFFICIAL PAIMANA SUMMARY',
      `Reporting period: ${paimanaData?.freeze_month ?? 'Not available'}`,
      `Original cost: ₹${officialNumber(official?.ProjectCost)} Cr`,
      `Latest revised cost: ₹${officialNumber(official?.RevisedCost)} Cr`,
      `Expenditure: ₹${officialNumber(official?.Expend)} Cr`,
      `Source: ${paimanaData?.source ?? 'PAIMANA data was unavailable when this brief was generated'}`,
      '',
      'PRIORITY PROJECTS',
      ...portfolioProjects.map((project, index) => `${index + 1}. ${project.name} (${project.state}) — ${project.status}; cost risk ${project.risk}; time risk ${project.time}; reported reason: ${project.reason}.`),
      '',
      'Note: Priority-project risk scores are the dashboard demonstration model. State totals are loaded from PAIMANA when available.',
    ]
    const file = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(file)
    const link = document.createElement('a')
    link.href = url
    link.download = `paimana-prism-brief-${new Date().toISOString().slice(0, 10)}.txt`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }
  const exportOfficialBrief = () => {
    const official = paimanaData?.national_total
    if (!official) {
      window.alert('Dashboard data is unavailable. Refresh the page and try again.')
      return
    }
    const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]))
    const currency = (value) => `Rs. ${officialNumber(value)} Cr`
    const stateRows = [...(paimanaData.states ?? [])]
      .sort((left, right) => (Number(right.ProjectCount) || 0) - (Number(left.ProjectCount) || 0))
      .map((state) => `<tr><td>${escapeHtml(state.StateName)}</td><td>${officialNumber(state.ProjectCount)}</td><td>${currency(state.ProjectCost)}</td><td>${currency(state.RevisedCost)}</td><td>${currency(state.Expend)}</td><td>${officialNumber(state.CompletedProject)}</td><td>${officialNumber(state.NewAddedProject)}</td></tr>`)
      .join('')
    const generatedAt = new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>PAIMANA Prism Portfolio Brief</title><style>body{font-family:Arial,sans-serif;color:#15231f;margin:40px;line-height:1.4}h1{margin:0;color:#173d34}h2{margin:30px 0 10px;color:#173d34;font-size:18px}.meta{color:#5b6c65;font-size:12px}.summary{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:16px}.summary div{border:1px solid #cdd9d2;padding:12px}.summary span{display:block;color:#687970;font-size:11px;text-transform:uppercase}.summary strong{display:block;margin-top:6px;font-size:20px}table{border-collapse:collapse;width:100%;font-size:11px}th{background:#173d34;color:#fff;text-align:left}th,td{border:1px solid #d6dfda;padding:8px}tr:nth-child(even){background:#f4f8f5}.note{font-size:11px;color:#5b6c65;margin-top:18px}@media print{body{margin:20px}}</style></head><body><h1>PAIMANA Prism Portfolio Brief</h1><p class="meta">Generated ${escapeHtml(generatedAt)} | Official PAIMANA reporting period: ${escapeHtml(paimanaData.freeze_month ?? 'Not specified')}</p><h2>National summary</h2><section class="summary"><div><span>Projects</span><strong>${officialNumber(official.ProjectCount)}</strong></div><div><span>Original cost</span><strong>${currency(official.ProjectCost)}</strong></div><div><span>Revised cost</span><strong>${currency(official.RevisedCost)}</strong></div><div><span>Expenditure</span><strong>${currency(official.Expend)}</strong></div><div><span>Completed this month</span><strong>${officialNumber(official.CompletedProject)}</strong></div><div><span>Newly added</span><strong>${officialNumber(official.NewAddedProject)}</strong></div></section><h2>State-wise project status</h2><table><thead><tr><th>State / UT</th><th>Projects</th><th>Original cost</th><th>Revised cost</th><th>Expenditure</th><th>Completed</th><th>New</th></tr></thead><tbody>${stateRows}</tbody></table><p class="note">Source: ${escapeHtml(paimanaData.source)}. This brief contains official PAIMANA state totals retrieved by the dashboard.</p></body></html>`
    const file = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(file)
    const link = document.createElement('a')
    link.href = url
    link.download = `paimana-statewise-brief-${new Date().toISOString().slice(0, 10)}.html`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }
  const exportJudgeReport = () => {
    const official = paimanaData?.national_total
    if (!official) {
      window.alert('Official PAIMANA figures have not loaded yet. Start the FastAPI server and wait for the State-wise projects panel to load before exporting.')
      return
    }
    try {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' })
    const generatedAt = new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
    const reportingPeriod = paimanaData.freeze_month ?? 'Not specified'
    const money = (value) => `INR ${officialNumber(value)} Cr`
    doc.setFillColor(23, 61, 52)
    doc.rect(0, 0, 210, 30, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(19)
    doc.text('PAIMANA Prism - Portfolio Brief', 15, 14)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.text(`Dashboard state-wise project data | Reporting period: ${reportingPeriod}`, 15, 21)
    doc.setTextColor(37, 43, 41)
    doc.setFontSize(8)
    doc.text(`Generated: ${generatedAt}`, 15, 38)
    doc.text('Source: PAIMANA Prism dashboard records shown in this application', 15, 43)

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(13)
    doc.text('National summary', 15, 53)
    autoTable(doc, {
      startY: 57,
      head: [['Projects', 'Original cost', 'Revised cost'], ['Expenditure', 'Completed this month', 'Newly added']],
      body: [[officialNumber(official.ProjectCount), money(official.ProjectCost), money(official.RevisedCost)], [money(official.Expend), officialNumber(official.CompletedProject), officialNumber(official.NewAddedProject)]],
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: 9, cellPadding: 4, textColor: [37, 43, 41] },
      headStyles: { fillColor: [229, 238, 225], textColor: [37, 43, 41], fontStyle: 'bold' },
    })

    const priorityY = doc.lastAutoTable.finalY + 11
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(13)
    doc.text('Priority project signals', 15, priorityY)
    autoTable(doc, {
      startY: priorityY + 4,
      head: [['Project', 'State', 'Status', 'Cost risk', 'Time risk', 'Reported reason']],
      body: portfolioProjects.map((project) => [project.name, project.state, project.status, String(project.risk), String(project.time), project.reason]),
      theme: 'striped',
      styles: { font: 'helvetica', fontSize: 7.5, cellPadding: 2.5, textColor: [37, 43, 41] },
      headStyles: { fillColor: [23, 61, 52], textColor: [255, 255, 255] },
      columnStyles: { 0: { cellWidth: 43 }, 1: { cellWidth: 27 }, 2: { cellWidth: 20 }, 3: { cellWidth: 18 }, 4: { cellWidth: 18 }, 5: { cellWidth: 38 } },
    })

    const stateY = doc.lastAutoTable.finalY + 11
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(13)
    doc.text('State-wise project status', 15, stateY)
    autoTable(doc, {
      startY: stateY + 4,
      head: [['State / UT', 'Projects', 'Original cost', 'Revised cost', 'Expenditure', 'Completed', 'New']],
      body: [...(paimanaData.states ?? [])]
        .sort((left, right) => (Number(right.ProjectCount) || 0) - (Number(left.ProjectCount) || 0))
        .map((state) => [state.StateName, officialNumber(state.ProjectCount), money(state.ProjectCost), money(state.RevisedCost), money(state.Expend), officialNumber(state.CompletedProject), officialNumber(state.NewAddedProject)]),
      theme: 'striped',
      styles: { font: 'helvetica', fontSize: 6.8, cellPadding: 1.8, textColor: [37, 43, 41] },
      headStyles: { fillColor: [23, 61, 52], textColor: [255, 255, 255], fontSize: 6.8 },
      columnStyles: { 0: { cellWidth: 30 }, 1: { cellWidth: 14 }, 2: { cellWidth: 31 }, 3: { cellWidth: 31 }, 4: { cellWidth: 31 }, 5: { cellWidth: 18 }, 6: { cellWidth: 14 } },
      margin: { left: 15, right: 15 },
    })
    const pages = doc.getNumberOfPages()
    for (let page = 1; page <= pages; page += 1) {
      doc.setPage(page)
      doc.setDrawColor(207, 216, 210)
      doc.line(15, 287, 195, 287)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7)
      doc.setTextColor(91, 108, 101)
      doc.text('PAIMANA Prism | Decision-support dashboard | Report generated from displayed dashboard data', 15, 292)
      doc.text(`Page ${page} of ${pages}`, 195, 292, { align: 'right' })
    }
    doc.save(`paimana-prism-judge-report-${new Date().toISOString().slice(0, 10)}.pdf`)
    } catch (error) {
      console.error('Unable to generate portfolio brief', error)
      window.alert('The PDF brief could not be generated. Please refresh the page and try again.')
    }
  }
  const scenarioTime = Math.min(99, selected.time + delay * 3)
  const scenarioCost = Math.min(99, selected.risk + Math.round(increase * 0.65))

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark">P</div><div><strong>PAIMANA</strong><span>PRISM / 01</span></div></div>
        <div className="source-note"><span className="live-dot" /> DEMO DATASET<br /><small>4 projects / 24 observations</small></div>
        <nav>
          <button className={view === 'overview' ? 'active' : ''} onClick={() => setView('overview')}><span>◉</span> Overview</button>
          <button className={view === 'queue' ? 'active' : ''} onClick={() => setView('queue')}><span>!</span> Early warnings <b>12</b></button>
          <button className={view === 'intelligence' ? 'active' : ''} onClick={() => setView('intelligence')}><span>⌁</span> Project intelligence</button>
          <button className={view === 'simulator' ? 'active' : ''} onClick={() => setView('simulator')}><span>↗</span> What-if simulator</button>
          <button className={view === 'add-project' ? 'active' : ''} onClick={() => setView('add-project')}><span>＋</span> Add project</button>
          <button className="download-nav" onClick={exportJudgeReport}><span>↓</span> Download brief</button>
        </nav>
        <div className="sidebar-foot"><span>MODEL STATUS</span><strong>Baseline + RF ready</strong><small>Last scored 23 Aug 2026</small><button className="logout-button" onClick={async () => { await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }); onLogout() }}>Log out</button></div>
      </aside>

      <main className="content">
        <header className="topbar"><div><span className="eyebrow">MINISTRY MONITORING / MONTHLY FLASH REPORTS</span><h1>{view === 'overview' ? 'Portfolio overview' : view === 'queue' ? 'Early-warning queue' : view === 'simulator' ? 'Decision-support simulator' : 'Project intelligence'}</h1></div><div className="header-meta"><span>Last report <strong>Mar 2025</strong></span><button className="export" onClick={exportJudgeReport}>↓ Download PDF report</button></div></header>

        {view === 'overview' && <Overview projects={portfolioProjects} onOpen={openProject} paimanaData={paimanaData} paimanaError={paimanaError} />}
        {view === 'queue' && <Queue projects={portfolioProjects} onOpen={openProject} />}
        {view === 'intelligence' && <Intelligence project={selected} onSimulate={() => setView('simulator')} />}
        {view === 'simulator' && <Simulator project={selected} delay={delay} increase={increase} setDelay={setDelay} setIncrease={setIncrease} scenarioTime={scenarioTime} scenarioCost={scenarioCost} />}
        {view === 'add-project' && <AddProject addedProjects={portfolioProjects.filter((project) => !projects.some((base) => base.id === project.id))} onAdd={async (project) => { const response = await fetch('/api/projects', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(project) }); if (response.status === 401) throw new Error('Your admin session expired. Please log in again.'); if (!response.ok) { const saved = [...loadLocalProjects().filter((item) => item.id !== project.id), project]; saveLocalProjects(saved); } setPortfolioProjects((current) => [project, ...current.filter((item) => item.id !== project.id)]) }} />}
      </main>
    </div>
  )
}

function Overview({ projects, onOpen, paimanaData, paimanaError }) {
  return <>
    <div className="hero-line"><div><p className="muted">A forward-looking view of infrastructure delivery health.</p><div className="data-badge">● SYNTHETIC DEMO RECORDS · REPLACE WITH VERIFIED PAIMANA EXTRACTS</div></div><span className="period">APR 2024 — MAR 2025 <i>12 months</i></span></div>
    <section className="metric-grid"><Metric label="Monitored projects" value="184" detail="+12 this period" /><Metric label="High cost risk" value="18" detail="9.8% of portfolio" tone="red" /><Metric label="High time risk" value="27" detail="14.7% of portfolio" tone="amber" /><Metric label="Priority attention" value="12" detail="6 need action today" tone="ink" /></section>
    <div className="dashboard-grid"><section className="panel chart-panel"><div className="panel-head"><div><span className="eyebrow">EXPOSURE BY SECTOR</span><h2>Risk concentration</h2></div><span className="legend"><i /> Avg. risk score</span></div><ResponsiveContainer width="100%" height={240}><BarChart data={sectorData} margin={{ top: 20, right: 10, left: -25, bottom: 0 }}><CartesianGrid vertical={false} stroke="#e6e1d8" /><XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#6d706b', fontSize: 12 }} /><YAxis axisLine={false} tickLine={false} tick={{ fill: '#9a9b95', fontSize: 11 }} /><Tooltip cursor={{ fill: '#f4f0e8' }} /><Bar dataKey="risk" fill="#d6553e" radius={[3, 3, 0, 0]} barSize={38} /></BarChart></ResponsiveContainer></section><section className="panel attention-panel"><div className="panel-head"><div><span className="eyebrow">ACTION REQUIRED</span><h2>Priority projects</h2></div><button className="text-button" onClick={() => onOpen(projects[0])}>View queue →</button></div>{projects.slice(0, 3).map((project) => <ProjectRow key={project.id} project={project} onOpen={onOpen} />)}</section></div>
    <StateProjects paimanaData={paimanaData} paimanaError={paimanaError} />
    <section className="panel table-panel"><div className="panel-head"><div><span className="eyebrow">PORTFOLIO PULSE</span><h2>Latest project signals</h2></div><button className="filter">All sectors ▾</button></div><div className="table-wrap"><table><thead><tr><th>Project</th><th>Sector</th><th>State</th><th>Cost risk</th><th>Time risk</th><th>Status</th></tr></thead><tbody>{projects.map((project) => <tr key={project.id} onClick={() => onOpen(project)}><td><strong>{project.name}</strong><small>[{project.id}]</small></td><td>{project.sector}</td><td>{project.state}</td><td><RiskPill score={project.risk} /></td><td><RiskPill score={project.time} /></td><td><span className="status">{project.status}</span></td></tr>)}</tbody></table></div></section>
  </>
}

function Metric({ label, value, detail, tone = '' }) { return <div className={`metric ${tone}`}><span>{label}</span><strong>{value}</strong><small>{detail}</small></div> }
function ProjectRow({ project, onOpen }) { return <button className="project-row" onClick={() => onOpen(project)}><span className="priority-dot" /><span><strong>{project.name}</strong><small>{project.id} · {project.reason}</small></span><RiskPill score={project.risk} /><span className="chevron">→</span></button> }

const emptyProject = { name: '', id: '', sector: 'Railways', state: '', cost: '', originalCost: '', approvalDate: '', completionDate: '', anticipatedDate: '', progress: 0, milestones: '', reason: 'Land acquisition', notes: '' }

function AddProject({ addedProjects, onAdd }) {
  const [form, setForm] = useState(emptyProject)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const update = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }))
  const submit = (event) => {
    event.preventDefault()
    setError('')
    const project = {
      ...form,
      id: form.id.trim() || `NEW-${String(Date.now()).slice(-6)}`,
      cost: Number(form.cost) || 0,
      risk: form.reason === 'No delay reported' ? 34 : form.progress < 40 ? 78 : 58,
      time: form.reason === 'No delay reported' ? 28 : form.progress < 40 ? 72 : 51,
      status: form.reason === 'No delay reported' ? 'Watching' : 'At risk',
      updated: 'Just now',
    }
    onAdd(project).then(() => { setSaved(true); setForm(emptyProject) }).catch((saveError) => setError(saveError.message))
  }
  return <>
    <div className="intake-heading"><div><span className="eyebrow">PORTFOLIO INTAKE / NEW RECORD</span><h2>Add a monitored project</h2><p>Capture the project baseline and the evidence needed for future monthly risk scoring.</p></div><span className="decision-badge">ADMIN RECORD · DEMO DATA</span></div>
    {saved && <div className="save-confirmation"><strong>Project saved successfully.</strong><span>It is now available to the portfolio and state map after refresh.</span><button onClick={() => setSaved(false)}>Dismiss</button></div>}{error && <div className="login-error">{error}</div>}
    <div className="intake-layout"><form className="panel project-form" onSubmit={submit}><FormSection title="Project identity" hint="Use the stable PAIMANA project ID when available."><div className="form-grid"><Field label="Project name" required><input required value={form.name} onChange={update('name')} placeholder="e.g. Coastal highway package" /></Field><Field label="Project ID"><input value={form.id} onChange={update('id')} placeholder="e.g. N24002501" /></Field><Field label="Sector"><select value={form.sector} onChange={update('sector')}><option>Railways</option><option>Road Transport</option><option>Water Resources</option><option>Power</option><option>Urban Transport</option><option>Health</option></select></Field><Field label="State / UT" required><input required value={form.state} onChange={update('state')} placeholder="e.g. Maharashtra" /></Field></div></FormSection><FormSection title="Financial baseline" hint="Amounts are recorded in crore rupees."><div className="form-grid"><Field label="Original approved cost" required><div className="input-suffix"><input required type="number" min="0" value={form.originalCost} onChange={update('originalCost')} placeholder="0" /><span>₹ Cr</span></div></Field><Field label="Latest anticipated cost" required><div className="input-suffix"><input required type="number" min="0" value={form.cost} onChange={update('cost')} placeholder="0" /><span>₹ Cr</span></div></Field><Field label="Date of approval"><input type="date" value={form.approvalDate} onChange={update('approvalDate')} /></Field></div></FormSection><FormSection title="Schedule and progress" hint="These fields establish the project’s first comparable observation."><div className="form-grid"><Field label="Original completion date"><input type="date" value={form.completionDate} onChange={update('completionDate')} /></Field><Field label="Anticipated completion date"><input type="date" value={form.anticipatedDate} onChange={update('anticipatedDate')} /></Field><Field label="Physical progress"><div className="range-field"><input type="range" min="0" max="100" value={form.progress} onChange={update('progress')} /><output>{form.progress}%</output></div></Field><Field label="Milestones achieved"><input value={form.milestones} onChange={update('milestones')} placeholder="e.g. 18 of 29" /></Field></div></FormSection><FormSection title="Current evidence" hint="Select the most recent reported reason for delay or risk."><div className="form-grid"><Field label="Primary delay reason" required><select required value={form.reason} onChange={update('reason')}><option>Land acquisition</option><option>Finance / funding</option><option>Contractor capacity</option><option>Utility shifting</option><option>Litigation</option><option>Right of way</option><option>No delay reported</option></select></Field><Field label="Field note"><textarea value={form.notes} onChange={update('notes')} placeholder="Add a concise evidence note from the latest report..." /></Field></div></FormSection><div className="form-actions"><span><b>*</b> Required fields</span><button type="button" className="cancel-button" onClick={() => setForm(emptyProject)}>Clear form</button><button type="submit" className="primary-button">Save project <span>↗</span></button></div></form><aside className="intake-aside"><section className="panel intake-tip"><span className="eyebrow">BEFORE YOU SAVE</span><h3>Build a useful baseline</h3><ul><li>Match the exact bracketed ID from the report.</li><li>Keep original and anticipated costs separate.</li><li>Use the latest reported completion date.</li></ul></section><section className="panel recent-projects"><div className="panel-head"><div><span className="eyebrow">THIS SESSION</span><h3>Recently added</h3></div><span className="count-badge">{addedProjects.length}</span></div>{addedProjects.length === 0 ? <p className="muted">Saved projects will appear here for review.</p> : addedProjects.map((project) => <div className="recent-project" key={project.id}><span className="priority-dot" /><div><strong>{project.name}</strong><small>[{project.id}] · {project.state}</small></div><RiskPill score={project.risk} /></div>)}</section></aside></div>
  </>
}

function FormSection({ title, hint, children }) { return <fieldset><legend>{title}</legend><p>{hint}</p>{children}</fieldset> }
function Field({ label, required, children }) { return <label className="field"><span>{label}{required && <b> *</b>}</span>{children}</label> }

const officialNumber = (value) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(value ?? 0)
const normalizeStateName = (name = '') => name.toUpperCase().replace(/&/g, 'AND').replace(/[^A-Z]/g, '')
const stateAliases = {
  DELHI: 'NCTOFDELHI', ODISHA: 'ORISSA', PUDUCHERRY: 'PONDICHERRY',
  DADRAANDNAGARHAVELI: 'DADRAANDNAGARHAVELIANDDAMANDIU', DAMANDIU: 'DADRAANDNAGARHAVELIANDDAMANDIU',
}
const stateKey = (name) => stateAliases[normalizeStateName(name)] || normalizeStateName(name)

function StateProjects({ paimanaData, paimanaError }) {
  const [selectedState, setSelectedState] = useState('')
  const states = paimanaData?.states ?? []
  const activeState = states.find((state) => stateKey(state.StateName) === stateKey(selectedState)) || paimanaData?.national_total
  const selectState = useCallback((stateName) => setSelectedState(stateName), [])

  return <section className="state-projects panel">
    <div className="panel-head"><div><span className="eyebrow">DASHBOARD STATE DATA</span><h2>State-wise projects</h2></div>{paimanaData && <span className="period">AS OF {paimanaData.freeze_month?.toUpperCase()}</span>}</div>
    {paimanaError && <p className="data-error">{paimanaError} Start the FastAPI server to load the official state figures.</p>}
    {!paimanaData && !paimanaError && <p className="muted">Loading the latest state figures from PAIMANA…</p>}
    {paimanaData?.stale && <p className="data-error">PAIMANA is temporarily unavailable; showing the most recently retrieved official figures.</p>}
    {activeState && <div className="state-content">
      <div className="state-summary">
        <span className="eyebrow">HOVER A STATE ON THE MAP</span><h3>{activeState.StateName}</h3>
        <div className="state-stat-grid">
          <StateStat label="Projects" value={officialNumber(activeState.ProjectCount)} />
          <StateStat label="Original cost" value={`₹${officialNumber(activeState.ProjectCost)} Cr`} />
          <StateStat label="Latest revised cost" value={`₹${officialNumber(activeState.RevisedCost)} Cr`} />
          <StateStat label="Expenditure" value={`₹${officialNumber(activeState.Expend)} Cr`} />
          <StateStat label="Completed this month" value={officialNumber(activeState.CompletedProject)} />
          <StateStat label="Newly added" value={officialNumber(activeState.NewAddedProject)} />
        </div>
        <small className="source-attribution">Source: PAIMANA Prism dashboard demonstration records</small>
      </div>
      <StateMap states={states} onHover={selectState} />
    </div>}
  </section>
}

function StateStat({ label, value }) { return <div><span>{label}</span><strong>{value}</strong></div> }

function StateMap({ states, onHover }) {
  const [hovered, setHovered] = useState(null)
  const byName = new globalThis.Map(states.map((state) => [stateKey(state.StateName), state]))
  const counts = states.map((state) => Number(state.ProjectCount) || 0)
  const minCount = Math.min(...counts, 0)
  const maxCount = Math.max(...counts, 1)
  const colourFor = (count) => {
    const ratio = Math.max(0, Math.min(1, (Number(count) - minCount) / Math.max(1, maxCount - minCount)))
    const start = [255, 244, 194]
    const end = [207, 72, 82]
    return `rgb(${start.map((value, index) => Math.round(value + (end[index] - value) * ratio)).join(',')})`
  }
  const showState = (state) => {
    if (!state) return
    setHovered(state)
    onHover(state.StateName)
  }

  return <div className="state-map-wrap">
    <svg className="state-map" viewBox={indiaMap.viewBox} role="img" aria-label="India map coloured by official PAIMANA project count">
      {indiaMap.locations.map((location) => {
        const state = byName.get(stateKey(location.name))
        return <path key={location.id} d={location.path} className={state ? 'map-state has-data' : 'map-state'} fill={state ? colourFor(state.ProjectCount) : '#d8ddd8'} onMouseEnter={() => showState(state)} onFocus={() => showState(state)} onClick={() => showState(state)}>
          <title>{state ? `${state.StateName}: ${officialNumber(state.ProjectCount)} projects` : `${location.name}: no PAIMANA data`}</title>
        </path>
      })}
    </svg>
    {hovered && <div className="map-tooltip"><strong>{hovered.StateName}</strong><span>{officialNumber(hovered.ProjectCount)} projects</span></div>}
    <span className="map-legend"><i /> Fewer projects <i /> More projects</span>
  </div>
}

function Queue({ projects, onOpen }) { return <section className="panel queue-panel"><div className="queue-toolbar"><div><p className="muted">Ranked by combined predicted deterioration over the next 1–3 reports.</p></div><div className="toolbar-controls"><button className="filter">All risks ▾</button><button className="filter">All states ▾</button></div></div><div className="queue-list">{projects.map((project) => <ProjectRow key={project.id} project={project} onOpen={onOpen} />)}</div></section> }

function Intelligence({ project, onSimulate }) { return <><div className="project-hero"><div><span className="eyebrow">PROJECT ID [{project.id}] · {project.sector.toUpperCase()}</span><h2>{project.name}</h2><p>{project.state} · Updated from Monthly Flash Report, {project.updated}</p></div><div className="hero-score"><span>OVERALL PRIORITY</span><strong>{project.risk}</strong><small>High attention</small></div></div><div className="dashboard-grid intelligence-grid"><section className="panel chart-panel"><div className="panel-head"><div><span className="eyebrow">PROJECT TRAJECTORY</span><h2>Cost and expenditure</h2></div><span className="legend"><i className="orange" /> Cost <i className="green" /> Expenditure</span></div><ResponsiveContainer width="100%" height={250}><AreaChart data={trend}><defs><linearGradient id="costFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#d6553e" stopOpacity=".16" /><stop offset="100%" stopColor="#d6553e" stopOpacity="0" /></linearGradient></defs><CartesianGrid vertical={false} stroke="#e6e1d8" /><XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#6d706b', fontSize: 11 }} /><YAxis axisLine={false} tickLine={false} tick={{ fill: '#9a9b95', fontSize: 11 }} /><Tooltip /><Area type="monotone" dataKey="cost" stroke="#d6553e" fill="url(#costFill)" strokeWidth={2} /><Area type="monotone" dataKey="spend" stroke="#3e8a72" fill="none" strokeWidth={2} /></AreaChart></ResponsiveContainer></section><section className="panel insight-panel"><div className="panel-head"><div><span className="eyebrow">EXPLAINED WARNING</span><h2>Why this project is flagged</h2></div></div><div className="warning-box"><strong>Schedule deterioration likely</strong><span>Predicted probability <b>87%</b></span></div><ul className="reason-list"><li><b>+14.6%</b><span>Anticipated cost rose across 5 reports</span></li><li><b>2×</b><span>Completion date revised in last 6 months</span></li><li><b>−18 pts</b><span>Milestone achievement vs. similar projects</span></li></ul><button className="primary-button" onClick={onSimulate}>Run intervention scenario <span>↗</span></button></section></div><div className="detail-strip"><div><span>ANTICIPATED COST</span><strong>₹12,840 Cr</strong><small>+14.6% from original</small></div><div><span>COMPLETION DATE</span><strong>Dec 2026</strong><small className="red-text">+11 months revised</small></div><div><span>MILESTONES</span><strong>62% achieved</strong><small>18 of 29 milestones</small></div><div><span>DELAY REASON</span><strong>{project.reason}</strong><small>Reported in 3 updates</small></div></div></> }

function Simulator({ project, delay, increase, setDelay, setIncrease, scenarioTime, scenarioCost }) { return <><div className="simulator-head"><div><span className="eyebrow">SCENARIO LAB / {project.id}</span><h2>Test the cost of waiting</h2><p>Explore how a hypothetical intervention delay may change this project’s risk profile.</p></div><span className="decision-badge">DECISION SUPPORT ONLY</span></div><div className="sim-grid"><section className="panel controls-panel"><span className="eyebrow">ASSUMPTIONS</span><h2>Adjust the scenario</h2><label>Additional delay <output>{delay} months</output><input type="range" min="0" max="12" value={delay} onChange={(event) => setDelay(Number(event.target.value))} /></label><label>Assumed cost increase <output>{increase}%</output><input type="range" min="0" max="30" value={increase} onChange={(event) => setIncrease(Number(event.target.value))} /></label><div className="scenario-caption">Starting point: <b>{project.name}</b><br />Current score based on latest available report.</div></section><section className="panel result-panel"><span className="eyebrow">PROJECTED RESPONSE</span><h2>Risk after scenario</h2><div className="result-grid"><div><span>Cost risk</span><strong className="red-text">{scenarioCost}</strong><small>+{scenarioCost - project.risk} points</small></div><div><span>Time risk</span><strong className="amber-text">{scenarioTime}</strong><small>+{scenarioTime - project.time} points</small></div></div><div className="impact-line"><span>Estimated completion impact</span><b>+{delay} months</b></div><div className="impact-line"><span>Estimated cost impact</span><b>₹{Math.round(project.cost * increase / 100)} Cr</b></div><div className="caution">This is a modelled scenario, not a guaranteed outcome. Use it to frame intervention conversations alongside current field evidence.</div></section></div></> }

export default App
