import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

import { createAtomicJsonStore } from '../storage/atomicJsonStore';
import { IPC_CHANNELS, type IpcMainLike } from './channels';

const credentialSchema = z
  .object({
    algorithm: z.literal('scrypt'),
    salt: z.string().regex(/^[0-9a-f]{32}$/u),
    hash: z.string().regex(/^[0-9a-f]{128}$/u),
  })
  .strict();
const passwordSchema = z.string().min(1).max(128);
const nextPasswordSchema = z.string().min(8).max(128);
type Credential = z.infer<typeof credentialSchema>;

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

async function createCredential(password: string): Promise<Credential> {
  const validPassword = nextPasswordSchema.parse(password);
  const salt = randomBytes(16);
  return {
    algorithm: 'scrypt',
    salt: salt.toString('hex'),
    hash: (await derive(validPassword, salt)).toString('hex'),
  };
}

async function authenticate(credentialFile: string, password: string): Promise<boolean> {
  const store = createAtomicJsonStore({ filePath: credentialFile, schema: credentialSchema });
  let credential: Credential;
  try {
    credential = await store.read();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }

  const actual = await derive(passwordSchema.parse(password), Buffer.from(credential.salt, 'hex'));
  return timingSafeEqual(actual, Buffer.from(credential.hash, 'hex'));
}

export async function initializeAdminPassword({
  credentialFile,
  initialPassword,
  log,
}: {
  credentialFile: string;
  initialPassword: string | undefined;
  log: { error(message: string): void };
}): Promise<void> {
  const store = createAtomicJsonStore({ filePath: credentialFile, schema: credentialSchema });

  try {
    await store.read();
    return;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }

  if (initialPassword === undefined) {
    log.error(
      'Admin authentication is disabled: set KIOSK_ADMIN_INITIAL_PASSWORD before first launch.',
    );
    return;
  }

  await store.writeIfAbsent(await createCredential(initialPassword));
}

export function registerAdminIpc({
  ipcMain,
  credentialFile,
}: {
  ipcMain: IpcMainLike;
  credentialFile: string;
}): void {
  const store = createAtomicJsonStore({ filePath: credentialFile, schema: credentialSchema });

  ipcMain.handle(IPC_CHANNELS.adminAuthenticate, async (_event, ...args) => {
    const [password] = z.tuple([passwordSchema]).parse(args);
    return authenticate(credentialFile, password);
  });

  ipcMain.handle(IPC_CHANNELS.adminChangePassword, async (_event, ...args) => {
    const [currentPassword, nextPassword] = z
      .tuple([passwordSchema, nextPasswordSchema])
      .parse(args);
    if (!(await authenticate(credentialFile, currentPassword))) {
      throw new Error('Current password is incorrect');
    }
    await store.write(await createCredential(nextPassword));
  });
}
