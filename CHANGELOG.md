# Cambios

Cada web instala una versión fija (`github:Bellit/micms#vX.Y.Z`). Al subir de versión, mira los apartados **«Al actualizar»**.

## 0.3.0 · Pestaña «Instalación»

- Nueva pestaña **«Instalación»** en el panel. Comprueba en el momento:
  - los secretos, sin mostrar su valor;
  - la conexión con GitHub, la rama y la caducidad del token (avisa 30 días antes);
  - que cada JSON esté en el repositorio y cumpla su esquema;
  - que no falten fotos;
  - que la web publicada sea la del último commit.
  
  Si algo falla, dice cómo arreglarlo. También muestra la configuración, los requisitos y el prompt para adaptar otra web, con un botón para copiarlo. El prompt se lee de PROMPT-ADAPTAR.md, así que no hay dos copias.
- Si el contenido no carga, el aviso tiene un botón «Comprobar la instalación».
- API: `GET <ruta>/api/diagnostico`. Funciona aunque falte la configuración de GitHub y exige sesión.
- El paquete incluye README, COMPATIBILIDAD, PROMPT-ADAPTAR y CHANGELOG.
- `ejemplo/`: 36 comprobaciones.

**Al actualizar:** nada.

## 0.2.0 · Para cualquier web Astro

Auditoría de lo que ataba micms a la Plantilla Landing Reservas y a Cloudflare.

- **Cualquier adaptador:** los secretos se leen con `astro:env/server` (antes, solo `cloudflare:workers`). Probado con `@astrojs/node` y con `@astrojs/cloudflare`.
- **Login propio** (`acceso: 'propio'`, por defecto): clave en el secreto `MICMS_CLAVE`, cookie firmada `HttpOnly` y `SameSite=Strict` solo para el gestor, 1 s de espera por intento fallido y botón «Salir». La API responde 401 sin sesión. Con `acceso: 'web'`, como antes: protege el login de la web.
- **Página propia** si la web no tiene panel: `layout` ya no es obligatorio.
- **`base` y `trailingSlash`:** el panel, la API, las fotos, `version.json` y el enlace a la web respetan la subcarpeta y la barra final.
- **Errores claros al compilar:** sin adaptador; `esquemas.ts` sin `export const ESQUEMAS`; esquemas que no son de Zod 4; nombres de fichero que no son `.json`; aviso si se importa `zod` en vez de `astro/zod`; opciones `acceso` y `ruta` no válidas.
- `version.json` también con Netlify (`COMMIT_REF`) y Vercel (`VERCEL_GIT_COMMIT_SHA`).
- `z.enum` se edita con un desplegable; `.meta({ opciones })` pone nombres legibles.
- Panel y API con `X-Robots-Tag: noindex` y sin caché.
- [COMPATIBILIDAD.md](COMPATIBILIDAD.md): requisitos exactos. [PROMPT-ADAPTAR.md](PROMPT-ADAPTAR.md): prompt para que una IA adapte una web.
- [`ejemplo/`](ejemplo/): web mínima compatible y prueba de extremo a extremo (27 comprobaciones).

**Al actualizar:**
- Webs con su propio login en el panel (la Plantilla): añade `acceso: 'web'` → `micms({ acceso: 'web', layout: 'src/layouts/Admin.astro' })`. Sin esto, micms pediría además su propia clave.
- Webs sin login: guarda el secreto `MICMS_CLAVE` (mínimo 12 caracteres).

## 0.1.0 · Primera versión

Panel generado a partir de los esquemas, publicación en un commit con la API de GitHub, fotos con recorte, vista previa de Google y `version.json`. Solo para la Plantilla Landing Reservas en Cloudflare.
