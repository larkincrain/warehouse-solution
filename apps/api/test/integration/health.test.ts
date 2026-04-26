import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestEnv, stopTestEnv, type TestEnv } from './setup.js';

let env: TestEnv;
beforeAll(async () => { env = await startTestEnv(); }, 60_000);
afterAll(async () => { await stopTestEnv(env); });

describe('health', () => {
  it('GET /health → 200', async () => {
    const r = await env.app.inject({ method: 'GET', url: '/api/v1/health' });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ status: 'ok' });
  });
  it('GET /ready → 200 with db up', async () => {
    const r = await env.app.inject({ method: 'GET', url: '/api/v1/ready' });
    expect(r.statusCode).toBe(200);
  });
});
