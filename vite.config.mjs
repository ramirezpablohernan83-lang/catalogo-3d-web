import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';


const assetsDirectory = resolve(process.cwd(), 'public', 'assets');


function listarModelosGlb() {

  try {

    return readdirSync(assetsDirectory, { withFileTypes: true })
      .filter((entrada) => entrada.isFile() && /\.glb$/i.test(entrada.name))
      .sort((a, b) =>
        a.name.localeCompare(b.name, 'es', {
          numeric: true,
          sensitivity: 'base'
        })
      )
      .map((entrada) => {

        const archivo = entrada.name;
        const base = archivo.replace(/\.glb$/i, '');

        return {
          file: archivo,
          url: `/assets/${encodeURIComponent(archivo)}`,
          label: base.replace(/[_-]+/g, ' ').trim()
        };
      });

  } catch (error) {

    console.warn('No se pudo leer public/assets:', error);

    return [];
  }
}


function manifiestoModelosPlugin() {

  return {

    name: 'manifiesto-modelos-glb',

    configureServer(server) {

      // En desarrollo, volver a leer la carpeta cada vez que el
      // navegador solicite la lista de modelos.
      server.middlewares.use('/modelos.json', (_request, response) => {

        response.statusCode = 200;
        response.setHeader('Content-Type', 'application/json; charset=utf-8');
        response.setHeader('Cache-Control', 'no-store');
        response.end(JSON.stringify(listarModelosGlb()));
      });
    },

    generateBundle() {

      // En producción, incluir la misma lista en la salida de Vite.
      this.emitFile({
        type: 'asset',
        fileName: 'modelos.json',
        source: JSON.stringify(listarModelosGlb(), null, 2)
      });
    }
  };
}


export default defineConfig({
  plugins: [manifiestoModelosPlugin()]
});
