import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const { rpc, createUser } = vi.hoisted(() => ({ rpc: vi.fn(), createUser: vi.fn() }));
vi.mock('@/lib/db', () => ({ getAdminDb: () => ({ rpc, auth: { admin: { createUser } } }) }));
import { POST } from '@/app/api/auth/register/route';
const values = { displayName: 'Test User', email: 'TEST@example.com', password: 'Strong-password-99', passwordConfirmation: 'Strong-password-99' };
const request = (body: unknown = values, origin = 'http://localhost:3000') => new NextRequest('http://localhost:3000/api/auth/register', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body) });
describe('registration without email confirmation', () => {
  beforeEach(() => { vi.clearAllMocks(); rpc.mockResolvedValue({ data: [{ allowed: true, retry_after: 3600 }], error: null }); createUser.mockResolvedValue({ data: { user: { id: 'new-user' } }, error: null }); });
  it('creates a confirmed new account with only display name metadata and no response credentials', async () => {
    const response = await POST(request());
    expect(response.status).toBe(201);
    expect(createUser).toHaveBeenCalledWith({ email: 'test@example.com', password: values.password, email_confirm: true, user_metadata: { display_name: 'Test User' } });
    expect(await response.json()).toEqual({ data: { registered: true, emailConfirmationRequired: false } });
    expect(rpc.mock.calls.every(c => /^[a-f0-9]{64}$/.test(c[1].p_key))).toBe(true);
  });
  it('rejects bad confirmation and injected privileges before creating accounts', async () => {
    expect((await POST(request({ ...values, passwordConfirmation: 'Other-password' }))).status).toBe(400);
    expect((await POST(request({ ...values, role: 'admin' }))).status).toBe(400);
    expect(createUser).not.toHaveBeenCalled();
  });
  it('rejects other origins', async () => {
    expect((await POST(request(values, 'https://other.example'))).status).toBe(403);
    expect(createUser).not.toHaveBeenCalled();
  });
  it('does not overwrite or auto-confirm existing accounts', async () => {
    createUser.mockResolvedValue({ data: { user: null }, error: { status: 422, code: 'email_exists', message: 'Already registered' } });
    const response = await POST(request());
    expect(response.status).toBe(409);
    expect(createUser).toHaveBeenCalledTimes(1);
  });
  it('fails closed when quota fails or denies the request', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    rpc.mockResolvedValue({ data: null, error: { message: 'DB unavailable' } });
    expect((await POST(request())).status).toBe(503);
    rpc.mockResolvedValue({ data: [{ allowed: false, retry_after: 99 }], error: null });
    const response = await POST(request());
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('99');
    expect(createUser).not.toHaveBeenCalled(); spy.mockRestore();
  });
});
