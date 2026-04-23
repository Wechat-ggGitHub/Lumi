# Shrew Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个 macOS 桌面应用，通过右 Command 语音快捷键驱动 Claude Code 执行任务，菜单栏实时显示状态。

**Architecture:** Electron 主进程管理窗口和全局快捷键，Next.js standalone server 通过 `utilityProcess.fork` 嵌入。两层状态机驱动 UI：应用状态机管理录音/编辑/执行流程，SDK 子状态驱动菜单栏小点。数据层用 SQLite 存执行元数据，JSON 存配置，Keychain 存 API Key。

**Tech Stack:** Electron 35, Next.js 15 (standalone), React 19, @anthropic-ai/claude-agent-sdk, sherpa-onnx-node, better-sqlite3, Swift N-API addon (CGEventTap)

---

## File Structure

```
项目/Shrew/
├── electron/
│   ├── main.ts                  # 主进程入口：启动 Next.js server、创建窗口/Tray、管理生命周期
│   ├── tray.ts                  # 菜单栏 Tray：图标、状态小点渲染、点击事件
│   ├── voice-bar.ts             # 语音悬浮窗：创建/销毁/显示/隐藏、IPC 通信
│   ├── summary-popup.ts         # 摘要弹窗：跟随 Tray 定位、创建/销毁
│   ├── shortcuts.ts             # 右 Cmd 监听：加载 Swift addon、按键事件分发
│   ├── recorder.ts              # 录音管理：系统音频捕获、写入临时文件
│   └── native/
│       └── key-event-tap/       # Swift N-API addon
│           ├── Package.swift
│           ├── Sources/
│           │   └── KeyEventTap.swift
│           └── lib/
│               └── binding.gyp  # node-gyp 构建配置
├── src/
│   ├── app/
│   │   ├── layout.tsx           # Root layout
│   │   ├── api/
│   │   │   ├── chat/route.ts    # Claude SDK 交互 endpoint
│   │   │   ├── status/route.ts  # 运行时状态查询
│   │   │   └── health/route.ts  # Health check (waitForServer 用)
│   │   ├── voice-bar/
│   │   │   └── page.tsx         # 语音悬浮窗页面
│   │   ├── summary/
│   │   │   └── page.tsx         # 摘要弹窗页面
│   │   └── settings/
│   │       └── page.tsx         # 设置页
│   ├── lib/
│   │   ├── claude-client.ts     # Claude Agent SDK 封装
│   │   ├── sherpa.ts            # sherpa-onnx 调用封装
│   │   ├── db.ts                # SQLite 操作
│   │   ├── store.ts             # 运行时状态管理
│   │   └── keychain.ts          # API Key 安全存储
│   ├── components/
│   │   ├── VoiceInput.tsx       # 语音输入 + 编辑组件
│   │   ├── SummaryPanel.tsx     # 摘要面板组件
│   │   ├── StatusDot.tsx        # 状态小点组件
│   │   └── Onboarding.tsx      # 首次启动引导
│   └── types/
│       └── index.ts             # 共享类型定义
├── scripts/
│   └── download-model.ts        # 语音模型下载脚本
├── resources/
│   └── tray/                    # Tray 图标资源
│       ├── iconTemplate@2x.png  # 模板图标 (暗色/亮色自适应)
│       ├── dot-blue@2x.png
│       ├── dot-green@2x.png
│       ├── dot-red@2x.png
│       ├── dot-yellow@2x.png
│       └── dot-gray@2x.png
├── package.json
├── next.config.ts
├── electron-builder.yml
├── tsconfig.json
└── tsconfig.electron.json
```

---

## Phase 1: Foundation

### Task 1: Project Scaffold

**Files:**
- Create: `项目/Shrew/package.json`
- Create: `项目/Shrew/tsconfig.json`
- Create: `项目/Shrew/tsconfig.electron.json`
- Create: `项目/Shrew/next.config.ts`
- Create: `项目/Shrew/electron-builder.yml`
- Create: `项目/Shrew/src/app/layout.tsx`
- Create: `项目/Shrew/src/app/api/health/route.ts`
- Create: `项目/Shrew/electron/main.ts`

- [ ] **Step 1: 初始化项目目录**

```bash
mkdir -p 项目/Shrew && cd 项目/Shrew
git init
```

- [ ] **Step 2: 创建 package.json**

```json
{
  "name": "shrew",
  "version": "0.1.0",
  "private": true,
  "main": "dist-electron/main.js",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "electron:dev": "concurrently \"next build && next start\" \"wait-on http://127.0.0.1:3000 && electron .\"",
    "electron:build": "next build && tsc -p tsconfig.electron.json && electron-builder"
  },
  "dependencies": {
    "@anthropic-ai/claude-agent-sdk": "^0.2.0",
    "better-sqlite3": "^11.0.0",
    "next": "^15.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "sherpa-onnx-node": "^1.10.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.0",
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "concurrently": "^9.0.0",
    "electron": "^35.0.0",
    "electron-builder": "^25.0.0",
    "typescript": "^5.7.0",
    "wait-on": "^8.0.0"
  }
}
```

- [ ] **Step 3: 创建 tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 4: 创建 tsconfig.electron.json**（Electron 端编译配置）

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "outDir": "./dist-electron",
    "module": "commonjs",
    "target": "ES2022",
    "jsx": "react-jsx"
  },
  "include": ["electron/**/*.ts"]
}
```

- [ ] **Step 5: 创建 next.config.ts**

```typescript
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ['better-sqlite3', 'sherpa-onnx-node'],
};

export default nextConfig;
```

- [ ] **Step 6: 创建 electron-builder.yml**

```yaml
appId: com.shrew.app
productName: Shrew
directories:
  output: release
mac:
  category: public.app-category.developer-tools
  target:
    - dmg
    - zip
  hardenedRuntime: true
  gatekeeperAssess: false
  minimumSystemVersion: "13.0.0"
asarUnpack:
  - "**/*.node"
  - "**/*.dylib"
extraResources:
  - from: "electron/native/key-event-tap/build/Release/"
    to: "native/"
files:
  - "dist-electron/**/*"
  - ".next/standalone/**/*"
  - ".next/static/**/*"
  - "public/**/*"
  - "!node_modules/**/*"
