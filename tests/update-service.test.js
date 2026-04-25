const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('sidepanel/update-service.js', 'utf8');

function createUpdateService(options = {}) {
  const manifest = options.manifest || {
    version: '2.0',
    version_name: 'Pro2.0',
  };
  const cache = new Map();
  const windowObject = {};
  let fetchCalls = 0;

  const localStorage = {
    getItem(key) {
      return cache.has(key) ? cache.get(key) : null;
    },
    setItem(key, value) {
      cache.set(key, String(value));
    },
  };

  if (options.cachedSnapshot) {
    cache.set(
      'multipage-release-snapshot-v1',
      JSON.stringify(options.cachedSnapshot)
    );
  }

  const fetchImpl = options.fetchImpl || (async () => ({
    ok: true,
    async json() {
      return [];
    },
  }));

  const wrappedFetch = async (...args) => {
    fetchCalls += 1;
    return fetchImpl(...args);
  };

  const api = new Function(
    'window',
    'localStorage',
    'fetch',
    'chrome',
    'AbortController',
    'setTimeout',
    'clearTimeout',
    `${source}; return window.SidepanelUpdateService;`
  )(
    windowObject,
    localStorage,
    wrappedFetch,
    {
      runtime: {
        getManifest() {
          return manifest;
        },
      },
    },
    AbortController,
    setTimeout,
    clearTimeout
  );

  return {
    api,
    getFetchCalls() {
      return fetchCalls;
    },
  };
}

test('getReleaseSnapshot keeps Pro releases ahead of legacy v releases', async () => {
  const { api } = createUpdateService({
    manifest: {
      version: '2.0',
      version_name: 'Pro2.0',
    },
    fetchImpl: async () => ({
      ok: true,
      async json() {
        return [
          {
            tag_name: 'v11.0.0',
            name: 'v11.0.0',
            html_url: 'https://example.com/v11.0.0',
            published_at: '2026-04-17T00:00:00.000Z',
            body: '- legacy release',
            draft: false,
            prerelease: false,
          },
          {
            tag_name: 'Pro2.4',
            name: 'Pro2.4',
            html_url: 'https://example.com/Pro2.4',
            published_at: '2026-04-18T00:00:00.000Z',
            body: '- pro release',
            draft: false,
            prerelease: false,
          },
          {
            tag_name: 'Pro2.0',
            name: 'Pro2.0',
            html_url: 'https://example.com/Pro2.0',
            published_at: '2026-04-16T00:00:00.000Z',
            body: '- current release',
            draft: false,
            prerelease: false,
          },
        ];
      },
    }),
  });

  const snapshot = await api.getReleaseSnapshot({ force: true });

  assert.equal(snapshot.status, 'update-available');
  assert.equal(snapshot.localVersion, 'Pro2.0');
  assert.equal(snapshot.latestVersion, 'Pro2.4');
  assert.deepEqual(
    snapshot.newerReleases.map((release) => release.displayVersion),
    ['Pro2.4']
  );
});

test('getReleaseSnapshot reorders cached releases before choosing latest version', async () => {
  const { api, getFetchCalls } = createUpdateService({
    manifest: {
      version: '2.0',
      version_name: 'Pro2.0',
    },
    cachedSnapshot: {
      fetchedAt: Date.now(),
      releases: [
        {
          version: '11.0.0',
          displayVersion: 'v11.0.0',
          family: 'legacy',
          title: '',
          url: 'https://example.com/v11.0.0',
          publishedAt: '2026-04-17T00:00:00.000Z',
          notes: [],
        },
        {
          version: '2.4',
          displayVersion: 'Pro2.4',
          family: 'pro',
          title: '',
          url: 'https://example.com/Pro2.4',
          publishedAt: '2026-04-18T00:00:00.000Z',
          notes: [],
        },
      ],
    },
    fetchImpl: async () => {
      throw new Error('should not fetch when cache is fresh');
    },
  });

  const snapshot = await api.getReleaseSnapshot();

  assert.equal(getFetchCalls(), 0);
  assert.equal(snapshot.status, 'update-available');
  assert.equal(snapshot.latestVersion, 'Pro2.4');
  assert.deepEqual(
    snapshot.newerReleases.map((release) => release.displayVersion),
    ['Pro2.4']
  );
});

test('getLocalVersionLabel supports plain numeric versions and treats them as newer than Pro releases', async () => {
  const { api } = createUpdateService({
    manifest: {
      version: '0.2',
      version_name: '0.2',
    },
    fetchImpl: async () => ({
      ok: true,
      async json() {
        return [
          {
            tag_name: 'Pro5.8',
            name: 'Pro5.8',
            html_url: 'https://example.com/Pro5.8',
            published_at: '2026-04-24T00:00:00.000Z',
            body: '- previous pro line',
            draft: false,
            prerelease: false,
          },
          {
            tag_name: 'v11.0.0',
            name: 'v11.0.0',
            html_url: 'https://example.com/v11.0.0',
            published_at: '2026-04-23T00:00:00.000Z',
            body: '- legacy release',
            draft: false,
            prerelease: false,
          },
        ];
      },
    }),
  });

  assert.equal(api.getLocalVersionLabel({
    version: '0.2',
    version_name: '0.2',
  }), '0.2');
  assert.equal(api.compareVersions('0.2', 'Pro99.0'), 1);

  const snapshot = await api.getReleaseSnapshot({ force: true });
  assert.equal(snapshot.localVersion, '0.2');
  assert.equal(snapshot.status, 'latest');
});

test('update service supports alpha suffix releases like 0.2a', async () => {
  const { api } = createUpdateService({
    manifest: {
      version: '0.2.1',
      version_name: '0.2a',
    },
    fetchImpl: async () => ({
      ok: true,
      async json() {
        return [
          {
            tag_name: '0.2a',
            name: '0.2a',
            html_url: 'https://example.com/0.2a',
            published_at: '2026-04-25T00:00:00.000Z',
            body: '- alpha patch release',
            draft: false,
            prerelease: false,
          },
          {
            tag_name: '0.2',
            name: '0.2',
            html_url: 'https://example.com/0.2',
            published_at: '2026-04-24T00:00:00.000Z',
            body: '- previous release',
            draft: false,
            prerelease: false,
          },
        ];
      },
    }),
  });

  assert.equal(api.getLocalVersionLabel({
    version: '0.2.1',
    version_name: '0.2a',
  }), '0.2a');
  assert.equal(api.compareVersions('0.2a', '0.2'), 1);

  const snapshot = await api.getReleaseSnapshot({ force: true });
  assert.equal(snapshot.localVersion, '0.2a');
  assert.equal(snapshot.latestVersion, '0.2a');
  assert.equal(snapshot.status, 'latest');
});
