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
  port?: number
  startCommand?: string
  nodeVersion?: string
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
    configFound: false,
    port: 3000,
    startCommand: '',
    nodeVersion: '20' 
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
      
      if (pkg.engines?.node) {
        const versionMatch = pkg.engines.node.match(/\d+/)
        if (versionMatch) report.nodeVersion = versionMatch[0]
      }

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

      if (pkg.scripts?.start) {
        report.startCommand = 'npm start'
      } else if (pkg.main) {
        report.startCommand = `node ${pkg.main}`
      } else {
        report.startCommand = 'node index.js'
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

    if (content.includes('psycopg2')) {
      report.database = 'Postgres'
      if (!report.services.includes('postgres')) report.services.push('postgres')
    } else if (content.includes('pymysql') || content.includes('mysql-connector')) {
      report.database = 'MySQL'
      if (!report.services.includes('mysql')) report.services.push('mysql')
    } else if (content.includes('sqlalchemy')) {
      if (content.includes('postgres')) {
        report.database = 'Postgres'
        if (!report.services.includes('postgres')) report.services.push('postgres')
      } else {
        report.database = 'MySQL'
        if (!report.services.includes('mysql')) report.services.push('mysql')
      }
    }

    if (content.includes('pymongo') || content.includes('mongoengine')) {
      report.database = 'MongoDB'
      if (!report.services.includes('mongodb')) report.services.push('mongodb')
    }
    if (content.includes('redis')) {
      report.cache = 'Redis'
      if (!report.services.includes('redis')) report.services.push('redis')
    }

    const possibleEntries = ['main.py', 'app.py', 'run.py', 'index.py']
    const entry = possibleEntries.find(e => fs.existsSync(path.join(projectPath, e))) || 'app.py'
    
    if (content.includes('fastapi')) {
      report.framework = 'FastAPI'
      report.startCommand = `uvicorn ${entry.replace('.py', '')}:app --host 0.0.0.0 --port 8000`
      report.port = 8000
    } else if (content.includes('flask')) {
      report.framework = 'Flask'
      report.startCommand = `python ${entry}`
      report.port = 5000
    } else {
      report.startCommand = `python ${entry}`
      report.port = 5000
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
    report.startCommand = './mvnw spring-boot:run'
    report.port = 8080
  }

  return report
}