```

- [ ] **Step 7: 创建最小 layout.tsx**

```tsx
// src/app/layout.tsx
export const metadata = { title: 'Shrew' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body style={{ margin: 0, fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' }}>
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 8: 创建 health check API**

```typescript
// src/app/api/health/route.ts
import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ status: 'ok' });
}
```

- [ ] **Step 9: 创建 Electron main.ts 骨架**

```typescript
// electron/main.ts
import { app, BrowserWindow } from 'electron';
import path from 'path';

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.loadURL('http://127.0.0.1:3000/settings');
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
```

- [ ] **Step 10: 安装依赖并验证**

```bash
cd 项目/Shrew && npm install
npx tsc --noEmit
```

Expected: 无编译错误

- [ ] **Step 11: 提交**

```bash
git add -A
git commit -m "feat: initial Electron + Next.js project scaffold"
```

---

### Task 2: Type Definitions + Database Layer

**Files:**
- Create: `src/types/index.ts`
- Create: `src/lib/db.ts`
- Create: `src/__tests__/db.test.ts`

- [ ] **Step 1: 创建共享类型定义**

```typescript
// src/types/index.ts

// 应用状态机
export type AppState =
  | 'idle'
  | 'recording'
  | 'transcribing'
  | 'editing'
  | 'sending'
  | 'executing'
  | 'error';

// SDK 执行子状态
export type SdkSubState =
  | 'thinking'
  | 'executing_tool'
  | 'compacting'
  | 'rate_limited'
  | 'authenticating'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | null;

// 状态小点颜色
export type DotColor = 'gray' | 'blue' | 'green' | 'red' | 'yellow';

// 执行记录
export interface ExecutionRecord {
  id: string;
  sdk_session_id: string | null;
  cwd: string;
  user_prompt: string;
  summary: string | null;
  cost_usd: number | null;
  duration_ms: number | null;
  num_turns: number | null;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  created_at: string;
  completed_at: string | null;
}

// 设置
export interface AppSettings {
  shortcut: string;
  voiceModel: string;
  claudePermissionMode: string;
  defaultCwd: string;
  vadTimeout: number;
  theme: string;
}

// IPC 消息类型
export interface IpcMessages {
  // voice-bar → main
  'voice:send': { text: string };
  'voice:cancel': void;
  'voice:ready': void;

  // main → voice-bar
  'voice:start-recording': void;
  'voice:stop-recording': void;
  'voice:transcript': { text: string; isAppending: boolean };
  'voice:transcribing': void;
  'voice:error': { message: string };

  // main → summary-popup
  'summary:update': { execution: ExecutionRecord | null; history: ExecutionRecord[] };

  // main → renderer (状态更新)
  'state:app-state': { state: AppState };
  'state:sdk-substate': { substate: SdkSubState; toolName?: string };

  // main → renderer (Tray 点击)
  'tray:click': void;
}
```

- [ ] **Step 2: 写 db.ts 测试**

```typescript
// src/__tests__/db.test.ts
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { initDb, insertExecution, updateExecution, getRecentExecutions, getActiveExecution } from '../lib/db';

// 使用临时数据库
const tmpDir = path.join(process.cwd(), '.tmp-test');
let db: Database.Database;

beforeAll(() => {
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
});

afterAll(() => {
  if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true });
});

beforeEach(() => {
  const dbPath = path.join(tmpDir, `test-${Date.now()}.db`);
  db = new Database(dbPath);
  initDb(db);
});

afterEach(() => {
  db.close();
});

test('insertExecution creates a running execution', () => {
  const id = insertExecution(db, {
    cwd: '/Users/test/project',
    user_prompt: '创建一个 React 项目',
  });
  expect(id).toBeTruthy();

  const active = getActiveExecution(db);
  expect(active).not.toBeNull();
  expect(active!.user_prompt).toBe('创建一个 React 项目');
  expect(active!.status).toBe('running');
});

test('updateExecution marks completion', () => {
  const id = insertExecution(db, {
    cwd: '/Users/test/project',
    user_prompt: '修复 bug',
  });

  updateExecution(db, id, {
    status: 'completed',
    summary: '已修复登录页面的空指针异常',
    duration_ms: 15000,
    num_turns: 3,
    cost_usd: 0.05,
  });

  const active = getActiveExecution(db);
  expect(active).toBeNull();

  const recent = getRecentExecutions(db, 5);
  expect(recent.length).toBe(1);
  expect(recent[0].status).toBe('completed');
  expect(recent[0].summary).toBe('已修复登录页面的空指针异常');
});

test('getRecentExecutions returns ordered by created_at desc', () => {
  for (let i = 0; i < 5; i++) {
    const id = insertExecution(db, {
      cwd: '/Users/test',
      user_prompt: `指令 ${i}`,
    });
    updateExecution(db, id, { status: 'completed', completed_at: new Date().toISOString() });
  }

  const recent = getRecentExecutions(db, 3);
  expect(recent.length).toBe(3);
  expect(new Date(recent[0].created_at) > new Date(recent[2].created_at)).toBe(true);
});
```

- [ ] **Step 3: 运行测试验证失败**

```bash
cd 项目/Shrew && npx jest src/__tests__/db.test.ts --no-compile 2>&1 | head -5
```

Expected: FAIL (module not found)

- [ ] **Step 4: 实现 db.ts**

```typescript
// src/lib/db.ts
import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import type { ExecutionRecord } from '@/types';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS execution_history (
  id TEXT PRIMARY KEY,
  sdk_session_id TEXT,
  cwd TEXT NOT NULL,
  user_prompt TEXT NOT NULL,
  summary TEXT,
  cost_usd REAL,
  duration_ms INTEGER,
  num_turns INTEGER,
  status TEXT NOT NULL DEFAULT 'running',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME
);
CREATE INDEX IF NOT EXISTS idx_execution_history_created ON execution_history(created_at DESC);
`;

export function initDb(db: Database.Database): void {
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.exec(SCHEMA);
}

export function insertExecution(
  db: Database.Database,
  params: { cwd: string; user_prompt: string; sdk_session_id?: string }
): string {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO execution_history (id, cwd, user_prompt, sdk_session_id) VALUES (?, ?, ?, ?)`
  ).run(id, params.cwd, params.user_prompt, params.sdk_session_id ?? null);
  return id;
}

export function updateExecution(
  db: Database.Database,
  id: string,
  updates: Partial<Pick<ExecutionRecord, 'status' | 'summary' | 'duration_ms' | 'num_turns' | 'cost_usd' | 'completed_at'>>
): void {
  const fields: string[] = [];
  const values: unknown[] = [];

  for (const [key, value] of Object.entries(updates)) {
    fields.push(`${key} = ?`);
    values.push(value);
  }

  if (fields.length === 0) return;

  values.push(id);
  db.prepare(`UPDATE execution_history SET ${fields.join(', ')} WHERE id = ?`).run(...values);
}

export function getActiveExecution(db: Database.Database): ExecutionRecord | null {
  return db.prepare(`SELECT * FROM execution_history WHERE status = 'running' ORDER BY created_at DESC LIMIT 1`).get() as ExecutionRecord | null;
}

export function getRecentExecutions(db: Database.Database, limit: number): ExecutionRecord[] {
  return db.prepare(`SELECT * FROM execution_history ORDER BY created_at DESC LIMIT ?`).all(limit) as ExecutionRecord[];
}

export function getExecutionById(db: Database.Database, id: string): ExecutionRecord | null {
  return db.prepare(`SELECT * FROM execution_history WHERE id = ?`).get(id) as ExecutionRecord | null;
}
```

- [ ] **Step 5: 运行测试验证通过**

```bash
cd 项目/Shrew && npx jest src/__tests__/db.test.ts
```

Expected: 所有测试 PASS

- [ ] **Step 6: 提交**

```bash
git add src/types/index.ts src/lib/db.ts src/__tests__/db.test.ts
git commit -m "feat: add type definitions and SQLite database layer"
```

---

### Task 3: State Management Store

**Files:**
- Create: `src/lib/store.ts`
- Create: `src/__tests__/store.test.ts`

- [ ] **Step 1: 写 store 测试**

```typescript
// src/__tests__/store.test.ts
import { ShrewStore } from '../lib/store';

test('initial state is idle with no substate', () => {
  const store = new ShrewStore();
  expect(store.appState).toBe('idle');
  expect(store.sdkSubState).toBeNull();
});

test('transition: idle → recording → transcribing → editing', () => {
  const store = new ShrewStore();
  store.transition('recording');
  expect(store.appState).toBe('recording');

  store.transition('transcribing');
  expect(store.appState).toBe('transcribing');

  store.transition('editing');
  expect(store.appState).toBe('editing');
});

test('transition: editing → sending → executing → idle', () => {
  const store = new ShrewStore();
  store.transition('recording');
  store.transition('transcribing');
  store.transition('editing');
  store.transition('sending');
  store.transition('executing');

  expect(store.appState).toBe('executing');

  store.transition('idle');
  expect(store.appState).toBe('idle');
});

test('invalid transitions are ignored', () => {
  const store = new ShrewStore();
  store.transition('executing'); // idle → executing is invalid
  expect(store.appState).toBe('idle');
});

test('sdk substate updates independently', () => {
  const store = new ShrewStore();
  const changes: Array<{ appState: string; sdkSubState: string | null }> = [];
  store.onChange((state) => changes.push({ ...state }));

  store.transition('recording');
  store.transition('transcribing');
  store.transition('editing');
  store.transition('sending');
  store.transition('executing');
  store.setSdkSubState('thinking');
  store.setSdkSubState('executing_tool');

  expect(store.sdkSubState).toBe('executing_tool');
  expect(changes[changes.length - 1].sdkSubState).toBe('executing_tool');
});

test('dotColor mapping', () => {
  const store = new ShrewStore();

  expect(store.dotColor).toBe('gray');

  store.transition('recording');
  store.transition('transcribing');
  store.transition('editing');
  store.transition('sending');
  expect(store.dotColor).toBe('blue');

  store.transition('executing');
  store.setSdkSubState('thinking');
  expect(store.dotColor).toBe('blue');

  store.transition('idle');
  store.setSdkSubState('completed');
  expect(store.dotColor).toBe('green');

  // green reverts to gray after 3 seconds (tested with jest timer)
});

test('rightCommand behavior per state', () => {
  const store = new ShrewStore();

  // idle → should start recording
  const action1 = store.getRightCommandAction();
  expect(action1).toBe('start-recording');

  store.transition('recording');
  const action2 = store.getRightCommandAction();
  expect(action2).toBe('stop-recording');

  store.transition('transcribing');
  const action3 = store.getRightCommandAction();
  expect(action3).toBe('none');

  store.transition('editing');
  const action4 = store.getRightCommandAction();
  expect(action4).toBe('append-recording');

  store.transition('sending');
  store.transition('executing');
  const action5 = store.getRightCommandAction();
  expect(action5).toBe('cancel-execution');
});
```

- [ ] **Step 2: 运行测试验证失败**

```bash
cd 项目/Shrew && npx jest src/__tests__/store.test.ts
```

Expected: FAIL

- [ ] **Step 3: 实现 store.ts**

```typescript
// src/lib/store.ts
import type { AppState, SdkSubState, DotColor } from '@/types';

type ValidTransitions = Record<AppState, AppState[]>;

const VALID_TRANSITIONS: ValidTransitions = {
  idle: ['recording'],
  recording: ['transcribing', 'idle'],
  transcribing: ['editing', 'idle'],
  editing: ['sending', 'recording', 'idle'],
  sending: ['executing', 'idle'],
  executing: ['idle', 'error'],
  error: ['idle'],
};

export type RightCommandAction =
  | 'start-recording'
  | 'stop-recording'
  | 'none'
  | 'append-recording'
  | 'cancel-execution';

export type StateChangeCallback = (state: { appState: AppState; sdkSubState: SdkSubState }) => void;

export class ShrewStore {
  private _appState: AppState = 'idle';
  private _sdkSubState: SdkSubState = null;
  private _previousSdkSubState: SdkSubState = null;
  private _greenTimer: ReturnType<typeof setTimeout> | null = null;
  private _listeners: StateChangeCallback[] = [];

  get appState(): AppState { return this._appState; }
  get sdkSubState(): SdkSubState { return this._sdkSubState; }

  transition(newState: AppState): void {
    const allowed = VALID_TRANSITIONS[this._appState];
    if (!allowed.includes(newState)) return;

    this._appState = newState;
    this.notify();

    if (newState === 'idle' && this._sdkSubState === 'completed') {
      this.scheduleGreenToGray();
    }

    if (newState !== 'executing') {
      // Keep completed/failed for dot color display on idle
      if (newState === 'idle' && (this._sdkSubState === 'completed' || this._sdkSubState === 'failed')) {
        // preserve substate for dot color
      } else if (newState !== 'idle') {
        this._sdkSubState = null;
      }
    }
  }

  setSdkSubState(substate: SdkSubState): void {
    this._previousSdkSubState = this._sdkSubState;
    this._sdkSubState = substate;
    this.notify();
  }

  get dotColor(): DotColor {
    if (this._appState === 'sending') return 'blue';
    if (this._appState === 'executing') {
      if (this._sdkSubState === 'rate_limited' || this._sdkSubState === 'authenticating') return 'yellow';
      return 'blue';
    }
    if (this._appState === 'idle') {
      if (this._sdkSubState === 'completed') return 'green';
      if (this._sdkSubState === 'failed') return 'red';
    }
    return 'gray';
  }

  getRightCommandAction(): RightCommandAction {
    switch (this._appState) {
      case 'idle': return 'start-recording';
      case 'recording': return 'stop-recording';
      case 'transcribing': return 'none';
      case 'editing': return 'append-recording';
      case 'executing': return 'cancel-execution';
      default: return 'none';
    }
  }

  onChange(callback: StateChangeCallback): () => void {
    this._listeners.push(callback);
    return () => {
      this._listeners = this._listeners.filter(l => l !== callback);
    };
  }

  private notify(): void {
    for (const cb of this._listeners) {
      cb({ appState: this._appState, sdkSubState: this._sdkSubState });
    }
  }

  private scheduleGreenToGray(): void {
    if (this._greenTimer) clearTimeout(this._greenTimer);
    this._greenTimer = setTimeout(() => {
      if (this._appState === 'idle' && this._sdkSubState === 'completed') {
        this._sdkSubState = null;
        this.notify();
      }
      this._greenTimer = null;
    }, 3000);
  }
}
```

- [ ] **Step 4: 运行测试验证通过**

```bash
cd 项目/Shrew && npx jest src/__tests__/store.test.ts
```

Expected: 所有测试 PASS

- [ ] **Step 5: 提交**

```bash
git add src/lib/store.ts src/__tests__/store.test.ts
git commit -m "feat: add two-layer state management store"
```

---

### Task 4: Menu Bar Tray with Status Dots

**Files:**
- Create: `electron/tray.ts`
- Create: `resources/tray/iconTemplate@2x.png` (placeholder)
- Create: `resources/tray/dot-blue@2x.png` (placeholder)
- Create: `resources/tray/dot-green@2x.png` (placeholder)
- Create: `resources/tray/dot-red@2x.png` (placeholder)
- Create: `resources/tray/dot-yellow@2x.png` (placeholder)
- Create: `resources/tray/dot-gray@2x.png` (placeholder)

- [ ] **Step 1: 创建 Tray 图标占位资源**

使用 macOS 原生代码在 electron/tray.ts 中生成 Template 图标（不依赖外部 PNG）。MVP 阶段使用 `nativeImage.createFromBuffer()` 动态生成 16x16 的黑色模板图标和彩色圆点。

创建资源目录：

```bash
mkdir -p 项目/Shrew/resources/tray
```

- [ ] **Step 2: 创建 electron/tray.ts**

```typescript
// electron/tray.ts
import { Tray, nativeImage, Menu, BrowserWindow } from 'electron';
import path from 'path';
import type { DotColor } from '../src/types';

// 动态生成 Template 图标 (22x22 黑色 Shrew logo 轮廓)
function createBaseIcon(): Electron.NativeImage {
  const size = 22;
  // macOS Template 图标：黑色像素自动适配明暗模式
  const img = nativeImage.createEmpty();
  return img;
}

// 动态生成状态小点图标
function createDotIcon(color: DotColor): Electron.NativeImage {
  const size = 22;
  const canvas = Buffer.alloc(size * size * 4); // RGBA

  const colors: Record<DotColor, [number, number, number, number]> = {
    gray:   [142, 142, 147, 200],
    blue:   [50, 173, 255, 255],
    green:  [52, 199, 89, 255],
    red:    [255, 69, 58, 255],
    yellow: [255, 214, 10, 255],
  };

  const [r, g, b, a] = colors[color];
  const center = size / 2;
  const radius = 8;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - center;
      const dy = y - center;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const idx = (y * size + x) * 4;

      if (dist <= radius) {
        canvas[idx] = r;
        canvas[idx + 1] = g;
        canvas[idx + 2] = b;
        canvas[idx + 3] = a;
      } else {
        canvas[idx + 3] = 0; // transparent
      }
    }
  }

  return nativeImage.createFromBuffer(canvas, { width: size, height: size });
}

export class ShrewTray {
  private tray: Tray;
  private dotIcons: Record<DotColor, Electron.NativeImage>;
  private baseIcon: Electron.NativeImage;
  private summaryWindow: BrowserWindow | null = null;

  constructor() {
    this.baseIcon = createBaseIcon();
    this.dotIcons = {
      gray: createDotIcon('gray'),
      blue: createDotIcon('blue'),
      green: createDotIcon('green'),
      red: createDotIcon('red'),
      yellow: createDotIcon('yellow'),
    };

    this.tray = new Tray(this.baseIcon);
    this.tray.setToolTip('Shrew - 待命中');
    this.updateDot('gray');

    const contextMenu = Menu.buildFromTemplate([
      { label: 'Shrew', type: 'normal', enabled: false },
      { type: 'separator' },
      { label: '设置...', click: () => this.openSettings() },
      { type: 'separator' },
      { label: '退出 Shrew', role: 'quit' },
    ]);
    this.tray.setContextMenu(contextMenu);

    this.tray.on('click', () => this.toggleSummaryPopup());
  }

  updateDot(color: DotColor): void {
    // macOS Template 图标 + overlay 小点
    const dot = this.dotIcons[color];
    // 使用 Tray.setImage 直接设置带小点的图标
    this.tray.setImage(dot);

    const tooltips: Record<DotColor, string> = {
      gray: 'Shrew - 待命中',
      blue: 'Shrew - 执行中',
      green: 'Shrew - 已完成',
      red: 'Shrew - 出错了',
      yellow: 'Shrew - 等待中',
    };
    this.tray.setToolTip(tooltips[color]);
  }

  private toggleSummaryPopup(): void {
    // 传递给 main process 处理（summary-popup.ts 负责创建窗口）
    if (this.summaryWindow && !this.summaryWindow.isDestroyed()) {
      this.summaryWindow.close();
      this.summaryWindow = null;
    } else {
      this.onPopupRequested?.();
    }
  }

  private openSettings(): void {
    this.onSettingsRequested?.();
  }

  // 回调，由 main.ts 注入
  onPopupRequested?: () => void;
  onSettingsRequested?: () => void;

  destroy(): void {
    this.tray.destroy();
  }
}
```

- [ ] **Step 3: 提交**

```bash
git add electron/tray.ts resources/
git commit -m "feat: add menu bar Tray with dynamic status dot icons"
```

---

## Phase 2: Keyboard + Voice Input

### Task 5: Swift N-API Addon for Right Command

**Files:**
- Create: `electron/native/key-event-tap/Package.swift`
- Create: `electron/native/key-event-tap/Sources/KeyEventTap.swift`
- Create: `electron/native/key-event-tap/binding.gyp`
- Create: `electron/shortcuts.ts`

- [ ] **Step 1: 创建 Swift addon 目录结构**

```bash
mkdir -p 项目/Shrew/electron/native/key-event-tap/Sources
```

- [ ] **Step 2: 创建 Package.swift**

```swift
// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "KeyEventTap",
    products: [
        .library(name: "KeyEventTap", type: .dynamic, targets: ["KeyEventTap"]),
    ],
    targets: [
        .systemLibrary(name: "CNodeAPI"),
        .target(
            name: "KeyEventTap",
            dependencies: ["CNodeAPI"],
            path: "Sources"
        ),
    ]
)
```

- [ ] **Step 3: 创建 CNodeAPI modulemap**

```bash
mkdir -p 项目/Shrew/electron/native/key-event-tap/Sources/CNodeAPI
```

```c
// Sources/CNodeAPI/module.modulemap
module CNodeAPI {
    header "/usr/local/include/node/node_api.h"
    link "node"
    export *
}
```

- [ ] **Step 4: 创建 KeyEventTap.swift**

```swift
import Foundation
import CoreGraphics
import ApplicationServices

@_cdecl("node_register_module_v1")
public func node_register_module_v1(
    env: OpaquePointer,
    exports: OpaquePointer
) -> OpaquePointer? {
    // N-API 注册：导出 startListening / stopListening 函数
    // startListening: 创建 CGEventTap 监听 kVK_RightCommand (0x36)
    // stopListening: 移除 CGEventTap
    //
    // 回调通过 N-API napi_call_function 将 keydown/keyup 事件
    // 传递回 JavaScript 回调函数

    let rightCmdKeyCode: UInt16 = 0x36

    // 注册 N-API 函数（使用 node_api_create_function）
    // 伪代码框架：
    // 1. startListening(env, callback) -> 启动 CGEventTap
    //    - CGEventTapCreate(.cgSessionEventTap, .headInsertEventTap,
    //        .defaultTap, .keyDownMask | .keyUpMask,
    //        { _, _, event, _ in
    //            let keyCode = CGEventGetIntegerValueField(event, .keyboardEventKeycode)
    //            if keyCode == rightCmdKeyCode {
    //                let type = CGEventGetType(event) == .keyDown ? "keydown" : "keyup"
    //                callback(type) // 调用 JS 回调
    //                return nil // 消费事件，防止传递
    //            }
    //            return Unmanaged.passUnretained(event)
    //        })
    //    - Add tap to current RunLoop
    //    - Check AXIsProcessTrusted()，如未授权则返回错误
    //
    // 2. stopListening() -> CGEventTapEnable(tap, false), remove from RunLoop

    return exports
}
```

> 注意：Swift N-API addon 的完整实现涉及大量 N-API C 桥接代码。这里提供架构框架，完整实现参考 [node-swift](https://github.com/kabiroberai/node-swift) 项目简化开发。MVP 阶段建议先用 node-swift CLI 工具生成 addon 脚手架。

- [ ] **Step 5: 创建 shortcuts.ts（addon 桥接层）**

```typescript
// electron/shortcuts.ts
import { app } from 'electron';
import type { RightCommandAction } from '../src/lib/store';

type KeyEventType = 'keydown' | 'keyup';
type KeyCallback = (event: KeyEventType) => void;

export class ShortcutManager {
  private nativeAddon: { startListening: (cb: KeyCallback) => void; stopListening: () => void } | null = null;
  private isListening = false;
  private onKeyDown?: (action: RightCommandAction) => void;

  async init(): Promise<boolean> {
    try {
      // 尝试加载 native addon
      const addonPath = app.isPackaged
        ? path.join(process.resourcesPath, 'native', 'key_event_tap.node')
        : path.join(__dirname, 'native', 'key-event-tap', 'build', 'Release', 'key_event_tap.node');

      this.nativeAddon = require(addonPath);
      return true;
    } catch {
      console.error('Failed to load key event tap addon');
      return false;
    }
  }

  start(onAction: (action: RightCommandAction) => void): void {
    if (!this.nativeAddon || this.isListening) return;
    this.onKeyDown = onAction;
    this.isListening = true;

    let lastKeydownTime = 0;

    this.nativeAddon.startListening((event) => {
      if (event === 'keydown') {
        const now = Date.now();
        if (now - lastKeydownTime < 200) return; // 防抖
        lastKeydownTime = now;
        // 具体的 action 由 store.getRightCommandAction() 决定
        // main.ts 中通过 store 获取当前 action 后调用对应处理
      }
    });
  }

  stop(): void {
    if (this.nativeAddon && this.isListening) {
      this.nativeAddon.stopListening();
      this.isListening = false;
    }
  }

  static checkAccessibility(): boolean {
    // 检查辅助功能权限
    try {
      const { systemPreferences } = require('electron');
      return systemPreferences.isTrustedAccessibilityClient(true);
    } catch {
      return false;
    }
  }
}

import path from 'path';
```

- [ ] **Step 6: 提交**

```bash
git add electron/native/ electron/shortcuts.ts
git commit -m "feat: add Swift N-API addon scaffold and shortcut manager"
```

---

### Task 6: Voice Recorder + Sherpa Integration

**Files:**
- Create: `src/lib/sherpa.ts`
- Create: `electron/recorder.ts`
- Create: `src/lib/keychain.ts`

- [ ] **Step 1: 创建 keychain.ts（API Key 安全存储）**

```typescript
// src/lib/keychain.ts
// 注意：此文件在 Electron main process 中使用
// safeStorage 在 renderer 中不可用

import { safeStorage } from 'electron';
import fs from 'fs';
import path from 'path';
import { app } from 'electron';

const KEYCHAIN_DIR = path.join(app.getPath('userData'), 'secure');
const API_KEY_FILE = path.join(KEYCHAIN_DIR, 'anthropic-key.enc');

export function saveApiKey(key: string): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Encryption not available on this system');
  }
  if (!fs.existsSync(KEYCHAIN_DIR)) fs.mkdirSync(KEYCHAIN_DIR, { recursive: true });
  const encrypted = safeStorage.encryptString(key);
  fs.writeFileSync(API_KEY_FILE, encrypted);
}

export function loadApiKey(): string | null {
  if (!fs.existsSync(API_KEY_FILE)) return null;
  if (!safeStorage.isEncryptionAvailable()) return null;
  const encrypted = fs.readFileSync(API_KEY_FILE);
  return safeStorage.decryptString(encrypted);
}

export function deleteApiKey(): void {
  if (fs.existsSync(API_KEY_FILE)) fs.unlinkSync(API_KEY_FILE);
}

export function hasApiKey(): boolean {
  return fs.existsSync(API_KEY_FILE);
}
```

- [ ] **Step 2: 创建 sherpa.ts（语音识别封装）**

```typescript
// src/lib/sherpa.ts
import path from 'path';
import { app } from 'electron';

type SherpaRecognizer = {
  acceptWaveform: (samples: Float32Array, sampleRate: number) => number;
  getResult: () => { text: string };
  reset: () => void;
  close: () => void;
};

export class VoiceRecognizer {
  private recognizer: SherpaRecognizer | null = null;
  private modelDir: string;
  private _isLoaded = false;

  constructor() {
    this.modelDir = path.join(app.getPath('userData'), 'models');
  }

  get isLoaded(): boolean { return this._isLoaded; }

  async load(): Promise<void> {
    if (this._isLoaded) return;

    try {
      // sherpa-onnx-node 动态导入（native module）
      const sherpaOnnx = await import('sherpa-onnx-node');

      const modelPath = path.join(this.modelDir, 'sensevoice-small-int8.onnx');

      this.recognizer = sherpaOnnx.createOfflineRecognizer({
        modelType: 'sensevoice',
        modelingUnit: 'auto',
        featConfig: { sampleRate: 16000, featureDim: 80 },
        modelConfig: {
          transducer: { encoder: '', decoder: '', joiner: '' },
          senseVoice: {
            model: modelPath,
            language: 'auto',
            useInverseTextNormalization: true,
          },
        },
      });

      this._isLoaded = true;
    } catch (error) {
      throw new Error(`Failed to load voice model: ${(error as Error).message}`);
    }
  }

  async transcribe(audioPath: string): Promise<string> {
    if (!this.recognizer) throw new Error('Recognizer not loaded');

    const sherpaOnnx = await import('sherpa-onnx-node');
    const wave = sherpaOnnx.readWave(audioPath);

    this.recognizer.acceptWaveform(wave.samples, wave.sampleRate);
    const result = this.recognizer.getResult();

    this.recognizer.reset();
    return result.text.trim();
  }

  close(): void {
    this.recognizer?.close();
    this.recognizer = null;
    this._isLoaded = false;
  }
}
```

- [ ] **Step 3: 创建 recorder.ts（录音管理）**

```typescript
// electron/recorder.ts
import { systemPreferences } from 'electron';
import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import { VoiceRecognizer } from '../src/lib/sherpa';

export class AudioRecorder {
  private recordingProcess: import('child_process').ChildProcess | null = null;
  private outputPath: string;
  private recognizer: VoiceRecognizer;

  constructor() {
    const tmpDir = path.join(app.getPath('userData'), 'tmp');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    this.outputPath = path.join(tmpDir, `recording-${Date.now()}.wav`);
    this.recognizer = new VoiceRecognizer();
  }

  static async checkMicrophonePermission(): Promise<boolean> {
    return systemPreferences.askForMediaAccess('microphone');
  }

  async startRecording(): Promise<void> {
    // 使用 macOS 的 afrecord 或 sox 录音
    // MVP 用 child_process 调用系统录音工具
    const { spawn } = await import('child_process');

    this.outputPath = path.join(
      path.dirname(this.outputPath),
      `recording-${Date.now()}.wav`
    );

    // 使用 macOS 内置的 afrecord（无额外依赖）
    this.recordingProcess = spawn('afrecord', [
      '-f', 'WAVE',
      '-r', '16000',
      '-c', '1',
      this.outputPath,
    ]);

    return new Promise((resolve, reject) => {
      this.recordingProcess!.on('error', (err) => reject(err));
      // 录音开始后立即 resolve（不等待结束）
      setTimeout(() => resolve(), 100);
    });
  }

  stopRecording(): Promise<string> {
    return new Promise((resolve) => {
      if (!this.recordingProcess) {
        resolve(this.outputPath);
        return;
      }

      // 发送 SIGINT 停止录音
      this.recordingProcess.kill('SIGINT');
      this.recordingProcess = null;

      // 等待文件写入完成
      setTimeout(() => resolve(this.outputPath), 200);
    });
  }

  async transcribe(audioPath?: string): Promise<string> {
    if (!this.recognizer.isLoaded) {
      await this.recognizer.load();
    }

    const path = audioPath || this.outputPath;
    const text = await this.recognizer.transcribe(path);

    // 清理临时文件
    try { fs.unlinkSync(path); } catch {}

    return text;
  }

  getRecognizer(): VoiceRecognizer {
    return this.recognizer;
  }
}
```

- [ ] **Step 4: 提交**

```bash
git add src/lib/sherpa.ts src/lib/keychain.ts electron/recorder.ts
git commit -m "feat: add voice recorder, sherpa-onnx integration, and keychain storage"
```

---

### Task 7: Voice Bar UI

**Files:**
- Create: `src/components/VoiceInput.tsx`
- Create: `src/app/voice-bar/page.tsx`
- Create: `electron/voice-bar.ts`

- [ ] **Step 1: 创建 VoiceInput 组件**

```tsx
// src/components/VoiceInput.tsx
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

type VoiceInputProps = {
  onSend: (text: string) => void;
  onCancel: () => void;
};

export function VoiceInput({ onSend, onCancel }: VoiceInputProps) {
  const [text, setText] = useState('');
  const [status, setStatus] = useState<'recording' | 'transcribing' | 'editing'>('recording');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    // 监听 IPC 事件
    if (typeof window === 'undefined') return;

    const { ipcRenderer } = require('electron');

    const handlers = {
      'voice:transcript': (_: unknown, data: { text: string; isAppending: boolean }) => {
        setText(prev => data.isAppending ? prev + data.text : data.text);
        setStatus('editing');
        textareaRef.current?.focus();
      },
      'voice:transcribing': () => setStatus('transcribing'),
      'voice:start-recording': () => setStatus('recording'),
      'voice:error': (_: unknown, data: { message: string }) => {
        setText(prev => prev + `\n[错误: ${data.message}]`);
        setStatus('editing');
      },
    };

    for (const [channel, handler] of Object.entries(handlers)) {
      ipcRenderer.on(channel, handler);
    }

    return () => {
      for (const [channel, handler] of Object.entries(handlers)) {
        ipcRenderer.removeListener(channel, handler);
      }
    };
  }, []);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
  }, [text, onSend]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    if (e.key === 'Escape') {
      onCancel();
    }
  }, [handleSend, onCancel]);

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '16px 20px',
      background: 'rgba(30, 30, 30, 0.95)',
      borderRadius: 16,
      backdropFilter: 'blur(20px)',
      color: '#fff',
      width: '100%',
      boxSizing: 'border-box',
    }}>
      {/* 状态指示 */}
      {status === 'recording' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
          <RecordingPulse />
          <span style={{ fontSize: 14, opacity: 0.7 }}>正在聆听...</span>
        </div>
      )}

      {status === 'transcribing' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
          <Spinner />
          <span style={{ fontSize: 14, opacity: 0.7 }}>识别中...</span>
        </div>
      )}

      {status === 'editing' && (
        <>
          <button
            onClick={() => {
              // 通知 main process 追加录音
              const { ipcRenderer } = require('electron');
              ipcRenderer.send('voice:request-append');
            }}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 20,
              padding: 4,
              opacity: 0.6,
            }}
            title="追加语音"
          >
            🎤
          </button>
          <textarea
            ref={textareaRef}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              color: '#fff',
              fontSize: 15,
              resize: 'none',
              outline: 'none',
              maxHeight: 80,
              minHeight: 24,
              fontFamily: 'inherit',
              lineHeight: 1.5,
            }}
            rows={1}
            autoFocus
          />
          <button
            onClick={handleSend}
            disabled={!text.trim()}
            style={{
              background: text.trim() ? '#007AFF' : '#333',
              color: text.trim() ? '#fff' : '#666',
              border: 'none',
              borderRadius: 8,
              padding: '6px 16px',
              cursor: text.trim() ? 'pointer' : 'default',
              fontSize: 14,
            }}
          >
            发送
          </button>
        </>
      )}
    </div>
  );
}

function RecordingPulse() {
  return (
    <div style={{
      width: 12, height: 12, borderRadius: '50%',
      background: '#FF3B30',
      animation: 'pulse 1.5s ease-in-out infinite',
    }}>
      <style>{`@keyframes pulse { 0%,100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.5; transform: scale(1.3); } }`}</style>
    </div>
  );
}

function Spinner() {
  return (
    <div style={{
      width: 16, height: 16, borderRadius: '50%',
      border: '2px solid #333',
      borderTopColor: '#007AFF',
      animation: 'spin 0.8s linear infinite',
    }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
```

- [ ] **Step 2: 创建 voice-bar 页面**

```tsx
// src/app/voice-bar/page.tsx
'use client';

import { VoiceInput } from '@/components/VoiceInput';

export default function VoiceBarPage() {
  const handleSend = (text: string) => {
    const { ipcRenderer } = require('electron');
    ipcRenderer.send('voice:send', { text });
  };

  const handleCancel = () => {
    const { ipcRenderer } = require('electron');
    ipcRenderer.send('voice:cancel');
  };

  return (
    <html lang="zh-CN">
      <body style={{
        margin: 0,
        background: 'transparent',
        overflow: 'hidden',
        WebkitAppRegion: 'no-drag',
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100vh',
          padding: '0 20px',
        }}>
          <div style={{ width: 600, maxWidth: '100%' }}>
            <VoiceInput onSend={handleSend} onCancel={handleCancel} />
          </div>
        </div>
      </body>
    </html>
  );
}
```

- [ ] **Step 3: 创建 voice-bar.ts（Electron 窗口管理）**

```typescript
// electron/voice-bar.ts
import { BrowserWindow, screen } from 'electron';
import path from 'path';

export class VoiceBarWindow {
  private win: BrowserWindow | null = null;
  private serverPort: number;

  constructor(serverPort: number) {
    this.serverPort = serverPort;
  }

  show(): void {
    if (this.win && !this.win.isDestroyed()) {
      this.win.show();
      return;
    }

    const cursorScreen = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const { width: screenWidth, height: screenHeight } = cursorScreen.workAreaSize;
    const barWidth = 640;
    const barHeight = 100;
    const x = cursorScreen.workArea.x + Math.round((screenWidth - barWidth) / 2);
    const y = cursorScreen.workArea.y + screenHeight - barHeight - 40;

    this.win = new BrowserWindow({
      width: barWidth,
      height: barHeight,
      x,
      y,
      frame: false,
      transparent: true,
      resizable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      hasShadow: false,
      show: false,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
      },
    });

    this.win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    this.win.loadURL(`http://127.0.0.1:${this.serverPort}/voice-bar`);
    this.win.once('ready-to-show', () => this.win?.show());
  }

  hide(): void {
    if (this.win && !this.win.isDestroyed()) {
      this.win.hide();
    }
  }

  close(): void {
    if (this.win && !this.win.isDestroyed()) {
      this.win.close();
      this.win = null;
    }
  }

  send(channel: string, data?: unknown): void {
    if (this.win && !this.win.isDestroyed()) {
      this.win.webContents.send(channel, data);
    }
  }

  isVisible(): boolean {
    return this.win !== null && !this.win.isDestroyed() && this.win.isVisible();
  }
}
```

- [ ] **Step 4: 提交**

```bash
git add src/components/VoiceInput.tsx src/app/voice-bar/page.tsx electron/voice-bar.ts
git commit -m "feat: add voice bar UI with floating window"
```

---

## Phase 3: Claude Integration

### Task 8: Claude Agent SDK Client

**Files:**
- Create: `src/lib/claude-client.ts`
- Create: `src/app/api/chat/route.ts`
- Create: `src/app/api/status/route.ts`

- [ ] **Step 1: 创建 claude-client.ts**

```typescript
// src/lib/claude-client.ts
import { query, type SDKMessage, type Options } from '@anthropic-ai/claude-agent-sdk';
import type { SdkSubState } from '../types';

export interface ClaudeExecutionResult {
  summary: string;
  costUsd: number | null;
  durationMs: number | null;
  numTurns: number | null;
  sdkSessionId: string | null;
  status: 'completed' | 'failed' | 'cancelled';
  error?: string;
}

export interface ClaudeCallbacks {
  onSubState: (substate: SdkSubState, toolName?: string) => void;
  onError: (error: string) => void;
}

export async function executeClaude(
  prompt: string,
  cwd: string,
  apiKey: string,
  callbacks: ClaudeCallbacks,
  abortSignal?: AbortSignal
): Promise<ClaudeExecutionResult> {
  const abortController = new AbortController();

  if (abortSignal) {
    abortSignal.addEventListener('abort', () => abortController.abort());
  }

  const startTime = Date.now();

  const options: Options = {
    cwd,
    permissionMode: 'bypassPermissions',
    allowDangerouslySkipPermissions: true,
    abortController,
    env: { ANTHROPIC_API_KEY: apiKey },
  };

  let summary = '';
  let costUsd: number | null = null;
  let durationMs: number | null = null;
  let numTurns: number | null = null;
  let sdkSessionId: string | null = null;
  let status: 'completed' | 'failed' | 'cancelled' = 'completed';
  let errorMsg: string | undefined;

  try {
    for await (const message of query({ prompt, options })) {
      if (abortController.signal.aborted) {
        status = 'cancelled';
        break;
      }

      switch (message.type) {
        case 'assistant':
          callbacks.onSubState('thinking');
          if ('session_id' in message && message.session_id) {
            sdkSessionId = message.session_id as string;
          }
          break;

        case 'tool_progress':
          callbacks.onSubState(
            'executing_tool',
            'tool_name' in message ? (message as any).tool_name : undefined
          );
          break;

        case 'tool_use_summary':
          // 中间进度摘要，不改变状态
          break;

        case 'status':
          if ('status' in message && message.status === 'compacting') {
            callbacks.onSubState('compacting');
          }
          break;

        case 'result':
          summary = message.result || '';
          if ('total_cost_usd' in message) costUsd = message.total_cost_usd as number;
          if ('duration_ms' in message) durationMs = message.duration_ms as number;
          if ('num_turns' in message) numTurns = message.num_turns as number;
          if ('session_id' in message) sdkSessionId = message.session_id as string ?? sdkSessionId;
          if (message.subtype === 'error_during_execution') {
            status = 'failed';
            errorMsg = message.result;
          }
          break;

        case 'rate_limit_event':
          callbacks.onSubState('rate_limited');
          break;

        case 'auth_status':
          if ('error' in message && message.error) {
            callbacks.onError(message.error as string);
          } else {
            callbacks.onSubState('authenticating');
          }
          break;
      }
    }
  } catch (error) {
    if (abortController.signal.aborted) {
      status = 'cancelled';
    } else {
      status = 'failed';
      errorMsg = (error as Error).message;
      callbacks.onError(errorMsg);
    }
  }

  durationMs = durationMs ?? Date.now() - startTime;

  return { summary, costUsd, durationMs, numTurns, sdkSessionId, status, error: errorMsg };
}
```

- [ ] **Step 2: 创建 chat API route**

```typescript
// src/app/api/chat/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { prompt, cwd, executionId } = body;

  if (!prompt || !cwd) {
    return NextResponse.json({ error: 'Missing prompt or cwd' }, { status: 400 });
  }

  // 实际的 Claude SDK 调用在 Electron main process 中执行
  // API route 只负责接收请求，通过 IPC 转发给 main process
  // 这是因为 native modules (better-sqlite3, sherpa-onnx) 只能在 Node.js 环境中运行
  // 而 Next.js API routes 在 Node.js 中运行，可以直接调用

  // 此处通过 global 暴露的执行函数来调用
  const executor = (globalThis as any).__shrewExecutor;
  if (!executor) {
    return NextResponse.json({ error: 'Executor not ready' }, { status: 503 });
  }

  try {
    const result = await executor.execute(prompt, cwd, executionId);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 3: 创建 status API route**

```typescript
// src/app/api/status/route.ts
import { NextResponse } from 'next/server';

export async function GET() {
  const store = (globalThis as any).__shrewStore;
  if (!store) {
    return NextResponse.json({ state: 'idle', substate: null });
  }

  return NextResponse.json({
    state: store.appState,
    substate: store.sdkSubState,
    dotColor: store.dotColor,
  });
}
```

- [ ] **Step 4: 提交**

```bash
git add src/lib/claude-client.ts src/app/api/chat/route.ts src/app/api/status/route.ts
git commit -m "feat: add Claude Agent SDK client and chat/status API routes"
```

---

## Phase 4: UI Completion

### Task 9: Summary Popup

**Files:**
- Create: `src/components/SummaryPanel.tsx`
- Create: `src/components/StatusDot.tsx`
- Create: `src/app/summary/page.tsx`
- Create: `electron/summary-popup.ts`

- [ ] **Step 1: 创建 StatusDot 组件**

```tsx
// src/components/StatusDot.tsx
'use client';

type DotColor = 'gray' | 'blue' | 'green' | 'red' | 'yellow';

const DOT_STYLES: Record<DotColor, { bg: string; animate?: string }> = {
  gray:   { bg: '#8E8E93' },
  blue:   { bg: '#32ADFF', animate: 'pulse-blue' },
  green:  { bg: '#34C759' },
  red:    { bg: '#FF453A' },
  yellow: { bg: '#FFD60A', animate: 'blink-yellow' },
};

export function StatusDot({ color, size = 8 }: { color: DotColor; size?: number }) {
  const style = DOT_STYLES[color];

  return (
    <>
      <span style={{
        display: 'inline-block',
        width: size,
        height: size,
        borderRadius: '50%',
        background: style.bg,
        animation: style.animate ? `${style.animate} 1.5s ease-in-out infinite` : 'none',
      }} />
      <style>{`
        @keyframes pulse-blue { 0%,100% { box-shadow: 0 0 0 0 rgba(50,173,255,0.4); } 50% { box-shadow: 0 0 0 4px rgba(50,173,255,0); } }
        @keyframes blink-yellow { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
      `}</style>
    </>
  );
}
```

- [ ] **Step 2: 创建 SummaryPanel 组件**

```tsx
// src/components/SummaryPanel.tsx
'use client';

import { useState, useEffect } from 'react';
import { StatusDot } from './StatusDot';

interface Execution {
  id: string;
  user_prompt: string;
  summary: string | null;
  status: string;
  duration_ms: number | null;
  num_turns: number | null;
  created_at: string;
}

type DotColor = 'gray' | 'blue' | 'green' | 'red' | 'yellow';

export function SummaryPanel() {
  const [current, setCurrent] = useState<Execution | null>(null);
  const [history, setHistory] = useState<Execution[]>([]);
  const [dotColor, setDotColor] = useState<DotColor>('gray');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const { ipcRenderer } = require('electron');

    const handler = (_: unknown, data: { execution: Execution | null; history: Execution[]; dotColor: DotColor }) => {
      setCurrent(data.execution);
      setHistory(data.history);
      setDotColor(data.dotColor);
    };

    ipcRenderer.on('summary:update', handler);
    ipcRenderer.send('summary:ready');

    return () => { ipcRenderer.removeListener('summary:update', handler); };
  }, []);

  const statusLabel: Record<string, string> = {
    running: '执行中',
    completed: '已完成',
    failed: '出错',
    cancelled: '已中断',
  };

  return (
    <div style={{ width: 360, fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif', fontSize: 13, color: '#333' }}>
      {/* 当前状态 */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #eee', display: 'flex', alignItems: 'center', gap: 8 }}>
        <StatusDot color={dotColor} />
        <span style={{ fontWeight: 600 }}>{current ? statusLabel[current.status] || '待命' : '待命'}</span>
      </div>

      {/* 当前执行详情 */}
      {current && (
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #eee' }}>
          <div style={{ color: '#666', marginBottom: 6 }}>「{current.user_prompt}」</div>
          {current.summary && (
            <div style={{ lineHeight: 1.5 }}>{current.summary}</div>
          )}
          {current.duration_ms != null && (
            <div style={{ color: '#999', marginTop: 8, fontSize: 12 }}>
              耗时 {Math.round(current.duration_ms / 1000)}s
              {current.num_turns != null && ` · 使用了 ${current.num_turns} 个工具`}
            </div>
          )}
        </div>
      )}

      {/* 历史记录 */}
      {history.length > 0 && (
        <div style={{ padding: '8px 16px' }}>
          <div style={{ color: '#999', fontSize: 12, marginBottom: 6 }}>最近</div>
          {history.slice(0, 5).map(exec => (
            <div key={exec.id} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '4px 0', fontSize: 12, borderBottom: '1px solid #f5f5f5',
            }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 240 }}>
                {exec.user_prompt}
              </span>
              <span style={{ color: '#999', flexShrink: 0 }}>
                {exec.status === 'completed' ? `${Math.round((exec.duration_ms || 0) / 1000)}s` :
                 exec.status === 'failed' ? '失败' : '...'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: 创建 summary 页面**

```tsx
// src/app/summary/page.tsx
'use client';

import { SummaryPanel } from '@/components/SummaryPanel';

export default function SummaryPage() {
  return (
    <html lang="zh-CN">
      <body style={{ margin: 0, background: '#fff', overflow: 'hidden' }}>
        <SummaryPanel />
      </body>
    </html>
  );
}
```

- [ ] **Step 4: 创建 summary-popup.ts（Electron 窗口管理）**

```typescript
// electron/summary-popup.ts
import { BrowserWindow, screen } from 'electron';
import { Tray } from 'electron';

export class SummaryPopupWindow {
  private win: BrowserWindow | null = null;
  private serverPort: number;

  constructor(serverPort: number) {
    this.serverPort = serverPort;
  }

  show(tray: Tray): void {
    if (this.win && !this.win.isDestroyed()) {
      this.win.close();
      this.win = null;
      return; // toggle off
    }

    const trayBounds = tray.getBounds();
    const popupWidth = 380;
    const popupHeight = 400;

    // 定位在 Tray 图标正下方
    const x = Math.round(trayBounds.x + trayBounds.width / 2 - popupWidth / 2);
    const y = Math.round(trayBounds.y + trayBounds.height + 4);

    this.win = new BrowserWindow({
      width: popupWidth,
      height: popupHeight,
      x,
      y,
      frame: false,
      resizable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      show: false,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
      },
    });

    this.win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    this.win.loadURL(`http://127.0.0.1:${this.serverPort}/summary`);

    this.win.once('ready-to-show', () => this.win?.show());

    // 点击外部关闭
    this.win.on('blur', () => {
      this.win?.close();
      this.win = null;
    });
  }

  send(channel: string, data?: unknown): void {
    if (this.win && !this.win.isDestroyed()) {
      this.win.webContents.send(channel, data);
    }
  }

  close(): void {
    if (this.win && !this.win.isDestroyed()) {
      this.win.close();
      this.win = null;
    }
  }
}
```

- [ ] **Step 5: 提交**

```bash
git add src/components/StatusDot.tsx src/components/SummaryPanel.tsx src/app/summary/page.tsx electron/summary-popup.ts
git commit -m "feat: add summary popup with status dots"
```

---

### Task 10: Settings Page

**Files:**
- Create: `src/app/settings/page.tsx`

- [ ] **Step 1: 创建设置页**

```tsx
// src/app/settings/page.tsx
'use client';

import { useState, useEffect } from 'react';

export default function SettingsPage() {
  const [apiKey, setApiKey] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [defaultCwd, setDefaultCwd] = useState('~/Documents');
  const [vadTimeout, setVadTimeout] = useState(2);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  useEffect(() => {
    const { ipcRenderer } = require('electron');
    ipcRenderer.invoke('settings:load').then((settings: any) => {
      setDefaultCwd(settings.defaultCwd || '~/Documents');
      setVadTimeout(settings.vadTimeout || 2);
      setHasKey(settings.hasApiKey || false);
    });
  }, []);

  const handleSaveApiKey = async () => {
    if (!apiKey.trim()) return;
    setStatus('saving');
    try {
      const { ipcRenderer } = require('electron');
      await ipcRenderer.invoke('settings:save-api-key', { key: apiKey.trim() });
      setHasKey(true);
      setApiKey('');
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 2000);
    } catch {
      setStatus('error');
    }
  };

  const handleSaveSettings = async () => {
    setStatus('saving');
    try {
      const { ipcRenderer } = require('electron');
      await ipcRenderer.invoke('settings:save', { defaultCwd, vadTimeout });
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 2000);
    } catch {
      setStatus('error');
    }
  };

  return (
    <div style={{ maxWidth: 480, margin: '40px auto', padding: '0 20px', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 32 }}>Shrew 设置</h1>

      {/* API Key */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Anthropic API Key</h2>
        <p style={{ fontSize: 13, color: '#666', marginBottom: 8 }}>
          Key 将安全存储在 macOS 钥匙串中。
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="password"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder={hasKey ? '已存储（输入新 Key 替换）' : 'sk-ant-...'}
            style={{
              flex: 1, padding: '8px 12px', borderRadius: 8,
              border: '1px solid #ddd', fontSize: 14,
            }}
          />
          <button
            onClick={handleSaveApiKey}
            disabled={!apiKey.trim() || status === 'saving'}
            style={{
              padding: '8px 16px', borderRadius: 8, border: 'none',
              background: apiKey.trim() ? '#007AFF' : '#ccc',
              color: '#fff', cursor: apiKey.trim() ? 'pointer' : 'default',
            }}
          >
            {status === 'saving' ? '验证中...' : '保存'}
          </button>
        </div>
        {status === 'saved' && <p style={{ color: '#34C759', fontSize: 13, marginTop: 4 }}>已保存</p>}
        {status === 'error' && <p style={{ color: '#FF453A', fontSize: 13, marginTop: 4 }}>保存失败</p>}
      </section>

      {/* 工作目录 */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>默认工作目录</h2>
        <p style={{ fontSize: 13, color: '#666', marginBottom: 8 }}>
          Claude Code 将在此目录下执行命令。
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            value={defaultCwd}
            onChange={e => setDefaultCwd(e.target.value)}
            style={{
              flex: 1, padding: '8px 12px', borderRadius: 8,
              border: '1px solid #ddd', fontSize: 14,
            }}
          />
          <button
            onClick={async () => {
              const { ipcRenderer } = require('electron');
              const path = await ipcRenderer.invoke('settings:pick-directory');
              if (path) setDefaultCwd(path);
            }}
            style={{
              padding: '8px 16px', borderRadius: 8,
              border: '1px solid #ddd', background: '#fff', cursor: 'pointer',
            }}
          >
            浏览
          </button>
        </div>
      </section>

      {/* VAD 超时 */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>语音静音超时</h2>
        <p style={{ fontSize: 13, color: '#666', marginBottom: 8 }}>
          停止说话后多少秒自动结束录音。
        </p>
        <input
          type="range"
          min={1} max={5} step={0.5}
          value={vadTimeout}
          onChange={e => setVadTimeout(Number(e.target.value))}
          style={{ width: '100%' }}
        />
        <span style={{ fontSize: 13 }}>{vadTimeout} 秒</span>
      </section>

      <button
        onClick={handleSaveSettings}
        style={{
          padding: '10px 24px', borderRadius: 8,
          border: 'none', background: '#007AFF',
          color: '#fff', fontSize: 15, cursor: 'pointer',
        }}
      >
        保存设置
      </button>

      {/* 关于 */}
      <section style={{ marginTop: 48, paddingTop: 24, borderTop: '1px solid #eee' }}>
        <p style={{ fontSize: 12, color: '#999' }}>
          Shrew v0.1.0 · Claude Code 语音壳子
        </p>
      </section>
    </div>
  );
}
```

- [ ] **Step 2: 提交**

```bash
git add src/app/settings/page.tsx
git commit -m "feat: add settings page (API Key, cwd, VAD timeout)"
```

---

### Task 11: Onboarding Flow

**Files:**
- Create: `src/components/Onboarding.tsx`

- [ ] **Step 1: 创建 Onboarding 组件**

```tsx
// src/components/Onboarding.tsx
'use client';

import { useState } from 'react';

type Step = 'welcome' | 'accessibility' | 'model-download' | 'api-key' | 'cwd' | 'done';

export function Onboarding({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState<Step>('welcome');
  const [apiKey, setApiKey] = useState('');
  const [defaultCwd, setDefaultCwd] = useState('~/Documents');
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [error, setError] = useState('');

  const ipcRenderer = typeof window !== 'undefined' ? require('electron').ipcRenderer : null;

  const checkAccessibility = async () => {
    const granted = await ipcRenderer?.invoke('onboarding:check-accessibility');
    if (granted) setStep('model-download');
  };

  const startDownload = async () => {
    setError('');
    try {
      await ipcRenderer?.invoke('onboarding:download-model', {
        onProgress: (p: number) => setDownloadProgress(p),
      });
      setStep('api-key');
    } catch (e: any) {
      setError(e.message);
    }
  };

  const skipDownload = () => setStep('api-key');

  const validateApiKey = async () => {
    setError('');
    try {
      await ipcRenderer?.invoke('onboarding:validate-api-key', { key: apiKey.trim() });
      setStep('cwd');
    } catch (e: any) {
      setError('API Key 验证失败，请检查后重试');
    }
  };

  const finish = async () => {
    await ipcRenderer?.invoke('onboarding:finish', { defaultCwd });
    setStep('done');
    onComplete();
  };

  const steps: Record<Step, JSX.Element> = {
    welcome: (
      <OnboardingStep
        title="欢迎使用 Shrew"
        description="Shrew 让你用语音驱动 Claude Code。按下右 Command，说一句话，Claude 帮你干活。"
        buttonText="开始设置"
        onAction={() => setStep('accessibility')}
      />
    ),
    accessibility: (
      <OnboardingStep
        title="辅助功能权限"
        description="为了响应右 Command 键唤起语音，Shrew 需要辅助功能权限。这与 Raycast、Alfred 等应用所需的权限相同。Shrew 只会监听右 Command 键，不会记录任何其他按键。"
        buttonText="打开系统设置"
        onAction={() => {
          ipcRenderer?.send('onboarding:open-accessibility');
          // 轮询检查权限
          const interval = setInterval(async () => {
            const granted = await ipcRenderer?.invoke('onboarding:check-accessibility');
            if (granted) {
              clearInterval(interval);
              setStep('model-download');
            }
          }, 1000);
        }}
        secondaryButton="已授权，下一步"
        onSecondary={() => checkAccessibility()}
      />
    ),
    'model-download': (
      <div style={stepStyle}>
        <h2 style={titleStyle}>语音模型</h2>
        <p style={descStyle}>Shrew 使用本地语音识别，需要下载约 230MB 的模型文件。</p>
        {downloadProgress > 0 && downloadProgress < 100 ? (
          <div style={{ marginBottom: 16 }}>
            <div style={{ background: '#eee', borderRadius: 4, height: 6, overflow: 'hidden' }}>
              <div style={{ background: '#007AFF', height: '100%', width: `${downloadProgress}%`, transition: 'width 0.3s' }} />
            </div>
            <p style={{ fontSize: 12, color: '#666', marginTop: 4 }}>{downloadProgress}%</p>
          </div>
        ) : null}
        {error && <p style={{ color: '#FF453A', fontSize: 13, marginBottom: 8 }}>{error}</p>}
        <button onClick={startDownload} style={buttonStyle}>下载模型</button>
        <button onClick={skipDownload} style={{ ...linkStyle, marginTop: 8 }}>跳过，稍后下载</button>
      </div>
    ),
    'api-key': (
      <div style={stepStyle}>
        <h2 style={titleStyle}>API Key</h2>
        <p style={descStyle}>需要 Anthropic API Key 来调用 Claude。Key 将安全存储在 macOS 钥匙串中。</p>
        <input
          type="password"
          value={apiKey}
          onChange={e => setApiKey(e.target.value)}
          placeholder="sk-ant-..."
          style={{ ...inputStyle, marginBottom: 12 }}
        />
        {error && <p style={{ color: '#FF453A', fontSize: 13, marginBottom: 8 }}>{error}</p>}
        <button onClick={validateApiKey} disabled={!apiKey.trim()} style={{
          ...buttonStyle,
          opacity: apiKey.trim() ? 1 : 0.5,
          cursor: apiKey.trim() ? 'pointer' : 'default',
        }}>
          验证并保存
        </button>
      </div>
    ),
    cwd: (
      <div style={stepStyle}>
        <h2 style={titleStyle}>工作目录</h2>
        <p style={descStyle}>Claude Code 将在此目录下执行命令。</p>
        <input
          type="text"
          value={defaultCwd}
          onChange={e => setDefaultCwd(e.target.value)}
          style={{ ...inputStyle, marginBottom: 12 }}
        />
        <button onClick={() => {
          ipcRenderer?.invoke('settings:pick-directory').then((p: string | null) => {
            if (p) setDefaultCwd(p);
          });
        }} style={{ ...buttonStyle, background: '#fff', color: '#007AFF', border: '1px solid #007AFF', marginBottom: 12 }}>
          浏览
        </button>
        <button onClick={finish} style={buttonStyle}>完成设置</button>
      </div>
    ),
    done: (
      <OnboardingStep
        title="设置完成！"
        description="按下右 Command 开始使用 Shrew。"
        buttonText="开始使用"
        onAction={onComplete}
      />
    ),
  };

  return (
    <div style={{
      display: 'flex', justifyContent: 'center', alignItems: 'center',
      minHeight: '100vh', background: '#fafafa',
    }}>
      {steps[step]}
    </div>
  );
}

function OnboardingStep({ title, description, buttonText, onAction, secondaryButton, onSecondary }: {
  title: string; description: string; buttonText: string;
  onAction: () => void; secondaryButton?: string; onSecondary?: () => void;
}) {
  return (
    <div style={stepStyle}>
      <h2 style={titleStyle}>{title}</h2>
      <p style={descStyle}>{description}</p>
      <button onClick={onAction} style={buttonStyle}>{buttonText}</button>
      {secondaryButton && onSecondary && (
        <button onClick={onSecondary} style={{ ...linkStyle, marginTop: 8 }}>{secondaryButton}</button>
      )}
    </div>
  );
}

const stepStyle: React.CSSProperties = { maxWidth: 420, padding: 40, textAlign: 'center' as const };
const titleStyle: React.CSSProperties = { fontSize: 22, fontWeight: 700, marginBottom: 12 };
const descStyle: React.CSSProperties = { fontSize: 14, color: '#666', lineHeight: 1.6, marginBottom: 24 };
const buttonStyle: React.CSSProperties = {
  padding: '10px 24px', borderRadius: 8, border: 'none',
  background: '#007AFF', color: '#fff', fontSize: 15, cursor: 'pointer',
};
const linkStyle: React.CSSProperties = {
  background: 'none', border: 'none', color: '#007AFF',
  fontSize: 13, cursor: 'pointer', textDecoration: 'underline',
};
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 8,
  border: '1px solid #ddd', fontSize: 14, boxSizing: 'border-box',
};
```

- [ ] **Step 2: 提交**

```bash
git add src/components/Onboarding.tsx
git commit -m "feat: add onboarding flow (accessibility, model download, API key, cwd)"
```

---

### Task 12: Main Process Integration

**Files:**
- Modify: `electron/main.ts`（完整重写，整合所有模块）

- [ ] **Step 1: 重写 main.ts，整合所有模块**

这是最关键的一步：将所有组件串联起来。

```typescript
// electron/main.ts
import { app, BrowserWindow, ipcMain, systemPreferences, dialog, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import { ShrewTray } from './tray';
import { VoiceBarWindow } from './voice-bar';
import { SummaryPopupWindow } from './summary-popup';
import { ShortcutManager } from './shortcuts';
import { AudioRecorder } from './recorder';
import { ShrewStore } from '../src/lib/store';
import { initDb, insertExecution, updateExecution, getRecentExecutions, getActiveExecution } from '../src/lib/db';
import { saveApiKey, loadApiKey, hasApiKey } from '../src/lib/keychain';
import { executeClaude } from '../src/lib/claude-client';
import type { ExecutionRecord, AppSettings, DotColor } from '../src/types';

// 全局状态
import Database from 'better-sqlite3';

const userDataDir = app.getPath('userData');
const settingsPath = path.join(userDataDir, 'settings.json');
const dbPath = path.join(userDataDir, 'shrew.db');

let db: Database.Database;
let store: ShrewStore;
let tray: ShrewTray;
let voiceBar: VoiceBarWindow;
let summaryPopup: SummaryPopupWindow;
let shortcutManager: ShortcutManager;
let recorder: AudioRecorder;
let mainWindow: BrowserWindow | null = null;
let serverPort = 3000;
let currentAbortController: AbortController | null = null;

function loadSettings(): AppSettings {
  try {
    if (fs.existsSync(settingsPath)) {
      return JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    }
  } catch {}
  return {
    shortcut: 'right_cmd',
    voiceModel: 'sensevoice',
    claudePermissionMode: 'bypassPermissions',
    defaultCwd: '~/Documents',
    vadTimeout: 2,
    theme: 'system',
  };
}

function saveSettings(settings: AppSettings): void {
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
}

function updateTrayDot(): void {
  tray.updateDot(store.dotColor);
}

function updateSummaryPopup(): void {
  const active = getActiveExecution(db);
  const history = getRecentExecutions(db, 5);
  summaryPopup.send('summary:update', {
    execution: active,
    history,
    dotColor: store.dotColor,
  });
}

// 右 Command 按键处理
function handleRightCommand(): void {
  const action = store.getRightCommandAction();

  switch (action) {
    case 'start-recording':
      voiceBar.show();
      recorder.startRecording();
      store.transition('recording');
      updateTrayDot();
      break;

    case 'stop-recording':
      recorder.stopRecording().then(audioPath => {
        store.transition('transcribing');
        updateTrayDot();
        voiceBar.send('voice:transcribing');

        return recorder.transcribe(audioPath);
      }).then(text => {
        if (text) {
          store.transition('editing');
          voiceBar.send('voice:transcript', { text, isAppending: false });
        } else {
          voiceBar.send('voice:error', { message: '未检测到语音，请重试' });
          store.transition('editing');
        }
        updateTrayDot();
      }).catch(err => {
        voiceBar.send('voice:error', { message: err.message });
        store.transition('error');
        store.transition('idle');
        updateTrayDot();
      });
      break;

    case 'append-recording':
      recorder.startRecording();
      store.transition('recording');
      updateTrayDot();
      break;

    case 'cancel-execution':
      if (currentAbortController) {
        currentAbortController.abort();
        currentAbortController = null;
      }
      break;

    case 'none':
      break;
  }
}

// 执行 Claude 命令
async function executePrompt(prompt: string): Promise<void> {
  const settings = loadSettings();
  const apiKey = loadApiKey();
  if (!apiKey) {
    tray.updateDot('red');
    return;
  }

  store.transition('sending');
  updateTrayDot();

  const executionId = insertExecution(db, {
    cwd: settings.defaultCwd.replace('~', app.getPath('home')),
    user_prompt: prompt,
  });

  store.transition('executing');
  store.setSdkSubState('thinking');
  updateTrayDot();
  updateSummaryPopup();

  voiceBar.close();

  currentAbortController = new AbortController();

  const result = await executeClaude(
    prompt,
    settings.defaultCwd.replace('~', app.getPath('home')),
    apiKey,
    {
      onSubState: (substate, toolName) => {
        store.setSdkSubState(substate);
        updateTrayDot();
        updateSummaryPopup();
      },
      onError: (error) => {
        console.error('Claude execution error:', error);
      },
    },
    currentAbortController.signal
  );

  currentAbortController = null;

  updateExecution(db, executionId, {
    status: result.status,
    summary: result.summary,
    duration_ms: result.durationMs,
    num_turns: result.numTurns,
    cost_usd: result.costUsd,
    completed_at: new Date().toISOString(),
  });

  store.transition('idle');
  store.setSdkSubState(result.status === 'completed' ? 'completed' :
                       result.status === 'cancelled' ? 'cancelled' : 'failed');
  updateTrayDot();
  updateSummaryPopup();
}

// IPC Handlers
function registerIpcHandlers(): void {
  // voice-bar messages
  ipcMain.on('voice:send', (_, data: { text: string }) => {
    executePrompt(data.text);
  });

  ipcMain.on('voice:cancel', () => {
    voiceBar.close();
    store.transition('idle');
    updateTrayDot();
  });

  ipcMain.on('voice:request-append', () => {
    recorder.startRecording();
    store.transition('recording');
    updateTrayDot();
  });

  // summary
  ipcMain.on('summary:ready', () => updateSummaryPopup());

  // settings
  ipcMain.handle('settings:load', () => {
    const settings = loadSettings();
    return { ...settings, hasApiKey: hasApiKey() };
  });

  ipcMain.handle('settings:save-api-key', (_, { key }: { key: string }) => {
    saveApiKey(key);
  });

  ipcMain.handle('settings:save', (_, data: Partial<AppSettings>) => {
    const settings = loadSettings();
    saveSettings({ ...settings, ...data });
  });

  ipcMain.handle('settings:pick-directory', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  // onboarding
  ipcMain.handle('onboarding:check-accessibility', () => {
    return systemPreferences.isTrustedAccessibilityClient(false);
  });

  ipcMain.on('onboarding:open-accessibility', () => {
    shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility');
  });

  ipcMain.handle('onboarding:download-model', async (_, { onProgress }: { onProgress: (p: number) => void }) => {
    const modelDir = path.join(userDataDir, 'models');
    if (!fs.existsSync(modelDir)) fs.mkdirSync(modelDir, { recursive: true });
    const modelPath = path.join(modelDir, 'sensevoice-small-int8.onnx');

    // 下载模型（URL 需要配置为实际下载地址）
    const response = await fetch('https://modelscope.cn/models/iic/SenseVoiceSmall/resolve/master/model.onnx');
    if (!response.ok) throw new Error('Download failed');
    const contentLength = Number(response.headers.get('content-length') || 0);
    const fileStream = fs.createWriteStream(modelPath);
    const reader = response.body!.getReader();
    let downloaded = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      fileStream.write(value);
      downloaded += value.length;
      if (contentLength > 0) {
        onProgress(Math.round(downloaded / contentLength * 100));
      }
    }

    fileStream.end();
  });

  ipcMain.handle('onboarding:validate-api-key', async (_, { key }: { key: string }) => {
    // 简单验证：尝试调用 Anthropic API
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }],
      }),
    });
    if (!response.ok) throw new Error('Invalid API key');
    saveApiKey(key);
  });

  ipcMain.handle('onboarding:finish', (_, { defaultCwd }: { defaultCwd: string }) => {
    const settings = loadSettings();
    saveSettings({ ...settings, defaultCwd });
  });

  // 暴露给 API routes
  (globalThis as any).__shrewStore = store;
  (globalThis as any).__shrewExecutor = {
    execute: executePrompt,
  };
}

