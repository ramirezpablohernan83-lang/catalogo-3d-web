import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';

// 1. ESCENA, CÁMARA PRINCIPAL Y RENDERER
const container = document.querySelector('#webgl-container');
const scene = new THREE.Scene();

const esMovil = window.innerHeight > window.innerWidth;
const fovInicial = esMovil ? 60 : 45;

const camera = new THREE.PerspectiveCamera(fovInicial, window.innerWidth / window.innerHeight, 0.1, 100);

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
controls.maxDistance = 15;
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

window.cerrarBienvenida = function() {
  const overlay = document.getElementById('welcome-overlay');
  if (overlay) {
    overlay.classList.add('hidden');
  }
};

// 5. VARIABLES DE ANIMACIÓN Y TOLERANCIA
let modeloActual = null;
let puntosInteres = [];
let cotaActiva = null;

let animandoCamara = false;
let tiempoInicioAnimacion = 0;
const duracionAnimacion = 1200;

let posInicialCamara = new THREE.Vector3();
let targetPosCamara = new THREE.Vector3();
let focusInicialControls = new THREE.Vector3();
let targetFocusControls = new THREE.Vector3();

let cotaFijadaActiva = false;
let refCamPos = new THREE.Vector3();
let refTargetPos = new THREE.Vector3();
const TOLERANCIA_MOVIMIENTO = 1.5; 

let desvanecerCotas = false;
let opacidadCotas = 1.0;

controls.addEventListener('start', () => {
  window.cerrarBienvenida();
  if (animandoCamara) {
    animandoCamara = false;
  }
});

// 6. CARGADOR DE MODELO .GLB CON SOPORTE DE CAMARA_DEFAULT Y TARGETS
const loader = new GLTFLoader();

function cargarModelo(pathArchivo) {
  if (modeloActual) {
    scene.remove(modeloActual);
  }

  puntosInteres = [];
  cotaActiva = null;
  animandoCamara = false;
  cotaFijadaActiva = false;

  loader.load(pathArchivo, (gltf) => {
    modeloActual = gltf.scene;
    scene.add(modeloActual);

    modeloActual.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(modeloActual);
    const center = box.getCenter(new THREE.Vector3());
    const sphere = new THREE.Sphere();
    box.getBoundingSphere(sphere);
    const radioModelo = sphere.radius;

    const camarasEncontradas = [];
    let camaraDefaultEncontrada = null;
    const targetsEncontrados = new Map();
    const cotasEncontradas = new Map();

    modeloActual.traverse((child) => {
      if (child.isCamera || child.type === 'PerspectiveCamera') {
        const nombreLower = child.name.toLowerCase();
        if (nombreLower.includes('default') || nombreLower.includes('inicio') || nombreLower.includes('camara_default')) {
          camaraDefaultEncontrada = child;
        } else {
          camarasEncontradas.push(child);
        }
      }
      
      const nombreLower = child.name.toLowerCase();
      if (nombreLower.includes('target_')) {
        const worldPos = new THREE.Vector3();
        child.getWorldPosition(worldPos);
        const claveTarget = nombreLower.replace('target_', '').replace('.001', '');
        targetsEncontrados.set(claveTarget, worldPos);
      }

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

    if (camaraDefaultEncontrada) {
      const posDef = camaraDefaultEncontrada.position.clone();
      const nombreDefLower = camaraDefaultEncontrada.name.toLowerCase();
      
      let targetDef = null;
      for (let [clave, posTarget] of targetsEncontrados.entries()) {
        if (nombreDefLower.includes(clave) || clave === 'default' || clave === 'inicio') {
          targetDef = posTarget.clone();
          break;
        }
      }

      if (!targetDef) targetDef = center.clone();

      controls.target.copy(targetDef);
      camera.position.copy(posDef);
      controls.update();
    } else {
      controls.target.copy(center);
      const fovRad = (camera.fov * Math.PI) / 180;
      let distanciaIdeal = radioModelo / Math.sin(fovRad / 2);
      distanciaIdeal *= 1.4;
      const offsetInicial = new THREE.Vector3(0, radioModelo * 0.5, distanciaIdeal);
      camera.position.copy(center).add(offsetInicial);
      controls.update();
    }

    camarasEncontradas.forEach((cam) => {
      const posicionCamara = cam.position.clone();
      const nombreCamLower = cam.name.toLowerCase();

      let puntoEnfoque = null;
      for (let [clave, posTarget] of targetsEncontrados.entries()) {
        if (nombreCamLower.includes(clave)) {
          puntoEnfoque = posTarget.clone();
          break;
        }
      }

      if (!puntoEnfoque) {
        const direccion = new THREE.Vector3(0, 0, -1);
        direccion.applyQuaternion(cam.quaternion);
        puntoEnfoque = posicionCamara.clone().add(direccion.multiplyScalar(3));
      }

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
  window.cerrarBienvenida();
  const p = puntosInteres[index];
  if (!p) return;

  if (cotaActiva && cotaActiva !== p.cota) {
    cotaActiva.visible = false;
    if (cotaActiva.material) cotaActiva.material.opacity = 0;
  }

  posInicialCamara.copy(camera.position);
  focusInicialControls.copy(controls.target);

  const posAjustada = p.posicion.clone();
  if (window.innerHeight > window.innerWidth) {
    const dirOffset = posAjustada.clone().sub(p.target).normalize();
    posAjustada.add(dirOffset.multiplyScalar(0.8));
  }

  targetPosCamara.copy(posAjustada);
  targetFocusControls.copy(p.target);

  tiempoInicioAnimacion = performance.now();
  animandoCamara = true;
  cotaFijadaActiva = false;

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

cargarModelo('/assets/modelo1.glb');

// 8. BUCLE DE ANIMACIÓN
function animate() {
  requestAnimationFrame(animate);

  if (animandoCamara) {
    const tiempoActual = performance.now();
    const progreso = (tiempoActual - tiempoInicioAnimacion) / duracionAnimacion;

    if (progreso < 1.0) {
      const easeProgress = progreso < 0.5 ? 2 * progreso * progreso : 1 - Math.pow(-2 * progreso + 2, 2) / 2;

      camera.position.lerpVectors(posInicialCamara, targetPosCamara, easeProgress);
      controls.target.lerpVectors(focusInicialControls, targetFocusControls, easeProgress);
    } else {
      camera.position.copy(targetPosCamara);
      controls.target.copy(targetFocusControls);
      animandoCamara = false;

      if (cotaActiva) {
        refCamPos.copy(camera.position);
        refTargetPos.copy(controls.target);
        cotaFijadaActiva = true;
      }
    }
  }

  if (cotaFijadaActiva && cotaActiva && !animandoCamara) {
    const distanciaMovida = camera.position.distanceTo(refCamPos) + controls.target.distanceTo(refTargetPos);
    if (distanciaMovida > TOLERANCIA_MOVIMIENTO) {
      desvanecerCotas = true;
      cotaFijadaActiva = false;
    }
  }

  if (desvanecerCotas && cotaActiva && cotaActiva.material) {
    opacidadCotas -= 0.04;
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
  const esPantallaVertical = window.innerHeight > window.innerWidth;
  camera.fov = esPantallaVertical ? 60 : 45;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});