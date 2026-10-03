import test from 'node:test';
import assert from 'node:assert/strict';
import { captureOAuthTokenFromHash, getToken } from '../client/src/api/authToken.js';

test('OAuth fragment is stored and removed before the app starts', () => {
  const values = new Map();
  const storageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, String(value)),
      removeItem: (key) => values.delete(key),
    },
  });

  const historyCalls = [];
  const browser = {
    location: {
      hash: '#token=jwt%2Evalue%2Esignature',
      pathname: '/auth/callback',
      search: '?next=%2Fgames',
    },
    history: {
      state: { key: 'router-state' },
      replaceState: (...args) => historyCalls.push(args),
    },
  };

  try {
    assert.equal(captureOAuthTokenFromHash(browser), 'jwt.value.signature');
    assert.equal(getToken(), 'jwt.value.signature');
    assert.deepEqual(historyCalls, [[
      { key: 'router-state' },
      '',
      '/auth/callback?next=%2Fgames',
    ]]);
  } finally {
    if (storageDescriptor) Object.defineProperty(globalThis, 'localStorage', storageDescriptor);
    else delete globalThis.localStorage;
  }
});

test('no token fragment leaves the URL untouched', () => {
  let replaced = false;
  const browser = {
    location: { hash: '#section', pathname: '/auth/callback', search: '' },
    history: { replaceState: () => { replaced = true; } },
  };

  assert.equal(captureOAuthTokenFromHash(browser), null);
  assert.equal(replaced, false);
});
