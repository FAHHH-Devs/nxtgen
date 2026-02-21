interface ProjectReport {
  framework: string
  database: string
  cache: string
  services: string[]
  configFound: boolean
  port?: number
  startCommand?: string
  nodeVersion?: string
}

interface VersionsProps {
  report: ProjectReport | null
}

function Versions({ report }: VersionsProps): React.JSX.Element {
  if (!report) {
    return (
      <ul className="versions">
        <li>Environment: Ready</li>
        <li>Mode: Development</li>
      </ul>
    )
  }

  return (
    <ul className="versions">
      <li>Stack: {report.framework}</li>
      {report.nodeVersion && <li>Node: v{report.nodeVersion}</li>}
      <li>DB: {report.database}</li>
      {report.cache !== 'None detected' && <li>Cache: {report.cache}</li>}
    </ul>
  )
}

export default Versions
