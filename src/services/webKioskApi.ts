import { z } from 'zod';

import { appSettingsSchema, categorySchema, orderSchema, paymentSettingsSchema, productSchema } from '../domain';
import type { KioskApi } from './kioskApi';

const catalogSchema = z.object({ categories: z.array(categorySchema), products: z.array(productSchema) });

class ApiError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

export function createWebKioskApi(fetcher: typeof fetch): KioskApi {
  const request = async (path: string, init?: RequestInit): Promise<unknown> => {
    const response = await fetcher(`/api/${path}`, { ...init, credentials: 'include' });
    const body: unknown = await response.json();
    if (!response.ok) {
      const error = z.object({ error: z.string() }).safeParse(body);
      throw new ApiError(response.status, error.success ? error.data.error : `Request failed (${response.status})`);
    }
    return body;
  };
  const post = (path: string, body: unknown = {}) => request(path, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });

  return {
    catalog: {
      read: async () => catalogSchema.parse(await request('catalog')),
      save: async (input) => { await post('admin/catalog', input); },
    },
    settings: {
      read: async () => appSettingsSchema.parse(await request('settings')),
      save: async (input) => { await post('admin/settings', input); },
      readPayment: async () => paymentSettingsSchema.parse(await request('payment')),
      savePayment: async (input) => { await post('admin/payment', input); },
    },
    orders: {
      create: async (input) => orderSchema.parse(await post('orders', input)),
      read: async (number) => orderSchema.nullable().parse(await request(`orders?orderNumber=${encodeURIComponent(number)}`)),
    },
    media: {
      upload: async (file) => {
        const body = new FormData();
        body.append('file', file);
        const result = await request('admin/media', { method: 'POST', body });
        return z.object({ url: z.url({ protocol: /^https$/iu }) }).parse(result).url;
      },
    },
    admin: {
      authenticate: async (password) => {
        try {
          await post('admin/login', { password });
          return true;
        } catch (error) {
          if (error instanceof ApiError && error.status === 401) return false;
          throw error;
        }
      },
      keepAlive: async () => { await post('admin/keep-alive'); },
      logout: async () => { await post('admin/logout'); },
      changePassword: async (currentPassword, nextPassword) => { await post('admin/password', { currentPassword, nextPassword }); },
    },
  };
}
