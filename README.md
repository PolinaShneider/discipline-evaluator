# ITMO Discipline Evaluator

A browser extension for evaluating and generating academic course structures through AI-powered analysis.

## 🏗️ Project Structure

```
discipline-evaluator/
├── src/                          # Source code
│   ├── background/               # Background service worker
│   │   └── background.js         # Main background script with API handlers
│   ├── content/                  # Content scripts
│   │   └── content.js            # DOM interaction script for ITMO pages
│   ├── popup/                    # Popup UI
│   │   ├── popup.html            # Popup interface
│   │   ├── popup.js              # Popup logic and UI interactions
│   │   └── styles.css            # Popup styling
│   ├── services/                 # API services and business logic
│   │   ├── index.js              # Services barrel export
│   │   ├── backgroundApi.js      # Background script communication helper
│   │   ├── evaluator.js          # Course evaluation API wrapper
│   │   ├── analytics.js          # Google Analytics tracking
│   │   └── generateCourseStructure.js # OpenAI course generation
│   ├── utils/                    # Utility functions
│   │   ├── index.js              # Utils barrel export
│   │   └── utils.js              # Common utility functions
│   ├── constants/                # Configuration and constants
│   │   ├── index.js              # Constants barrel export
│   │   └── config.js             # API endpoints and configuration
│   └── types/                    # Type definitions and contracts
│       ├── index.js              # Types barrel export
│       └── messageTypes.js       # Message contracts for extension communication
├── assets/                       # Static assets
│   └── icons/                    # Extension icons
│       └── icon.png
├── manifest.json                 # Extension manifest
└── README.md                     # This file
```

## 🔧 Architecture

### Background Service Worker

- **Location**: `src/background/background.js`
- **Purpose**: Handles all API calls, token management, and secure operations
- **Key Features**:
  - ITMO API integration
  - OpenAI API calls
  - Token validation and storage
  - Google Analytics tracking
  - Legacy message support for gradual migration

### Content Scripts

- **Location**: `src/content/content.js`
- **Purpose**: Minimal DOM interactions on ITMO pages
- **Scope**: Only handles page-specific operations that require DOM access

### Popup Interface

- **Location**: `src/popup/`
- **Purpose**: User interface for extension functionality
- **Features**: Course evaluation, structure generation, settings

### Services Layer

- **Location**: `src/services/`
- **Purpose**: Abstracted API services and business logic
- **Components**:
  - `backgroundApi.js`: Helper for communicating with background script
  - `evaluator.js`: Course evaluation service
  - `analytics.js`: Usage tracking
  - `generateCourseStructure.js`: AI-powered course generation

## 🔒 Security Features

1. **API Key Protection**: Sensitive keys moved to background script
2. **Token Management**: Secure storage and validation
3. **CSP Compliance**: No inline scripts or unsafe evaluations
4. **Permission Minimization**: Only necessary permissions requested

## 🚀 Development

### File Organization Principles

1. **Separation of Concerns**: Each folder has a specific responsibility
2. **Module Boundaries**: Clear interfaces between different parts
3. **Security First**: Sensitive operations isolated in background
4. **Clean Imports**: Barrel exports for organized imports

### Import Patterns

```javascript
// Preferred: Use barrel exports
import { BackgroundApi, ItmoApi } from "../services/index.js";
import { MESSAGE_TYPES } from "../types/index.js";
import { ENDPOINT } from "../constants/index.js";

// Avoid: Direct file imports (unless performance critical)
import { BackgroundApi } from "../services/backgroundApi.js";
```

## 📡 Message Passing

The extension uses a type-safe message passing system:

- **Message Types**: Defined in `src/types/messageTypes.js`
- **Background API**: Helper in `src/services/backgroundApi.js`
- **Legacy Support**: Backward compatibility for gradual migration

## 🔄 Migration Status

This project is currently being refactored from a monolithic structure to a modular architecture:

- ✅ Background service worker created
- ✅ Message passing system implemented
- ✅ File organization completed
- 🔄 Content script refactoring (in progress)
- ⏳ Popup script migration (pending)
- ⏳ Legacy code removal (pending)

## 🛠️ Build Process

Currently using direct file serving. Future improvements may include:

- Build system (Webpack/Vite)
- TypeScript integration
- Automated testing
- Code minification
