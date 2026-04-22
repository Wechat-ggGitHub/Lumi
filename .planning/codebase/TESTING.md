# Testing Patterns

**Analysis Date:** 2026-04-22

## Test Framework

**Runner:**
- Jest 30.3.0 with ts-jest 29.4.9
- Config: `Shrew/jest.config.ts`
- Test environment: `node`

**Assertion Library:**
- Jest built-in (`expect`, `toBe`, `toBeNull`, `toBeTruthy`, `not.toBeNull`)

**Run Commands:**
```bash
cd Shrew && npx jest                     # Run all tests
cd Shrew && npx jest src/__tests__/store.test.ts  # Run single test file
```

No watch mode or coverage scripts defined in `package.json`. No coverage configuration in `jest.config.ts`.

## Jest Configuration

```typescript
// Shrew/jest.config.ts
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

Key details:
- `ts-jest` preset handles TypeScript compilation
- `testEnvironment: 'node'` (not `jsdom`) -- tests run in Node, no DOM simulation
- Path alias `@/*` mapped to `src/*` matching production config
- Test root is `src/` directory

## Test File Organization

**Location:**
- All tests in a single directory: `src/__tests__/`
- Separate from source files (not co-located)

**Naming:**
- Pattern: `<module-name>.test.ts`
- Examples: `store.test.ts`, `db.test.ts`

**Current test files:**
```
src/__tests/
  store.test.ts    -- Tests for ShrewStore state machine
  db.test.ts       -- Tests for database CRUD operations
```

**Only 2 test files covering 2 of 8+ modules.** No tests exist for:
- `src/lib/claude-client.ts`
- `src/lib/sherpa.ts`
- `src/lib/keychain.ts`
- `electron/main.ts` or any `electron/*.ts` module
- Any React component (`VoiceInput`, `SummaryPanel`, `Onboarding`, `StatusDot`)
- API routes (`api/chat`, `api/health`, `api/status`)

## Test Structure

**Suite Organization:**
Tests use flat `test()` blocks without `describe()` grouping. Each test is a self-contained unit.

```typescript
// Pattern from src/__tests__/store.test.ts
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

**Patterns:**
- No `describe()` blocks used -- flat test structure
- No `beforeEach`/`afterEach` in store tests (stateless -- new ShrewStore per test)
- State machine tests follow the actual user flow: `idle -> recording -> transcribing -> editing -> sending -> executing -> idle`
- Negative test cases included: `'invalid transitions are ignored'`

**Setup/Teardown (database tests):**
```typescript
// Pattern from src/__tests__/db.test.ts
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
```

**Database test approach:**
- Real SQLite database on filesystem (not mocked)
- Temporary directory `.tmp-test/` created/cleaned per test run
- Fresh database created per test via `Date.now()` filename for isolation
- Database closed after each test to release file handles

## Mocking

**Framework:** No mocking library used. No `jest.mock()`, `jest.fn()`, or `jest.spyOn()` calls found.

**Current approach:**
- Store tests: No mocking needed -- `ShrewStore` is a pure state machine with no dependencies
- Database tests: Real `better-sqlite3` instance with temp file -- no mocking of the database

**What this means for new tests:**
- Pure logic modules (store, utility functions) need no mocking
- Modules with Electron dependencies (`keychain.ts`, `recorder.ts`, all `electron/` files) will need mocking
- Modules with native dependencies (`sherpa.ts`) will need mocking
- `claude-client.ts` requires mocking the `@anthropic-ai/claude-agent-sdk` dynamic import

**When adding mocks for Electron-dependent code, use:**
```typescript
// Mock Electron modules
jest.mock('electron', () => ({
  app: { getPath: jest.fn(() => '/tmp/test') },
  safeStorage: {
    isEncryptionAvailable: jest.fn(() => true),
    encryptString: jest.fn((s) => Buffer.from(s)),
    decryptString: jest.fn((b) => b.toString()),
  },
}));

// Mock native modules
jest.mock('sherpa-onnx-node', () => ({
  createOfflineRecognizer: jest.fn(),
  readWave: jest.fn(),
}));

// Mock SDK with AsyncGenerator
jest.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: jest.fn(),
}));
```

## Fixtures and Factories

**Test Data:**
Tests create inline data directly. No fixture files or factory functions.

```typescript
// Pattern from src/__tests__/db.test.ts -- inline test data
const id = insertExecution(db, {
  cwd: '/Users/test/project',
  user_prompt: '创建一个 React 项目',
});
```

```typescript
// Pattern for multi-record setup
const baseTime = new Date('2026-01-01T00:00:00Z');
for (let i = 0; i < 5; i++) {
  const id = insertExecution(db, {
    cwd: '/Users/test',
    user_prompt: `指令 ${i}`,
  });
  // Direct SQL for controlling timestamps
  db.prepare(`UPDATE execution_history SET status = 'completed', created_at = ? WHERE id = ?`)
    .run(time, id);
}
```

**Location:**
- No dedicated fixtures directory
- All test data created inline in test files

## Coverage

**Requirements:** None enforced. No coverage thresholds configured in `jest.config.ts`.

**View Coverage:**
```bash
cd Shrew && npx jest --coverage
```

**Current coverage estimate (by module):**
| Module | Has Tests | Lines |
|--------|-----------|-------|
| `src/lib/store.ts` | Yes (6 tests) | 108 |
| `src/lib/db.ts` | Yes (3 tests) | 70 |
| `src/lib/claude-client.ts` | No | 128 |
| `src/lib/sherpa.ts` | No | 69 |
| `src/lib/keychain.ts` | No | 34 |
| `electron/main.ts` | No | 499 |
| `electron/tray.ts` | No | 141 |
| `electron/recorder.ts` | No | 81 |
| `electron/voice-bar.ts` | No | 69 |
| `electron/summary-popup.ts` | No | 66 |
| `electron/shortcuts.ts` | No | 48 |
| All React components | No | ~500 |

## Test Types

**Unit Tests:**
- Current tests are all unit tests
- State machine transitions tested exhaustively (valid paths + invalid transitions)
- Database CRUD tested with real SQLite
- No external dependencies in tested modules

**Integration Tests:**
- None present
- Needed areas: IPC communication between Electron and Next.js, full voice-to-execution pipeline, API route handling with globalThis state

**E2E Tests:**
- Not used
- Electron + voice recording + system-level interactions make E2E challenging
- No Playwright, Spectron, or similar E2E framework configured

## Common Patterns

**State Machine Testing:**
```typescript
// Test valid transition paths
test('transition: idle -> recording -> transcribing -> editing', () => {
  const store = new ShrewStore();
  store.transition('recording');
  expect(store.appState).toBe('recording');
  store.transition('transcribing');
  expect(store.appState).toBe('transcribing');
  store.transition('editing');
  expect(store.appState).toBe('editing');
});

// Test invalid transitions are silently rejected
test('invalid transitions are ignored', () => {
  const store = new ShrewStore();
  store.transition('executing'); // invalid from idle
  expect(store.appState).toBe('idle');
});
```

**Listener/Callback Testing:**
```typescript
// Collect state changes into an array for assertion
test('sdk substate updates independently', () => {
  const store = new ShrewStore();
  const changes: Array<{ appState: string; sdkSubState: string | null }> = [];
  store.onChange((state) => changes.push({ ...state }));

  store.transition('recording');
  store.setSdkSubState('thinking');

  expect(changes[changes.length - 1].sdkSubState).toBe('thinking');
});
```

**Derived Property Testing:**
```typescript
// Test computed properties at each state
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
});
```

**Async Testing:**
- No async tests currently present
- For future async tests, use the standard Jest async pattern:
```typescript
test('async operation', async () => {
  const result = await someAsyncFunction();
  expect(result).toBeDefined();
});
```

**Error Testing:**
- No error-path tests currently
- For testing thrown errors:
```typescript
test('throws when not loaded', () => {
  const recognizer = new VoiceRecognizer();
  expect(() => recognizer.transcribe('path')).toThrow('Recognizer not loaded');
});
```

## Adding New Tests

**For pure logic modules (store-like):**
- Create `src/__tests__/<module>.test.ts`
- Instantiate directly, no mocks needed
- Test all public methods and edge cases

**For database-related modules:**
- Follow the `db.test.ts` pattern with temp directory and `beforeEach`/`afterEach` cleanup
- Use real SQLite, not mocks

**For Electron-dependent modules:**
- Mock `electron` module at the top of the test file
- Mock any native modules (`sherpa-onnx-node`, `better-sqlite3`)
- Test business logic in isolation from Electron APIs

**For React components:**
- Add `@testing-library/react` to devDependencies
- Switch jest config or use `@jest/globals` with `testEnvironment: 'jsdom'` for component tests
- Alternatively, test component logic by extracting hooks/functions and testing in node environment

---

*Testing analysis: 2026-04-22*
