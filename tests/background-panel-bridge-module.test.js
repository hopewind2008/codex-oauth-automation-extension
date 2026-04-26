const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('background imports panel bridge module', () => {
  const source = fs.readFileSync('background.js', 'utf8');
  assert.match(source, /importScripts\([\s\S]*'background\/panel-bridge\.js'/);
});

test('panel bridge module exposes a factory', () => {
  const source = fs.readFileSync('background/panel-bridge.js', 'utf8');
  const globalScope = {};

  const api = new Function('self', `${source}; return self.MultiPageBackgroundPanelBridge;`)(globalScope);

  assert.equal(typeof api?.createPanelBridge, 'function');
});

test('panel bridge requests oauth url with step 7 log label payload', () => {
  const source = fs.readFileSync('background/panel-bridge.js', 'utf8');
  assert.match(source, /logStep:\s*7/);
  assert.doesNotMatch(source, /logStep:\s*6/);
});

test('panel bridge waits for CPA tab complete before checking content script readiness', async () => {
  const source = fs.readFileSync('background/panel-bridge.js', 'utf8');
  const globalScope = {};
  const api = new Function('self', `${source}; return self.MultiPageBackgroundPanelBridge;`)(globalScope);

  const events = [];
  const bridge = api.createPanelBridge({
    chrome: {
      tabs: {
        create: async () => ({ id: 7 }),
      },
    },
    addLog: async () => {},
    closeConflictingTabsForSource: async () => {
      events.push('close');
    },
    ensureContentScriptReadyOnTab: async () => {
      events.push('ensure');
    },
    getPanelMode: () => 'cpa',
    normalizeSub2ApiUrl: (value) => value,
    rememberSourceLastUrl: async () => {
      events.push('remember');
    },
    sendToContentScript: async () => ({}),
    sendToContentScriptResilient: async () => {
      events.push('request');
      return { oauthUrl: 'https://auth.openai.com/oauth?state=test' };
    },
    waitForTabComplete: async () => {
      events.push('complete');
      return { id: 7, status: 'complete' };
    },
    waitForTabUrlFamily: async () => {
      events.push('family');
      return null;
    },
    DEFAULT_SUB2API_GROUP_NAME: 'default',
    SUB2API_STEP1_RESPONSE_TIMEOUT_MS: 30000,
  });

  const result = await bridge.requestOAuthUrlFromPanel({
    vpsUrl: 'https://example.com/panel',
    vpsPassword: 'secret',
  }, {
    logLabel: '步骤 7',
  });

  assert.deepStrictEqual(result, {
    oauthUrl: 'https://auth.openai.com/oauth?state=test',
  });
  assert.deepStrictEqual(events, [
    'close',
    'remember',
    'family',
    'complete',
    'ensure',
    'request',
  ]);
});
