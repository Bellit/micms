// API del gestor (la ejecuta el Worker; la protege el login de la web):
//   GET  …/api/estado                      contenido actual, esquemas y fotos
//   GET  …/api/imagen?archivo=x.jpg&ref=…  una foto del repositorio, para verla en el panel
//   POST …/api/publicar                    valida y guarda los cambios en GitHub (JSON)
import type { APIRoute } from 'astro';
import { OPCIONES } from 'virtual:micms/config';
import { NOMBRE_FOTO, TIPO_FOTO } from '../comun/esquema';
import { estado, publicar } from '../servidor/contenido';
import { configurado, ErrorGitHub, leerCrudo } from '../servidor/github';

export const prerender = false;

const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
const NO_CONFIGURADO = 'El gestor no está conectado a GitHub: faltan los secretos GITHUB_TOKEN y GITHUB_REPO.';

function fallo(e: unknown) {
  if (e instanceof ErrorGitHub) {
    console.error('[micms]', e.estado, e.message);
    if (e.estado === 409) return json({ errores: [{ mensaje: 'Alguien ha publicado a la vez. Recarga la página.' }] }, 409);
    if (e.estado === 401 || e.estado === 403) return json({ errores: [{ mensaje: 'GitHub no acepta el token (caducado o sin permiso de escritura).' }] }, 502);
    if (e.estado === 404) return json({ errores: [{ mensaje: 'No se encuentra el repositorio o el fichero en GitHub.' }] }, 502);
  } else console.error('[micms]', e);
  return json({ errores: [{ mensaje: 'No se ha podido hablar con GitHub. Prueba otra vez en un momento.' }] }, 502);
}

export const GET: APIRoute = async ({ params, url }) => {
  if (!configurado()) return json({ errores: [{ mensaje: NO_CONFIGURADO }] }, 503);
  try {
    if (params.accion === 'estado') return json(await estado());
    if (params.accion === 'imagen') {
      const archivo = url.searchParams.get('archivo') ?? '';
      const ref = url.searchParams.get('ref') ?? '';
      if (!NOMBRE_FOTO.test(archivo) || !/^[0-9a-f]{40}$/.test(ref)) return new Response('Petición no válida', { status: 400 });
      const r = await leerCrudo(`${OPCIONES.carpeta}/imagenes/${archivo}`, ref);
      // Un commit no cambia nunca: se puede guardar en la caché del navegador (solo de quien ha entrado).
      return new Response(r.body, {
        headers: { 'Content-Type': TIPO_FOTO[archivo.split('.').pop()!], 'Cache-Control': 'private, max-age=86400, immutable' },
      });
    }
  } catch (e) {
    return fallo(e);
  }
  return new Response('No existe', { status: 404 });
};

export const POST: APIRoute = async ({ params, request }) => {
  if (params.accion !== 'publicar') return new Response('No existe', { status: 404 });
  if (!configurado()) return json({ errores: [{ mensaje: NO_CONFIGURADO }] }, 503);
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) return json({ errores: [{ mensaje: 'Petición no válida' }] }, 415);
  const largo = Number(request.headers.get('Content-Length') ?? 0);
  if (largo > 30 * 1024 * 1024) return json({ errores: [{ mensaje: 'Demasiado grande: publica las fotos en dos veces.' }] }, 413);
  let cuerpo: unknown;
  try {
    cuerpo = await request.json();
  } catch {
    return json({ errores: [{ mensaje: 'Petición no válida' }] }, 400);
  }
  try {
    const r = await publicar(cuerpo);
    return r.ok ? json({ commit: r.commit }) : json({ errores: r.errores }, r.estado);
  } catch (e) {
    return fallo(e);
  }
};
