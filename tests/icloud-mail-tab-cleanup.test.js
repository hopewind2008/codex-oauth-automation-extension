const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const helperSource = fs.readFileSync('background.js', 'utf8');
const tabRuntimeSource = fs.readFileSync('background/tab-runtime.js', 'utf8');

function extractFunction(source, name) {
  const markers = [`async function ${name}(`, `function ${name}(`];
  const start = markers
    .map((marker) => source.indexOf(marker))
    .find((index) => index >= 0);
  if (start < 0) {
    throw new Error(`missing function ${name}`);
  }

  let parenDepth = 0;
  let signatureEnded = false;
  let braceStart = -1;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '(') {
      parenDepth += 1;
    } else if (ch === ')') {
      parenDepth -= 1;
      if (parenDepth === 0) {
        signatureEnded = true;
      }
    } else if (ch === '{' && signatureEnded) {
      braceStart = i;
      break;
    }
  }
  if (braceStart < 0) {
    throw new Error(`missing body for function ${name}`);
  }

  let depth = 0;
  let end = braceStart;
  for (; end < source.length; end += 1) {
    const ch = source[end];
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        end += 1;
        break;
      }
    }
  }

  return source.slice(start, end);
}

function createCleanupApi() {
  const helperBundle = [
    extractFunction(helperSource, 'parseUrlSafely'),
    extractFunction(helperSource, 'isSignupPageHost'),
    extractFunction(helperSource, 'isSignupEntryHost'),
    extractFunction(helperSource, 'is163MailHost'),
    extractFunction(helperSource, 'isIcloudMailHost'),
    extractFunction(helperSource, 'matchesSourceUrlFamily'),
  ].join('\n');

  return new Function('tabRuntimeSource', `
const self = {};
let currentState = {
  sourceLastUrls: {},
  tabRegistry: {},
};
let currentTabs = [];
const removedBatches = [];
const logMessages = [];

const chrome = {
  tabs: {
    async query() {
      return currentTabs;
    },
    async remove(ids) {
      removedBatches.push(ids);
      currentTabs = currentTabs.filter((tab) => !ids.includes(tab.id));
    },
  },
};

async function getState() {
  return currentState;
}

async function setState(updates) {
  currentState = { ...currentState, ...updates };
}

async function addLog(message, level = 'info') {
  logMessages.push({ message, level });
}

function getSourceLabel(source) {
  return source;
}

function isLocalhostOAuthCallbackUrl() {
  return false;
}

function isRetryableContentScriptTransportError() {
  return false;
}

function throwIfStopped() {}
const LOG_PREFIX = '[test:bg]';
const STOP_ERROR_MESSAGE = 'Flow stopped.';

${helperBundle}
${tabRuntimeSource}

const runtime = self.MultiPageBackgroundTabRuntime.createTabRuntime({
  addLog,
  chrome,
  getSourceLabel,
  getState,
  isLocalhostOAuthCallbackUrl,
  isRetryableContentScriptTransportError,
  LOG_PREFIX,
  matchesSourceUrlFamily,
  setState,
  STOP_ERROR_MESSAGE,
  throwIfStopped,
});

return {
  closeConflictingTabsForSource: runtime.closeConflictingTabsForSource,
  reset({ tabs, state }) {
    currentTabs = tabs;
    removedBatches.length = 0;
    logMessages.length = 0;
    currentState = {
      sourceLastUrls: {},
      tabRegistry: {},
      ...(state || {}),
    };
  },
  snapshot() {
    return {
      currentState,
      currentTabs,
      removedBatches,
      logMessages,
    };
  },
};
`)(tabRuntimeSource);
}

test('closeConflictingTabsForSource cleans stale icloud mail tabs after auto-run resets tab registry', async () => {
  const api = createCleanupApi();

  api.reset({
    tabs: [
      { id: 21, url: 'https://www.icloud.com/mail/' },
      { id: 22, url: 'https://www.icloud.com.cn/mail/' },
      { id: 23, url: 'https://mail.163.com/js6/main.jsp' },
    ],
    state: {
      tabRegistry: {},
      sourceLastUrls: {},
    },
  });

  await api.closeConflictingTabsForSource('icloud-mail', 'https://www.icloud.com/mail/');

  const snapshot = api.snapshot();
  assert.deepStrictEqual(snapshot.removedBatches, [[21, 22]]);
  assert.deepStrictEqual(snapshot.currentTabs, [
    { id: 23, url: 'https://mail.163.com/js6/main.jsp' },
  ]);
  assert.equal(snapshot.logMessages.length, 1);
  assert.match(snapshot.logMessages[0].message, /已关闭 2 个旧的icloud-mail标签页/);
});
