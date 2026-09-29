// @vitest-environment node
import { Readable } from 'node:stream';
import sharp from 'sharp';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import media from '../../api/admin/media';
import type { ApiResponse } from '../../api/_lib/http';

const { query, put } = vi.hoisted(() => ({ query: vi.fn(), put: vi.fn() }));
vi.mock('../../api/_lib/db', () => ({ getDb: () => ({ query }) }));
vi.mock('@vercel/blob', () => ({ put }));

const cookie = '__Host-kiosk-admin=824b1722-4a18-4d69-9b51-dccac58dc700';
const image = sharp({ create: { width: 1, height: 1, channels: 3, background: '#000' } });
const [png, jpeg, webp] = await Promise.all([
  image.clone().png().toBuffer(),
  image.clone().jpeg().toBuffer(),
  image.clone().webp().toBuffer(),
]);
const largePng = await sharp(Buffer.alloc(3 * 1024 * 1024), {
  raw: { width: 1024, height: 1024, channels: 3 },
}).png({ compressionLevel: 0 }).toBuffer();

function request(bytes: Buffer, type = 'image/png', filename = 'caller-controlled.png', authenticated = true) {
  const boundary = 'test-boundary';
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${type}\r\n\r\n`),
    bytes,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return Object.assign(Readable.from([body]), {
    method: 'POST',
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}`, ...(authenticated ? { cookie } : {}) },
  });
}

function response() {
  return { statusCode: 200, setHeader: vi.fn(), end: vi.fn() } as unknown as ApiResponse;
}

beforeEach(() => {
  query.mockReset().mockResolvedValue([{ expires_at: new Date(Date.now() + 300000) }]);
  put.mockReset().mockResolvedValue({ url: 'https://public.blob.vercel-storage.com/images/server.png' });
  process.env.BLOB_READ_WRITE_TOKEN = 'test-secret';
});

describe('admin media upload', () => {
  it('requires an active admin session before reading or storing the upload', async () => {
    const res = response();
    await media(request(png, 'image/png', 'x.png', false), res);
    expect(res.statusCode).toBe(401);
    expect(query).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();

    query.mockResolvedValue([]);
    const expired = response();
    await media(request(png), expired);
    expect(expired.statusCode).toBe(401);
    expect(put).not.toHaveBeenCalled();
  });

  it('stores a PNG under a server-generated pathname and returns only its public HTTPS URL', async () => {
    const res = response();
    await media(request(png, 'image/png', 'do-not-use-this-name.png'), res);
    expect(res.statusCode).toBe(200);
    expect(put).toHaveBeenCalledOnce();
    const [pathname, file, options] = put.mock.calls[0]!;
    expect(pathname).toMatch(/^images\/[0-9a-f-]{36}\.png$/u);
    expect(pathname).not.toContain('do-not-use');
    expect(file).toBeInstanceOf(File);
    expect(options).toEqual({ access: 'public', token: 'test-secret' });
    expect(JSON.parse((res.end as ReturnType<typeof vi.fn>).mock.calls[0]![0])).toEqual({ url: 'https://public.blob.vercel-storage.com/images/server.png' });
  });

  it.each([
    ['image/jpeg', jpeg, '.jpg'],
    ['image/webp', webp, '.webp'],
  ])('accepts %s with its canonical extension', async (type, bytes, extension) => {
    const res = response();
    await media(request(bytes, type), res);
    expect(res.statusCode).toBe(200);
    expect(put.mock.calls[0]![0]).toMatch(new RegExp(`^images/[0-9a-f-]{36}\\${extension}$`, 'u'));
  });

  it.each([
    ['image/gif', Buffer.from('GIF89a')],
    ['image/png', Buffer.from('not a png')],
  ])('rejects unsupported or mismatched image content', async (type, bytes) => {
    const res = response();
    await media(request(bytes, type), res);
    expect(res.statusCode).toBe(415);
    expect(put).not.toHaveBeenCalled();
  });

  it.each([
    ['PNG missing its final IEND bytes', png, 'image/png'],
    ['JPEG missing its EOI marker', jpeg, 'image/jpeg'],
    ['WebP shorter than its RIFF length', webp, 'image/webp'],
  ])('rejects a %s before storing it', async (_name, bytes, type) => {
    const res = response();
    await media(request(bytes.subarray(0, -2), type), res);
    expect(res.statusCode).toBe(415);
    expect(put).not.toHaveBeenCalled();
  });

  it('accepts ordinary photos up to 4 MiB', async () => {
    const res = response();
    await media(request(largePng), res);
    expect(res.statusCode).toBe(200);
    expect(put).toHaveBeenCalledOnce();
  });

  it('rejects files larger than 4 MiB', async () => {
    const res = response();
    await media(request(Buffer.concat([png, Buffer.alloc(4 * 1024 * 1024)])), res);
    expect(res.statusCode).toBe(413);
    expect(put).not.toHaveBeenCalled();
  });
});
