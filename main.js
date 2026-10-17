import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

// ========== CONFIGURACIÓN ==========
const HDRI_PATH = './assets/hdri.hdr';   // ← ajusta si el nombre es distinto
const MODELS = {
  'modelo1.glb': './assets/modelo1.glb',
  'modelo2.glb': './assets/modelo2.glb',
  'modelo3.glb': './assets/modelo3.glb'
};

// ========== ESCENA ==========
const container = document.getElementById('viewer');
const loaderEl = document.getElementById('loader');
const scene = new THREE.Scene();

// Cámara
const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.set(4.5, 2.2, 5.5);

// Renderer
const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: false
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.outputColorSpace = THREE.SRGBColorSpace;

// Sombras
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

container.appendChild(renderer.domElement);

// Controles
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.target.set(0, 0.9, 0);
controls.update();

// ========== LUZ DIRECCIONAL PARA SOMBRAS ==========
const dirLight = new THREE.DirectionalLight(0xffffff, 1.8);
dirLight.position.set(6, 12, 8);
dirLight.castShadow = true;
dirLight.shadow.mapSize.set(2048, 2048);
dirLight.shadow.camera.near = 0.5;
dirLight.shadow.camera.far = 40;
dirLight.shadow.camera.left = -8;
dirLight.shadow.camera.right = 8;
dirLight.shadow.camera.top = 8;
dirLight.shadow.camera.bottom = -8;
dirLight.shadow.bias = -0.0005;
scene.add(dirLight);

// Luz ambiental suave
const ambient = new THREE.AmbientLight(0xffffff, 0.25);
scene.add(ambient);

// ========== HDRI ==========
const pmremGenerator = new THREE.PMREMGenerator(renderer);
pmremGenerator.compileEquirectangularShader();

new RGBELoader()
  .setDataType(THREE.HalfFloatType)
  .load(
    HDRI_PATH,
    (texture) => {
      const envMap = pmremGenerator.fromEquirectangular(texture).texture;
      scene.environment = envMap;
      scene.background = envMap;
      texture.dispose();
      pmremGenerator.dispose();
    },
    undefined,
    (err) => {
      console.error('Error cargando HDRI:', err);
      scene.background = new THREE.Color(0x1a1a2e);
    }
  );

// ========== CARGA DE MODELOS ==========
const gltfLoader = new GLTFLoader();
let currentModel = null;

function showLoader() {
  loaderEl.classList.remove('hidden');
}

function hideLoader() {
  loaderEl.classList.add('hidden');
}

function loadModel(filename) {
  const path = MODELS[filename];
  if (!path) return;

  showLoader();

  // Eliminar modelo anterior y liberar memoria
  if (currentModel) {
    scene.remove(currentModel);
    currentModel.traverse((child) => {
      if (child.isMesh) {
        child.geometry?.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m.dispose());
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

      // Centrado y escalado
      const box = new THREE.Box3().setFromObject(currentModel);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());

      currentModel.position.sub(center);

      const maxDim = Math.max(size.x, size.y, size.z);
      const scale = 2.8 / maxDim;
      currentModel.scale.setScalar(scale);

      // Activar sombras
      currentModel.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });

      scene.add(currentModel);

      controls.target.set(0, size.y * scale * 0.35, 0);
      controls.update();

      hideLoader();
    },
    undefined,
    (error) => {
      console.error('Error cargando modelo:', filename, error);
      hideLoader();
    }
  );
}

// Cargar el primer modelo
loadModel('modelo1.glb');

// ========== INTERFAZ ==========
const sidebar = document.getElementById('sidebar');
const toggleBtn = document.getElementById('toggle-btn');
const modelButtons = document.querySelectorAll('.model-btn');

toggleBtn.addEventListener('click', () => {
  sidebar.classList.toggle('collapsed');
});

modelButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    modelButtons.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    loadModel(btn.dataset.model);
  });
});

modelButtons[0].classList.add('active');

// ========== RESIZE ==========
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ========== ANIMACIÓN ==========
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
animate();