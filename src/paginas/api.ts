// API del gestor (se ejecuta en el servidor, nunca se genera en estático):
//   GET  …/api/estado                      contenido actual, esquemas y fotos
//   GET  …/api/imagen?archivo=x.jpg&ref=…  una foto del repositorio, para verla en el panel
//   POST …/api/publicar                    valida y guarda los cambios en GitHub (JSON)
//   POST …/api/entrar · …/api/salir        login propio (solo con `acceso: 'propio'`; formulario)
// Todo menos «entrar» exige sesión (o, con `acceso: 'web'`, el login de la web).
import type { APIRoute } from 'astro';
import { OPCIONES } from 'virtual:micms/config';
import { NOMBRE_FOTO, TIPO_FOTO } from '../comun/esquema';
import { rutaCookie, urlPanel } from '../comun/rutas';
import { estado, publicar } from '../servidor/contenido';
import { configurado, ErrorGitHub, leerCrudo } from '../servidor/github';
import { abrirSesion, autorizado, cerrarSesion, claveCorrecta, claveConfigurada } from '../servidor/sesion';

export const prerender = false;

const CABECERAS = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' };
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: CABECERAS });
const errorJson = (mensaje: string, status: number) => json({ errores: [{ mensaje }] }, status);
const NO_CONFIGURADO = 'El gestor no está conectado a GitHub: faltan los secretos GITHUB_TOKEN y GITHUB_REPO.';
const SIN_SESION = 'La sesión ha caducado. Vuelve a entrar.';

function fallo(e: unknown) {
  if (e instanceof ErrorGitHub) {
    console.error('[micms]', e.estado, e.message);
    if (e.estado === 409) return errorJson('Alguien ha publicado a la vez. Recarga la página.', 409);
    if (e.estado === 401 || e.estado === 403) return errorJson('GitHub no acepta el token (caducado o sin permiso de escritura).', 502);
    if (e.estado === 404) return errorJson('No se encuentra el repositorio o el fichero en GitHub.', 502);
  } else console.error('[micms]', e);
  return errorJson('No se ha podido hablar con GitHub. Prueba otra vez en un momento.', 502);
}

const volver = (error?: string) =>
  new Response(null, { status: 303, headers: { ...CABECERAS, Location: urlPanel(OPCIONES) + (error ? `?error=${error}` : '') } });

export const GET: APIRoute = async ({ params, url, cookies }) => {
  if (!(await autorizado(cookies))) return errorJson(SIN_SESION, 401);
  if (!configurado()) return errorJson(NO_CONFIGURADO, 503);
  try {
    if (params.accion === 'estado') return json(await estado());
    if (params.accion === 'imagen') {
      const archivo = url.searchParams.get('archivo') ?? '';
      const ref = url.searchParams.get('ref') ?? '';
      if (!NOMBRE_FOTO.test(archivo) || !/^[0-9a-f]{40}$/.test(ref)) return new Response('Petición no válida', { status: 400 });
      const r = await leerCrudo(`${OPCIONES.carpeta}/imagenes/${archivo}`, ref);
      // Un commit no cambia nunca: se puede guardar en la caché del navegador (solo de quien ha entrado).
      return new Response(r.body, {
        headers: { 'Content-Type': TIPO_FOTO[archivo.split('.').pop()!], 'Cache-Control': 'private, max-age=86400, immutable', 'X-Robots-Tag': 'noindex' },
      });
    }
  } catch (e) {
    return fallo(e);
  }
  return new Response('No existe', { status: 404 });
};

export const POST: APIRoute = async ({ params, request, cookies, url }) => {
  // Login propio. Los formularios los protege la comprobación de origen de Astro (security.checkOrigin).
  if (params.accion === 'entrar' || params.accion === 'salir') {
    if (OPCIONES.acceso === 'web') return new Response('No existe', { status: 404 });
    if (params.accion === 'salir') {
      cerrarSesion(cookies, url, rutaCookie(OPCIONES));
      return volver();
    }
    if (!claveConfigurada()) return volver();
    const form = await request.formData().catch(() => null);
    const intento = form?.get('clave');
    if (typeof intento !== 'string' || !(await claveCorrecta(intento))) {
      await new Promise((r) => setTimeout(r, 1000)); // frena los intentos a ciegas
      return volver('clave');
    }
    await abrirSesion(cookies, url, rutaCookie(OPCIONES));
    return volver();
  }

  if (params.accion !== 'publicar') return new Response('No existe', { status: 404 });
  if (!(await autorizado(cookies))) return errorJson(SIN_SESION, 401);
  if (!configurado()) return errorJson(NO_CONFIGURADO, 503);
  // Solo JSON: un formulario de otra web no puede enviar este tipo sin permiso del navegador (CORS).
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) return errorJson('Petición no válida', 415);
  const largo = Number(request.headers.get('Content-Length') ?? 0);
  if (largo > 30 * 1024 * 1024) return errorJson('Demasiado grande: publica las fotos en dos veces.', 413);
  let cuerpo: unknown;
  try {
    cuerpo = await request.json();
  } catch {
    return errorJson('Petición no válida', 400);
  }
  try {
    const r = await publicar(cuerpo);
    return r.ok ? json({ commit: r.commit }) : json({ errores: r.errores }, r.estado);
  } catch (e) {
    return fallo(e);
  }
};
