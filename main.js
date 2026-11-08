import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';


// ============================================================
// 1. ESCENA, CÁMARA PRINCIPAL Y RENDERER
// ============================================================

const container = document.querySelector('#webgl-container');
const scene = new THREE.Scene();

// FOV vertical de referencia (paisaje).
// En pantallas verticales el FOV se abre solo lo necesario
// para no perder campo de visión horizontal.
const FOV_BASE = 45;
const FOV_HORIZONTAL_MINIMO = 50;
const FOV_VERTICAL_MAXIMO = 70;

const camera = new THREE.PerspectiveCamera(FOV_BASE, 1, 0.1, 100);

const renderer = new THREE.WebGLRenderer({ antialias: true });

renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

container.appendChild(renderer.domElement);


// ------------------------------------------------------------
// FOV vertical que garantiza un mínimo de campo horizontal.
// ------------------------------------------------------------

function calcularFovVertical(aspecto) {

  const medioH =
    Math.tan(THREE.MathUtils.degToRad(FOV_BASE) / 2) * aspecto;

  const medioHMinimo =
    Math.tan(THREE.MathUtils.degToRad(FOV_HORIZONTAL_MINIMO) / 2);

  let fov = FOV_BASE;

  if (medioH < medioHMinimo) {

    fov = THREE.MathUtils.radToDeg(
      2 * Math.atan(medioHMinimo / aspecto)
    );
  }

  return Math.min(fov, FOV_VERTICAL_MAXIMO);
}


// ------------------------------------------------------------
// Redimensionado: siempre a partir del tamaño REAL del
// contenedor (no de window.innerWidth/innerHeight).
// ------------------------------------------------------------

function redimensionar() {

  const ancho = container.clientWidth || window.innerWidth;

  const alto = container.clientHeight || window.innerHeight;

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  renderer.setSize(ancho, alto, false);

  camera.aspect = ancho / alto;

  camera.fov = calcularFovVertical(camera.aspect);

  camera.updateProjectionMatrix();

  // Si el usuario todavía no ha girado la vista,
  // reencuadramos para la nueva relación de aspecto.
  if (typeof aplicarVistaReferencia === 'function') {

    aplicarVistaReferencia();
  }
}

window.addEventListener('resize', redimensionar);

window.addEventListener('orientationchange', () => {

  // El navegador tarda un instante en reportar el nuevo tamaño.
  setTimeout(redimensionar, 250);
});

if (window.visualViewport) {

  window.visualViewport.addEventListener(
    'resize',
    redimensionar
  );
}


// ============================================================
// 2. ILUMINACIÓN
// ============================================================

const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
dirLight.position.set(5, 10, 7);
scene.add(dirLight);


// ============================================================
// 3. ENTORNO HDRI
// ============================================================

const rgbeLoader = new RGBELoader();

rgbeLoader.load(
  '/assets/hdri.hdr',
  (texture) => {
    texture.mapping = THREE.EquirectangularReflectionMapping;

    scene.environment = texture;
    scene.background = texture;
  },
  undefined,
  (error) => {
    console.warn("⚠️ No se pudo cargar el HDRI:", error);
  }
);


// ============================================================
// 4. ORBIT CONTROLS
// ============================================================

const controls = new OrbitControls(
  camera,
  renderer.domElement
);

controls.enableDamping = true;
controls.dampingFactor = 0.05;

controls.minDistance = 2;
controls.maxDistance = 15;

controls.maxPolarAngle = Math.PI / 2 - 0.05;
controls.minPolarAngle = 0.1;

controls.enablePan = false;


// ============================================================
// 4.1 ENCUADRE INDEPENDIENTE DEL DISPOSITIVO
// ============================================================

// Relación de aspecto con la que se compuso la escena en
// Blender (referencia). En cualquier otra pantalla se corrige
// la distancia de forma proporcional, sin trucos fijos.
const ASPECTO_REFERENCIA = 16 / 9;
const FOV_REFERENCIA = 45;
const MARGEN_ENCUADRE = 1.05;

let focoActual = new THREE.Vector3();
let dirActual = new THREE.Vector3(0, 0.45, 1).normalize();
let distanciaReferencia = 6;
let radioActual = 1;
let vistaLista = false;
let usuarioInteractuo = false;


// Ángulo de apertura efectivo (el más restrictivo entre
// vertical y horizontal) para una cámara dada.
function fovEfectivo(fovVertical, aspecto) {

  const fovV = THREE.MathUtils.degToRad(fovVertical);

  const fovH = 2 * Math.atan(Math.tan(fovV / 2) * aspecto);

  return Math.min(fovV, fovH);
}


// Cuánto hay que alejar la cámara respecto al encuadre de
// referencia (1 = idéntico a Blender en 16:9).
function factorEncuadre() {

  const referencia =
    Math.sin(fovEfectivo(FOV_REFERENCIA, ASPECTO_REFERENCIA) / 2);

  const actual =
    Math.sin(fovEfectivo(camera.fov, camera.aspect) / 2);

  return referencia / actual;
}


// Distancia mínima para que el producto quepa entero.
function distanciaMinimaVisible() {

  const medio = fovEfectivo(camera.fov, camera.aspect) / 2;

  return (radioActual / Math.sin(medio)) * MARGEN_ENCUADRE;
}


function distanciaVista() {

  return Math.max(
    distanciaReferencia * factorEncuadre(),
    distanciaMinimaVisible()
  );
}


function aplicarVistaReferencia() {

  if (!vistaLista) return;


  // Un resize durante el enganche no debe interrumpir la
  // interpolación ni reencuadrar la cámara de golpe.
  if (transicionRecorrido.activa) return;


  // Si la cámara está sobre el carril, un resize del móvil
  // (barra de direcciones, giro de pantalla) no debe sacarla
  // de la curva ni reencuadrar hacia otro lado.
  if (recorrido.segmentos.length) {

    const enCarril = puntoEnLongitud(recorrido.posicion);

    const tolerancia = Math.max(radioActual * 0.02, 1e-3);

    if (camera.position.distanceTo(enCarril) <= tolerancia) {

      aplicarRecorrido(recorrido.posicion);

      return;
    }
  }


  camera.position
    .copy(focoActual)
    .addScaledVector(dirActual, distanciaVista());

  controls.target.copy(focoActual);

  controls.update();
}


// ============================================================
// 5. CONTROLADORES DE MENÚS
// ============================================================

const sidebar = document.getElementById('sidebar');
const toggleSidebarBtn = document.getElementById('toggle-sidebar');

toggleSidebarBtn.addEventListener('click', () => {
  sidebar.classList.toggle('collapsed');
});


const specsPanel = document.getElementById('specs-panel');
const toggleSpecsBtn = document.getElementById('toggle-specs');

toggleSpecsBtn.addEventListener('click', () => {
  specsPanel.classList.toggle('collapsed');
});


// ============================================================
// 6. TARJETA DE BIENVENIDA
// ============================================================

window.cerrarBienvenida = function () {

  const overlay = document.getElementById('welcome-overlay');

  if (overlay) {

    overlay.classList.add('hidden');

    console.log("🔓 Tarjeta de bienvenida cerrada.");
  }
};


