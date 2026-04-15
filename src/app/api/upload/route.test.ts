import { describe, expect, it } from 'vitest';

import { POST } from './route';

const ONE_MB_BYTES = 1024 * 1024;

describe('POST /api/upload', () => {
  it('возвращает фактический размер payload', async () => {
    const payload = new Uint8Array(ONE_MB_BYTES);
    const request = new Request('http://localhost/api/upload', {
      method: 'POST',
      body: payload
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ size: ONE_MB_BYTES });
  });

  it('возвращает 400 при несовпадении Content-Length и фактического payload', async () => {
    const payload = new Uint8Array(ONE_MB_BYTES);
    const request = new Request('http://localhost/api/upload', {
      method: 'POST',
      body: payload,
      headers: {
        'Content-Length': String(ONE_MB_BYTES + 128)
      }
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json).toEqual({ error: 'Content-Length does not match payload size' });
  });

  it('возвращает 413 для payload больше лимита', async () => {
    const payload = new Uint8Array(6 * ONE_MB_BYTES);
    const request = new Request('http://localhost/api/upload', {
      method: 'POST',
      body: payload
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(413);
    expect(json).toEqual({ error: 'Payload exceeds allowed limit' });
  });
});