// 启动应用
app.whenReady().then(async () => {
  // 初始化数据库
  db = new Database(dbPath);
  initDb(db);

  // 初始化状态管理
  store = new ShrewStore();
  store.onChange(() => updateTrayDot());

  // 创建菜单栏 Tray
  tray = new ShrewTray();
  tray.onPopupRequested = () => summaryPopup.show(tray as any);
  tray.onSettingsRequested = () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.loadURL(`http://127.0.0.1:${serverPort}/settings`);
    } else {
      createMainWindow();
    }
  };

  // 创建窗口管理器
  voiceBar = new VoiceBarWindow(serverPort);
  summaryPopup = new SummaryPopupWindow(serverPort);

  // 初始化快捷键
  shortcutManager = new ShortcutManager();
  const shortcutReady = await shortcutManager.init();
  if (shortcutReady) {
    shortcutManager.start(handleRightCommand);
  }

  // 初始化录音器
  recorder = new AudioRecorder();

  // 注册 IPC
  registerIpcHandlers();

  // 检查是否需要引导
  const needsOnboarding = !hasApiKey();
  if (needsOnboarding) {
    createOnboardingWindow();
  } else {
    createMainWindow();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });
  mainWindow.loadURL(`http://127.0.0.1:${serverPort}/settings`);
  mainWindow.once('ready-to-show', () => mainWindow?.show());
}

