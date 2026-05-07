import { ShrewStore } from '../lib/store';

test('initial state is idle with no substate', () => {
  const store = new ShrewStore();
  expect(store.appState).toBe('idle');
  expect(store.sdkSubState).toBeNull();
});

test('transition: idle -> recording -> transcribing -> thinking', () => {
  const store = new ShrewStore();
  store.transition('recording');
  expect(store.appState).toBe('recording');

  store.transition('transcribing');
  expect(store.appState).toBe('transcribing');

  store.transition('thinking');
  expect(store.appState).toBe('thinking');
});

test('transition: idle -> thinking -> executing -> completed -> idle', () => {
  const store = new ShrewStore();
  store.transition('thinking');
  store.transition('executing');
  store.transition('completed');
  expect(store.appState).toBe('completed');
});

test('invalid transitions are ignored', () => {
  const store = new ShrewStore();
  store.transition('executing'); // idle -> executing is invalid
  expect(store.appState).toBe('idle');
});

test('sdk substate updates independently', () => {
  const store = new ShrewStore();
  const changes: Array<{ appState: string; sdkSubState: string | null }> = [];
  store.onChange((state) => changes.push({ ...state }));

  store.transition('thinking');
  store.setSdkSubState('thinking');
  store.transition('executing');
  store.setSdkSubState('executing_tool');

  expect(store.sdkSubState).toBe('executing_tool');
  expect(changes[changes.length - 1].sdkSubState).toBe('executing_tool');
});

test('dotColor mapping', () => {
  const store = new ShrewStore();

  expect(store.dotColor).toBe('gray');

  store.transition('thinking');
  expect(store.dotColor).toBe('blue');

  store.transition('executing');
  store.setSdkSubState('thinking');
  expect(store.dotColor).toBe('blue');

  store.transition('completed');
  expect(store.dotColor).toBe('green');
});

test('rightCommand behavior per state', () => {
  const store = new ShrewStore();

  expect(store.getRightCommandAction()).toBe('start-recording');

  store.transition('recording');
  expect(store.getRightCommandAction()).toBe('stop-recording');

  store.transition('transcribing');
  expect(store.getRightCommandAction()).toBe('none');

  // transcribing -> thinking (no more editing)
  store.transition('thinking');
  store.transition('executing');
  expect(store.getRightCommandAction()).toBe('cancel-execution');
});

test('transcribing can transition to idle (empty transcription scenario)', () => {
  const store = new ShrewStore();
  store.transition('recording');
  store.transition('transcribing');
  store.transition('idle');
  expect(store.appState).toBe('idle');

  store.transition('recording');
  expect(store.appState).toBe('recording');
});

test('speaking flag defaults to false', () => {
  const store = new ShrewStore();
  expect(store.speaking).toBe(false);
});

test('setSpeaking updates the flag and notifies listeners', () => {
  const store = new ShrewStore();
  const changes: Array<{ appState: string; sdkSubState: string | null }> = [];
  store.onChange((state) => changes.push({ ...state }));

  store.setSpeaking(true);
  expect(store.speaking).toBe(true);
  expect(changes.length).toBe(1);

  store.setSpeaking(false);
  expect(store.speaking).toBe(false);
  expect(changes.length).toBe(2);
});

test('getRightCommandAction returns stop-speaking when speaking is true', () => {
  const store = new ShrewStore();
  store.setSpeaking(true);
  expect(store.getRightCommandAction()).toBe('stop-speaking');
});

test('getRightCommandAction returns start-recording when idle and not speaking', () => {
  const store = new ShrewStore();
  expect(store.getRightCommandAction()).toBe('start-recording');
});

test('completed timer does not transition to idle while speaking', () => {
  jest.useFakeTimers();
  const store = new ShrewStore();
  store.transition('thinking');
  store.transition('executing');
  store.transition('completed');
  store.setSpeaking(true);

  jest.advanceTimersByTime(3000);
  expect(store.appState).toBe('completed');

  store.setSpeaking(false);
  if (store.appState === 'completed') {
    store.transition('idle');
  }
  expect(store.appState).toBe('idle');
  jest.useRealTimers();
});

test('continuousChatWindow flag', () => {
  const store = new ShrewStore();
  expect(store.continuousChatWindow).toBe(false);

  store.setContinuousChatWindow(true);
  expect(store.continuousChatWindow).toBe(true);

  store.setContinuousChatWindow(false);
  expect(store.continuousChatWindow).toBe(false);
});
