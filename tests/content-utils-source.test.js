const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('content/utils.js', 'utf8');

function loadUtilsForUrl(href, options = {}) {
  const sentMessages = [];
  const listeners = [];
  const windowObject = {
    __MULTIPAGE_SOURCE: options.injectedSource,
  };
  windowObject.top = options.isTopFrame === false ? {} : windowObject;

  const locationObject = {
    href,
    hostname: new URL(href).hostname,
  };

  const chrome = {
    runtime: {
      onMessage: {
        addListener(listener) {
          listeners.push(listener);
        },
      },
      sendMessage(message) {
        sentMessages.push(message);
        return Promise.resolve({ ok: true });
      },
    },
  };

  const api = new Function(
    'self',
    'window',
    'location',
    'chrome',
    `${source}; return { SCRIPT_SOURCE, reportReady };`
  )(
    {},
    windowObject,
    locationObject,
    chrome,
  );

  return {
    api,
    listeners,
    sentMessages,
  };
}

test('content utils treat chatgpt.com entry pages as signup-page source', async () => {
  const { api, sentMessages } = loadUtilsForUrl('https://chatgpt.com/');

  assert.equal(api.SCRIPT_SOURCE, 'signup-page');
  assert.equal(sentMessages[0]?.type, 'CONTENT_SCRIPT_READY');
  assert.equal(sentMessages[0]?.source, 'signup-page');
});

test('content utils still prefer explicit injected source override', async () => {
  const { api, sentMessages } = loadUtilsForUrl('https://chatgpt.com/', {
    injectedSource: 'signup-page',
  });

  assert.equal(api.SCRIPT_SOURCE, 'signup-page');
  assert.equal(sentMessages[0]?.source, 'signup-page');
});
