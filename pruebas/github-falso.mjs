// GitHub falso para probar el gestor sin tocar un repositorio real. Implementa solo lo que usa micms:
// ref de la rama, commits, contents (fichero en crudo o listado de carpeta), blobs, trees y mover la rama.
//
//   import { githubFalso } from 'micms/pruebas';
//   const gh = await githubFalso({ 'src/contenido/portada.json': '{…}', 'src/contenido/imagenes/a.jpg': buffer });
//   // vars del Worker: GITHUB_API=gh.url, GITHUB_REPO=prueba/web, GITHUB_TOKEN=gh.token
//   gh.leer('src/contenido/portada.json') · gh.commits · gh.existe(ruta) · gh.publicarAparte(ruta, texto) · gh.cerrar()
import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';

const sha = (x) => createHash('sha1').update(x).digest('hex');

/** @param {Record<string, string | Buffer>} inicial ficheros del repositorio: ruta → contenido */
export async function githubFalso(inicial = {}, { repo = 'prueba/web', rama = 'main', token = 'token-de-prueba' } = {}) {
  const blobs = new Map(); // sha → Buffer
  const arboles = new Map(); // sha → Map(ruta → sha del blob)
  const commitsPorSha = new Map(); // sha → { tree, parents, message }
  const commits = []; // los creados por el gestor, en orden: { sha, message, ficheros: [rutas cambiadas] }
  let cabeza;

  const guardarBlob = (buf) => {
    const s = sha(Buffer.concat([Buffer.from(`blob ${buf.length}\0`), buf]));
    blobs.set(s, buf);
    return s;
  };
  const guardarArbol = (mapa) => {
    const s = sha(JSON.stringify([...mapa].sort()));
    arboles.set(s, mapa);
    return s;
  };
  const guardarCommit = (tree, parents, message) => {
    const s = sha(`${tree}${parents.join()}${message}${randomBytes(8).toString('hex')}`);
    commitsPorSha.set(s, { tree, parents, message });
    return s;
  };

  const mapaInicial = new Map(Object.entries(inicial).map(([r, c]) => [r, guardarBlob(Buffer.isBuffer(c) ? c : Buffer.from(c))]));
  cabeza = guardarCommit(guardarArbol(mapaInicial), [], 'Inicial');

  const arbolDe = (commit) => arboles.get(commitsPorSha.get(commit)?.tree);

  const servidor = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const responder = (estado, cuerpo, tipo = 'application/json') => {
      res.writeHead(estado, { 'Content-Type': tipo });
      res.end(tipo === 'application/json' ? JSON.stringify(cuerpo) : cuerpo);
    };
    if (req.headers.authorization !== `Bearer ${token}`) return responder(401, { message: 'Bad credentials' });
    const prefijo = `/repos/${repo}`;
    if (!url.pathname.startsWith(prefijo)) return responder(404, { message: 'Not Found' });
    const ruta = decodeURIComponent(url.pathname.slice(prefijo.length));
    let cuerpo = null;
    if (req.method !== 'GET') {
      const trozos = [];
      for await (const t of req) trozos.push(t);
      cuerpo = JSON.parse(Buffer.concat(trozos).toString() || 'null');
    }

    if (req.method === 'GET' && ruta === `/git/ref/heads/${rama}`) return responder(200, { object: { sha: cabeza, type: 'commit' } });

    let m;
    if (req.method === 'GET' && (m = ruta.match(/^\/git\/commits\/([0-9a-f]{40})$/))) {
      const c = commitsPorSha.get(m[1]);
      return c ? responder(200, { sha: m[1], tree: { sha: c.tree }, parents: c.parents.map((p) => ({ sha: p })) }) : responder(404, { message: 'Not Found' });
    }

    if (req.method === 'GET' && (m = ruta.match(/^\/contents\/(.+)$/))) {
      const arbol = arbolDe(url.searchParams.get('ref') ?? cabeza);
      if (!arbol) return responder(404, { message: 'No commit found' });
      const r = m[1];
      if (arbol.has(r)) {
        const buf = blobs.get(arbol.get(r));
        if (req.headers.accept === 'application/vnd.github.raw') return responder(200, buf, 'application/octet-stream');
        return responder(200, { type: 'file', name: r.split('/').pop(), path: r, sha: arbol.get(r), content: buf.toString('base64'), encoding: 'base64' });
      }
      const dentro = [...arbol.keys()].filter((k) => k.startsWith(`${r}/`) && !k.slice(r.length + 1).includes('/'));
      if (dentro.length) return responder(200, dentro.map((k) => ({ type: 'file', name: k.split('/').pop(), path: k, sha: arbol.get(k) })));
      return responder(404, { message: 'Not Found' });
    }

    if (req.method === 'POST' && ruta === '/git/blobs') {
      const buf = cuerpo.encoding === 'base64' ? Buffer.from(cuerpo.content, 'base64') : Buffer.from(cuerpo.content);
      return responder(201, { sha: guardarBlob(buf) });
    }

    if (req.method === 'POST' && ruta === '/git/trees') {
      const base = arboles.get(cuerpo.base_tree);
      if (!base) return responder(422, { message: 'Invalid base_tree' });
      const nuevo = new Map(base);
      for (const e of cuerpo.tree) {
        if (e.sha === null) {
          if (!nuevo.has(e.path)) return responder(422, { message: `GitHub: no se puede borrar ${e.path}, no existe` });
          nuevo.delete(e.path);
        } else if (e.content !== undefined) nuevo.set(e.path, guardarBlob(Buffer.from(e.content)));
        else if (blobs.has(e.sha)) nuevo.set(e.path, e.sha);
        else return responder(422, { message: 'Blob desconocido' });
      }
      return responder(201, { sha: guardarArbol(nuevo) });
    }

    if (req.method === 'POST' && ruta === '/git/commits') {
      if (!arboles.has(cuerpo.tree)) return responder(422, { message: 'Tree desconocido' });
      return responder(201, { sha: guardarCommit(cuerpo.tree, cuerpo.parents, cuerpo.message) });
    }

    if (req.method === 'PATCH' && ruta === `/git/refs/heads/${rama}`) {
      const c = commitsPorSha.get(cuerpo.sha);
      if (!c) return responder(422, { message: 'Object does not exist' });
      if (!cuerpo.force && !c.parents.includes(cabeza)) return responder(422, { message: 'Update is not a fast forward' });
      const antes = arbolDe(cabeza);
      const despues = arboles.get(c.tree);
      const ficheros = [...new Set([...antes.keys(), ...despues.keys()])].filter((k) => antes.get(k) !== despues.get(k)).sort();
      commits.push({ sha: cuerpo.sha, message: c.message, ficheros });
      cabeza = cuerpo.sha;
      return responder(200, { object: { sha: cabeza } });
    }

    return responder(404, { message: `No implementado en el GitHub falso: ${req.method} ${ruta}` });
  });

  await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok));
  const { port } = servidor.address();

  return {
    url: `http://127.0.0.1:${port}`,
    repo,
    token,
    /** Commits hechos por el gestor: { sha, message, ficheros }. */
    commits,
    cabeza: () => cabeza,
    /** Contenido actual de un fichero (Buffer) o undefined. */
    leer: (r) => {
      const s = arbolDe(cabeza).get(r);
      return s ? blobs.get(s) : undefined;
    },
    existe: (r) => arbolDe(cabeza).has(r),
    listar: (carpeta) => [...arbolDe(cabeza).keys()].filter((k) => k.startsWith(`${carpeta}/`)),
    /** Simula que alguien publica otro cambio (para probar los conflictos). */
    publicarAparte(r, contenido) {
      const nuevo = new Map(arbolDe(cabeza));
      nuevo.set(r, guardarBlob(Buffer.from(contenido)));
      cabeza = guardarCommit(guardarArbol(nuevo), [cabeza], 'Cambio aparte');
      return cabeza;
    },
    cerrar: () => new Promise((ok) => servidor.close(ok)),
  };
}