// ============================================================
// 7. VARIABLES DE ESTADO
// ============================================================

let modeloActual = null;

let puntosInteres = [];

let cotaActiva = null;


// ============================================================
// 8. VARIABLES DE ANIMACIÓN DE CÁMARA
// ============================================================

let animandoCamara = false;

let tiempoInicioAnimacion = 0;

const duracionAnimacion = 1200;

let posInicialCamara = new THREE.Vector3();

let targetPosCamara = new THREE.Vector3();

let focusInicialControls = new THREE.Vector3();

let targetFocusControls = new THREE.Vector3();


// ============================================================
// 9. INTERACCIÓN DEL USUARIO
// ============================================================

controls.addEventListener('start', () => {

  window.cerrarBienvenida();

  usuarioInteractuo = true;

  if (animandoCamara) {
    animandoCamara = false;
  }

});


// ============================================================
// 10. CARGADOR GLB
// ============================================================

// Caja envolvente calculada SOLO con la geometría visible.
//
// Box3.setFromObject() incluye los objetos ocultos (cotas,
// líneas de medida, etc.). Como esas cotas suelen estar
// desplazadas a un lado del producto, su centro dejaba de
// coincidir con el centro real: la cámara apuntaba al lado
// y el modelo aparecía corrido, sobre todo en vertical.
function calcularCajaVisible(raiz) {

  const caja = new THREE.Box3();

  const cajaParcial = new THREE.Box3();

  raiz.updateMatrixWorld(true);

  raiz.traverse((objeto) => {

    if (!objeto.isMesh || !objeto.geometry) return;

    // Comprobar también los padres (grupos ocultos)
    let visible = true;

    let padre = objeto;

    while (padre) {

      if (padre.visible === false) {
        visible = false;
        break;
      }

      padre = padre.parent;
    }

    if (!visible) return;

    if (!objeto.geometry.boundingBox) {

      objeto.geometry.computeBoundingBox();
    }

    cajaParcial
      .copy(objeto.geometry.boundingBox)
      .applyMatrix4(objeto.matrixWorld);

    caja.union(cajaParcial);
  });

  return caja;
}


// Busca una Custom Property sin importar mayúsculas ni el
// guion bajo que agrega el exporter (info / _info / Info).
function propiedadDe(objeto, clave) {

  const datos = (objeto && objeto.userData) || {};

  const buscada = clave.toLowerCase();

  for (const nombre of Object.keys(datos)) {

    if (
      nombre.toLowerCase().replace(/^_/, '') === buscada
    ) {

      return datos[nombre];
    }
  }

  return undefined;
}


// Texto de una Custom Property de Blender exportada en el .glb.
// Blender la guarda en "extras" y three la expone en userData.
function leerPropiedadTexto(objeto, clave) {

  const valor = propiedadDe(objeto, clave);

  if (typeof valor === 'string') return valor.trim();

  if (typeof valor === 'number') return String(valor);

  return '';
}


// CAM_01__Fijacion_del_rin  →  "Fijacion del rin"
function nombreVisibleDeCamara(nombre) {

  return (
    String(nombre).split('__')[1] ||
    String(nombre)
  )
    .replace(/_/g, ' ')
    .trim();
}


const loader = new GLTFLoader();


// ============================================================
// 11. CARGAR MODELO
// ============================================================

