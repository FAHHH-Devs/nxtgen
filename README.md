# DOC-PILOT

`DOC-PILOT` is a powerful Electron-based desktop application designed to streamline the setup of local development environments. It automatically analyzes your source code, detects frameworks and database dependencies, and generates a fully-functional Docker Compose infrastructure tailored to your project.

## 🚀 Features

- **Automated Project Analysis**: Scans your project directory to identify:
  - **Frameworks**: Node.js, Python (FastAPI, Flask), and Java (Spring Boot).
  - **Databases**: PostgreSQL, MySQL, and MongoDB.
  - **Caching**: Redis.
- **Smart Infrastructure Generation**: Automatically creates:
  - `.devup/Dockerfile` and `docker-compose.yml` optimized for your environment.
  - `devup.config.json` for persistent settings.
  - Environment variables (`.env`) for seamless service connectivity.
- **Application Shimming**: Injects lightweight "shims" (Node.js/Python) to handle service discovery (e.g., automatically mapping `localhost` to Docker service names like `postgres` or `mysql`).
- **Integrated Docker Runner**: Start and stop your Docker Compose environment directly from the app, with real-time log streaming.
- **Health Monitoring**: Built-in port scanning and health checks to ensure your services are ready for development.

## 🛠️ Tech Stack

- **Framework**: [Electron](https://www.electronjs.org/)
- **Frontend**: [React](https://reactjs.org/) with [TypeScript](https://www.typescriptlang.org/)
- **Build Tool**: [electron-vite](https://electron-vite.org/)
- **Packaging**: [electron-builder](https://www.electron.build/)
- **Styling**: Vanilla CSS

## 📦 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (Latest LTS recommended)
- [Docker](https://www.docker.com/) with Docker Compose support
- [npm](https://www.npmjs.com/) (usually comes with Node.js)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/devup-app.git
   cd devup-app
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

### Development

Run the application in development mode with Hot Module Replacement (HMR):

```bash
npm run dev
```

### Building

To package the application for production:

```bash
# Windows
npm run build:win

# macOS
npm run build:mac

# Linux
npm run build:linux
```

## 📂 Project Structure

- `src/main`: Electron main process logic, including the `projectService` for analysis and Docker management.
- `src/renderer`: React-based UI components and frontend logic.
- `src/preload`: Preload scripts for secure IPC communication between main and renderer processes.
- `resources`: Static assets like application icons.

## ⚙️ How It Works

1. **Select Project**: Choose your project's root directory using the app's file picker.
2. **Analysis**: The `projectService` scans for manifest files (like `package.json`, `requirements.txt`, or `pom.xml`) to determine the stack.
3. **Configuration**: It generates a `.devup` folder containing everything needed to containerize your app and its dependencies.
4. **Launch**: Click "Run" to build and start your containers. The app handles the orchestration and monitors service health.

---

Built with ❤️ for developers who hate manual environment setup.
