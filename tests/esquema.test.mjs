// Lectura de esquemas (src/comun/esquema.ts) y GitHub falso (pruebas/github-falso.mjs).
// Las pruebas del panel y la API completos están en la Plantilla (tests/contenido.test.mjs), con un Worker de verdad.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizar, recorrerImagenes, vacio } from '../src/comun/esquema.ts';
import { githubFalso } from '../pruebas/github-falso.mjs';

const texto = { type: 'string', minLength: 1, maxLength: 40, etiqueta: 'Nombre' };

describe('normalizar', () => {
  test('T | null: queda T marcado como anulable, con los metadatos del exterior', () => {
    const n = normalizar({ anyOf: [{ type: 'object', properties: { a: texto } }, { type: 'null' }], etiqueta: 'Colegiado' });
    assert.equal(n.type, 'object');
    assert.equal(n.anulable, true);
    assert.equal(n.etiqueta, 'Colegiado');
  });

  test("texto | '': queda texto que admite vacío", () => {
    const n = normalizar({ anyOf: [{ type: 'string', format: 'uri' }, { type: 'string', const: '' }], etiqueta: 'Instagram' });
    assert.equal(n.type, 'string');
    assert.equal(n.vacioPermitido, true);
    assert.equal(n.etiqueta, 'Instagram');
  });
});

test('vacio: respeta los campos obligatorios y el mínimo de elementos', () => {
  const e = {
    type: 'object',
    required: ['nombre', 'lista', 'activo'],
    properties: { nombre: texto, lista: { type: 'array', minItems: 2, items: texto }, activo: { type: 'boolean' }, opcional: texto },
  };
  assert.deepEqual(vacio(e), { nombre: '', lista: ['', ''], activo: false });
});

test('recorrerImagenes: encuentra las fotos y su ruta', () => {
  const foto = { type: 'string', tipo: 'imagen' };
  const e = {
    type: 'object',
    properties: { portada: { type: 'object', properties: { archivo: foto } }, galeria: { type: 'array', items: foto }, otro: texto },
  };
  const vistas = [];
  recorrerImagenes(e, { portada: { archivo: 'a.jpg' }, galeria: ['b.jpg', 'c.png'], otro: 'x.jpg' }, (a, r) => vistas.push([a, r.join('.')]));
  assert.deepEqual(vistas, [['a.jpg', 'portada.archivo'], ['b.jpg', 'galeria.0'], ['c.png', 'galeria.1']]);
});

describe('GitHub falso', () => {
  const api = (gh, ruta, init = {}) =>
    fetch(`${gh.url}/repos/${gh.repo}${ruta}`, { ...init, headers: { Authorization: `Bearer ${gh.token}`, ...init.headers } });

  test('commit con avance rápido y rechazo si la rama ha cambiado', async () => {
    const gh = await githubFalso({ 'a.txt': 'uno' });
    try {
      const base = gh.cabeza();
      const { tree } = await (await api(gh, `/git/commits/${base}`)).json();
      const arbol = await (await api(gh, '/git/trees', { method: 'POST', body: JSON.stringify({ base_tree: tree.sha, tree: [{ path: 'a.txt', mode: '100644', type: 'blob', content: 'dos' }] }) })).json();
      const c = await (await api(gh, '/git/commits', { method: 'POST', body: JSON.stringify({ message: 'm', tree: arbol.sha, parents: [base] }) })).json();
      gh.publicarAparte('b.txt', 'otro');
      const r = await api(gh, '/git/refs/heads/main', { method: 'PATCH', body: JSON.stringify({ sha: c.sha, force: false }) });
      assert.equal(r.status, 422);
      assert.equal(gh.leer('a.txt').toString(), 'uno');
    } finally {
      await gh.cerrar();
    }
  });

  test('sin token correcto: 401', async () => {
    const gh = await githubFalso({});
    try {
      const r = await fetch(`${gh.url}/repos/${gh.repo}/git/ref/heads/main`, { headers: { Authorization: 'Bearer otro' } });
      assert.equal(r.status, 401);
    } finally {
      await gh.cerrar();
    }
  });
});