function cargarModelo(pathArchivo) {

  // Eliminar modelo anterior
  if (modeloActual) {

    scene.remove(modeloActual);

    modeloActual = null;
  }


  // Reiniciar información
  puntosInteres = [];

  cotaActiva = null;

  animandoCamara = false;

  tarjetaActiva = null;

  ocultarTarjeta();

  limpiarRecorrido();


  // Cargar GLB
  loader.load(

    pathArchivo,

    (gltf) => {

      // ------------------------------------------------------
      // MODELO
      // ------------------------------------------------------

      modeloActual = gltf.scene;

      scene.add(modeloActual);

      modeloActual.updateMatrixWorld(true);


      // ------------------------------------------------------
      // CONTENEDORES
      // ------------------------------------------------------

      const camarasRegulares = [];

      let camaraLibreObjeto = null;

      // Nodo "CURVA" que define el carril de recorrido
      let nodoCurva = null;

      const targetsEncontrados = new Map();

      const cotasEncontradas = new Map();


      // ======================================================
      // RECORRER TODOS LOS OBJETOS DEL GLB
      // ======================================================

      modeloActual.traverse((child) => {

        const nombreOriginal = child.name.trim();

        const nombre = nombreOriginal.toUpperCase();

        const nombreLower = nombreOriginal.toLowerCase();


        // ----------------------------------------------------
        // TARGETS
        //
        // TARGET_01
        // TARGET_02
        // TARGET_03
        // ----------------------------------------------------

        const coincidenciaTarget =
  nombre.match(/^TARGET_(\d{2})(?:__.*)?$/);


        if (coincidenciaTarget) {

          const worldPos = new THREE.Vector3();

          child.getWorldPosition(worldPos);

          const numeroTarget =
            coincidenciaTarget[1];

          targetsEncontrados.set(
            numeroTarget,
            {
              posicion: worldPos,

              // Texto editable desde Blender (Custom Properties)
              info: leerPropiedadTexto(child, 'info'),

              titulo: leerPropiedadTexto(child, 'titulo')
            }
          );

          console.log(
            `🎯 TARGET_${numeroTarget} detectado`
          );


          // ------------------------------------------------
          // Ayuda de autoría
          //
          // Error típico en Blender: dejar la propiedad con
          // el nombre "prop" (el que pone New por defecto)
          // en vez de renombrarla a "info".
          // ------------------------------------------------

          // three agrega "name" a userData: no cuenta como property
          const properties =
            Object.keys(child.userData || {})
              .filter((clave) => clave !== 'name');

          const infoCruda =
            propiedadDe(child, 'info');

          if (
            infoCruda === undefined &&
            properties.length
          ) {

            console.warn(
              `⚠️ TARGET_${numeroTarget}: tiene ` +
              `[${properties.join(', ')}] pero ninguna ` +
              'se llama "info". Renombrala en Blender.'
            );

          } else if (
            typeof infoCruda === 'number'
          ) {

            console.warn(
              `⚠️ TARGET_${numeroTarget}: "info" es ` +
              'numérica. Cambiala a String en Blender.'
            );
          }
        }


        // ----------------------------------------------------
        // CURVA DE RECORRIDO
        //
        // CURVA
        //
        // En Blender es una curva, pero dentro del .glb viaja
        // como líneas (hay que exportar con "Loose Edges").
        // ----------------------------------------------------

        if (/^CURVA(?:$|[._])/.test(nombre)) {

          nodoCurva = child;

          // El carril es solo una guía: no se dibuja
          child.visible = false;

          console.log('🛤️ CURVA detectada');
        }


        // ----------------------------------------------------
        // CÁMARAS
        //
        // CAM_LIBRE
        // CAM_01
        // CAM_02
        // CAM_03...
        // ----------------------------------------------------

        if (child.isCamera) {

          // Cámara inicial
          if (nombre === 'CAM_LIBRE') {

            camaraLibreObjeto = child;

            console.log(
              '📷 CAM_LIBRE detectada'
            );
          }

          // Cámaras técnicas
          else if (/^CAM_\d{2}(?:__.*)?$/.test(nombre)) {

            camarasRegulares.push(child);

            console.log(
              `📷 ${nombre} detectada`
            );
          }
        }


        // ----------------------------------------------------
        // COTAS / MEDIDAS
        // ----------------------------------------------------

        if (
          nombreLower.includes('cota') ||
          nombreLower.includes('medida')
        ) {

          if (child.material) {

            child.material.transparent = true;

            child.material.opacity = 0;
          }

          child.visible = false;


          const claveLimpia =
            nombreLower
              .replace('cota_', '')
              .replace('medida_', '')
              .replace('.001', '');


          cotasEncontradas.set(
            claveLimpia,
            child
          );
        }

      });


      // ------------------------------------------------------
      // CALCULAR CENTRO Y TAMAÑO DEL MODELO
      // (ya con las cotas ocultas, así que no cuentan)
      // ------------------------------------------------------

      const boxCompleta = new THREE.Box3().setFromObject(modeloActual);

      const box = calcularCajaVisible(modeloActual);

      if (box.isEmpty()) {
        box.copy(boxCompleta);
      }

      const boxCenter = box.getCenter(
        new THREE.Vector3()
      );

      const sphere = new THREE.Sphere();

      box.getBoundingSphere(sphere);

      const radioModelo = sphere.radius;


      // Diagnóstico: si el centro "con cotas" está lejos del
      // centro real, era justo lo que descuadraba la vista.
      const centroCompleto = boxCompleta.getCenter(
        new THREE.Vector3()
      );

      if (centroCompleto.distanceTo(boxCenter) > radioModelo * 0.02) {

        console.info(
          '🧭 La caja con objetos ocultos (cotas) estaba desplazada:',
          centroCompleto,
          '→ centro real:',
          boxCenter
        );
      }


      // La cámara se adapta al tamaño real del producto
      camera.near = Math.max(radioModelo / 100, 0.01);

      camera.far = radioModelo * 100;

      camera.updateProjectionMatrix();

      controls.minDistance = radioModelo * 0.6;

      controls.maxDistance = radioModelo * 12;


      // Preparar el recorrido por la CURVA (si existe)
      prepararRecorrido(nodoCurva, boxCenter);


      // ======================================================
      // MOSTRAR RESUMEN DE LO ENCONTRADO
      // ======================================================

      console.log('--------------------------------------');

      console.log('🔎 RESUMEN DEL GLB');

      console.log(
        'Centro del modelo:',
        boxCenter
      );

      console.log(
        'Radio aproximado:',
        radioModelo
      );

      console.log(
        'Targets encontrados:',
        targetsEncontrados.size
      );

      console.log(
        'Cámaras técnicas:',
        camarasRegulares.length
      );

      console.log(
        'CAM_LIBRE:',
        camaraLibreObjeto ? '✓' : '✗'
      );

      console.log(
        'Curva de recorrido:',
        recorrido.segmentos.length ? '✓' : '✗'
      );

      console.log('--------------------------------------');


      // ======================================================
      // PROCESAR CÁMARAS TÉCNICAS
      //
      // CAM_01 → TARGET_01
      // CAM_02 → TARGET_02
      // CAM_03 → TARGET_03
      // ======================================================

      camarasRegulares.forEach((cam) => {

        const posicionCamara =
          new THREE.Vector3();

        cam.getWorldPosition(
          posicionCamara
        );


        const nombreCam =
          cam.name
            .trim()
            .toUpperCase();


        const coincidenciaCam =
          nombreCam.match(/^CAM_(\d{2})(?:__.*)?$/);


        if (!coincidenciaCam) {
          return;
        }


        const numeroCamara =
          coincidenciaCam[1];


        // ----------------------------------------------------
        // BUSCAR TARGET EXACTO
        // ----------------------------------------------------

        const datosTarget =
          targetsEncontrados.get(numeroCamara);

        let puntoEnfoque = datosTarget
          ? datosTarget.posicion.clone()
          : null;


        if (puntoEnfoque) {

          console.log(
            `🔗 ${nombreCam} → TARGET_${numeroCamara} ✓`
          );

        } else {

          // --------------------------------------------------
          // FALLBACK
          //
          // Si falta TARGET_XX utilizamos la dirección
          // propia de la cámara.
          // --------------------------------------------------

          const quaternionMundo =
            new THREE.Quaternion();

          cam.getWorldQuaternion(
            quaternionMundo
          );


          const direccion =
            new THREE.Vector3(
              0,
              0,
              -1
            );


          direccion.applyQuaternion(
            quaternionMundo
          );


          puntoEnfoque =
            posicionCamara
              .clone()
              .add(
                direccion.multiplyScalar(3)
              );


          console.warn(
            `⚠️ No se encontró TARGET_${numeroCamara} para ${nombreCam}`
          );
        }


        // ----------------------------------------------------
        // TEXTO DE LA TARJETA
        //
        // 1) Custom Property "info" del TARGET_XX  (recomendado)
        // 2) Custom Property "info" de la cámara CAM_XX
        // 3) vacío → no se muestra tarjeta
        // ----------------------------------------------------

        const infoTarjeta =
          (datosTarget && datosTarget.info) ||
          leerPropiedadTexto(cam, 'info');

        const tituloTarjeta =
          (datosTarget && datosTarget.titulo) ||
          leerPropiedadTexto(cam, 'titulo') ||
          nombreVisibleDeCamara(cam.name);


        // ----------------------------------------------------
        // BUSCAR COTA ASOCIADA
        // ----------------------------------------------------

        let cotaAsociada = null;


        for (
          const [clave, meshCota]
          of cotasEncontradas.entries()
        ) {

          if (
            nombreCam
              .toLowerCase()
              .includes(clave)
          ) {

            cotaAsociada = meshCota;

            break;
          }
        }


        // ----------------------------------------------------
        // GUARDAR PUNTO DE INTERÉS
        // ----------------------------------------------------

        puntosInteres.push({

          nombre: cam.name,

          posicion: posicionCamara,

          target: puntoEnfoque,

          cota: cotaAsociada,

          info: infoTarjeta,

          titulo: tituloTarjeta,

          esLibre: false

        });

      });


      // ======================================================
      // PROCESAR CAM_LIBRE
      // ======================================================

      if (camaraLibreObjeto) {

        const posLibreMundo =
          new THREE.Vector3();


        camaraLibreObjeto.getWorldPosition(
          posLibreMundo
        );


        puntosInteres.push({

          nombre: 'CAM_LIBRE',

          posicion: posLibreMundo,

          // IMPORTANTE:
          // La posición viene de Blender,
          // pero el centro de órbita es el centro
          // geométrico real del producto.
          target: boxCenter.clone(),

          cota: null,

          info: '',

          titulo: '',

          esLibre: true

        });


        console.log(
          '✅ CAM_LIBRE configurada como vista inicial.'
        );

        console.log(
          '🎯 Centro orbital:',
          boxCenter
        );

      } else {

        console.warn(
          '⚠️ No se encontró CAM_LIBRE.'
        );

      }


      // ======================================================
      // POSICIONAMIENTO INICIAL
      // ======================================================

      if (puntosInteres.length > 0) {

        // Preferir siempre CAM_LIBRE
        const vistaInicial =
          puntosInteres.find(
            (p) => p.esLibre
          ) ||
          puntosInteres[0];


        // Guardamos el encuadre de referencia TAL COMO lo
        // compusiste en Blender: ángulo y distancia reales.
        const dir = vistaInicial.posicion
          .clone()
          .sub(vistaInicial.target);

        const distanciaBlender = dir.length();

        if (distanciaBlender < 1e-4) {

          dir.set(0, 0.45, 1);

        }

        dir.normalize();


        focoActual.copy(vistaInicial.target);

        dirActual.copy(dir);

        radioActual = radioModelo;

        distanciaReferencia =
          distanciaBlender > 1e-4
            ? distanciaBlender
            : radioModelo * 2.5;


        vistaLista = true;

        usuarioInteractuo = false;

        aplicarVistaReferencia();


        console.log(
          '🚀 Vista inicial:',
          vistaInicial.nombre
        );

        console.log(
          '📏 Factor de encuadre:',
          factorEncuadre().toFixed(3)
        );

      } else {

        // ----------------------------------------------------
        // VISTA AUTOMÁTICA DE EMERGENCIA
        // ----------------------------------------------------

        focoActual.copy(boxCenter);

        dirActual.set(0, 0.45, 1).normalize();

        radioActual = radioModelo;

        distanciaReferencia =
          (radioModelo /
            Math.sin(
              fovEfectivo(
                FOV_REFERENCIA,
                ASPECTO_REFERENCIA
              ) / 2
            )) * 1.15;


        vistaLista = true;

        usuarioInteractuo = false;

        aplicarVistaReferencia();


        console.log(
          'ℹ️ No se encontraron cámaras. Se utiliza vista automática.'
        );
      }


      // ------------------------------------------------------
      // GENERAR BOTONES
      // ------------------------------------------------------

      renderizarBotonesDeCamara();

    },


    undefined,


    (error) => {

      console.error(
        '❌ Error al cargar modelo:',
        error
      );

    }

  );

}