export const generateConfig = (projectPath: string, report: ProjectReport) => {
  const devupDir = path.join(projectPath, '.devup')
  if (!fs.existsSync(devupDir)) fs.mkdirSync(devupDir)

  const configPath = path.join(projectPath, 'devup.config.json')
  const config = {
    projectType: report.framework,
    services: report.services,
    env: {
      DATABASE_URL: report.services.includes('postgres') ? 'postgresql://devuser:devpassword@postgres:5432/devdb' : '',
      DB_HOST: report.services.includes('mysql') ? 'mysql' : (report.services.includes('postgres') ? 'postgres' : ''),
      DB_USER: 'devuser',
      DB_PASSWORD: 'devpassword',
      DB_PASS: 'devpassword',
      DB_NAME: report.services.includes('mysql') ? 'todos_db' : 'devdb',
      REDIS_URL: report.services.includes('redis') ? 'redis://redis:6379' : '',
      MONGODB_URI: report.services.includes('mongodb') ? 'mongodb://mongodb:27017/devdb' : ''
    }
  }
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2))

  const envPath = path.join(projectPath, '.env')
  let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8').trim() : ''
  Object.entries(config.env).forEach(([key, value]) => {
    const regex = new RegExp(`^${key}=.*`, 'm');
    if (envContent.match(regex)) {
      if (key === 'DB_HOST' || key === 'DB_PASS' || key === 'DB_USER' || key === 'DB_NAME' || key === 'DB_PASSWORD') {
        envContent = envContent.replace(regex, `${key}=${value}`);
      }
    } else {
      envContent += (envContent ? '\n' : '') + `${key}=${value}`;
    }
  });
  if (envContent) fs.writeFileSync(envPath, envContent + '\n')

  // Generate Python Shim
  if (report.framework === 'Python' || report.framework === 'FastAPI' || report.framework === 'Flask') {
    const pythonShim = `
import socket
import os

_original_getaddrinfo = socket.getaddrinfo

def patched_getaddrinfo(host, port, *args, **kwargs):
    if host in ['localhost', '127.0.0.1', 'db', 'database']:
        if port == 3306: host = 'mysql'
        elif port == 5432: host = 'postgres'
        elif port == 27017: host = 'mongodb'
        elif port == 6379: host = 'redis'
    return _original_getaddrinfo(host, port, *args, **kwargs)

socket.getaddrinfo = patched_getaddrinfo
`;
    fs.writeFileSync(path.join(devupDir, 'shim.py'), pythonShim);
  }

  if (report.framework === 'Node.js') {
    const shim = `
const Module = require('module');
const originalRequire = Module.prototype.require;
const patchConfig = (config) => {
  if (typeof config !== 'object' || config === null) return config;
  if (config.host === 'localhost' || config.host === '127.0.0.1' || !config.host) config.host = 'mysql';
  if (config.user === 'root') { config.user = 'devuser'; config.password = 'devpassword'; }
  return config;
};
Module.prototype.require = function(id) {
  const exports = originalRequire.apply(this, arguments);
  if (id === 'mysql' || id === 'mysql2') {
    const originalCreateConnection = exports.createConnection;
    if (typeof originalCreateConnection === 'function') exports.createConnection = function(config) { return originalCreateConnection.call(this, patchConfig(config)); };
    const originalCreatePool = exports.createPool;
    if (typeof originalCreatePool === 'function') exports.createPool = function(config) { return originalCreatePool.call(this, patchConfig(config)); };
  }
  return exports;
};
`;
    fs.writeFileSync(path.join(devupDir, 'shim.js'), shim);
  }

  const dockerfilePath = path.join(devupDir, 'Dockerfile')
  let dockerfileContent = ''

  if (report.framework === 'Node.js') {
    const startCmd = report.startCommand.replace('npm start', 'server.js').replace('node ', '');
    dockerfileContent = `FROM node:${report.nodeVersion}-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
COPY .devup/shim.js /shim.js
EXPOSE ${report.port}
ENV NODE_OPTIONS="-r /shim.js"
CMD ["node", "${startCmd}"]
`
  } else if (report.framework === 'Python' || report.framework === 'FastAPI' || report.framework === 'Flask') {
    dockerfileContent = `FROM python:3.9-slim
WORKDIR /app
COPY requirements.txt* .
RUN if [ -f requirements.txt ]; then pip install --no-cache-dir -r requirements.txt; fi
COPY . .
COPY .devup/shim.py /app/sitecustomize.py
EXPOSE ${report.port}
ENV PYTHONPATH=/app:$PYTHONPATH
CMD ${JSON.stringify(report.startCommand.split(' '))}
`
  } else if (report.framework === 'Java') {
    dockerfileContent = `FROM maven:3.8-openjdk-17-slim
WORKDIR /app
COPY pom.xml .
RUN mvn dependency:go-offline
COPY . .
EXPOSE ${report.port}
CMD ["mvn", "spring-boot:run"]
`
  }
  if (dockerfileContent) fs.writeFileSync(dockerfilePath, dockerfileContent)

  fs.writeFileSync(path.join(projectPath, '.dockerignore'), 'node_modules\n.git\n')

  const sqlFiles = fs.readdirSync(projectPath)
    .filter(file => file.endsWith('.sql') || file.toLowerCase() === 'schema.sql')
    .map(file => `      - ../${file}:/docker-entrypoint-initdb.d/${file}`)

  const composePath = path.join(devupDir, 'docker-compose.yml')
  let composeContent = `version: "3.8"
services:
  app:
    build:
      context: ..
      dockerfile: .devup/Dockerfile
    ports:
      - "${report.port}:${report.port}"
    volumes:
      - ..:/app
      - /app/node_modules
    env_file:
      - ../.env
${report.services.length > 0 ? `    depends_on:
${report.services.map(s => `      ${s}:
        condition: service_healthy`).join('\n')}` : ''}
`

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
    networks:
      default:
        aliases:
          - db
          - database
    volumes:
${sqlFiles.length > 0 ? sqlFiles.join('\n') : '      - ./.devup:/tmp/devup_empty:ro'}
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U devuser -d devdb"]
      interval: 5s
      timeout: 5s
      retries: 5
`
  }
  
  if (report.services.includes('mongodb')) {
    composeContent += `
  mongodb:
    image: mongo:latest
    ports:
      - "27017:27017"
    healthcheck:
      test: ["CMD", "mongosh", "--eval", "db.adminCommand('ping')"]
      interval: 5s
      timeout: 5s
      retries: 5
`
  }

  if (report.services.includes('redis')) {
    composeContent += `
  redis:
    image: redis:alpine
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 5
`
  }

  if (report.services.includes('mysql')) {
    composeContent += `
  mysql:
    image: mysql:8.0
    command: --default-authentication-plugin=mysql_native_password
    environment:
      MYSQL_ROOT_PASSWORD: rootpassword
      MYSQL_DATABASE: todos_db
      MYSQL_USER: devuser
      MYSQL_PASSWORD: devpassword
    ports:
      - "3306:3306"
    networks:
      default:
        aliases:
          - db
          - database
    volumes:
${sqlFiles.length > 0 ? sqlFiles.join('\n') : '      - ./.devup:/tmp/devup_empty:ro'}
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost", "-u", "devuser", "-pdevpassword"]
      interval: 5s
      timeout: 5s
      retries: 10
`
  }

  fs.writeFileSync(composePath, composeContent)
}

export const runDockerCompose = (projectPath: string) => {
  const devupDir = path.join(projectPath, '.devup')
  const dockerCmd = getDockerCommand()
  const args = [...dockerCmd.slice(1), 'up', '-d', '--build']
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

export const checkHealth = async (services: string[], projectPort: number = 3000) => {
  const results: Record<string, boolean> = {}
  const servicePorts: Record<string, number> = {
    app: projectPort,
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
