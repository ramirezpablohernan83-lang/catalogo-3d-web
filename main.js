import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';

// 1. ESCENA, CÁMARA PRINCIPAL Y RENDERER
const container = document.querySelector('#webgl-container');
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 3, 6);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
container.appendChild(renderer.domElement);

// ILUMINACIÓN
const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
dirLight.position.set(5, 10, 7);
scene.add(dirLight);

// 2. ENTORNO HDRI
const rgbeLoader = new RGBELoader();
rgbeLoader.load('/assets/hdri.hdr', (texture) => {
  texture.mapping = THREE.EquirectangularReflectionMapping;
  scene.environment = texture;
  scene.background = texture;
}, undefined, (error) => {
  console.warn("⚠️ No se pudo cargar el HDRI:", error);
});

// 3. ORBITCONTROLS
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = 2;
controls.maxDistance = 12;
controls.maxPolarAngle = Math.PI / 2 - 0.05;
controls.minPolarAngle = 0.1;
controls.enablePan = true;

// 4. CONTROLADORES DE MENÚS COLAPSABLES (IZQUIERDO Y DERECHO)
const sidebar = document.getElementById('sidebar');
const toggleSidebarBtn = document.getElementById('toggle-sidebar');
toggleSidebarBtn.addEventListener('click', () => sidebar.classList.toggle('collapsed'));

const specsPanel = document.getElementById('specs-panel');
const toggleSpecsBtn = document.getElementById('toggle-specs');
toggleSpecsBtn.addEventListener('click', () => specsPanel.classList.toggle('collapsed'));

// 5. VARIABLES DE ANIMACIÓN Y MAPEO CÁMARA-COTA
let modeloActual = null;
let puntosInteres = [];
let cotaActiva = null;

// Estado para transición suave de cámara (Lerp)
let animandoCamara = false;
let targetPosCamara = new THREE.Vector3();
let targetFocusControls = new THREE.Vector3();

// VELOCIDAD DE TRANSICIÓN: Un valor menor (0.02) hace el movimiento más lento y suave
const VELOCIDAD_TRANSICION = 0.022; 

// Estado para desvanecimiento paulatino de cota (Fade Out)
let desvanecerCotas = false;
let opacidadCotas = 1.0;

// INTERRUPCIÓN DE CÁMARA Y LIBERTAD TOTAL AL INTERACTUAR:
// Al tocar/arrastrar en la pantalla, cancelamos la animación de la cámara para eliminar el "efecto imán"
controls.addEventListener('start', () => {
  animandoCamara = false; // Cancela la fuerza hacia el punto guardado inmediatamente
  if (cotaActiva) {
    desvanecerCotas = true; // Inicia el desvanecimiento de la cota
  }
});

// 6. CARGADOR DE MODELO .GLB Y MAPEO INTELIGENTE
const loader = new GLTFLoader();

function cargarModelo(pathArchivo) {
  if (modeloActual) {
    scene.remove(modeloActual);
  }

  puntosInteres = [];
  cotaActiva = null;

  loader.load(pathArchivo, (gltf) => {
    modeloActual = gltf.scene;
    scene.add(modeloActual);

    const camarasEncontradas = [];
    const cotasEncontradas = new Map();

    modeloActual.traverse((child) => {
      // 1. Detectar Cámaras
      if (child.isCamera || child.type === 'PerspectiveCamera') {
        camarasEncontradas.push(child);
      }
      
      // 2. Detectar Mallas de Cotas
      const nombreLower = child.name.toLowerCase();
      if (nombreLower.includes('cota') || nombreLower.includes('medida')) {
        if (child.material) {
          child.material.transparent = true;
          child.material.opacity = 0;
        }
        child.visible = false;
        const claveLimpia = nombreLower.replace('cota_', '').replace('medida_', '').replace('.001', '');
        cotasEncontradas.set(claveLimpia, child);
      }
    });

    // 3. Vincular cada Cámara con su Cota correspondiente
    camarasEncontradas.forEach((cam) => {
      const direccion = new THREE.Vector3(0, 0, -1);
      direccion.applyQuaternion(cam.quaternion);

      const posicionCamara = cam.position.clone();
      const puntoEnfoque = posicionCamara.clone().add(direccion.multiplyScalar(3));

      const nombreCamLower = cam.name.toLowerCase();
      let cotaAsociada = null;

      for (let [clave, meshCota] of cotasEncontradas.entries()) {
        if (nombreCamLower.includes(clave)) {
          cotaAsociada = meshCota;
          break;
        }
      }

      puntosInteres.push({
        nombre: cam.name || `Vista ${puntosInteres.length + 1}`,
        posicion: posicionCamara,
        target: puntoEnfoque,
        cota: cotaAsociada
      });
    });

    console.log(`✅ Modelo cargado. Puntos de interés configurados: ${puntosInteres.length}`);
    renderizarBotonesDeCamara();

  }, undefined, (error) => {
    console.error("❌ Error al cargar modelo:", error);
  });
}