// ============================================================
// 12. GENERAR BOTONES DE CÁMARAS
// ============================================================

function renderizarBotonesDeCamara() {

  const contenedor =
    document.getElementById(
      'lista-vistas-dinamica'
    );


  contenedor.innerHTML = '';


  if (puntosInteres.length === 0) {

    contenedor.innerHTML =
      `<div style="
        color: #94a3b8;
        font-size: 0.65rem;
        text-align: center;
        padding: 6px;
      ">
        Sin cámaras en .glb
      </div>`;

    return;
  }


  puntosInteres.forEach(
    (punto, index) => {

      const div =
        document.createElement('div');


      div.className =
        'btn-vista-item';


      div.onclick = () =>
        seleccionarPuntoDeInteres(index);


      // ----------------------------------------------------
      // ICONO
      // ----------------------------------------------------

      const icono =
        punto.esLibre
          ? '🔄'
          : '📍';


      const nombreVisible = punto.esLibre
  ? 'Vista Libre'
  : (
      punto.nombre.split('__')[1] ||
      punto.nombre
    )
      .replace(/_/g, ' ')
      .trim();

div.innerHTML =
  `<span>${icono} ${nombreVisible}</span>`;


      contenedor.appendChild(div);

    }
  );

}


// ============================================================
// 13. SELECCIONAR PUNTO DE INTERÉS
// ============================================================

window.seleccionarPuntoDeInteres =
  function (index) {

    window.cerrarBienvenida();


    const p =
      puntosInteres[index];


    if (!p) {
      return;
    }


    // Si se elige un POI durante el enganche, la animación del
    // POI continúa desde la posición visible en ese instante.
    transicionRecorrido.activa = false;

    controls.enabled = true;


    // --------------------------------------------------------
    // Ocultar cota anterior
    // --------------------------------------------------------

    if (cotaActiva) {

      cotaActiva.visible = false;

      if (cotaActiva.material) {
        cotaActiva.material.opacity = 0;
      }

      cotaActiva = null;
    }


    // --------------------------------------------------------
    // Guardar posición actual
    // --------------------------------------------------------

    posInicialCamara.copy(
      camera.position
    );


    focusInicialControls.copy(
      controls.target
    );


    // --------------------------------------------------------
    // Posición destino
    // --------------------------------------------------------

    // Se conserva el encuadre de Blender y solo se corrige
    // la distancia según la relación de aspecto actual
    // (vertical de móvil = se aleja, horizontal = igual).
    const factorPantalla = factorEncuadre();

    const posAjustada = p.target
      .clone()
      .add(
        p.posicion
          .clone()
          .sub(p.target)
          .multiplyScalar(factorPantalla)
      );


    // Recordar esta vista para poder reencuadrarla
    // si el usuario gira el teléfono.
    focoActual.copy(p.target);

    dirActual.copy(p.posicion).sub(p.target).normalize();

    distanciaReferencia = Math.max(
      p.posicion.distanceTo(p.target),
      1e-4
    );

    vistaLista = true;

    usuarioInteractuo = false;


    // Distancia real de esta vista en esta pantalla.
    //
    // OJO: OrbitControls limita la distancia a [minDistance,
    // maxDistance]. Si el encuadre de Blender es más cercano
    // que minDistance, la cámara termina más lejos de lo que
    // dice posAjustada. Usamos la distancia ya limitada, que
    // es donde la cámara va a quedar de verdad.
    p.distanciaVista = THREE.MathUtils.clamp(
      posAjustada.distanceTo(p.target),
      controls.minDistance,
      controls.maxDistance
    );


    // Mostrar (o no) la tarjeta del punto seleccionado
    mostrarTarjeta(p);


    // --------------------------------------------------------
    // Guardar destinos
    // --------------------------------------------------------

    targetPosCamara.copy(
      posAjustada
    );


    targetFocusControls.copy(
      p.target
    );


    // --------------------------------------------------------
    // Iniciar animación
    // --------------------------------------------------------

    tiempoInicioAnimacion =
      performance.now();


    animandoCamara = true;


    // --------------------------------------------------------
    // Mostrar cota asociada
    // --------------------------------------------------------

    if (p.cota) {

      cotaActiva = p.cota;

      cotaActiva.visible = true;


      if (cotaActiva.material) {
        cotaActiva.material.opacity = 1.0;
      }

    }

  };


// ============================================================
// 14. CAMBIAR MODELO
// ============================================================

window.cambiarModelo =
  function (nombreModelo) {

    document
      .querySelectorAll(
        '.sidebar-nav .nav-item'
      )
      .forEach(
        (btn) =>
          btn.classList.remove('active')
      );


    if (
      window.event &&
      window.event.target
    ) {

      window.event.target.classList.add(
        'active'
      );

    }


    if (
      nombreModelo === 'modelo1'
    ) {

      cargarModelo(
        '/assets/modelo1.glb'
      );

    }

    else if (
      nombreModelo === 'modelo2'
    ) {

      cargarModelo(
        '/assets/modelo2.glb'
      );

    }

    else if (
      nombreModelo === 'modelo3'
    ) {

      cargarModelo(
        '/assets/modelo3.glb'
      );

    }

  };


