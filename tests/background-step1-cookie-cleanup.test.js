const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('step 1 runs cookie cleanup before opening ChatGPT homepage', async () => {
  const source = fs.readFileSync('background/steps/open-chatgpt.js', 'utf8');
  const globalScope = {};
  const api = new Function('self', `${source}; return self.MultiPageBackgroundStep1;`)(globalScope);

  const events = [];
  const executor = api.createStep1Executor({
    addLog: async (message) => {
      events.push(`log:${message}`);
    },
    completeStepFromBackground: async (step) => {
      events.push(`complete:${step}`);
    },
    ensureSignupEntryPageReady: async (step, options) => {
      events.push(`ready:${step}:${options.readinessTimeoutMs}:${options.transportTimeoutMs}`);
    },
    openSignupEntryTab: async (step) => {
      events.push(`open:${step}`);
    },
    runPreStep1CookieCleanup: async () => {
      events.push('cleanup');
    },
  });

  await executor.executeStep1();

  assert.deepStrictEqual(events, [
    'cleanup',
    'log:步骤 1：正在打开 ChatGPT 官网...',
    'ready:1:45000:50000',
    'complete:1',
  ]);
});

test('background wires runPreStep1CookieCleanup into the step 1 executor', () => {
  const source = fs.readFileSync('background.js', 'utf8');

  assert.match(source, /async function runPreStep1CookieCleanup\(\)/);
  assert.match(
    source,
    /createStep1Executor\(\{\s*addLog,\s*completeStepFromBackground,\s*ensureSignupEntryPageReady,\s*openSignupEntryTab,\s*runPreStep1CookieCleanup,\s*\}\)/
  );
});
