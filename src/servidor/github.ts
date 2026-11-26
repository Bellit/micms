// Lectura y escritura del repositorio de la web con la API de GitHub.
// Secretos (en Cloudflare, `npx wrangler secret put …`; en otros servidores, variables de entorno):
//   GITHUB_TOKEN  token de grano fino, solo para ese repositorio, con permiso «Contents: Read and write»
//   GITHUB_REPO   «usuario/repositorio»
// Variables opcionales: GITHUB_RAMA (por defecto main) y GITHUB_API (las pruebas usan un GitHub falso).
import { secreto } from './entorno';

const E = new Proxy({} as Record<string, string | undefined>, { get: (_, k) => secreto(String(k)) });

export const configurado = () => Boolean(E.GITHUB_TOKEN && E.GITHUB_REPO && /^[\w.-]+\/[\w.-]+$/.test(E.GITHUB_REPO));
const rama = () => E.GITHUB_RAMA || 'main';
const api = () => (E.GITHUB_API || 'https://api.github.com').replace(/\/$/, '');

/** Error de GitHub con su código. 409 = alguien ha publicado antes (la rama ha avanzado). */
export class ErrorGitHub extends Error {
  constructor(
    public estado: number,
    mensaje: string,
  ) {
    super(mensaje);
  }
}

const rutaCodificada = (ruta: string) => ruta.split('/').map(encodeURIComponent).join('/');

async function gh(ruta: string, init: RequestInit & { crudo?: boolean } = {}) {
  const { crudo, ...resto } = init;
  const r = await fetch(`${api()}/repos/${E.GITHUB_REPO}${ruta}`, {
    ...resto,
    headers: {
      Authorization: `Bearer ${E.GITHUB_TOKEN}`,
      Accept: crudo ? 'application/vnd.github.raw' : 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'micms',
      ...(resto.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  if (!r.ok) {
    const texto = await r.text().catch(() => '');
    // Al mover la rama sin avance rápido, GitHub responde 422: otra publicación ha llegado antes.
    if (r.status === 422 && /fast.?forward/i.test(texto)) throw new ErrorGitHub(409, 'La rama ha cambiado mientras tanto');
    throw new ErrorGitHub(r.status, `GitHub ${r.status} en ${ruta}: ${texto.slice(0, 300)}`);
  }
  return r;
}

const json = async <T>(r: Promise<Response>) => (await (await r).json()) as T;

/** Último commit de la rama. */
export const ultimoCommit = async () => (await json<{ object: { sha: string } }>(gh(`/git/ref/heads/${rama()}`))).object.sha;

/** Contenido de un fichero de texto en un commit. */
export const leerTexto = async (ruta: string, ref: string) => (await gh(`/contents/${rutaCodificada(ruta)}?ref=${ref}`, { crudo: true })).text();

/** Fichero tal cual (para servir las fotos al panel). */
export const leerCrudo = (ruta: string, ref: string) => gh(`/contents/${rutaCodificada(ruta)}?ref=${ref}`, { crudo: true });

/** Nombres de los ficheros de una carpeta en un commit. Vacío si la carpeta no existe. */
export async function listar(carpeta: string, ref: string) {
  try {
    const l = await json<{ name: string; type: string }[]>(gh(`/contents/${rutaCodificada(carpeta)}?ref=${ref}`));
    return Array.isArray(l) ? l.filter((f) => f.type === 'file').map((f) => f.name) : [];
  } catch (e) {
    if (e instanceof ErrorGitHub && e.estado === 404) return [];
    throw e;
  }
}

export type Cambio = { ruta: string; texto: string } | { ruta: string; base64: string } | { ruta: string; borrar: true };

/**
 * Un commit con todos los cambios encima de `base`, y la rama pasa a él sin forzar:
 * si alguien ha publicado entretanto, falla con ErrorGitHub 409 y no se pierde nada.
 * Devuelve el commit nuevo, o null si los cambios no cambian nada.
 */
export async function guardar(base: string, cambios: Cambio[], mensaje: string) {
  const { tree } = await json<{ tree: { sha: string } }>(gh(`/git/commits/${base}`));
  const entradas = await Promise.all(
    cambios.map(async (c) => {
      const comun = { path: c.ruta, mode: '100644', type: 'blob' };
      if ('borrar' in c) return { ...comun, sha: null };
      if ('texto' in c) return { ...comun, content: c.texto };
      const blob = await json<{ sha: string }>(gh('/git/blobs', { method: 'POST', body: JSON.stringify({ content: c.base64, encoding: 'base64' }) }));
      return { ...comun, sha: blob.sha };
    }),
  );
  const arbol = await json<{ sha: string }>(gh('/git/trees', { method: 'POST', body: JSON.stringify({ base_tree: tree.sha, tree: entradas }) }));
  if (arbol.sha === tree.sha) return null;
  const commit = await json<{ sha: string }>(
    gh('/git/commits', { method: 'POST', body: JSON.stringify({ message: mensaje, tree: arbol.sha, parents: [base] }) }),
  );
  await gh(`/git/refs/heads/${rama()}`, { method: 'PATCH', body: JSON.stringify({ sha: commit.sha, force: false }) });
  return commit.sha;
}
