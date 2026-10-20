import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';

// ==========================================
// CONFIGURACIÓN DE MODO
// true  = Muestra botones de grabación/edición para el Administrador
// false = Modo público/Cliente (sólo lectura de vistas predefinidas)
const MODO_ADMINISTRADOR = true; 
// ==========================================

// 1. ESCENA, CÁMARA Y RENDERER
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

// 3. ORBITCONTROLS CON LIBERTAD DE ROTACIÓN
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = 2;
controls.maxDistance = 12;
controls.maxPolarAngle = Math.PI / 2 - 0.05;
controls.minPolarAngle = 0.1;
controls.enablePan = true;

// 4. CARGA DE MODELO 3D
let modeloActual = null;
const loader = new GLTFLoader();

function cargarModelo(pathArchivo) {
  if (modeloActual) {
    scene.remove(modeloActual);
  }

  loader.load(pathArchivo, (gltf) => {
    modeloActual = gltf.scene;
    scene.add(modeloActual);
    console.log("✅ Modelo cargado:", pathArchivo);
  }, undefined, (error) => {
    console.error("❌ Error al cargar modelo:", error);
  });
}

cargarModelo('/assets/modelo1.glb');

// 5. CONTROLADOR MENÚ LATERAL
const sidebar = document.getElementById('sidebar');
const toggleSidebarBtn = document.getElementById('toggle-sidebar');

toggleSidebarBtn.addEventListener('click', () => {
  sidebar.classList.toggle('collapsed');
});

// 6. VISTAS TÉCNICAS (DEFAULT PARA EL CLIENTE)
const VISTAS_DEFAULT = [
  { nombre: "Vista General", px: 0, py: 3, pz: 6, tx: 0, ty: 0, tz: 0 },
  { nombre: "Agujero Central", px: 0, py: 4, pz: 0.1, tx: 0, ty: 0, tz: 0 },
  { nombre: "Apernadura (PCD)", px: 1.2, py: 2.5, pz: 2, tx: 0.3, ty: 0, tz: 0 },
  { nombre: "Cama de Caucho", px: 4.5, py: 0.5, pz: 0, tx: 0, ty: 0, tz: 0 }
];

let listaVistas = JSON.parse(localStorage.getItem('catalogo3d_vistas_rueda')) || VISTAS_DEFAULT;

// Control visual de Modo Admin vs Cliente
const panelAdmin = document.getElementById('panel-admin');
if (MODO_ADMINISTRADOR && panelAdmin) {
  panelAdmin.style.display = 'flex';
}

function renderizarBotonesVistas() {
  const contenedor = document.getElementById('lista-vistas-dinamica');
  contenedor.innerHTML = '';

  if (listaVistas.length === 0) {
    contenedor.innerHTML = `<div style="color: #94a3b8; font-size: 0.65rem; text-align: center; padding: 6px;">Sin puntos cargados</div>`;
    return;
  }

  listaVistas.forEach((vista, index) => {
    const div = document.createElement('div');
    div.className = 'btn-vista-item';
    div.onclick = () => aplicarVista(index);

    const botonBorrar = MODO_ADMINISTRADOR 
      ? `<button class="btn-borrar-item" onclick="borrarVista(event, ${index})" title="Eliminar">✕</button>` 
      : '';

    div.innerHTML = `
      <span>📍 ${vista.nombre}</span>
      ${botonBorrar}
    `;
    
    contenedor.appendChild(div);
  });
}

// FUNCIONES DE ADMINISTRACIÓN
window.guardarVistaActual = function() {
  const nombreVista = prompt("Nombre de la cota o punto técnico:", `Punto ${listaVistas.length + 1}`);
  if (!nombreVista || nombreVista.trim() === "") return;

  const nuevaVista = {
    nombre: nombreVista.trim(),
    px: Number(camera.position.x.toFixed(2)),
    py: Number(camera.position.y.toFixed(2)),
    pz: Number(camera.position.z.toFixed(2)),
    tx: Number(controls.target.x.toFixed(2)),
    ty: Number(controls.target.y.toFixed(2)),
    tz: Number(controls.target.z.toFixed(2))
  };

  listaVistas.push(nuevaVista);
  localStorage.setItem('catalogo3d_vistas_rueda', JSON.stringify(listaVistas));
  renderizarBotonesVistas();
};

window.exportarConfiguracionJSON = function() {
  console.log("📋 COPIA ESTE ARRAY EN VISTAS_DEFAULT:");
  console.log(JSON.stringify(listaVistas, null, 2));
  alert("Las coordenadas se imprimieron en la consola (F12).");
};

window.borrarVista = function(event, index) {
  event.stopPropagation();
  listaVistas.splice(index, 1);
  localStorage.setItem('catalogo3d_vistas_rueda', JSON.stringify(listaVistas));
  renderizarBotonesVistas();
};

// APLICAR VISTA (Mantiene total libertad de rotación al usuario)
window.aplicarVista = function(index) {
  const v = listaVistas[index];
  if (!v) return;

  camera.position.set(v.px, v.py, v.pz);
  controls.target.set(v.tx, v.ty, v.tz);
  controls.update();
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

renderizarBotonesVistas();

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