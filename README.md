# micms

Gestor de contenido para webs Astro. Desde el panel de la web, el cliente cambia **textos, fotos y SEO**, sin tocar el diseño. Al pulsar «Publicar», los cambios se guardan en el repositorio de GitHub de la web y Cloudflare vuelve a compilarla y publicarla.

- La web sigue siendo **estática**: no hay base de datos para el contenido.
- Los formularios se **generan solos** a partir de los esquemas Zod de la web (`src/contenido/esquemas.ts`): etiquetas, ayudas, límites de caracteres, número de elementos de las listas, proporción y tamaño mínimo de las fotos.
- **Nada se rompe:** se valida en el navegador, en el Worker antes de guardar y otra vez en `astro build`. Si algo no cumple, no se publica.
- **Nada se pisa:** cada publicación es un commit encima del que se abrió. Si alguien ha publicado entretanto, se avisa y no se guarda.
- El cliente **no necesita cuenta de GitHub**: el Worker usa un token guardado como secreto.

El plan completo, con las fases, está en [PLAN.md](PLAN.md).

## Qué necesita la web

Seguir la convención de la guía (`GUIA-WEB.md` → «Contenido editable»). Ejemplo completo: la Plantilla Landing Reservas.

- `src/contenido/*.json`: el contenido. Ningún texto del cliente escrito en los `.astro`.
- `src/contenido/esquemas.ts`: exporta `ESQUEMAS = { 'fichero.json': esquemaZod, … }`, con Zod de `astro/zod`.
- `src/contenido/imagenes/`: las fotos. En el JSON va solo el nombre del fichero.
- Opcional: `src/contenido/marcadores.ts`, que exporta `MARCADORES = { nombre: 'explicación' }` (los `{nombre}` que se sustituyen en los textos).
- Un panel con login que proteja la ruta del gestor (por defecto `/admin/contenido`), y comprobación de origen en los POST. **micms no tiene login propio.**
- Publicación en Cloudflare **conectada al repositorio** (Workers Builds), para que cada commit se publique solo.

### Metadatos de los esquemas (`.meta()`)

| Clave | Para qué |
|---|---|
| `etiqueta` | Nombre del campo, de la sección o de la pestaña |
| `ayuda` | Frase de ayuda debajo del campo |
| `tipo` | `linea` · `parrafo` · `titular` (vista previa de `*subrayado*` y `[píldora]`) · `email` · `telefono` · `url` · `imagen` |
| `imagen` | `{ proporcion, minAncho, transparente }`: la foto se recorta al centro con esa proporción en el navegador. Si es pequeña, se rechaza. Si `transparente`, solo PNG |
| `ocultarSi` | No muestra el campo si el campo hermano con ese nombre está marcado |
| `google` | En la raíz de un fichero: `{ titulo, descripcion }` con `{campo}`. Muestra cómo se verá en Google |

Lo demás sale del propio esquema: `max` → contador y límite, `min`/`max` de listas → añadir y quitar, `.nullable()` → casilla para activar el bloque, `.optional()` → campo que puede quedar vacío, listas de números → una línea separada por `;`.

## Instalación

```bash
npm install github:Bellit/micms
```

```js
// astro.config.mjs
import micms from 'micms';
export default defineConfig({
  integrations: [micms({ layout: 'src/layouts/Admin.astro' })],
});
```

Opciones: `layout` (plantilla del panel; recibe `title` y `actual="contenido"`), `carpeta` (`src/contenido`), `esquemas`, `marcadores` y `ruta` (`/admin/contenido`).

Añade la pestaña «Contenido» al menú del panel y, en `wrangler.jsonc`, que la ruta la ejecute el Worker (`run_worker_first` con `/admin/*`).

### Conectar con GitHub

1. GitHub → Settings → Developer settings → **Fine-grained tokens** → Generate new token.
   - Repository access: **solo el repositorio de esa web**.
   - Permissions → Repository → **Contents: Read and write**. Nada más.
   - Caducidad: la más larga que permita tu cuenta, y apúntala para renovarlo.
2. Guárdalo como secreto del Worker (nunca en el código ni en el chat):
   ```bash
   npx wrangler secret put GITHUB_TOKEN
   npx wrangler secret put GITHUB_REPO     # usuario/repositorio
   ```
   Opcional: `GITHUB_RAMA` si no es `main`.
3. Cloudflare → el Worker → Settings → **Builds** → conectar el repositorio. Build command: `npm run build`. Deploy command: `npx wrangler deploy`.

Para saber cuándo un cambio ya está en línea, la compilación escribe `/_micms/version.json` con el commit (`WORKERS_CI_COMMIT_SHA`). Si la web se compila a mano, el panel avisa de que los cambios se verán en la próxima publicación.

## Cómo funciona

| Ruta | Qué hace |
|---|---|
| `GET <ruta>` | El panel (`src/paginas/panel.astro` + `src/cliente/panel.ts`) |
| `GET <ruta>/api/estado` | Último commit, esquemas en JSON (`z.toJSONSchema`), datos de cada fichero y fotos que hay |
| `GET <ruta>/api/imagen?archivo=&ref=` | Una foto del repositorio, para verla en el panel |
| `POST <ruta>/api/publicar` | `{ base, ficheros, fotos }` → valida y hace un solo commit (API de Git de GitHub: blobs, tree, commit y avance de la rama sin forzar) |

Al publicar:
- Solo se guardan los ficheros que cambian.
- Las fotos nuevas se suben si se usan.
- Las fotos que el contenido deja de usar se borran del repositorio. Las demás no se tocan.
- Las fotos subidas se comprueban por sus primeros bytes y no pueden pasar de 5 MB cada una (20 MB por publicación).

Zod y los esquemas se cargan desde la web mediante un módulo virtual (`virtual:micms/config`), así hay una sola copia de Zod y de Astro.

## Pruebas

- `npm test`: lectura de esquemas y GitHub falso.
- `micms/pruebas` exporta `githubFalso()`, un servidor que imita la API de GitHub que usa micms. La Plantilla lo usa en `tests/contenido.test.mjs` para probar el panel y la API con un Worker de verdad: acceso, lectura, publicar, validación, conflictos y fotos.
