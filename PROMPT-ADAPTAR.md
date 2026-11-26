# Prompt para adaptar una web a micms

Cópialo entero y pégalo en la IA que trabaje en el repositorio de la web (Claude Code, por ejemplo). Funciona con webs Astro. Si la web no es Astro, la IA te lo dirá en el paso 1: primero habría que pasarla a Astro, y eso es otro trabajo.

Los requisitos que comprueba son los de [COMPATIBILIDAD.md](COMPATIBILIDAD.md). Ejemplo de web ya adaptada: [`ejemplo/`](ejemplo/).

---

```text
Quiero que esta web Astro sea compatible con micms, un gestor de contenido que deja al cliente cambiar
textos, fotos y SEO desde un panel, sin tocar el diseño. micms genera los formularios a partir de esquemas
Zod y guarda los cambios como commits en GitHub. Documentación y ejemplo: https://github.com/Bellit/micms
(COMPATIBILIDAD.md y la carpeta ejemplo/).

REGLA PRINCIPAL: la web tiene que verse EXACTAMENTE IGUAL antes y después. Solo cambia de dónde salen los
datos. No cambies diseño, estilos, estructura, textos ni orden de nada.

PASO 1 · DIAGNÓSTICO (no toques nada todavía)
Revisa el proyecto y dame una tabla con cada requisito, «cumple», «no cumple» o «no aplica», y qué habría
que hacer:
 1. Astro 7 o posterior.
 2. Repositorio en GitHub; rama que se publica (main u otra).
 3. Dónde se publica y si se publica sola al hacer commit. Si es GitHub Pages, FTP u otro alojamiento solo
    estático, dilo claramente: micms necesita servidor (Cloudflare Workers recomendado; también Netlify,
    Vercel o Node).
 4. Adaptador de servidor en astro.config (@astrojs/cloudflare, node, netlify o vercel).
 5. Dónde están ahora los textos, datos y fotos que el cliente podría querer cambiar. Haz una lista por
    página y componente: textos escritos en .astro, constantes en .ts, Markdown, fotos en public/ o src/.
 6. Si ya existe src/contenido/ y src/contenido/esquemas.ts.
 7. base y trailingSlash de astro.config (están soportados; solo anótalo).
 8. Si ya hay un panel con login (por ejemplo, en /admin).
Después, PARA y espera a que te diga «sigue».

PASO 2 · CONTENIDO EN JSON
 - Crea src/contenido/ con un JSON por bloque lógico, en castellano y con nombres claros: por ejemplo
   negocio.json (nombre, contacto, dirección, horario, redes, título y descripción para Google),
   portada.json (textos de la portada) y otro por cada página con contenido propio.
 - Mueve ahí TODO lo que el cliente pueda querer cambiar: textos, teléfonos, correos, horarios, precios,
   listas (servicios, preguntas frecuentes, opiniones...), título y descripción de cada página.
 - NO muevas lo que no debe tocar el cliente: colores, tipografías, logo, estructura, orden de secciones,
   claves técnicas, dominio, analítica.
 - Copia los textos tal cual, carácter a carácter (acentos, comillas, saltos de línea).

PASO 3 · FOTOS
 - Las fotos que el cliente pueda cambiar van a src/contenido/imagenes/ con nombres en minúsculas, sin
   espacios ni acentos ([a-z0-9-]) y extensión jpg, jpeg, png, webp o avif.
 - En el JSON va solo el nombre del fichero y, al lado, su texto alternativo: { "archivo": "local.jpg",
   "alt": "Fachada del local" }. Si una foto no tenía texto alternativo, escribe uno que describa la foto y
   avísame para revisarlo.
 - En las páginas, cárgalas con import.meta.glob('../contenido/imagenes/*', { eager: true }) y píntalas
   con <Image> o <Picture> de astro:assets, con el mismo tamaño y clases que antes.
 - El logo, los iconos y las imágenes de diseño se quedan donde están.

PASO 4 · ESQUEMAS
Crea src/contenido/esquemas.ts:
 - import { z } from 'astro/zod'  (nunca el paquete 'zod' aparte).
 - Un esquema por JSON y al final: export const ESQUEMAS = { 'portada.json': Portada, ... }
   con TODOS los JSON de src/contenido/.
 - Cada texto con .max(n): la longitud máxima que cabe en el diseño sin romperlo. Mídelo mirando el
   diseño (móvil incluido); como referencia, el texto actual más un margen razonable. .min(1) si no puede
   quedar vacío.
 - Cada lista con .min(n) y .max(n) de elementos según lo que admite el diseño.
 - Cada campo con .meta({ etiqueta: 'Nombre que entienda el cliente' }) y, si ayuda, ayuda: 'Una frase'.
   Las secciones (objetos) también llevan etiqueta.
 - Tipos en meta: 'parrafo' (texto largo), 'titular', 'email', 'telefono', 'url', 'imagen'.
 - Fotos: .meta({ etiqueta, tipo: 'imagen', imagen: { proporcion: ancho/alto, minAncho: píxeles } }) con
   la proporción en la que se muestra en el diseño.
 - Opciones cerradas: z.enum([...]).meta({ opciones: { valor: 'Texto visible' } }).
 - En el esquema de negocio.json (o el que tenga el SEO), en la raíz:
   .meta({ etiqueta: '...', google: { titulo: '{campoTitulo}', descripcion: '{campoDescripcion}' } }).
 - No uses z.union de tipos distintos, z.record, z.date ni z.tuple en src/contenido/.

PASO 5 · LAS PÁGINAS LEEN Y VALIDAN EL CONTENIDO
 - Las páginas y componentes importan los JSON y los pasan por su esquema antes de usarlos:
     import datos from '../contenido/portada.json';
     import { Portada } from '../contenido/esquemas';
     const portada = Portada.parse(datos);
   Si el contenido no cumple el esquema, la compilación tiene que fallar.
 - Si hay un fichero de configuración (por ejemplo src/data/negocio.ts) que usan muchas páginas, haz que
   siga exportando lo mismo pero leyendo del JSON, así cambian menos ficheros.
 - Cero textos editables escritos a mano en .astro, .ts o componentes.

PASO 6 · MICMS
 - npm install github:Bellit/micms#v0.2.0
 - Si no hay adaptador de servidor, añade el que corresponda a donde se publica (recomendado:
   @astrojs/cloudflare). Las páginas tienen que seguir siendo estáticas (no cambies output ni añadas
   prerender = false a las páginas de la web).
 - En astro.config: import micms from 'micms'; e integrations: [..., micms()].
   Si la web ya tiene un panel con login que protege /admin: micms({ acceso: 'web', layout: 'ruta del
   layout del panel' }) y añade al menú del panel un enlace a /admin/contenido. Comprueba que el login
   protege /admin/contenido y /admin/contenido/api/*.
 - En Cloudflare, si wrangler.jsonc tiene assets.run_worker_first, incluye "/admin/*".
 - Añade a .dev.vars.example (o al README) los secretos, SIN valores: MICMS_CLAVE (salvo acceso 'web'),
   GITHUB_TOKEN, GITHUB_REPO. Nunca escribas valores de secretos en el código ni me los pidas: los
   guardo yo con `npx wrangler secret put NOMBRE` o en el panel del alojamiento.

PASO 7 · COMPROBAR QUE TODO SIGUE IGUAL
 - Antes de empezar el paso 2, compila y guarda una copia de dist/ (o el HTML de cada página).
 - Al terminar, vuelve a compilar y compara el HTML de cada página con el de antes. Las únicas diferencias
   aceptables son nombres de ficheros de imagen optimizada y el atributo alt si lo has añadido tú.
   Explícame cada diferencia.
 - Prueba que la validación funciona: pon temporalmente un texto más largo que su máximo, comprueba que
   `npm run build` falla diciendo qué campo es, y deshazlo.
 - Pasa los tests y el comprobador de tipos del proyecto, si los hay.

AL TERMINAR, dame:
 - La lista de JSON creados y qué contiene cada uno.
 - Las longitudes máximas que has elegido para los textos que se ven en la portada, para que las revise.
 - Los textos alternativos que has escrito tú.
 - Lo que tengo que hacer yo: crear el token de GitHub (grano fino, solo este repositorio, Contents: Read
   and write), guardar los secretos y conectar la publicación al repositorio.
No hagas commit ni push hasta que te lo diga.
```