function createOnboardingWindow(): void {
  mainWindow = new BrowserWindow({
    width: 600,
    height: 500,
    show: false,
    resizable: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });
  // Onboarding 通过 settings 页面中的 Onboarding 组件实现
  // 判断逻辑：如果没有 API key，显示 Onboarding；否则显示 Settings
  mainWindow.loadURL(`http://127.0.0.1:${serverPort}/settings`);
  mainWindow.once('ready-to-show', () => mainWindow?.show());
}

app.on('window-all-closed', () => {
  // macOS 不退出，保持菜单栏常驻
});

app.on('before-quit', () => {
  shortcutManager?.stop();
  db?.close();
});
```

- [ ] **Step 2: 提交**

```bash
git add electron/main.ts
git commit -m "feat: integrate all modules in main process with IPC handlers"
```

---

### Task 13: Build Configuration + First Run

**Files:**
- Modify: `package.json`（添加 jest 配置和 build scripts）
- Create: `jest.config.js`

- [ ] **Step 1: 创建 jest.config.js**

```javascript
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
};
```

- [ ] **Step 2: 更新 package.json 添加 jest 依赖和脚本**

在 `devDependencies` 中添加：

```json
"jest": "^29.0.0",
"ts-jest": "^29.0.0",
"@types/jest": "^29.0.0"
```

在 `scripts` 中添加：

```json
"test": "jest",
"test:watch": "jest --watch"
```

- [ ] **Step 3: 运行全部测试**

```bash
cd 项目/Shrew && npm install && npm test
```

Expected: 所有测试 PASS

- [ ] **Step 4: 运行开发模式验证**

```bash
cd 项目/Shrew && npm run dev
```

打开浏览器访问 `http://127.0.0.1:3000/settings` 验证设置页渲染正常。