// ============================================================
// 14.1 TARJETA DE INFORMACIÓN DEL PUNTO DE INTERÉS
// ============================================================

const tarjetaInfo = document.getElementById('tarjeta-info');

const anclaInfo = document.getElementById('ancla-info');

const tarjetaTitulo = tarjetaInfo.querySelector('.tarjeta-info-titulo');

const tarjetaTexto = tarjetaInfo.querySelector('.tarjeta-info-texto');

// Punto cuya tarjeta está visible (null = ninguna)
let tarjetaActiva = null;

const _proyeccion = new THREE.Vector3();

// Fundido según la distancia a la vista seleccionada:
// empieza a desvanecerse al 125 % y desaparece al 170 %.
const UMBRAL_CERCANO = 1.25;
const UMBRAL_LEJOS = 1.7;

// Separación de la tarjeta respecto al punto (en píxeles)
const SEPARACION_TARJETA = 18;

// Separación vertical de la tarjeta bajo el POI en móvil.
// Aumenta este valor si quieres que quede más alejada del punto.
const SEPARACION_TARJETA_MOVIL = 14;

// Opacidad máxima de la tarjeta (0 = transparente, 1 = opaca).
// El fundido por distancia sigue aplicándose sobre este máximo.
const OPACIDAD_MAXIMA_TARJETA = 0.7;


function ocultarTarjeta() {

  tarjetaInfo.style.opacity = 0;

  anclaInfo.style.opacity = 0;
}


// La vista ya no corresponde a un punto de interés
function cancelarTarjeta() {

  tarjetaActiva = null;

  ocultarTarjeta();
}


function mostrarTarjeta(punto) {

  tarjetaActiva = punto && punto.info ? punto : null;

  if (!tarjetaActiva) {

    ocultarTarjeta();

    return;
  }

  tarjetaTitulo.textContent = punto.titulo || '';

  tarjetaTitulo.style.display = punto.titulo ? 'block' : 'none';

  // textContent: el texto viene del .glb, nunca innerHTML
  tarjetaTexto.textContent = punto.info;

  actualizarTarjeta();
}


function actualizarTarjeta() {

  if (!tarjetaActiva) return;

  const ancho = container.clientWidth;

  const alto = container.clientHeight;


  // Punto 3D → coordenadas de pantalla
  _proyeccion
    .copy(tarjetaActiva.target)
    .project(camera);


  const x = (_proyeccion.x * 0.5 + 0.5) * ancho;

  const y = (-_proyeccion.y * 0.5 + 0.5) * alto;


  // Fundido por distancia
  const distancia =
    camera.position.distanceTo(tarjetaActiva.target);

  const referencia =
    tarjetaActiva.distanciaVista || distancia;

  const opacidadDistancia =
    1 - THREE.MathUtils.smoothstep(
      distancia,
      referencia * UMBRAL_CERCANO,
      referencia * UMBRAL_LEJOS
    );

  const opacidadTarjeta =
    opacidadDistancia * OPACIDAD_MAXIMA_TARJETA;


  const fueraDePantalla =
    _proyeccion.z > 1 ||
    x < 0 || x > ancho ||
    y < 0 || y > alto;


  if (fueraDePantalla || opacidadDistancia < 0.02) {

    ocultarTarjeta();

    return;
  }


  // En escritorio, ubicar la tarjeta junto al POI, a la derecha
  // o izquierda según el espacio disponible.
  const anchoTarjeta = tarjetaInfo.offsetWidth;

  const altoTarjeta = tarjetaInfo.offsetHeight;

  // Margen mínimo entre la tarjeta y el borde de la pantalla.
  const margen = 12;

  // En móviles (hasta 600 px de ancho), centrar la tarjeta bajo
  // el POI. Si no cabe debajo, colocarla encima para mantenerla
  // completamente visible.
  const esMovil = ancho <= 600;

  let xTarjeta;

  let yTarjeta;

  if (esMovil) {

    xTarjeta = THREE.MathUtils.clamp(
      x - anchoTarjeta / 2,
      margen,
      Math.max(margen, ancho - anchoTarjeta - margen)
    );

    const debajo = y + SEPARACION_TARJETA_MOVIL;

    const cabeDebajo =
      debajo + altoTarjeta <= alto - margen;

    yTarjeta = cabeDebajo
      ? debajo
      : y - altoTarjeta - SEPARACION_TARJETA_MOVIL;

    yTarjeta = THREE.MathUtils.clamp(
      yTarjeta,
      margen,
      Math.max(margen, alto - altoTarjeta - margen)
    );

  } else {

    const aLaDerecha =
      x + SEPARACION_TARJETA + anchoTarjeta <= ancho - margen;

    xTarjeta = aLaDerecha
      ? x + SEPARACION_TARJETA
      : x - SEPARACION_TARJETA - anchoTarjeta;

    // Alinear aproximadamente con el punto y limitar arriba/abajo.
    yTarjeta = THREE.MathUtils.clamp(
      y - 12,
      margen,
      Math.max(margen, alto - altoTarjeta - margen)
    );
  }

  tarjetaInfo.style.transform =
    `translate3d(${xTarjeta}px, ${yTarjeta}px, 0)`;

  tarjetaInfo.style.opacity = opacidadTarjeta;


  anclaInfo.style.transform =
    `translate3d(${x}px, ${y}px, 0)`;

  anclaInfo.style.opacity = opacidadDistancia;
}


// ============================================================
// 14.2 RECORRIDO LATERAL POR LA CURVA "CURVA"
//
// La curva es el carril de la cámara. Se recorre:
//   · en PC: arrastrando con el botón central del mouse
//   · en móvil: arrastrando con dos dedos
//
// La curva se exporta como líneas (Blender → Loose Edges)
// y se lee desde el .glb, así que no hay que tocar código
// para cambiarla: se edita en Blender y listo.
// ============================================================

const recorrido = {

  puntos: [],

  segmentos: [],

  longitud: 0,

  cerrada: false,

  posicion: 0,

  centro: new THREE.Vector3()
};

// Enganche suave al carril: al empezar el gesto la cámara no
// salta al punto de la curva, sino que se desliza hasta él.
const transicionRecorrido = {

  activa: false,

  inicio: 0,

  duracion: 600,

  offset: new THREE.Vector3(),

  targetInicial: new THREE.Vector3()
};

// Cuánto avanza por píxel arrastrado (1 = natural)
const SENSIBILIDAD_RECORRIDO = 1;

// 1 = arrastrar a la derecha avanza en el sentido de la
// curva. Si te queda al revés, poné -1.
const DIRECCION_RECORRIDO = 1;

// Punteros apoyados (para el gesto de dos dedos)
const punterosRecorrido = new Map();

// 'raton' | 'tactil' | null
let modoRecorrido = null;

let ultimoXRecorrido = 0;


