import { request } from 'undici';

export const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

export async function waitForReady(timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastErr: unknown;
  while (Date.now() < deadline) {
    try {
      const r = await request(`${BASE_URL}/api/v1/ready`);
      if (r.statusCode === 200) return;
    } catch (e) { lastErr = e; }
    await new Promise((res) => setTimeout(res, 500));
  }
  throw new Error(`API never became ready: ${String(lastErr)}`);
}

export async function post<T>(path: string, body: unknown, headers: Record<string, string> = {}): Promise<{ status: number; body: T }> {
  const r = await request(`${BASE_URL}${path}`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', ...headers },
  });
  const text = await r.body.text();
  return { status: r.statusCode, body: text ? (JSON.parse(text) as T) : (undefined as T) };
}

export async function get<T>(path: string): Promise<{ status: number; body: T }> {
  const r = await request(`${BASE_URL}${path}`);
  const text = await r.body.text();
  return { status: r.statusCode, body: text ? (JSON.parse(text) as T) : (undefined as T) };
}
