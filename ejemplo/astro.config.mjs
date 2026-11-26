// Web mínima compatible con micms. Usa a propósito una subcarpeta (`base`) y barra final (`trailingSlash`),
// como algunas webs publicadas en subcarpetas, para comprobar que el gestor respeta las dos cosas.
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import micms from 'micms';

export default defineConfig({
  site: 'https://ejemplo.com',
  base: '/mi-web',
  trailingSlash: 'always',
  adapter: node({ mode: 'standalone' }), // en Cloudflare: @astrojs/cloudflare
  integrations: [micms()], // login propio: secreto MICMS_CLAVE
});