function limpiarRecorrido() {

  recorrido.puntos = [];

  recorrido.segmentos = [];

  recorrido.longitud = 0;

  recorrido.cerrada = false;

  recorrido.posicion = 0;

  recorrido.centro.set(0, 0, 0);

  transicionRecorrido.activa = false;

  transicionRecorrido.offset.set(0, 0, 0);

  // Sin carril, el botón central vuelve a hacer zoom
  controls.mouseButtons.MIDDLE = THREE.MOUSE.DOLLY;
}


// ------------------------------------------------------------
// LEER LOS PUNTOS DE LA CURVA
// ------------------------------------------------------------

function extraerRecorrido(nodo) {

  let datos = null;

  nodo.traverse((objeto) => {

    if (datos) return;

    const geometria = objeto.geometry;

    if (!geometria || !geometria.attributes) return;

    const atributo = geometria.attributes.position;

    if (!atributo) return;

    const indice = geometria.index;

    // Leer un vértice. Si la geometría está indexada hay que
    // respetar el índice: en las líneas los pares son
    // consecutivos en el índice, no en el buffer de posiciones.
    const leerPunto = (i) =>
      new THREE.Vector3()
        .fromBufferAttribute(atributo, i)
        .applyMatrix4(objeto.matrixWorld);

    const cantidad = indice ? indice.count : atributo.count;

    if (cantidad < 2) return;


    if (objeto.isLineSegments) {

      // La curva exportada llega como pares de puntos:
      // hay que reconstruir el orden.
      const pares = [];

      for (let i = 0; i + 1 < cantidad; i += 2) {

        const a = indice ? indice.getX(i) : i;

        const b = indice ? indice.getX(i + 1) : i + 1;

        pares.push([leerPunto(a), leerPunto(b)]);
      }

      datos = ordenarSegmentos(pares);

    } else if (objeto.isLineLoop || objeto.isLine || objeto.isPoints) {

      const puntos = [];

      for (let i = 0; i < cantidad; i++) {

        puntos.push(leerPunto(indice ? indice.getX(i) : i));
      }

      datos = {
        puntos,
        cerrada: objeto.isLineLoop
      };

    } else if (objeto.isMesh) {

      console.warn(
        '⚠️ La CURVA salió como malla. Para usarla como ' +
        'recorrido activá en Blender: Include → Data → ' +
        'Mesh → Loose Edges, y volvé a exportar.'
      );
    }
  });

  return datos;
}


// Reconstruye el orden de una curva exportada como pares
// de puntos (LineSegments). Detecta si es cerrada.
function ordenarSegmentos(pares) {

  const coords = new Map();

  const vecinos = new Map();

  const aristas = new Set();

  const clavePunto = (p) =>
    `${p.x.toFixed(4)}|${p.y.toFixed(4)}|${p.z.toFixed(4)}`;

  const claveArista = (a, b) =>
    a < b ? `${a}>${b}` : `${b}>${a}`;


  for (const [a, b] of pares) {

    const ka = clavePunto(a);

    const kb = clavePunto(b);

    if (ka === kb) continue;


    if (!coords.has(ka)) {

      coords.set(ka, a.clone());

      vecinos.set(ka, []);
    }

    if (!coords.has(kb)) {

      coords.set(kb, b.clone());

      vecinos.set(kb, []);
    }


    const arista = claveArista(ka, kb);

    if (aristas.has(arista)) continue;

    aristas.add(arista);

    vecinos.get(ka).push(kb);

    vecinos.get(kb).push(ka);
  }


  if (!vecinos.size) return null;


  // Un extremo suelto = curva abierta
  let inicio = null;

  for (const [clave, lista] of vecinos) {

    if (lista.length === 1) {

      inicio = clave;

      break;
    }
  }

  const cerrada = inicio === null;

  if (inicio === null) inicio = vecinos.keys().next().value;


  const usadas = new Set();

  const puntos = [coords.get(inicio).clone()];

  let actual = inicio;


  for (;;) {

    let siguiente = null;

    for (const vecino of vecinos.get(actual)) {

      const arista = claveArista(actual, vecino);

      if (usadas.has(arista)) continue;

      usadas.add(arista);

      siguiente = vecino;

      break;
    }

    if (siguiente === null) break;

    actual = siguiente;

    if (cerrada && actual === inicio) break;

    puntos.push(coords.get(actual).clone());
  }


  if (usadas.size < aristas.size) {

    console.warn(
      '⚠️ La CURVA tiene varias piezas separadas. ' +
      'Se usa la primera.'
    );
  }

  return { puntos, cerrada };
}


// ------------------------------------------------------------
// PREPARAR EL RECORRIDO AL CARGAR UN MODELO
// ------------------------------------------------------------

function prepararRecorrido(nodo, centro) {

  limpiarRecorrido();

  if (!nodo) return;


  const datos = extraerRecorrido(nodo);

  if (!datos || datos.puntos.length < 2) {

    console.warn(
      '⚠️ La CURVA no tiene líneas dentro del .glb. ' +
      'Exportala con Include → Data → Mesh → Loose Edges.'
    );

    return;
  }


  const puntos = datos.puntos;

  const segmentos = [];

  let acumulado = 0;

  // Una curva cerrada suma el segmento final → inicial
  const cantidad =
    datos.cerrada ? puntos.length : puntos.length - 1;


  for (let i = 0; i < cantidad; i++) {

    const a = puntos[i];

    const b = puntos[(i + 1) % puntos.length];

    const largo = a.distanceTo(b);

    if (largo < 1e-6) continue;

    segmentos.push({ a, b, largo, inicio: acumulado });

    acumulado += largo;
  }


  if (!segmentos.length) {

    console.warn('⚠️ La CURVA no tiene longitud utilizable.');

    return;
  }


  recorrido.puntos = puntos;

  recorrido.segmentos = segmentos;

  recorrido.longitud = acumulado;

  recorrido.cerrada = datos.cerrada;

  recorrido.posicion = 0;

  recorrido.centro.copy(centro);


  // OrbitControls no debe empujar la cámara fuera del carril:
  // se amplía el rango permitido si la curva lo necesita.
  let minima = Infinity;

  let maxima = 0;

  // Ángulo polar de cada punto respecto al centro. La curva
  // suele estar a la altura de los ojos, por encima del límite
  // normal de órbita; si no se amplía, OrbitControls sube la
  // cámara y el carril deja de seguirse con exactitud.
  let phiMinimo = Infinity;

  let phiMaximo = -Infinity;

  const direccion = new THREE.Vector3();

  puntos.forEach((p) => {

    direccion.copy(p).sub(centro);

    const distancia = direccion.length();

    if (distancia < minima) minima = distancia;

    if (distancia > maxima) maxima = distancia;

    if (distancia < 1e-6) return;

    const phi = Math.acos(
      THREE.MathUtils.clamp(direccion.y / distancia, -1, 1)
    );

    if (phi < phiMinimo) phiMinimo = phi;

    if (phi > phiMaximo) phiMaximo = phi;
  });

  if (isFinite(minima)) {

    controls.minDistance = Math.min(
      controls.minDistance,
      Math.max(minima * 0.95, 1e-4)
    );

    controls.maxDistance = Math.max(
      controls.maxDistance,
      maxima * 1.05
    );
  }

  if (isFinite(phiMinimo)) {

    controls.minPolarAngle = Math.min(
      controls.minPolarAngle,
      phiMinimo
    );

    controls.maxPolarAngle = Math.max(
      controls.maxPolarAngle,
      phiMaximo
    );
  }


  // El botón central pasa a ser el recorrido del carril
  controls.mouseButtons.MIDDLE = null;


  console.log(
    `🛤️ Recorrido listo: ${puntos.length} puntos, ` +
    `${acumulado.toFixed(2)} u, ` +
    `${datos.cerrada ? 'cerrado' : 'abierto'}`
  );
}


