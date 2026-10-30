/* ============================================================
   Service Worker - Catálogo Técnico 3D (Vite)
   ------------------------------------------------------------
   Este archivo vive en /public, así que se publica tal cual
   en la raíz del sitio (/sw.js), sin pasar por el build.

   IMPORTANTE: cada vez que cambies archivos de la app o
   reemplaces un .glb, sube el número de VERSION.
   Si no, el móvil seguirá mostrando la copia en caché.
   ============================================================ */

const VERSION = 'catalogo-3d-v2';

const CACHE_APP = `${VERSION}-app`;
const CACHE_ASSETS = `${VERSION}-assets`;

// Solo archivos con ruta estable.
// El JS y el CSS generados por Vite llevan hash en el nombre,
// así que se cachean en tiempo de ejecución (rama "resto").
const ARCHIVOS_BASE = [
  '/',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon.png'
];

// Modelos, texturas y entorno
const EXTENSIONES_ASSETS = /\.(glb|gltf|bin|hdr|exr|ktx2|png|jpe?g|webp|gif|svg)$/i;


// ============================================================
// INSTALACIÓN
// ============================================================

self.addEventListener('install', (evento) => {

  evento.waitUntil((async () => {

    const cache = await caches.open(CACHE_APP);

    // Best-effort: si un archivo falla, la instalación
    // del Service Worker no se rompe por eso.
    await Promise.all(

      ARCHIVOS_BASE.map(async (url) => {

        try {
          await cache.add(url);
        } catch (error) {
          console.warn('[SW] No se pudo precachear:', url);
        }
      })
    );

    await self.skipWaiting();
  })());
});


// ============================================================
// ACTIVACIÓN (borra cachés de versiones anteriores)
// ============================================================

self.addEventListener('activate', (evento) => {

  evento.waitUntil((async () => {

    const claves = await caches.keys();

    await Promise.all(

      claves
        .filter((clave) => !clave.startsWith(VERSION))
        .map((clave) => caches.delete(clave))
    );

    await self.clients.claim();
  })());
});


// ============================================================
// FETCH
// ============================================================

self.addEventListener('fetch', (evento) => {

  const peticion = evento.request;

  // Solo GET del mismo origen
  if (peticion.method !== 'GET') return;

  const url = new URL(peticion.url);

  if (url.origin !== self.location.origin) return;


  // ----------------------------------------------------------
  // Navegación: red primero, caché como respaldo (offline)
  // ----------------------------------------------------------

  if (peticion.mode === 'navigate') {

    evento.respondWith((async () => {

      try {

        const respuesta = await fetch(peticion);

        const copia = respuesta.clone();

        const cache = await caches.open(CACHE_APP);

        cache.put('/', copia);

        return respuesta;

      } catch (error) {

        return (
          (await caches.match('/')) ||
          (await caches.match('/index.html')) ||
          new Response('Sin conexión', { status: 503 })
        );
      }
    })());

    return;
  }


  // ----------------------------------------------------------
  // Modelos y texturas: caché primero
  // (son pesados y no cambian sin subir VERSION)
  // ----------------------------------------------------------

  if (EXTENSIONES_ASSETS.test(url.pathname)) {

    evento.respondWith((async () => {

      const enCache = await caches.match(peticion);

      if (enCache) return enCache;

      const respuesta = await fetch(peticion);

      if (respuesta && respuesta.status === 200) {

        const copia = respuesta.clone();

        const cache = await caches.open(CACHE_ASSETS);

        cache.put(peticion, copia);
      }

      return respuesta;
    })());

    return;
  }


  // ----------------------------------------------------------
  // Resto (JS, CSS, HTML): sirve rápido y actualiza detrás
  // ----------------------------------------------------------

  evento.respondWith((async () => {

    const enCache = await caches.match(peticion);

    const desdeRed = fetch(peticion)
      .then(async (respuesta) => {

        if (respuesta && respuesta.status === 200) {

          const copia = respuesta.clone();

          const cache = await caches.open(CACHE_APP);

          cache.put(peticion, copia);
        }

        return respuesta;
      })
      .catch(() => enCache);

    return enCache || desdeRed;
  })());
});
