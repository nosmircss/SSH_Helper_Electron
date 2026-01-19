# SSH Helper (Electron)

Cross-platform SSH command execution tool built with Electron, React, and TypeScript.

## Features

- Execute SSH commands on multiple hosts simultaneously
- YAML-based scripting for complex automation workflows
- Preset management with folders and favorites
- CSV import/export for host lists
- Dark/light theme support
- Cross-platform: Windows, macOS, Linux

## Development

### Prerequisites

- Node.js 20+
- npm or yarn

### Setup

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# In another terminal, start Electron
npm start
```

### Building

```bash
# Build for current platform
npm run dist

# Build for specific platform
npm run dist:win    # Windows
npm run dist:mac    # macOS
npm run dist:linux  # Linux
```

## Project Structure

```
ssh-helper-electron/
├── src/
│   ├── main/           # Electron main process
│   │   ├── services/   # Business logic (SSH, Config, etc.)
│   │   ├── ipc/        # IPC handlers
│   │   └── utils/      # Utilities
│   ├── renderer/       # React frontend
│   │   ├── components/ # UI components
│   │   ├── store/      # Zustand state management
│   │   └── styles/     # CSS/Tailwind
│   ├── shared/         # Shared types between main/renderer
│   └── preload/        # Context bridge for secure IPC
├── package.json
├── electron-builder.json
└── vite.config.ts
```

## Technologies

- **Electron** - Cross-platform desktop app framework
- **React 18** - UI library
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **Zustand** - State management
- **ssh2** - Node.js SSH client
- **electron-store** - Configuration persistence
- **Vite** - Fast build tool

## License

MIT
