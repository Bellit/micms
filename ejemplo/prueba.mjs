// Prueba de extremo a extremo de micms en esta web mínima (adaptador Node, base y barra final), con un GitHub falso.
// Compila la web, arranca el servidor y prueba el login, la seguridad, la lectura y la publicación.
//   cd ejemplo && npm install && npm test
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { githubFalso } from 'micms/pruebas';

// Compila como lo haría la integración continua (con un commit), para que version.json lo lleve.
const build = spawnSync('npx astro build', { shell: true, stdio: 'inherit', env: { ...process.env, GITHUB_SHA: '0123456789abcdef0123456789abcdef01234567' } });
if (build.status !== 0) process.exit(1);

const fallos = [];
const ok = (cond, que) => { console.log(`${cond ? '✔' : '✘'} ${que}`); if (!cond) fallos.push(que); };
const C = 'src/contenido';
const foto = readFileSync(`${C}/imagenes/uno.jpg`);
const gh = await githubFalso({ [`${C}/portada.json`]: readFileSync(`${C}/portada.json`), [`${C}/imagenes/uno.jpg`]: foto });

async function servidor(puerto, vars) {
  const p = spawn(process.execPath, ['dist/server/entry.mjs'], { env: { ...process.env, HOST: '127.0.0.1', PORT: String(puerto), ...vars }, stdio: ['ignore', 'pipe', 'pipe'] });
  p.stderr.on('data', (d) => process.env.VER && process.stderr.write(d));
  const url = `http://localhost:${puerto}`;
  for (let i = 0; i < 50; i++) { try { await fetch(url); return { url, p }; } catch { await new Promise((r) => setTimeout(r, 200)); } }
  throw new Error('el servidor no arranca');
}

const CLAVE = 'clave-de-prueba-larga';
const { url: U, p } = await servidor(4391, { MICMS_CLAVE: CLAVE, GITHUB_TOKEN: gh.token, GITHUB_REPO: gh.repo, GITHUB_API: gh.url });
const PANEL = `${U}/mi-web/admin/contenido/`;
const API = (a) => `${U}/mi-web/admin/contenido/api/${a}/`;
const f = (u, o = {}) => fetch(u, { redirect: 'manual', ...o });

