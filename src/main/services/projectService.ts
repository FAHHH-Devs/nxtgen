import fs from 'fs'
import path from 'path'
import { spawn, execSync } from 'child_process'
import net from 'net'

export interface ProjectReport {
  framework: string
  database: string
  cache: string
  services: string[]
  configFound: boolean
}

const getDockerCommand = () => {
  try {
    execSync('docker compose version', { stdio: 'ignore' })
    return ['docker', 'compose']
  } catch {
    return ['docker-compose']
  }
}

export const analyzeProject = (projectPath: string): ProjectReport => {
  const report: ProjectReport = {
    framework: 'Unknown',
    database: 'None detected',
    cache: 'None detected',
    services: [],
    configFound: false
  }

  if (fs.existsSync(path.join(projectPath, 'devup.config.json'))) {
    report.configFound = true
  }

  // Node.js detection
  const packagePath = path.join(projectPath, 'package.json')
  if (fs.existsSync(packagePath)) {
    report.framework = 'Node.js'
    try {
      const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'))
      const deps = { ...pkg.dependencies, ...pkg.devDependencies }
      const depKeys = Object.keys(deps)
      
      if (depKeys.some(d => ['pg', 'sequelize', 'prisma', 'knex', 'typeorm'].includes(d)) || depKeys.some(d => d.includes('postgres'))) {
        report.database = 'Postgres'
        if (!report.services.includes('postgres')) report.services.push('postgres')
      } else if (depKeys.some(d => ['mysql', 'mysql2'].includes(d))) {
        report.database = 'MySQL'
        if (!report.services.includes('mysql')) report.services.push('mysql')
      }
      
      if (depKeys.some(d => ['mongoose', 'mongodb'].includes(d))) {
        report.database = 'MongoDB'
        if (!report.services.includes('mongodb')) report.services.push('mongodb')
      }
      if (depKeys.some(d => ['redis', 'ioredis'].includes(d))) {
        report.cache = 'Redis'
        if (!report.services.includes('redis')) report.services.push('redis')
      }
    } catch (e) {
      console.error('Error parsing package.json:', e)
    }
  }

  // Python detection
  const reqPath = path.join(projectPath, 'requirements.txt')
  const pyProjPath = path.join(projectPath, 'pyproject.toml')
  if (fs.existsSync(reqPath) || fs.existsSync(pyProjPath)) {
    report.framework = 'Python'
    let content = ''
    if (fs.existsSync(reqPath)) content += fs.readFileSync(reqPath, 'utf8')
    if (fs.existsSync(pyProjPath)) content += fs.readFileSync(pyProjPath, 'utf8')

    if (content.includes('psycopg2') || content.includes('sqlalchemy') || content.includes('databases[postgresql]')) {
      report.database = 'Postgres'
      if (!report.services.includes('postgres')) report.services.push('postgres')
    }
    if (content.includes('pymongo') || content.includes('mongoengine')) {
      report.database = 'MongoDB'
      if (!report.services.includes('mongodb')) report.services.push('mongodb')
    }
    if (content.includes('redis')) {
      report.cache = 'Redis'
      if (!report.services.includes('redis')) report.services.push('redis')
    }
  }

  // Java detection
  const pomPath = path.join(projectPath, 'pom.xml')
  const gradlePath = path.join(projectPath, 'build.gradle')
  if (fs.existsSync(pomPath) || fs.existsSync(gradlePath)) {
    report.framework = 'Java'
    let content = ''
    if (fs.existsSync(pomPath)) content += fs.readFileSync(pomPath, 'utf8')
    if (fs.existsSync(gradlePath)) content += fs.readFileSync(gradlePath, 'utf8')

    if (content.includes('postgresql')) {
      report.database = 'Postgres'
      if (!report.services.includes('postgres')) report.services.push('postgres')
    }
    if (content.includes('mongodb')) {
      report.database = 'MongoDB'
      if (!report.services.includes('mongodb')) report.services.push('mongodb')
    }
    if (content.includes('redis')) {
      report.cache = 'Redis'
      if (!report.services.includes('redis')) report.services.push('redis')
    }
  }

  return report
}

export const generateConfig = (projectPath: string, report: ProjectReport) => {
  const configPath = path.join(projectPath, 'devup.config.json')
  const config = {
    projectType: report.framework,
    services: report.services,
    env: {
      DATABASE_URL: report.services.includes('postgres') ? 'postgresql://devuser:devpassword@localhost:5432/devdb' : '',
      REDIS_URL: report.services.includes('redis') ? 'redis://localhost:6379' : '',
      MONGODB_URI: report.services.includes('mongodb') ? 'mongodb://localhost:27017/devdb' : ''
    }
  }
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2))

  // Update/Merge .env
  const envPath = path.join(projectPath, '.env')
  let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8').trim() : ''
  
  Object.entries(config.env).forEach(([key, value]) => {
    if (value && !envContent.includes(`${key}=`)) {
      envContent += (envContent ? '\n' : '') + `${key}=${value}`
    }
  })
  if (envContent) {
    fs.writeFileSync(envPath, envContent + '\n')
  }

  // Ensure .devup folder exists
  const devupDir = path.join(projectPath, '.devup')
  if (!fs.existsSync(devupDir)) {
    fs.mkdirSync(devupDir)
  }

  // Generate docker-compose.yml
  const composePath = path.join(devupDir, 'docker-compose.yml')
  let composeContent = 'version: "3.8"\nservices:\n'

  if (report.services.includes('postgres')) {
    composeContent += `
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: devuser
      POSTGRES_PASSWORD: devpassword
      POSTGRES_DB: devdb
    ports:
      - "5432:5432"
`
  }
  
  if (report.services.includes('mongodb')) {
    composeContent += `
  mongodb:
    image: mongo:latest
    ports:
      - "27017:27017"
`
  }

  if (report.services.includes('redis')) {
    composeContent += `
  redis:
    image: redis:alpine
    ports:
      - "6379:6379"
`
  }

  if (report.services.includes('mysql')) {
    composeContent += `
  mysql:
    image: mysql:8
    environment:
      MYSQL_ROOT_PASSWORD: rootpassword
      MYSQL_DATABASE: devdb
      MYSQL_USER: devuser
      MYSQL_PASSWORD: devpassword
    ports:
      - "3306:3306"
`
  }

  fs.writeFileSync(composePath, composeContent)
}

export const runDockerCompose = (projectPath: string) => {
  const devupDir = path.join(projectPath, '.devup')
  const dockerCmd = getDockerCommand()
  const args = [...dockerCmd.slice(1), 'up', '-d']
  const child = spawn(dockerCmd[0], args, {
    cwd: devupDir,
    shell: true
  })
  return child
}

export const checkPort = (port: number, host: string = '127.0.0.1'): Promise<boolean> => {
  return new Promise((resolve) => {
    const socket = new net.Socket()
    const onError = () => {
      socket.destroy()
      resolve(false)
    }
    socket.setTimeout(1000)
    socket.once('error', onError)
    socket.once('timeout', onError)
    socket.connect(port, host, () => {
      socket.end()
      resolve(true)
    })
  })
}

export const checkHealth = async (services: string[]) => {
  const results: Record<string, boolean> = {}
  const servicePorts: Record<string, number> = {
    postgres: 5432,
    mongodb: 27017,
    redis: 6379,
    mysql: 3306
  }

  for (const service of services) {
    if (servicePorts[service]) {
      results[service] = await checkPort(servicePorts[service])
    }
  }
  return results
}