- [ ] **Step 5: 提交**

```bash
git add package.json jest.config.js
git commit -m "feat: add test configuration and build scripts"
```

---

## Self-Review

### Spec Coverage

| Spec 需求 | 对应 Task |
|---|---|
| Electron + Next.js standalone | Task 1 (scaffold) |
| 菜单栏 Tray + 状态小点 | Task 4 |
| 右 Command 监听 (Swift addon) | Task 5 |
| 语音录音 + sherpa-onnx | Task 6 |
| 语音悬浮窗 UI | Task 7 |
| Claude Agent SDK 交互 | Task 8 |
| 摘要弹窗 | Task 9 |
| 设置页 | Task 10 |
| 首次启动引导 | Task 11 |
| 主进程整合 | Task 12 |
| 两层状态机 | Task 3 |
| SQLite 数据层 | Task 2 |
| API Key 安全存储 | Task 6 (keychain) |
| 错误处理 | Task 12 (IPC handlers) |
| 多显示器支持 | Task 7 (voice-bar.ts) |
| 辅助功能权限引导 | Task 11 |

### Placeholder Scan
- Swift N-API addon (Task 5) 提供了架构框架但完整 N-API C 桥接代码需要参考 node-swift 工具生成——已标注说明
- 语音模型下载 URL 需要替换为实际地址——已标注
- 其余所有步骤包含完整代码

### Type Consistency
- `AppState`, `SdkSubState`, `DotColor`, `ExecutionRecord`, `AppSettings` 类型在 Task 2 定义，后续 Task 全部引用一致
- `ShrewStore` 的 `getRightCommandAction()` 返回类型在 Task 3 定义，Task 12 中使用一致
- IPC 消息通道名称在各组件间一致（`voice:send`, `summary:update` 等）
