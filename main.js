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

// 4. CONTROLADORES DE MENÚS COLAPSABLES
const sidebar = document.getElementById('sidebar');
const toggleSidebarBtn = document.getElementById('toggle-sidebar');
toggleSidebarBtn.addEventListener('click', () => sidebar.classList.toggle('collapsed'));

const specsPanel = document.getElementById('specs-panel');
const toggleSpecsBtn = document.getElementById('toggle-specs');
toggleSpecsBtn.addEventListener('click', () => specsPanel.classList.toggle('collapsed'));

// 5. VARIABLES DE ANIMACIÓN POR TIEMPO UNIFORME Y MAPEO CÁMARA-COTA
let modeloActual = null;
let puntosInteres = [];
let cotaActiva = null;

// Control de animación basada en tiempo (duración constante para todos los modelos)
let animandoCamara = false;
let tiempoInicioAnimacion = 0;
const duracionAnimacion = 1200; // Duración fija en milisegundos (1.2 segundos por transición)

let posInicialCamara = new THREE.Vector3();
let targetPosCamara = new THREE.Vector3();
let focusInicialControls = new THREE.Vector3();
let targetFocusControls = new THREE.Vector3();

// Estado para desvanecimiento paulatino de cota (Fade Out)
let desvanecerCotas = false;
let opacidadCotas = 1.0;

// Al interactuar manualmente, cancelamos cualquier transición en curso para dar libertad total
controls.addEventListener('start', () => {
  if (animandoCamara) {
    animandoCamara = false;
  }
  if (cotaActiva) {
    desvanecerCotas = true;
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
  animandoCamara = false;

  loader.load(pathArchivo, (gltf) => {
    modeloActual = gltf.scene;
    scene.add(modeloActual);

    // Centrar el target de los controles automáticamente al centro del modelo cargado
    const box = new THREE.Box3().setFromObject(modeloActual);
    const center = box.getCenter(new THREE.Vector3());
    controls.target.copy(center);
    controls.update();

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

  // Configurar puntos de partida y llegada para la interpolación temporal
  posInicialCamara.copy(camera.position);
  focusInicialControls.copy(controls.target);

  targetPosCamara.copy(p.posicion);
  targetFocusControls.copy(p.target);

  tiempoInicioAnimacion = performance.now();
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

  // Transición suave basada en tiempo real (Velocidad constante garantizada para cualquier modelo)
  if (animandoCamara) {
    const tiempoActual = performance.now();
    const progreso = (tiempoActual - tiempoInicioAnimacion) / duracionAnimacion;

    if (progreso < 1.0) {
      // Función de suavizado easeInOut para que arranque y frene con elegancia
      const easeProgress = progreso < 0.5 ? 2 * progreso * progreso : 1 - Math.pow(-2 * progreso + 2, 2) / 2;

      camera.position.lerpVectors(posInicialCamara, targetPosCamara, easeProgress);
      controls.target.lerpVectors(focusInicialControls, targetFocusControls, easeProgress);
    } else {
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