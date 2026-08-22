import { useState } from 'react'
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

function RiskPill({ score }) {
  return <span className={`risk-pill ${score >= 75 ? 'critical' : score >= 55 ? 'watch' : 'stable'}`}>{score}</span>
}

function App() {
  const [view, setView] = useState('overview')
  const [selected, setSelected] = useState(projects[0])
  const [delay, setDelay] = useState(3)
  const [increase, setIncrease] = useState(10)

  const openProject = (project) => { setSelected(project); setView('intelligence') }
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
        </nav>
        <div className="sidebar-foot"><span>MODEL STATUS</span><strong>Baseline + RF ready</strong><small>Last scored 23 Aug 2026</small></div>
      </aside>

      <main className="content">
        <header className="topbar"><div><span className="eyebrow">MINISTRY MONITORING / MONTHLY FLASH REPORTS</span><h1>{view === 'overview' ? 'Portfolio overview' : view === 'queue' ? 'Early-warning queue' : view === 'simulator' ? 'Decision-support simulator' : 'Project intelligence'}</h1></div><div className="header-meta"><span>Last report <strong>Mar 2025</strong></span><button className="export">↓ Export brief</button></div></header>

        {view === 'overview' && <Overview onOpen={openProject} />}
        {view === 'queue' && <Queue onOpen={openProject} />}
        {view === 'intelligence' && <Intelligence project={selected} onSimulate={() => setView('simulator')} />}
        {view === 'simulator' && <Simulator project={selected} delay={delay} increase={increase} setDelay={setDelay} setIncrease={setIncrease} scenarioTime={scenarioTime} scenarioCost={scenarioCost} />}
      </main>
    </div>
  )
}

function Overview({ onOpen }) {
  return <>
    <div className="hero-line"><div><p className="muted">A forward-looking view of infrastructure delivery health.</p><div className="data-badge">● SYNTHETIC DEMO RECORDS · REPLACE WITH VERIFIED PAIMANA EXTRACTS</div></div><span className="period">APR 2024 — MAR 2025 <i>12 months</i></span></div>
    <section className="metric-grid"><Metric label="Monitored projects" value="184" detail="+12 this period" /><Metric label="High cost risk" value="18" detail="9.8% of portfolio" tone="red" /><Metric label="High time risk" value="27" detail="14.7% of portfolio" tone="amber" /><Metric label="Priority attention" value="12" detail="6 need action today" tone="ink" /></section>
    <div className="dashboard-grid"><section className="panel chart-panel"><div className="panel-head"><div><span className="eyebrow">EXPOSURE BY SECTOR</span><h2>Risk concentration</h2></div><span className="legend"><i /> Avg. risk score</span></div><ResponsiveContainer width="100%" height={240}><BarChart data={sectorData} margin={{ top: 20, right: 10, left: -25, bottom: 0 }}><CartesianGrid vertical={false} stroke="#e6e1d8" /><XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#6d706b', fontSize: 12 }} /><YAxis axisLine={false} tickLine={false} tick={{ fill: '#9a9b95', fontSize: 11 }} /><Tooltip cursor={{ fill: '#f4f0e8' }} /><Bar dataKey="risk" fill="#d6553e" radius={[3, 3, 0, 0]} barSize={38} /></BarChart></ResponsiveContainer></section><section className="panel attention-panel"><div className="panel-head"><div><span className="eyebrow">ACTION REQUIRED</span><h2>Priority projects</h2></div><button className="text-button" onClick={() => onOpen(projects[0])}>View queue →</button></div>{projects.slice(0, 3).map((project) => <ProjectRow key={project.id} project={project} onOpen={onOpen} />)}</section></div>
    <section className="panel table-panel"><div className="panel-head"><div><span className="eyebrow">PORTFOLIO PULSE</span><h2>Latest project signals</h2></div><button className="filter">All sectors ▾</button></div><div className="table-wrap"><table><thead><tr><th>Project</th><th>Sector</th><th>State</th><th>Cost risk</th><th>Time risk</th><th>Status</th></tr></thead><tbody>{projects.map((project) => <tr key={project.id} onClick={() => onOpen(project)}><td><strong>{project.name}</strong><small>[{project.id}]</small></td><td>{project.sector}</td><td>{project.state}</td><td><RiskPill score={project.risk} /></td><td><RiskPill score={project.time} /></td><td><span className="status">{project.status}</span></td></tr>)}</tbody></table></div></section>
  </>
}

function Metric({ label, value, detail, tone = '' }) { return <div className={`metric ${tone}`}><span>{label}</span><strong>{value}</strong><small>{detail}</small></div> }
function ProjectRow({ project, onOpen }) { return <button className="project-row" onClick={() => onOpen(project)}><span className="priority-dot" /><span><strong>{project.name}</strong><small>{project.id} · {project.reason}</small></span><RiskPill score={project.risk} /><span className="chevron">→</span></button> }

