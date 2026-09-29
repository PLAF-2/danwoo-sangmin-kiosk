import { randomUUID } from 'node:crypto';
import { put } from '@vercel/blob';
import sharp from 'sharp';

import { requireAdmin } from '../_lib/auth';
import { endpoint, HttpError, type ApiRequest } from '../_lib/http';

const maxFileSize = 4 * 1024 * 1024;
const extensions: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

function hasImageSignature(bytes: Uint8Array, type: string): boolean {
  if (type === 'image/png') return Buffer.from(bytes.subarray(0, 8)).equals(Buffer.from('89504e470d0a1a0a', 'hex'));
  if (type === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  return type === 'image/webp' && Buffer.from(bytes.subarray(0, 4)).toString() === 'RIFF'
    && Buffer.from(bytes.subarray(8, 12)).toString() === 'WEBP';
}

function hasCompleteImageContainer(bytes: Buffer, type: string): boolean {
  if (type === 'image/png') {
    return bytes.length >= 20 && bytes.subarray(-12).equals(Buffer.from('0000000049454e44ae426082', 'hex'));
  }
  if (type === 'image/jpeg') return bytes.length >= 2 && bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9;
  return type === 'image/webp' && bytes.length >= 12 && bytes.readUInt32LE(4) + 8 === bytes.length;
}

async function uploadedFile(request: ApiRequest): Promise<File> {
  const contentType = request.headers['content-type'];
  if (typeof contentType !== 'string' || !/^multipart\/form-data;\s*boundary=/iu.test(contentType)) {
    throw new HttpError(415, 'Multipart form data required');
  }

  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request as unknown as AsyncIterable<Buffer>) {
    const bytes = Buffer.from(chunk);
    size += bytes.length;
    if (size > maxFileSize + 64 * 1024) throw new HttpError(413, 'File too large');
    chunks.push(bytes);
  }

  let form: FormData;
  try {
    form = await new Request('http://localhost', {
      method: 'POST',
      headers: { 'content-type': contentType },
      body: Buffer.concat(chunks),
    }).formData();
  } catch {
    throw new HttpError(400, 'Invalid multipart form data');
  }
  const entries = [...form.entries()];
  if (entries.length !== 1 || entries[0]?.[0] !== 'file' || !(entries[0][1] instanceof File)) {
    throw new HttpError(400, 'One file is required');
  }
  return entries[0][1];
}

export default endpoint('POST', async (request) => {
  await requireAdmin(request);
  const file = await uploadedFile(request);
  if (file.size > maxFileSize) throw new HttpError(413, 'File too large');
  const bytes = Buffer.from(await file.arrayBuffer());
  const extension = extensions[file.type];
  if (!extension || !hasImageSignature(bytes, file.type) || !hasCompleteImageContainer(bytes, file.type)) {
    throw new HttpError(415, 'Unsupported image');
  }
  try {
    await sharp(bytes, {
      failOn: 'warning',
      limitInputPixels: 16_777_216,
    }).raw().toBuffer();
  } catch {
    throw new HttpError(415, 'Unsupported image');
  }
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) throw new Error('Blob token unavailable');
  const blob = await put(`images/${randomUUID()}.${extension}`, file, {
    access: 'public',
    token,
  });
  if (new URL(blob.url).protocol !== 'https:') throw new Error('Invalid Blob URL');
  return { url: blob.url };
});
