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

// 2. ENTORNO Y FONDO HDRI
const rgbeLoader = new RGBELoader();
rgbeLoader.load('/assets/hdri.hdr', (texture) => {
  texture.mapping = THREE.EquirectangularReflectionMapping;
  scene.environment = texture;
  scene.background = texture;
  console.log("✅ HDRI cargado correctamente.");
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

toggleSidebarBtn.addEventListener('click', () => {
  sidebar.classList.toggle('collapsed');
});

const specsPanel = document.getElementById('specs-panel');
const toggleSpecsBtn = document.getElementById('toggle-specs');

toggleSpecsBtn.addEventListener('click', () => {
  specsPanel.classList.toggle('collapsed');
});

// 5. CARGADOR DE MODELO Y EXTRACCIÓN AUTOMÁTICA DE CÁMARAS DESDE BLENDER
let modeloActual = null;
let camarasDetectadas = [];
const loader = new GLTFLoader();

function cargarModelo(pathArchivo) {
  if (modeloActual) {
    scene.remove(modeloActual);
  }

  camarasDetectadas = [];

  loader.load(pathArchivo, (gltf) => {
    modeloActual = gltf.scene;
    scene.add(modeloActual);

    // Escaneamos el .glb en busca de cámaras exportadas desde Blender
    modeloActual.traverse((child) => {
      if (child.isCamera || child.type === 'PerspectiveCamera') {
        const direccion = new THREE.Vector3(0, 0, -1);
        direccion.applyQuaternion(child.quaternion);

        const posicionCamara = child.position.clone();
        const puntoEnfoque = posicionCamara.clone().add(direccion.multiplyScalar(3));

        camarasDetectadas.push({
          nombre: child.name || `Vista ${camarasDetectadas.length + 1}`,
          posicion: posicionCamara,
          target: puntoEnfoque
        });
      }
    });

    console.log(`✅ Modelo cargado: ${pathArchivo}. Cámaras encontradas: ${camarasDetectadas.length}`);
    renderizarBotonesDeCamara();

  }, undefined, (error) => {
    console.error("❌ Error al cargar modelo:", error);
  });
}

// 6. GENERADOR DINÁMICO DE BOTONES DE CÁMARA
function renderizarBotonesDeCamara() {
  const contenedor = document.getElementById('lista-vistas-dinamica');
  contenedor.innerHTML = '';

  if (camarasDetectadas.length === 0) {
    contenedor.innerHTML = `<div style="color: #94a3b8; font-size: 0.65rem; text-align: center; padding: 6px;">Sin cámaras en .glb</div>`;
    return;
  }

  camarasDetectadas.forEach((camData, index) => {
    const div = document.createElement('div');
    div.className = 'btn-vista-item';
    div.onclick = () => aplicarCamaraBlender(index);

    div.innerHTML = `<span>📍 ${camData.nombre}</span>`;
    contenedor.appendChild(div);
  });
}

window.aplicarCamaraBlender = function(index) {
  const c = camarasDetectadas[index];
  if (!c) return;

  camera.position.copy(c.posicion);
  controls.target.copy(c.target);
  controls.update();

  console.log(`🎬 Vista enfocada: ${c.nombre}`);
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

// 7. BUCLE DE ANIMACIÓN
function animate() {
  requestAnimationFrame(animate);
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