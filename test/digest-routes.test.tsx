import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { RigConfig } from '../src/config.js';
import type { Night } from '../src/digest/types.js';

// Route tests for the digest page (HTML) and digest JSON, plan morning-digest § 2d (issue #6).
// Fixtures live in a temp dir; runs/ is read-only and never touched.

const NORMAL = '2026-11-01';
const EMPTY = '2026-11-02';
const BAD = '2026-11-03';
const MISSING = '2026-11-04';

const normalLog = [
  '{"at":"2026-11-01T01:00:00+01:00","job":"lane/sync","status":"retry","owner":"rook","error":"upstream 503"}',
  '{"at":"2026-11-01T01:01:00+01:00","job":"lane/sync","status":"ok","owner":"rook"}',
  '{"at":"2026-11-01T02:00:00+01:00","job":"digest/render","status":"ok","owner":null}',
  '{"at":"2026-11-01T03:00:00+01:00","job":"notes/backup","status":"fail","owner":"lane-07","error":"quota exceeded"}',
].join('\n');

const badLog = [
  '{"at":"2026-11-03T01:00:00+01:00","job":"lane/sync","status":"ok","owner":"rook"}',
  '{"at":"2026-11-03T02:00:00+01:00","job":"notes/backu',
  '{"at":"2026-11-03T03:00:00+01:00","job":"digest/render","status":"ok","owner":null}',
].join('\n');

let runsDir: string;
let config: RigConfig;

beforeAll(() => {
  runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-routes-'));
  writeFileSync(join(runsDir, `${NORMAL}.jsonl`), normalLog + '\n');
  writeFileSync(join(runsDir, `${EMPTY}.jsonl`), '');
  writeFileSync(join(runsDir, `${BAD}.jsonl`), badLog + '\n');
  config = {
    adapter: 'shim',
    installed: '2026-10-29T14:06:00+01:00',
    beatEverySeconds: 60,
    runsDir,
  };
});

afterAll(() => {
  rmSync(runsDir, { recursive: true, force: true });
});

describe('GET /digest/:night (HTML)', () => {
  it('renders the night with each job, in job order', async () => {
    const res = await createApp(config).request(`/digest/${NORMAL}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain(`digest · ${NORMAL}`);
    const at = ['digest/render', 'lane/sync', 'notes/backup'].map((job) => {
      expect(html).toContain(job);
      return html.indexOf(job);
    });
    expect(at).toEqual([...at].sort((a, b) => a - b));
  });

  it('answers 404 for a night with no file', async () => {
    const res = await createApp(config).request(`/digest/${MISSING}`);
    expect(res.status).toBe(404);
  });

  it('renders an empty night as "nothing ran"', async () => {
    const res = await createApp(config).request(`/digest/${EMPTY}`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('nothing ran');
  });

  it('reports a bad line and still renders the good rows', async () => {
    const res = await createApp(config).request(`/digest/${BAD}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('1 line did not parse');
    expect(html).toContain('lane/sync');
    expect(html).toContain('digest/render');
  });
});

describe('GET /api/digest/:night (JSON)', () => {
  it('returns the Night exactly as readNight shapes it', async () => {
    const res = await createApp(config).request(`/api/digest/${NORMAL}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Night;
    expect(Object.keys(body).sort()).toEqual(['badLines', 'counts', 'night', 'rows']);
    expect(body.night).toBe(NORMAL);
    expect(body.badLines).toBe(0);
    expect(body.counts).toEqual({ ok: 2, retry: 1, fail: 1 });
    expect(body.rows.map((r) => r.job)).toEqual(['digest/render', 'lane/sync', 'notes/backup']);
    expect(body.rows.find((r) => r.job === 'lane/sync')).toMatchObject({
      runs: 2,
      retries: 1,
      lastStatus: 'ok',
      owner: 'rook',
    });
    expect(body.rows.find((r) => r.job === 'digest/render')).toMatchObject({ owner: null, lastError: null });
  });

  it('answers 404 with a JSON error for a night with no file', async () => {
    const res = await createApp(config).request(`/api/digest/${MISSING}`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'no run log for this night', night: MISSING });
  });

  it('returns no rows for an empty night', async () => {
    const res = await createApp(config).request(`/api/digest/${EMPTY}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Night;
    expect(body.rows).toEqual([]);
  });

  it('counts the bad line', async () => {
    const res = await createApp(config).request(`/api/digest/${BAD}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Night;
    expect(body.badLines).toBe(1);
    expect(body.rows.map((r) => r.job)).toEqual(['digest/render', 'lane/sync']);
  });
});

describe('page and JSON agree', () => {
  it('lists the jobs in the HTML in the same order as the JSON rows', async () => {
    const app = createApp(config);
    const html = await (await app.request(`/digest/${NORMAL}`)).text();
    const body = (await (await app.request(`/api/digest/${NORMAL}`)).json()) as Night;
    const positions = body.rows.map((r) => html.indexOf(r.job));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });
});
