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
            worldPos
          );

          console.log(
            `🎯 TARGET_${numeroTarget} detectado`
          );
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

        let puntoEnfoque =
          targetsEncontrados
            .get(numeroCamara);


        if (puntoEnfoque) {

          puntoEnfoque =
            puntoEnfoque.clone();

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