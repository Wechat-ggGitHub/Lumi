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

test('transition: editing → thinking → executing → completed → idle', () => {
  const store = new ShrewStore();
  store.transition('recording');
  store.transition('transcribing');
  store.transition('editing');
  store.transition('thinking');
  store.transition('executing');

  expect(store.appState).toBe('executing');

  store.transition('completed');
  expect(store.appState).toBe('completed');
});

test('transition: idle → thinking (text input path)', () => {
  const store = new ShrewStore();
  store.transition('thinking');
  expect(store.appState).toBe('thinking');

  store.transition('executing');
  expect(store.appState).toBe('executing');

  store.transition('completed');
  expect(store.appState).toBe('completed');
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

  store.transition('thinking');
  store.transition('executing');
  const action5 = store.getRightCommandAction();
  expect(action5).toBe('cancel-execution');
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
