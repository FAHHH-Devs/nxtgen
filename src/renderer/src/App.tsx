import { useState, useEffect, useRef } from 'react'
import Versions from './components/Versions'

interface ProjectReport {
  framework: string
  database: string
  cache: string
  services: string[]
  configFound: boolean
  port: number
}

const App = () => {
  const [projectPath, setProjectPath] = useState<string | null>(null)
  const [report, setReport] = useState<ProjectReport | null>(null)
  const [logs, setLogs] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [health, setHealth] = useState<Record<string, boolean>>({})
  const [setupStep, setSetupStep] = useState(0) // 0: Select, 1: Analyze, 2: Setup/Start
  const [repoUrl, setRepoUrl] = useState('')
  const logEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const unregister = window.electronAPI.onDockerLog((log: string) => {
      setLogs((prev) => [...prev, log])
    })
    return unregister
  }, [])

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  const handleClone = async () => {
    if (!repoUrl) return
    const path = await window.electronAPI.selectFolder()
    if (path) {
      setLoading(true)
      setLogs(['Starting repository clone...', `URL: ${repoUrl}`, `Location: ${path}`])
      const cloneResult = await window.electronAPI.cloneRepo(repoUrl, path)
      
      if (cloneResult.success) {
        setLogs((prev) => [...prev, 'Clone successful. Starting analysis...'])
        setProjectPath(path)
        const analysisReport = await window.electronAPI.analyzeProject(path)
        setReport(analysisReport)
        setSetupStep(1)
      } else {
        setLogs((prev) => [...prev, `CLONE ERROR: ${cloneResult.error}`])
      }
      setLoading(false)
    }
  }

  const handleOpenEditor = async () => {
    if (projectPath) {
      await window.electronAPI.openEditor(projectPath)
    }
  }

  const handleSetup = async () => {
    if (!projectPath || !report) return
    setLoading(true)
    setSetupStep(2)
    setLogs((prev) => [...prev, 'Generating devup.config.json...'])
    await window.electronAPI.generateConfig(projectPath, report)
    setLogs((prev) => [...prev, 'Configuration generated. Merging environment variables...'])
    setLogs((prev) => [...prev, 'Starting infrastructure via Docker Compose...'])
    
    const result = await window.electronAPI.runDocker(projectPath)
    if (result.success) {
      setLogs((prev) => [...prev, 'Docker processes initiated.'])
    } else {
      setLogs((prev) => [...prev, `ERROR: ${result.error}`])
    }
    
    setLoading(false)
    
    // Start health checks after a delay
    setTimeout(performHealthCheck, 5000)
    const interval = setInterval(performHealthCheck, 10000)
    return () => clearInterval(interval)
  }

  const performHealthCheck = async () => {
    if (!report) return
    const servicesToCheck = ['app', ...(report.services || [])]
    const status = await window.electronAPI.checkHealth(servicesToCheck, report.port)
    setHealth(status)
  }

  const reset = () => {
    setProjectPath(null)
    setReport(null)
    setLogs([])
    setSetupStep(0)
    setHealth({})
    setRepoUrl('')
  }

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div style={styles.logoContainer}>
          <div style={styles.logo}>D</div>
          <h1 style={styles.title}>DOC-PILOT Accelerator</h1>
        </div>
        {projectPath && (
          <button onClick={reset} style={styles.resetBtn}>New Project</button>
        )}
      </header>

      <main style={styles.main}>
        {setupStep === 0 && (
          <div style={styles.hero}>
            <h2 style={styles.heroTitle}>Streamline your development environment.</h2>
            <p style={styles.heroSub}>Paste your Git repo URL and choose a location to auto-detect dependencies and spin up infrastructure.</p>
            <div style={styles.inputGroup}>
              <input 
                type="text" 
                placeholder="https://github.com/user/repo.git" 
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                style={styles.textInput}
              />
              <button 
                onClick={handleClone} 
                disabled={loading || !repoUrl}
                style={{...styles.primaryBtn, padding: '15px 40px', fontSize: '18px'}}
              >
                {loading ? 'Processing...' : 'Clone & Setup'}
              </button>
            </div>
          </div>
        )}

        {setupStep >= 1 && (
          <div style={styles.dashboard}>
            <div style={styles.column}>
              <section style={styles.card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h3 style={{...styles.cardTitle, margin: 0}}>Project Blueprint</h3>
                  <button onClick={handleOpenEditor} style={styles.editorBtn}>Open in Code Editor</button>
                </div>
                <div style={styles.infoGrid}>
                  <div style={styles.infoItem}>
                    <span style={styles.infoLabel}>Path</span>
                    <code style={styles.infoValue}>{projectPath}</code>
                  </div>
                  <div style={styles.infoItem}>
                    <span style={styles.infoLabel}>Framework</span>
                    <span style={styles.infoValue}>{report?.framework || 'Detecting...'}</span>
                  </div>
                  <div style={styles.infoItem}>
                    <span style={styles.infoLabel}>Database</span>
                    <span style={styles.infoValue}>{report?.database || 'None'}</span>
                  </div>
                  <div style={styles.infoItem}>
                    <span style={styles.infoLabel}>Cache</span>
                    <span style={styles.infoValue}>{report?.cache || 'None'}</span>
                  </div>
                </div>

                {setupStep === 1 && (
                  <button 
                    onClick={handleSetup} 
                    disabled={loading}
                    style={{...styles.primaryBtn, marginTop: '20px', width: '100%'}}
                  >
                    Setup & Start Services
                  </button>
                )}
              </section>

              {report && (
                <section style={styles.card}>
                  <h3 style={styles.cardTitle}>Infrastructure Health</h3>
                  <div style={styles.serviceList}>
                    {['app', ...report.services].map((service) => (
                      <div key={service} style={styles.serviceItem}>
                        <div style={{ 
                          ...styles.statusDot, 
                          backgroundColor: health[service] ? '#4caf50' : '#f44336',
                          boxShadow: health[service] ? '0 0 8px #4caf50' : '0 0 8px #f44336'
                        }} />
                        <span style={styles.serviceName}>{service === 'app' ? 'Project' : service}</span>
                        <span style={styles.statusText}>
                          {health[service] ? 'Online' : 'Starting...'}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>

            <div style={styles.column}>
              <section style={{...styles.card, flex: 1, display: 'flex', flexDirection: 'column'}}>
                <h3 style={styles.cardTitle}>Execution Logs</h3>
                <div style={styles.logContainer}>
                  {logs.length === 0 && <div style={styles.logPlaceholder}>Waiting for action...</div>}
                  {logs.map((log, i) => (
                    <div key={i} style={styles.logLine}>
                      <span style={styles.logTimestamp}>{new Date().toLocaleTimeString()}</span>
                      <span style={styles.logContent}>{log}</span>
                    </div>
                  ))}
                  <div ref={logEndRef} />
                </div>
              </section>
            </div>
          </div>
        )}
      </main>
      <footer style={styles.footer}>
        <Versions report={report} />
      </footer>
    </div>
  )
}

const styles: Record<string, any> = {
  container: {
    height: '100vh',
    backgroundColor: '#0f172a',
    color: '#e2e8f0',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  header: {
    padding: '16px 24px',
    backgroundColor: '#1e293b',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: '1px solid #334155',
  },
  logoContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  logo: {
    width: '32px',
    height: '32px',
    backgroundColor: '#3b82f6',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 'bold',
    fontSize: '20px',
  },
  title: {
    fontSize: '20px',
    margin: 0,
    fontWeight: 600,
  },
  resetBtn: {
    padding: '6px 12px',
    backgroundColor: 'transparent',
    border: '1px solid #475569',
    color: '#94a3b8',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '12px',
  },
  main: {
    flex: 1,
    padding: '32px',
    overflowY: 'auto',
  },
  hero: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    textAlign: 'center',
    maxWidth: '600px',
    margin: '0 auto',
  },
  heroTitle: {
    fontSize: '32px',
    marginBottom: '16px',
    color: '#f8fafc',
  },
  heroSub: {
    fontSize: '18px',
    color: '#94a3b8',
    marginBottom: '32px',
  },
  primaryBtn: {
    backgroundColor: '#3b82f6',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    width: '100%',
    maxWidth: '500px',
  },
  textInput: {
    padding: '12px 16px',
    backgroundColor: '#1e293b',
    border: '1px solid #334155',
    borderRadius: '8px',
    color: '#f8fafc',
    fontSize: '14px',
    width: '100%',
    outline: 'none',
  },
  editorBtn: {
    padding: '6px 12px',
    backgroundColor: '#475569',
    color: '#f1f5f9',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 500,
  },
  dashboard: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '24px',
    height: '100%',
  },
  column: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
  },
  card: {
    backgroundColor: '#1e293b',
    borderRadius: '12px',
    padding: '24px',
    border: '1px solid #334155',
  },
  cardTitle: {
    fontSize: '16px',
    fontWeight: 600,
    margin: '0 0 16px 0',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  infoGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  infoItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  infoLabel: {
    fontSize: '12px',
    color: '#64748b',
  },
  infoValue: {
    fontSize: '14px',
    color: '#f1f5f9',
    wordBreak: 'break-all',
  },
  serviceList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  serviceItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px',
    backgroundColor: '#0f172a',
    borderRadius: '8px',
  },
  statusDot: {
    width: '10px',
    height: '10px',
    borderRadius: '50%',
  },
  serviceName: {
    flex: 1,
    fontWeight: 500,
    textTransform: 'capitalize',
  },
  statusText: {
    fontSize: '12px',
    color: '#64748b',
  },
  logContainer: {
    flex: 1,
    backgroundColor: '#000',
    borderRadius: '8px',
    padding: '12px',
    fontFamily: 'ui-monospace, monospace',
    fontSize: '12px',
    color: '#4ade80',
    overflowY: 'auto',
    maxHeight: '400px',
  },
  logLine: {
    display: 'flex',
    gap: '12px',
    marginBottom: '4px',
  },
  logTimestamp: {
    color: '#64748b',
    flexShrink: 0,
  },
  logContent: {
    wordBreak: 'break-all',
  },
  logPlaceholder: {
    color: '#334155',
    textAlign: 'center',
    marginTop: '20px',
  },
  footer: {
    padding: '8px 24px',
    backgroundColor: '#0f172a',
    borderTop: '1px solid #1e293b',
    display: 'flex',
    justifyContent: 'center',
  }
}

export default App
