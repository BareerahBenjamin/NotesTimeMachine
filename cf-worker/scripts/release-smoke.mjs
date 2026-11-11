import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';

const {
  RELEASE_API_URL,
  RELEASE_COMMIT,
  RELEASE_ENVIRONMENT,
  RELEASE_SITE_URL,
} = process.env;

assert.match(RELEASE_COMMIT ?? '', /^[a-f0-9]{40}$/);
assert.ok(RELEASE_ENVIRONMENT);
const site = new URL(RELEASE_SITE_URL);
const api = new URL(RELEASE_API_URL);

function fetchFrom(base, path, options = {}) {
  return fetch(new URL(path, base), {
    ...options,
    signal: AbortSignal.timeout(15000),
    headers: { Origin: site.origin, ...options.headers },
  });
}

async function getJson(base, path, options) {
  const response = await fetchFrom(base, path, options);
  assert.equal(response.status, 200, path);
  assert.equal(response.headers.get('access-control-allow-origin'), base === api ? site.origin : null);
  return response.json();
}

async function waitForRelease(base, path, getCommit) {
  const deadline = Date.now() + 90000;
  do {
    try {
      const response = await fetchFrom(base, path + '?commit=' + RELEASE_COMMIT, {
        headers: { 'Cache-Control': 'no-cache' },
      });
      if (response.ok && getCommit(await response.json()) === RELEASE_COMMIT) return;
    } catch (error) {
      if (Date.now() >= deadline) throw error;
    }
    await delay(3000);
  } while (Date.now() < deadline);
  throw new Error(path + ' did not serve the expected commit ' + RELEASE_COMMIT);
}

await waitForRelease(api, '/api/health', data => data.release);
const health = await getJson(api, '/api/health');
assert.equal(health.status, 'ok');
assert.equal(health.environment, RELEASE_ENVIRONMENT);

const classics = await getJson(api, '/api/classics');
assert.ok(classics.classics?.length, 'R2 catalog is populated');
const chapters = await getJson(api, '/api/chapters/shuyuci');
assert.ok(chapters.chapters?.length, 'R2 has chapters for shuyuci');
const chapterId = encodeURIComponent(chapters.chapters[0].chapter_id);
const chapter = await getJson(api, '/api/paragraphs/' + chapterId);
assert.ok(chapter.paragraphs?.[0]?.content, 'Chapter contains readable text');
const search = await getJson(api, '/api/search', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ filters: { classic_id: 'shuyuci' }, top_k: 1 }),
});
assert.ok(search.results?.length, 'Search returns a reading result');
await getJson(api, '/api/community/categories');
const feedback = await getJson(api, '/api/feedback/availability');
assert.equal(feedback.available, false, 'Feedback is disabled');
const activation = await getJson(api, '/api/activation/example');
assert.equal(typeof activation.available, 'boolean');
assert.equal((await fetchFrom(api, '/api/community/user', {
  headers: { Authorization: 'Bearer invalid.test.token' },
})).status, 401, 'Invalid session is rejected');
assert.equal((await fetchFrom(api, '/api/community/users/1/reading-progress')).status, 401,
  'Anonymous reading progress is private');
assert.equal((await fetchFrom(api, '/api/community/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: '__ntm_release_smoke_missing__', password: 'invalid-test-password' }),
})).status, 401, 'Signing configuration is active and an invalid login is rejected');
console.log('API verified at ' + RELEASE_COMMIT);

if (!process.argv.includes('--api-only')) {
  await waitForRelease(site, '/release.json', data => data.commit);
  const page = await fetchFrom(site, '/?commit=' + RELEASE_COMMIT);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /js\/main\.js/);
  for (const path of ['/js/main.js', '/css/v2.css', '/privacy.html']) {
    assert.equal((await fetchFrom(site, path)).status, 200, path);
  }
  console.log('Site verified at ' + RELEASE_COMMIT);
}
