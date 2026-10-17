import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

// ========== CONFIGURACIÓN ==========
// Cambia estas rutas según dónde tengas tus archivos
const HDRI_PATH = './assets/hdri.hdr';          // ← tu HDRI exterior
const MODELS = {
  'modelo1.glb': './assets/modelo1.glb',
  'modelo2.glb': './assets/modelo2.glb',
  'modelo3.glb': './assets/modelo3.glb'
};

// ========== ESCENA ==========
const container = document.getElementById('viewer');
const scene = new THREE.Scene();

// Cámara
const camera = new THREE.PerspectiveCamera(
  50,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.set(3, 2, 5);

// Renderer
const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: false
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
container.appendChild(renderer.domElement);

// Controles de órbita
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.target.set(0, 0.8, 0);
controls.update();

// ========== HDRI (entorno + iluminación) ==========
const pmremGenerator = new THREE.PMREMGenerator(renderer);
pmremGenerator.compileEquirectangularShader();

new RGBELoader()
  .setDataType(THREE.HalfFloatType)
  .load(HDRI_PATH, (texture) => {
    const envMap = pmremGenerator.fromEquirectangular(texture).texture;
    scene.environment = envMap;   // ilumina los materiales PBR
    scene.background = envMap;    // se ve el cielo / entorno
    texture.dispose();
    pmremGenerator.dispose();
  }, undefined, (err) => {
    console.error('Error cargando HDRI:', err);
    // Fallback de color por si falla el HDRI
    scene.background = new THREE.Color(0x1a1a2e);
  });

// ========== CARGA DE MODELOS ==========
const gltfLoader = new GLTFLoader();
let currentModel = null;

function loadModel(filename) {
  const path = MODELS[filename];
  if (!path) return;

  // Quitar el modelo anterior
  if (currentModel) {
    scene.remove(currentModel);
    // Liberar memoria (opcional pero recomendable)
    currentModel.traverse((child) => {
      if (child.isMesh) {
        child.geometry?.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose());
        } else {
          child.material?.dispose();
        }
      }
    });
    currentModel = null;
  }

  gltfLoader.load(
    path,
    (gltf) => {
      currentModel = gltf.scene;

      // Centrar y escalar el modelo automáticamente
      const box = new THREE.Box3().setFromObject(currentModel);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());

      // Centrar en origen
      currentModel.position.sub(center);

      // Escalar para que quepa bien (ajusta el 2.5 según necesites)
      const maxDim = Math.max(size.x, size.y, size.z);
      const scale = 2.5 / maxDim;
      currentModel.scale.setScalar(scale);

      scene.add(currentModel);

      // Ajustar controles al nuevo modelo
      controls.target.set(0, size.y * scale * 0.4, 0);
      controls.update();
    },
    undefined,
    (error) => {
      console.error('Error cargando modelo:', filename, error);
    }
  );
}

// Cargar el primer modelo al iniciar
loadModel('modelo1.glb');

// ========== INTERFAZ ==========
const sidebar = document.getElementById('sidebar');
const toggleBtn = document.getElementById('toggle-btn');
const modelButtons = document.querySelectorAll('.model-btn');

// Toggle del panel
toggleBtn.addEventListener('click', () => {
  sidebar.classList.toggle('collapsed');
});

// Botones de modelos
modelButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    // Quitar clase active de todos
    modelButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    const modelName = btn.dataset.model;
    loadModel(modelName);
  });
});

// Activar el primer botón visualmente
modelButtons[0].classList.add('active');

// ========== RESIZE ==========
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ========== LOOP DE ANIMACIÓN ==========
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
animate();