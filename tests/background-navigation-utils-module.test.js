const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('background imports navigation utils module', () => {
  const source = fs.readFileSync('background.js', 'utf8');
  assert.match(source, /background\/navigation-utils\.js/);
});

test('navigation utils module exposes a factory', () => {
  const source = fs.readFileSync('background/navigation-utils.js', 'utf8');
  const globalScope = {};

  const api = new Function('self', `${source}; return self.MultiPageBackgroundNavigationUtils;`)(globalScope);

  assert.equal(typeof api?.createNavigationUtils, 'function');
});

test('navigation utils match icloud mail pages as the same reusable tab family', () => {
  const source = fs.readFileSync('background/navigation-utils.js', 'utf8');
  const globalScope = {};

  const api = new Function('self', `${source}; return self.MultiPageBackgroundNavigationUtils;`)(globalScope);
  const navigationUtils = api.createNavigationUtils({
    DEFAULT_SUB2API_URL: 'https://example.com/admin/accounts',
    normalizeLocalCpaStep9Mode: () => 'submit',
  });

  assert.equal(
    navigationUtils.matchesSourceUrlFamily('icloud-mail', 'https://www.icloud.com/mail/', 'https://www.icloud.com/mail/'),
    true
  );
  assert.equal(
    navigationUtils.matchesSourceUrlFamily('icloud-mail', 'https://www.icloud.com.cn/mail/', 'https://www.icloud.com/mail/'),
    true
  );
  assert.equal(
    navigationUtils.matchesSourceUrlFamily('icloud-mail', 'https://example.com/mail/', 'https://www.icloud.com/mail/'),
    false
  );
});