// ------------------------------------------------------------
// CÁMARA SOBRE LA CURVA
// ------------------------------------------------------------

function puntoEnLongitud(distancia) {

  const segmentos = recorrido.segmentos;

  const ultimo = segmentos[segmentos.length - 1];

  if (distancia <= 0) return segmentos[0].a.clone();

  if (distancia >= recorrido.longitud) return ultimo.b.clone();

  for (const segmento of segmentos) {

    if (distancia <= segmento.inicio + segmento.largo) {

      const avance =
        (distancia - segmento.inicio) / segmento.largo;

      return segmento.a.clone().lerp(segmento.b, avance);
    }
  }

  return ultimo.b.clone();
}


// Punto de la curva más cercano a una posición dada
function longitudMasCercanaA(posicion) {

  let mejor = 0;

  let mejorDistancia = Infinity;


  for (const segmento of recorrido.segmentos) {

    const ab = segmento.b.clone().sub(segmento.a);

    const denominador = ab.lengthSq();

    const avance = denominador > 1e-10
      ? THREE.MathUtils.clamp(
          posicion.clone().sub(segmento.a).dot(ab) / denominador,
          0,
          1
        )
      : 0;

    const punto = segmento.a.clone().addScaledVector(ab, avance);

    const distancia = punto.distanceToSquared(posicion);

    if (distancia < mejorDistancia) {

      mejorDistancia = distancia;

      mejor = segmento.inicio + avance * segmento.largo;
    }
  }

  return mejor;
}


function aplicarRecorrido(distancia) {

  if (!recorrido.segmentos.length) return;


  if (recorrido.cerrada) {

    distancia =
      ((distancia % recorrido.longitud) + recorrido.longitud) %
      recorrido.longitud;

  } else {

    distancia = THREE.MathUtils.clamp(
      distancia,
      0,
      recorrido.longitud
    );
  }

  recorrido.posicion = distancia;


  // Durante el enganche suave la interpolación la hace el
  // bucle de animación, no este método.
  if (transicionRecorrido.activa) return;


  const punto = puntoEnLongitud(distancia);

  camera.position.copy(punto);

  controls.target.copy(recorrido.centro);


  // Mantener la referencia para que un resize no devuelva
  // la cámara a la vista anterior.
  focoActual.copy(recorrido.centro);

  dirActual.copy(punto).sub(recorrido.centro).normalize();

  distanciaReferencia = Math.max(
    punto.distanceTo(recorrido.centro),
    1e-4
  );

  vistaLista = true;

  controls.update();
}


function avanzarRecorrido(deltaX) {

  const alto = container.clientHeight || window.innerHeight;

  // Usar la distancia del carril (no la de la cámara, que
  // durante el enganche todavía puede estar lejos).
  const puntoActual = puntoEnLongitud(recorrido.posicion);

  const distancia = Math.max(
    puntoActual.distanceTo(recorrido.centro),
    1e-4
  );

  const altoMundo =
    2 * distancia *
    Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);

  const unidadesPorPixel = altoMundo / alto;

  const paso =
    deltaX * unidadesPorPixel *
    SENSIBILIDAD_RECORRIDO * DIRECCION_RECORRIDO;

  aplicarRecorrido(recorrido.posicion + paso);
}


// Consumir y poner a cero los impulsos pendientes de
// OrbitControls (restos de órbita/zoom con amortiguamiento),
// sin mover la cámara.
function limpiarImpulsoControles() {

  const posicion = camera.position.clone();

  const objetivo = controls.target.clone();

  const damping = controls.enableDamping;

  controls.enableDamping = false;

  controls.update();

  controls.enableDamping = damping;

  camera.position.copy(posicion);

  controls.target.copy(objetivo);

  camera.lookAt(objetivo);
}


function iniciarRecorrido() {

  if (!recorrido.segmentos.length) return false;


  animandoCamara = false;

  cancelarTarjeta();

  limpiarImpulsoControles();


  // Punto del carril más cercano a la cámara. En vez de
  // saltar ahí de golpe, se guarda la diferencia y el bucle
  // la va reduciendo durante la transición.
  recorrido.posicion =
    longitudMasCercanaA(camera.position);

  const punto = puntoEnLongitud(recorrido.posicion);

  transicionRecorrido.offset
    .copy(camera.position)
    .sub(punto);

  transicionRecorrido.targetInicial.copy(controls.target);

  transicionRecorrido.inicio = performance.now();

  transicionRecorrido.activa = true;

  return true;
}


function terminarRecorrido() {

  modoRecorrido = null;

  punterosRecorrido.clear();

  // Devolver el control a OrbitControls (órbita, zoom...)
  controls.enabled = true;

  container.style.cursor = '';
}


// Enganche suave: la cámara se desliza desde donde estaba
// hasta el carril, y el objetivo pasa del punto anterior al
// centro del modelo. Si el usuario arrastra durante la
// transición, el carril avanza y el deslizamiento continúa sin
// saltos.
function actualizarTransicionRecorrido() {

  if (!transicionRecorrido.activa) return;


  const progreso = THREE.MathUtils.clamp(
    (performance.now() - transicionRecorrido.inicio) /
      transicionRecorrido.duracion,
    0,
    1
  );


  // Ease In / Ease Out
  const suave = progreso < 0.5
    ? 4 * progreso * progreso * progreso
    : 1 - Math.pow(-2 * progreso + 2, 3) / 2;


  const punto = puntoEnLongitud(recorrido.posicion);

  camera.position
    .copy(punto)
    .addScaledVector(
      transicionRecorrido.offset,
      1 - suave
    );


  controls.target.lerpVectors(
    transicionRecorrido.targetInicial,
    recorrido.centro,
    suave
  );


  camera.lookAt(controls.target);


  if (progreso >= 1) {

    transicionRecorrido.activa = false;

    aplicarRecorrido(recorrido.posicion);
  }
}


// ------------------------------------------------------------
// GESTOS: botón central (PC) y dos dedos (móvil)
// ------------------------------------------------------------

function alBajarPuntero(evento) {

  // Botón central del mouse
  if (evento.button === 1) {

    if (!iniciarRecorrido()) return;

    modoRecorrido = 'raton';

    // Evitar que OrbitControls altere la cámara mientras se
    // desliza al carril o mientras se recorre con el mouse.
    controls.enabled = false;

    ultimoXRecorrido = evento.clientX;

    container.style.cursor = 'grabbing';

    evento.preventDefault();

    return;
  }


  // Dos dedos
  if (evento.pointerType !== 'touch') return;

  punterosRecorrido.set(evento.pointerId, {
    x: evento.clientX
  });

  if (punterosRecorrido.size !== 2) return;


  if (!iniciarRecorrido()) {

    punterosRecorrido.clear();

    return;
  }

  modoRecorrido = 'tactil';

  // Mientras dure el gesto de dos dedos, OrbitControls no
  // debe hacer zoom/pan: los dos dedos son el recorrido.
  controls.enabled = false;

  const dedos = [...punterosRecorrido.values()];

  ultimoXRecorrido = (dedos[0].x + dedos[1].x) / 2;
}


