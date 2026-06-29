import crypto from 'node:crypto';
import { createId } from './store.js';

const COOKIE_NAME = 'conta_session';
const SESSION_DAYS = 30;

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [scheme, salt, expected] = String(stored || '').split(':');
  if (scheme !== 'scrypt' || !salt || !expected) return false;

  const actual = crypto.scryptSync(password, salt, 64);
  const expectedBuffer = Buffer.from(expected, 'hex');
  return expectedBuffer.length === actual.length && crypto.timingSafeEqual(actual, expectedBuffer);
}

export function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt,
    settings: user.settings || { currency: 'BRL', monthlySafeReserve: 0, payday: 1 }
  };
}

export function parseCookies(request) {
  return Object.fromEntries(
    String(request.headers.cookie || '')
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf('=');
        return [decodeURIComponent(part.slice(0, index)), decodeURIComponent(part.slice(index + 1))];
      })
  );
}

export function sessionCookie(token) {
  const maxAge = SESSION_DAYS * 24 * 60 * 60;
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

export function clearSessionCookie() {
  return `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
}

export function getSessionToken(request) {
  return parseCookies(request)[COOKIE_NAME];
}

export function authenticateRequest(request, store) {
  const token = getSessionToken(request);
  if (!token) return null;

  const now = new Date();
  const session = store.sessions.find((item) => item.token === token && new Date(item.expiresAt) > now);
  if (!session) return null;

  return store.users.find((user) => user.id === session.userId) || null;
}

export function requireAuthenticatedUser(request, store) {
  const user = authenticateRequest(request, store);
  if (!user) {
    throw Object.assign(new Error('Entre na sua conta para continuar.'), { status: 401 });
  }
  return user;
}

export function registerUser(store, body) {
  const name = String(body.name || '').trim();
  const email = normalizeEmail(body.email);
  const password = String(body.password || '');

  if (name.length < 2) {
    throw Object.assign(new Error('Informe seu nome.'), { status: 422 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw Object.assign(new Error('Informe um email valido.'), { status: 422 });
  }
  if (password.length < 8) {
    throw Object.assign(new Error('A senha precisa ter pelo menos 8 caracteres.'), { status: 422 });
  }
  if (store.users.some((user) => user.email === email)) {
    throw Object.assign(new Error('Ja existe uma conta com esse email.'), { status: 409 });
  }

  const user = {
    id: createId('usr'),
    name,
    email,
    passwordHash: hashPassword(password),
    settings: {
      currency: 'BRL',
      monthlySafeReserve: 0,
      payday: 1
    },
    createdAt: new Date().toISOString()
  };

  store.users.push(user);
  return user;
}

export function loginUser(store, body) {
  const email = normalizeEmail(body.email);
  const password = String(body.password || '');
  const user = store.users.find((item) => item.email === email);

  if (!user || !verifyPassword(password, user.passwordHash)) {
    throw Object.assign(new Error('Email ou senha invalidos.'), { status: 401 });
  }

  return user;
}

export function createSession(store, user) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  store.sessions = store.sessions.filter((session) => new Date(session.expiresAt) > new Date());
  store.sessions.push({ token, userId: user.id, createdAt: new Date().toISOString(), expiresAt });
  return token;
}

export function destroySession(store, request) {
  const token = getSessionToken(request);
  if (!token) return;
  store.sessions = store.sessions.filter((session) => session.token !== token);
}