try {
  let r = await f(`${U}/mi-web/`);
  ok(r.status === 200 && (await r.text()).includes('<h1>Hola</h1>'), 'la web estática sale con el contenido del JSON');
  r = await f(`${U}/mi-web/_micms/version.json`);
  ok(r.status === 200 && (await r.json()).commit?.length === 40, 'version.json con el commit, dentro de la base');

  r = await f(PANEL);
  let html = await r.text();
  ok(r.status === 200 && html.includes('name="clave"') && !html.includes('id="micms"'), 'sin sesión, el panel pide la clave');
  ok(r.headers.get('x-robots-tag') === 'noindex' && /no-store/.test(r.headers.get('cache-control') ?? ''), 'panel: noindex y sin caché');
  ok(html.includes('action="/mi-web/admin/contenido/api/entrar/"'), 'el formulario usa base y barra final');

  ok((await f(API('estado'))).status === 401, 'sin sesión, /api/estado da 401');
  ok((await f(API('publicar'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status === 401, 'sin sesión, publicar da 401');
  ok((await f(API('estado'), { headers: { Cookie: 'micms_sesion=9999999999.inventada' } })).status === 401, 'una cookie inventada no vale');

  const entrar = (clave, origen = U) =>
    f(API('entrar'), { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: origen }, body: new URLSearchParams({ clave }) });
  const t0 = Date.now();
  r = await entrar('mala-clave-123456');
  ok(r.status === 303 && r.headers.get('location')?.endsWith('?error=clave') && !r.headers.get('set-cookie'), 'clave incorrecta: vuelve con error y sin cookie');
  ok(Date.now() - t0 >= 900, 'clave incorrecta: tarda 1 s (frena los intentos)');
  r = await entrar(CLAVE, 'https://otra-web.com');
  ok(r.status === 403, 'entrar desde otra web: bloqueado por la comprobación de origen');

  r = await entrar(CLAVE);
  const sc = r.headers.get('set-cookie') ?? '';
  ok(r.status === 303 && /micms_sesion=\d+\./.test(sc), 'clave correcta: abre sesión');
  ok(/HttpOnly/i.test(sc) && /SameSite=Strict/i.test(sc) && /Path=\/mi-web\/admin\/contenido/i.test(sc), 'cookie HttpOnly, SameSite=Strict y solo para el gestor');
  const cookie = { Cookie: sc.split(';')[0] };

  html = await (await f(PANEL, { headers: cookie })).text();
  ok(html.includes('data-api="/mi-web/admin/contenido/api/ACCION/"') && html.includes('data-version="/mi-web/_micms/version.json"'), 'con sesión, el panel tiene las direcciones con base');

  r = await f(API('estado'), { headers: cookie });
  const E = await r.json();
  ok(r.status === 200 && E.ficheros['portada.json']?.datos.titulo === 'Hola' && E.imagenes.includes('uno.jpg'), 'estado: lee el contenido y las fotos de GitHub');
  ok(E.ficheros['portada.json'].esquema.etiqueta === 'Portada', 'estado: los esquemas llegan con sus etiquetas');

  r = await f(`${API('imagen')}?archivo=uno.jpg&ref=${E.commit}`, { headers: cookie });
  ok(r.status === 200 && r.headers.get('content-type') === 'image/jpeg', 'imagen: sirve la foto del repositorio');
  ok((await f(`${API('imagen')}?archivo=../../secreto&ref=${E.commit}`, { headers: cookie })).status === 400, 'imagen: no deja salir de la carpeta');

  // Pestaña «Instalación».
  ok((await f(API('diagnostico'))).status === 401, 'diagnóstico: sin sesión, 401');
  const diagnosticar = async () => (await f(API('diagnostico'), { headers: cookie })).json();
  let D = await diagnosticar();
  const nivel = (titulo) => D.comprobaciones.find((c) => c.titulo === titulo)?.nivel;
  ok(D.comprobaciones.every((c) => c.nivel !== 'error') && nivel('portada.json') === 'ok' && nivel('Fotos') === 'ok', 'diagnóstico: todo correcto sin errores');
  ok(D.commit === E.commit && D.ajustes.base === '/mi-web' && D.ajustes.ruta === '/admin/contenido' && D.ajustes.version, 'diagnóstico: commit y configuración');
  ok(nivel('API de GitHub') === 'aviso', 'diagnóstico: avisa de que GITHUB_API es solo para pruebas');
  ok(!JSON.stringify(D).includes(gh.token) && !JSON.stringify(D).includes(CLAVE), 'diagnóstico: no muestra el token ni la clave');

  const publicar = (cuerpo) => f(API('publicar'), { method: 'POST', headers: { ...cookie, 'Content-Type': 'application/json', Origin: U }, body: JSON.stringify(cuerpo) });
  const datos = structuredClone(E.ficheros['portada.json'].datos);

  r = await publicar({ base: E.commit, ficheros: { 'portada.json': { ...datos, titulo: 'x'.repeat(41) } } });
  const malo = await r.json();
  ok(r.status === 422 && malo.errores[0].ruta?.[0] === 'titulo', 'texto demasiado largo: 422 con el campo');
  ok(/40/.test(malo.errores[0].mensaje) && !/[Tt]oo/.test(malo.errores[0].mensaje), `mensaje en castellano: «${malo.errores[0].mensaje}»`);

  r = await publicar({ base: E.commit, ficheros: { 'portada.json': { ...datos, titulo: 'Hola de nuevo' } } });
  const c1 = (await r.json()).commit;
  ok(r.status === 200 && c1 && JSON.parse(gh.leer(`${C}/portada.json`)).titulo === 'Hola de nuevo', 'publicar: commit con el titular nuevo');
  ok(gh.commits.at(-1).message.startsWith('Contenido: portada.json'), `mensaje del commit: «${gh.commits.at(-1).message.split('\n')[0]}»`);

  r = await publicar({ base: E.commit, ficheros: { 'portada.json': { ...datos, titulo: 'Pisando' } } });
  ok(r.status === 409, 'publicar desde un commit viejo: 409, no pisa');

  r = await publicar({
    base: c1,
    ficheros: { 'portada.json': { ...datos, titulo: 'Hola de nuevo', foto: { archivo: 'dos.jpg', alt: 'Otra foto' } } },
    fotos: { 'dos.jpg': foto.toString('base64') },
  });
  ok(r.status === 200 && gh.existe(`${C}/imagenes/dos.jpg`) && !gh.existe(`${C}/imagenes/uno.jpg`), 'foto nueva: se sube y la que deja de usarse se retira');

  // Alguien sube a mano un JSON que no cumple: el diagnóstico lo encuentra y dice qué campo es.
  gh.publicarAparte(`${C}/portada.json`, JSON.stringify({ ...datos, titulo: '', foto: { archivo: 'no-existe.jpg', alt: 'x' } }));
  D = await diagnosticar();
  const p1 = D.comprobaciones.find((c) => c.titulo === 'portada.json');
  ok(p1?.nivel === 'error' && p1.detalle.includes('titulo'), `diagnóstico: JSON que no cumple → «${p1?.detalle}»`);
  ok(D.comprobaciones.find((c) => c.titulo === 'Fotos')?.detalle.includes('no-existe.jpg'), 'diagnóstico: foto que falta');

  r = await f(API('salir'), { method: 'POST', headers: { ...cookie, Origin: U, 'Content-Type': 'application/x-www-form-urlencoded' }, body: '' });
  ok(r.status === 303 && /micms_sesion=;|Max-Age=0|Expires=Thu, 01 Jan 1970/i.test(r.headers.get('set-cookie') ?? ''), 'salir: borra la cookie');
} finally {
  p.kill();
}

// Sin MICMS_CLAVE: el gestor no se abre y dice qué falta.
const s2 = await servidor(4392, { GITHUB_TOKEN: gh.token, GITHUB_REPO: gh.repo, GITHUB_API: gh.url });
try {
  const html = await (await fetch(`${s2.url}/mi-web/admin/contenido/`)).text();
  ok(html.includes('MICMS_CLAVE') && !html.includes('name="clave"'), 'sin MICMS_CLAVE: avisa y no deja entrar');
  ok((await fetch(`${s2.url}/mi-web/admin/contenido/api/estado/`)).status === 401, 'sin MICMS_CLAVE: la API no responde');
} finally {
  s2.p.kill();
}

// Sin los secretos de GitHub: el contenido no carga, pero el diagnóstico dice qué falta.
const s3 = await servidor(4393, { MICMS_CLAVE: CLAVE });
try {
  const base = `${s3.url}/mi-web/admin/contenido/api`;
  const r = await fetch(`${base}/entrar/`, { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: s3.url }, body: new URLSearchParams({ clave: CLAVE }) });
  const cookie = { Cookie: (r.headers.get('set-cookie') ?? '').split(';')[0] };
  ok((await fetch(`${base}/estado/`, { headers: cookie })).status === 503, 'sin GitHub: el contenido no carga (503)');
  const D = await (await fetch(`${base}/diagnostico/`, { headers: cookie })).json();
  const titulos = D.comprobaciones.filter((c) => c.nivel === 'error').map((c) => c.titulo);
  ok(titulos.includes('Token de GitHub') && titulos.includes('Repositorio'), `sin GitHub: el diagnóstico lo dice (${titulos.join(', ')})`);
} finally {
  s3.p.kill();
  await gh.cerrar();
}

console.log(fallos.length ? `\n${fallos.length} FALLOS` : '\nTodo bien');
process.exit(fallos.length ? 1 : 0);