function Queue({ onOpen }) { return <section className="panel queue-panel"><div className="queue-toolbar"><div><p className="muted">Ranked by combined predicted deterioration over the next 1–3 reports.</p></div><div className="toolbar-controls"><button className="filter">All risks ▾</button><button className="filter">All states ▾</button></div></div><div className="queue-list">{projects.concat(projects).map((project, index) => <ProjectRow key={`${project.id}-${index}`} project={project} onOpen={onOpen} />)}</div></section> }

function Intelligence({ project, onSimulate }) { return <><div className="project-hero"><div><span className="eyebrow">PROJECT ID [{project.id}] · {project.sector.toUpperCase()}</span><h2>{project.name}</h2><p>{project.state} · Updated from Monthly Flash Report, {project.updated}</p></div><div className="hero-score"><span>OVERALL PRIORITY</span><strong>{project.risk}</strong><small>High attention</small></div></div><div className="dashboard-grid intelligence-grid"><section className="panel chart-panel"><div className="panel-head"><div><span className="eyebrow">PROJECT TRAJECTORY</span><h2>Cost and expenditure</h2></div><span className="legend"><i className="orange" /> Cost <i className="green" /> Expenditure</span></div><ResponsiveContainer width="100%" height={250}><AreaChart data={trend}><defs><linearGradient id="costFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#d6553e" stopOpacity=".16" /><stop offset="100%" stopColor="#d6553e" stopOpacity="0" /></linearGradient></defs><CartesianGrid vertical={false} stroke="#e6e1d8" /><XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#6d706b', fontSize: 11 }} /><YAxis axisLine={false} tickLine={false} tick={{ fill: '#9a9b95', fontSize: 11 }} /><Tooltip /><Area type="monotone" dataKey="cost" stroke="#d6553e" fill="url(#costFill)" strokeWidth={2} /><Area type="monotone" dataKey="spend" stroke="#3e8a72" fill="none" strokeWidth={2} /></AreaChart></ResponsiveContainer></section><section className="panel insight-panel"><div className="panel-head"><div><span className="eyebrow">EXPLAINED WARNING</span><h2>Why this project is flagged</h2></div></div><div className="warning-box"><strong>Schedule deterioration likely</strong><span>Predicted probability <b>87%</b></span></div><ul className="reason-list"><li><b>+14.6%</b><span>Anticipated cost rose across 5 reports</span></li><li><b>2×</b><span>Completion date revised in last 6 months</span></li><li><b>−18 pts</b><span>Milestone achievement vs. similar projects</span></li></ul><button className="primary-button" onClick={onSimulate}>Run intervention scenario <span>↗</span></button></section></div><div className="detail-strip"><div><span>ANTICIPATED COST</span><strong>₹12,840 Cr</strong><small>+14.6% from original</small></div><div><span>COMPLETION DATE</span><strong>Dec 2026</strong><small className="red-text">+11 months revised</small></div><div><span>MILESTONES</span><strong>62% achieved</strong><small>18 of 29 milestones</small></div><div><span>DELAY REASON</span><strong>{project.reason}</strong><small>Reported in 3 updates</small></div></div></> }

function Simulator({ project, delay, increase, setDelay, setIncrease, scenarioTime, scenarioCost }) { return <><div className="simulator-head"><div><span className="eyebrow">SCENARIO LAB / {project.id}</span><h2>Test the cost of waiting</h2><p>Explore how a hypothetical intervention delay may change this project’s risk profile.</p></div><span className="decision-badge">DECISION SUPPORT ONLY</span></div><div className="sim-grid"><section className="panel controls-panel"><span className="eyebrow">ASSUMPTIONS</span><h2>Adjust the scenario</h2><label>Additional delay <output>{delay} months</output><input type="range" min="0" max="12" value={delay} onChange={(event) => setDelay(Number(event.target.value))} /></label><label>Assumed cost increase <output>{increase}%</output><input type="range" min="0" max="30" value={increase} onChange={(event) => setIncrease(Number(event.target.value))} /></label><div className="scenario-caption">Starting point: <b>{project.name}</b><br />Current score based on latest available report.</div></section><section className="panel result-panel"><span className="eyebrow">PROJECTED RESPONSE</span><h2>Risk after scenario</h2><div className="result-grid"><div><span>Cost risk</span><strong className="red-text">{scenarioCost}</strong><small>+{scenarioCost - project.risk} points</small></div><div><span>Time risk</span><strong className="amber-text">{scenarioTime}</strong><small>+{scenarioTime - project.time} points</small></div></div><div className="impact-line"><span>Estimated completion impact</span><b>+{delay} months</b></div><div className="impact-line"><span>Estimated cost impact</span><b>₹{Math.round(project.cost * increase / 100)} Cr</b></div><div className="caution">This is a modelled scenario, not a guaranteed outcome. Use it to frame intervention conversations alongside current field evidence.</div></section></div></> }

export default App
