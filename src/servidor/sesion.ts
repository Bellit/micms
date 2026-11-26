// Login propio del gestor (opción `acceso: 'propio'`, la de por defecto), para webs que no tienen panel con login.
// Una sola clave, en el secreto MICMS_CLAVE (mínimo 12 caracteres). La sesión es una cookie firmada con
// HMAC-SHA256 a partir de la clave: dura 12 horas y cambiar la clave cierra todas las sesiones.
// Con `acceso: 'web'`, micms no comprueba nada: la ruta la protege el login de la web.
import type { AstroCookies } from 'astro';
import { OPCIONES } from 'virtual:micms/config';
import { secreto } from './entorno';

export const COOKIE = 'micms_sesion';
export const MINIMO_CLAVE = 12;
const DURACION = 12 * 60 * 60; // segundos

const enc = new TextEncoder();
const clave = () => secreto('MICMS_CLAVE') ?? '';
export const claveConfigurada = () => OPCIONES.acceso === 'web' || clave().length >= MINIMO_CLAVE;

const b64url = (b: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const hmac = (k: string) => crypto.subtle.importKey('raw', enc.encode(k), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
const firmar = async (texto: string) => b64url(await crypto.subtle.sign('HMAC', await hmac(`micms-sesion:${clave()}`), enc.encode(texto)));

/** Compara sin dar pistas por el tiempo: se comparan los HMAC de las dos cadenas, que siempre miden lo mismo. */
async function iguales(a: string, b: string) {
  const k = await hmac('micms-comparar');
  const [x, y] = await Promise.all([a, b].map((s) => crypto.subtle.sign('HMAC', k, enc.encode(s))));
  const u = new Uint8Array(x), v = new Uint8Array(y);
  let d = 0;
  for (let i = 0; i < u.length; i++) d |= u[i] ^ v[i];
  return d === 0;
}

export const claveCorrecta = async (intento: string) => clave().length >= MINIMO_CLAVE && (await iguales(intento, clave()));

/** ¿La petición puede usar el gestor? */
export async function autorizado(cookies: AstroCookies) {
  if (OPCIONES.acceso === 'web') return true;
  if (clave().length < MINIMO_CLAVE) return false;
  const [caduca, firma] = (cookies.get(COOKIE)?.value ?? '').split('.');
  if (!caduca || !firma || !/^\d+$/.test(caduca) || Number(caduca) < Date.now() / 1000) return false;
  return iguales(firma, await firmar(caduca));
}

const opcionesCookie = (url: URL, path: string) => ({ path, httpOnly: true, sameSite: 'strict' as const, secure: url.protocol === 'https:' });

export async function abrirSesion(cookies: AstroCookies, url: URL, path: string) {
  const caduca = String(Math.floor(Date.now() / 1000) + DURACION);
  cookies.set(COOKIE, `${caduca}.${await firmar(caduca)}`, { ...opcionesCookie(url, path), maxAge: DURACION });
}

export const cerrarSesion = (cookies: AstroCookies, url: URL, path: string) => cookies.delete(COOKIE, opcionesCookie(url, path));