function alMoverPuntero(evento) {

  if (modoRecorrido === 'raton') {

    // Si soltaron el botón central
    if (!(evento.buttons & 4)) {

      terminarRecorrido();

      return;
    }

    const delta = evento.clientX - ultimoXRecorrido;

    ultimoXRecorrido = evento.clientX;

    if (delta) avanzarRecorrido(delta);

    return;
  }


  if (modoRecorrido !== 'tactil') return;

  if (!punterosRecorrido.has(evento.pointerId)) return;


  punterosRecorrido.set(evento.pointerId, {
    x: evento.clientX
  });

  const dedos = [...punterosRecorrido.values()];

  if (dedos.length < 2) return;

  const x = (dedos[0].x + dedos[1].x) / 2;

  const delta = x - ultimoXRecorrido;

  ultimoXRecorrido = x;

  if (delta) avanzarRecorrido(delta);
}


function alSubirPuntero(evento) {

  if (evento.pointerType === 'touch') {

    punterosRecorrido.delete(evento.pointerId);


    // El recorrido termina al levantar uno de los dos dedos,
    // pero OrbitControls no se reactiva hasta que no quede
    // ningún dedo apoyado: si no, el dedo que queda rota la
    // cámara y parece que "vuelve" a otro lado.
    if (modoRecorrido === 'tactil') {

      modoRecorrido = null;

      container.style.cursor = '';
    }


    if (punterosRecorrido.size === 0) {

      controls.enabled = true;
    }

    return;
  }

  if (modoRecorrido === 'raton' && evento.button === 1) {

    terminarRecorrido();
  }
}


renderer.domElement.addEventListener(
  'pointerdown',
  alBajarPuntero
);

window.addEventListener('pointermove', alMoverPuntero);

window.addEventListener('pointerup', alSubirPuntero);

window.addEventListener('pointercancel', alSubirPuntero);


// Evitar el autoscroll del navegador con el botón central
renderer.domElement.addEventListener('mousedown', (evento) => {

  if (evento.button === 1) evento.preventDefault();
});


// ============================================================
// 15. CARGAR MODELO INICIAL
// ============================================================

cargarModelo(
  '/assets/modelo1.glb'
);


// ============================================================
// 16. BUCLE PRINCIPAL DE ANIMACIÓN
// ============================================================

function animate() {

  requestAnimationFrame(
    animate
  );


  // ----------------------------------------------------------
  // Animación de cámara
  // ----------------------------------------------------------

  if (animandoCamara) {

    const tiempoActual =
      performance.now();


    const progreso =
      (
        tiempoActual -
        tiempoInicioAnimacion
      ) /
      duracionAnimacion;


    if (progreso < 1.0) {

      // Ease In / Ease Out
      const easeProgress =
        progreso < 0.5
          ? 2 * progreso * progreso
          : 1 -
            Math.pow(
              -2 * progreso + 2,
              2
            ) / 2;


      camera.position.lerpVectors(
        posInicialCamara,
        targetPosCamara,
        easeProgress
      );


      controls.target.lerpVectors(
        focusInicialControls,
        targetFocusControls,
        easeProgress
      );

    }

    else {

      camera.position.copy(
        targetPosCamara
      );


      controls.target.copy(
        targetFocusControls
      );


      animandoCamara = false;


      controls.update();

    }

  }


  // ----------------------------------------------------------
  // OrbitControls
  // ----------------------------------------------------------

  controls.update();


  // El enganche va después de OrbitControls para que ningún
  // residuo de órbita/zoom desplace la interpolación.
  actualizarTransicionRecorrido();


  // ----------------------------------------------------------
  // Tarjeta del punto de interés
  // ----------------------------------------------------------

  actualizarTarjeta();


  // ----------------------------------------------------------
  // Render
  // ----------------------------------------------------------

  renderer.render(
    scene,
    camera
  );

}


animate();


// ============================================================
// 17. RESPONSIVE
// ============================================================

// El resize y el cambio de orientación se gestionan desde
// redimensionar(), registrado arriba junto al renderer.

redimensionar();


// ============================================================
// 18. PWA (instalable en el móvil)
// ============================================================

// El Service Worker solo se activa en contextos seguros:
// https:// o http://localhost. En una IP local (192.168.x.x)
// sin HTTPS el navegador no lo registra y no habrá instalación.
if ('serviceWorker' in navigator) {

  window.addEventListener('load', () => {

    navigator.serviceWorker
      .register('/sw.js')
      .then(() => {
        console.log('📦 Service Worker activo.');
      })
      .catch((error) => {
        console.warn('⚠️ Service Worker no registrado:', error);
      });
  });
}


// ------------------------------------------------------------
// Botón "Instalar app"
// ------------------------------------------------------------

const btnInstalar = document.getElementById('btn-instalar');

const avisoIos = document.getElementById('ios-aviso');

const cerrarAvisoIos = document.getElementById('cerrar-ios-aviso');

let eventoInstalacion = null;


// ¿Ya se está usando como app instalada?
function appYaInstalada() {

  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  );
}


// Safari en iOS no dispara beforeinstallprompt:
// hay que mostrar instrucciones manuales.
function esSafariIos() {

  const ua = navigator.userAgent;

  const esIos = /iphone|ipad|ipod/i.test(ua);

  const esOtroNavegadorIos = /crios|fxios|edgios/i.test(ua);

  return esIos && !esOtroNavegadorIos;
}


if (!appYaInstalada()) {

  // Chrome / Edge / Android
  window.addEventListener('beforeinstallprompt', (evento) => {

    evento.preventDefault();

    eventoInstalacion = evento;

    btnInstalar.hidden = false;

    console.log('📲 La app se puede instalar.');
  });

  // iPhone / iPad
  if (esSafariIos()) {

    btnInstalar.hidden = false;
  }

  btnInstalar.addEventListener('click', async () => {

    if (eventoInstalacion) {

      eventoInstalacion.prompt();

      const eleccion = await eventoInstalacion.userChoice;

      console.log('📲 Instalación:', eleccion.outcome);

      eventoInstalacion = null;

      if (eleccion.outcome === 'accepted') {

        btnInstalar.hidden = true;
      }

      return;
    }

    // Sin prompt disponible (iPhone)
    if (esSafariIos()) {

      avisoIos.classList.remove('oculto');
    }
  });


  cerrarAvisoIos.addEventListener('click', () => {

    avisoIos.classList.add('oculto');
  });

  avisoIos.addEventListener('click', (evento) => {

    if (evento.target === avisoIos) {

      avisoIos.classList.add('oculto');
    }
  });


  // Instalada con éxito
  window.addEventListener('appinstalled', () => {

    console.log('✅ App instalada.');

    eventoInstalacion = null;

    btnInstalar.hidden = true;
  });
}
