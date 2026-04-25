(function attachBackgroundStep1(root, factory) {
  root.MultiPageBackgroundStep1 = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createBackgroundStep1Module() {
  function createStep1Executor(deps = {}) {
    const {
      addLog,
      completeStepFromBackground,
      ensureSignupEntryPageReady,
      openSignupEntryTab,
      runPreStep1CookieCleanup,
    } = deps;

    async function executeStep1() {
      if (typeof runPreStep1CookieCleanup === 'function') {
        await runPreStep1CookieCleanup();
      }
      await addLog('步骤 1：正在打开 ChatGPT 官网...');
      if (typeof ensureSignupEntryPageReady === 'function') {
        await ensureSignupEntryPageReady(1, {
          readinessTimeoutMs: 45000,
          transportTimeoutMs: 50000,
        });
      } else {
        await openSignupEntryTab(1);
      }
      await completeStepFromBackground(1, {});
    }

    return { executeStep1 };
  }

  return { createStep1Executor };
});
