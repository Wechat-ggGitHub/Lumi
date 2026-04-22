# Testing Patterns

**Analysis Date:** 2026-04-22

## Test Framework

**Runner:**
- Jest 30 with ts-jest 29
- Config: `jest.config.ts`
- Environment: `node` (not `jsdom`)
- TypeScript compiled via `ts-jest` preset

**Assertion Library:**
- Jest built-in (`expect`, `toBe`, `toBeNull`, `toBeTruthy`, etc.)

**Run Commands:**
```bash
npx jest                    # Run all tests
npx jest src/__tests__/store.test.ts   # Run single test file
npx jest --watch            # Watch mode (not configured but available)
```

**Jest Configuration (`jest.config.ts`):**
```typescript
import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
};

export default config;
```

Key settings:
- `roots: ['<rootDir>/src']` -- only looks for tests in `src/`
- `moduleNameMapper` -- resolves `@/*` path alias to `src/*`
- No coverage configuration
- No `setupFiles` or `setupFilesAfterFramework`

## Test File Organization

**Location:**
- All tests in a single directory: `src/__tests__/`
- Co-located test pattern NOT used (tests are centralized)
- No tests exist for `electron/` modules

**Naming:**
- `<module-name>.test.ts` mirrors the source file name
- Current test files:
  - `src/__tests__/store.test.ts` tests `src/lib/store.ts`
  - `src/__tests__/db.test.ts` tests `src/lib/db.ts`

**Structure:**
```
src/
├── __tests__/
│   ├── db.test.ts          # Database operations tests
│   └── store.test.ts       # State machine tests
├── lib/
│   ├── db.ts               # Source under test
│   └── store.ts            # Source under test
└── ...
```

## Test Structure

**Suite Organization:**
- No `describe()` blocks used -- each test is a top-level `test()` call
- Tests are independent and self-contained
- No shared state between tests (each test creates its own instances)

**Store Tests Pattern (`src/__tests__/store.test.ts`):**
```typescript
import { ShrewStore } from '../lib/store';

test('initial state is idle with no substate', () => {
  const store = new ShrewStore();
  expect(store.appState).toBe('idle');
  expect(store.sdkSubState).toBeNull();
});

test('transition: idle -> recording -> transcribing -> editing', () => {
  const store = new ShrewStore();
  store.transition('recording');
  expect(store.appState).toBe('recording');
  store.transition('transcribing');
  expect(store.appState).toBe('transcribing');
  store.transition('editing');
  expect(store.appState).toBe('editing');
});
```

**Database Tests Pattern (`src/__tests__/db.test.ts`):**
```typescript
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { initDb, insertExecution, updateExecution, getRecentExecutions, getActiveExecution } from '../lib/db';

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
  const id = insertExecution(db, { cwd: '/Users/test/project', user_prompt: '...' });
  expect(id).toBeTruthy();
  const active = getActiveExecution(db);
  expect(active).not.toBeNull();
  expect(active!.user_prompt).toBe('...');
  expect(active!.status).toBe('running');
});
```

**Patterns:**
- **Setup:** `beforeAll` creates temp directory; `beforeEach` creates fresh DB per test
- **Teardown:** `afterEach` closes DB; `afterAll` removes temp directory
- **Assertion style:** Direct `expect(value).toBe(expected)` -- no fancy matchers
- **Non-null assertion:** Uses `!` operator after null checks: `expect(active!.user_prompt)`
- **Chinese strings in test data:** Test data uses Chinese text matching real-world usage

## Mocking

**Framework:** Jest built-in mocking (not heavily used)

**Current Usage:**
- No mocks are used in existing tests
- Store tests test the real `ShrewStore` class directly
- Database tests use a real `better-sqlite3` instance with temporary file
- No `jest.mock()` calls found anywhere in the codebase

**What to Mock (guidelines for future tests):**
- Electron APIs (`app`, `BrowserWindow`, `ipcMain`, `safeStorage`) when testing `electron/` modules
- Native modules (`sherpa-onnx-node`, `uiohook-napi`) that require native binaries
- File system operations when testing `src/lib/keychain.ts`
- Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) when testing `src/lib/claude-client.ts`

**What NOT to Mock:**
- `ShrewStore` -- it is a pure TypeScript class with no dependencies
- Database functions -- use real `better-sqlite3` with temp file (current pattern)
- Type definitions and pure utility functions

## Fixtures and Factories

**Test Data:**
- Inline construction within test bodies -- no fixture files or factory functions
- Test data uses realistic values: Chinese text for prompts, real directory paths
- Example:
  ```typescript
  const id = insertExecution(db, {
    cwd: '/Users/test/project',
    user_prompt: '创建一个 React 项目',
  });
  ```

**Location:**
- No dedicated fixtures directory
- No factory functions or builders
- Data constructed directly in test cases

## Coverage

**Requirements:** None enforced. No coverage configuration in `jest.config.ts`.

**Current Coverage:**
- Tested modules: `src/lib/store.ts` (state machine), `src/lib/db.ts` (database operations)
- Untested modules:
  - `src/lib/claude-client.ts` (Claude SDK wrapper)
  - `src/lib/keychain.ts` (keychain operations)
  - `src/lib/sherpa.ts` (voice recognition)
  - `electron/main.ts` (main process orchestration)
  - `electron/tray.ts` (tray management)
  - `electron/recorder.ts` (audio recording)
  - `electron/shortcuts.ts` (keyboard hooks)
  - `electron/voice-bar.ts` (voice bar window)
  - `electron/summary-popup.ts` (summary popup window)
  - All React components (`src/components/*.tsx`)
  - All API routes (`src/app/api/*/route.ts`)

**View Coverage:**
```bash
npx jest --coverage
```

## Test Types

**Unit Tests:**
- Scope: Pure logic functions and state machines with no external dependencies
- Approach: Instantiate class directly, call methods, assert results
- Pattern: Arrange-Act-Assert within a single `test()` block
- State machine tests verify valid transitions, invalid transition guards, and derived properties (`dotColor`, `getRightCommandAction`)

**Integration Tests:**
- Scope: Database operations using real SQLite instance
- Approach: Create temp database, run real queries, verify persisted data
- Isolation: Each test gets a fresh database file via `beforeEach` with timestamp-based naming

**E2E Tests:**
- Not used. No E2E testing framework configured.

## Common Patterns

**Async Testing:**
- Not currently present in tests
- The codebase uses async patterns (Promise chains in `electron/main.ts`, async/await in `executeClaude`), but no async tests exist yet

**Error Testing:**
- State machine tests verify invalid transitions are silently ignored:
  ```typescript
  test('invalid transitions are ignored', () => {
    const store = new ShrewStore();
    store.transition('executing'); // idle -> executing is invalid
    expect(store.appState).toBe('idle');
  });
  ```
- No tests for error throwing paths (e.g., `VoiceRecognizer.transcribe()` when not loaded)

**Observer/Listener Testing:**
- Change callback pattern verified by collecting emitted states:
  ```typescript
  test('sdk substate updates independently', () => {
    const store = new ShrewStore();
    const changes: Array<{ appState: string; sdkSubState: string | null }> = [];
    store.onChange((state) => changes.push({ ...state }));
    // ... trigger transitions ...
    expect(changes[changes.length - 1].sdkSubState).toBe('executing_tool');
  });
  ```

**Database Ordering Tests:**
- Verify sort order by manipulating `created_at` timestamps directly:
  ```typescript
  db.prepare(`UPDATE execution_history SET status = 'completed', created_at = ? WHERE id = ?`).run(time, id);
  ```

---

*Testing analysis: 2026-04-22*