// 7. RENDERIZADO DINÁMICO DE BOTONES
function renderizarBotonesDeCamara() {
  const contenedor = document.getElementById('lista-vistas-dinamica');
  contenedor.innerHTML = '';

  if (puntosInteres.length === 0) {
    contenedor.innerHTML = `<div style="color: #94a3b8; font-size: 0.65rem; text-align: center; padding: 6px;">Sin cámaras en .glb</div>`;
    return;
  }

  puntosInteres.forEach((punto, index) => {
    const div = document.createElement('div');
    div.className = 'btn-vista-item';
    div.onclick = () => seleccionarPuntoDeInteres(index);

    div.innerHTML = `<span>📍 ${punto.nombre}</span>`;
    contenedor.appendChild(div);
  });
}

window.seleccionarPuntoDeInteres = function(index) {
  const p = puntosInteres[index];
  if (!p) return;

  // Ocultar cota activa anterior si existe
  if (cotaActiva && cotaActiva !== p.cota) {
    cotaActiva.visible = false;
    if (cotaActiva.material) cotaActiva.material.opacity = 0;
  }

  // Definir las coordenadas destino e iniciar la transición pausada
  targetPosCamara.copy(p.posicion);
  targetFocusControls.copy(p.target);
  animandoCamara = true;

  // Mostrar cota asociada
  if (p.cota) {
    cotaActiva = p.cota;
    cotaActiva.visible = true;
    desvanecerCotas = false;
    opacidadCotas = 1.0;
    if (cotaActiva.material) cotaActiva.material.opacity = 1.0;
  } else {
    cotaActiva = null;
  }
};

window.cambiarModelo = function(nombreModelo) {
  document.querySelectorAll('.sidebar-nav .nav-item').forEach(btn => btn.classList.remove('active'));
  if (event && event.target) {
    event.target.classList.add('active');
  }

  if (nombreModelo === 'modelo1') cargarModelo('/assets/modelo1.glb');
  else if (nombreModelo === 'modelo2') cargarModelo('/assets/modelo2.glb');
  else if (nombreModelo === 'modelo3') cargarModelo('/assets/modelo3.glb');
};

// Cargar modelo inicial
cargarModelo('/assets/modelo1.glb');

// 8. BUCLE DE ANIMACIÓN
function animate() {
  requestAnimationFrame(animate);

  // Interpolación suave y pausada de movimiento de cámara
  if (animandoCamara) {
    camera.position.lerp(targetPosCamara, VELOCIDAD_TRANSICION);
    controls.target.lerp(targetFocusControls, VELOCIDAD_TRANSICION);

    // Finalizar animación automáticamente cuando ya está extremadamente cerca
    if (camera.position.distanceTo(targetPosCamara) < 0.005) {
      camera.position.copy(targetPosCamara);
      controls.target.copy(targetFocusControls);
      animandoCamara = false;
    }
  }

  // Fade-out paulatino de cota al orbitar
  if (desvanecerCotas && cotaActiva && cotaActiva.material) {
    opacidadCotas -= 0.03;
    if (opacidadCotas <= 0) {
      opacidadCotas = 0;
      cotaActiva.visible = false;
      desvanecerCotas = false;
      cotaActiva = null;
    }
    cotaActiva.material.opacity = opacidadCotas;
  }

  controls.update();
  renderer.render(scene, camera);
}

animate();

// RESPONSIVE
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});