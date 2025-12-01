import * as THREE from 'three';
import grassShader from './shaders/grass.js';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';

// Mouse position normalized (-1 to +1)
const mouseTarget = new THREE.Vector2();

// Renderer
const canvas = document.querySelector('#three-canvas');


// Defina o fator de redução (quanto maior, menor a resolução)
// 1 = Resolução nativa (HD/4K)
// 4 = Estilo PS1/Retro (bem pixelado)
// 8 = Muito pixelado
const pixelFactor = 2; 

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: false // Desligue o antialias para ficar nítido
});

// O 'false' no final impede que o three.js encolha o canvas na tela
renderer.setSize(window.innerWidth / pixelFactor, window.innerHeight / pixelFactor, false);

// Opcional: Garante que não use o pixel ratio do dispositivo (retina) para manter o pixelado
renderer.setPixelRatio(1); 

renderer.shadowMap.enabled = true;
renderer.toneMapping = THREE.NoToneMapping;



// Scene
const scene = new THREE.Scene();
new EXRLoader().load(
  '../textures/ceu-preto.exr',
  
  (texture) => {
    texture.mapping = THREE.EquirectangularReflectionMapping;
    scene.background = texture;
    scene.environment = texture;
  },
  undefined,
  (err) => {
    console.error('Error loading EXR texture:', err);
  }
);

// Camera
const camera = new THREE.PerspectiveCamera(
  60, // fov
  window.innerWidth / window.innerHeight, //aspect
  0.1, // near
  1000 // far
);
camera.position.x = 0;
camera.position.y = -1;
camera.position.z = 3;
scene.add(camera);

// --- GRASS CONFIGURATION --- 

const PLANE_SIZE = 30;
const BLADE_COUNT = 50000;
const BLADE_WIDTH = 0.1;
const BLADE_HEIGHT = 0.8;
const BLADE_HEIGHT_VARIATION = 0.6;

// --- DIRT GROUND ---
const dirtTexture = new THREE.TextureLoader().load(
  '../textures/terra.jpg'
);
dirtTexture.wrapS = THREE.RepeatWrapping;
dirtTexture.wrapT = THREE.RepeatWrapping;
dirtTexture.repeat.set(10, 10); 

const dirtMaterial = new THREE.MeshStandardMaterial({
  map: dirtTexture,
  color: 0x9B8A79
});

const dirtMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(PLANE_SIZE, PLANE_SIZE), 
  dirtMaterial
);
dirtMesh.rotation.x = THREE.MathUtils.degToRad(-90);
dirtMesh.position.y = -0.2;
dirtMesh.receiveShadow = true;
scene.add(dirtMesh);

// Grass Textures
const grassTexture = new THREE.TextureLoader().load('../textures/grass.jpg');
const cloudTexture = new THREE.TextureLoader().load('../textures/cloud.jpg');
cloudTexture.wrapS = cloudTexture.wrapT = THREE.RepeatWrapping;

// Uniforms for Shaders
const startTime = Date.now();
const timeUniform = { type: 'f', value: 0.0 };
const grassUniforms = {
  textures: { value: [grassTexture, cloudTexture] },
  iTime: timeUniform
};

const grassMaterial = new THREE.ShaderMaterial({
  uniforms: grassUniforms,
  vertexShader: grassShader.vert,
  fragmentShader: grassShader.frag,
  vertexColors: true,
  side: THREE.DoubleSide,
  toneMapped: false,
});

// Generate grass geometry
generateField();


// --- Form Tilt (Parallax Effect) ---
const loginSection = document.querySelector('.login');
const tiltIntensity = 10;

window.addEventListener('mousemove', (e) => {
  // Normalize mouse position (-1 to +1)
  const xPercent = (e.clientX / window.innerWidth - 0.5) * 2;
  const yPercent = (e.clientY / window.innerHeight - 0.5) * 2;

  // Apply tilt to the form
  const rotateX = -yPercent * tiltIntensity;
  const rotateY = xPercent * tiltIntensity;

  if (loginSection) {
    loginSection.style.transform = `translateZ(100px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
  }

  // Update 3D camera target
  mouseTarget.x = xPercent;
  mouseTarget.y = -yPercent; // Inverted for Three.js
});


// --- Animation Loop (Camera Parallax) ---
const baseCameraX = 3;
const baseCameraY = 2;
const parallaxIntensity = 1;

function animate() {
  requestAnimationFrame(animate);

  // Update grass wind time
  const elapsedTime = Date.now() - startTime;
  grassUniforms.iTime.value = elapsedTime;

  // Camera Parallax Logic
  const targetCameraX = baseCameraX + (mouseTarget.x * parallaxIntensity);
  const targetCameraY = baseCameraY + (mouseTarget.y * parallaxIntensity);

  // Smooth movement (lerp)
  camera.position.x += (targetCameraX - camera.position.x) * 0.05;
  camera.position.y += (targetCameraY - camera.position.y) * 0.05;

  camera.lookAt(-10, 0, -10)

  // Render scene
  renderer.render(scene, camera);
}

// Start the loop
animate();


// === GRASS HELPER FUNCTIONS ===

function convertRange (val, oldMin, oldMax, newMin, newMax) {
  return (((val - oldMin) * (newMax - newMin)) / (oldMax - oldMin)) + newMin;
}

function generateField () {
  const positions = [];
  const uvs = [];
  const indices = [];
  const colors = [];

  for (let i = 0; i < BLADE_COUNT; i++) {
    const VERTEX_COUNT = 5;
    const surfaceMin = PLANE_SIZE / 2 * -1;
    const surfaceMax = PLANE_SIZE / 2;
    const radius = PLANE_SIZE / 2;

    const r = radius * Math.sqrt(Math.random());
    const theta = Math.random() * 2 * Math.PI;
    const x = r * Math.cos(theta);
    const y = r * Math.sin(theta);

    const pos = new THREE.Vector3(x, 0, y);

    const uv = [convertRange(pos.x, surfaceMin, surfaceMax, 0, 1), convertRange(pos.z, surfaceMin, surfaceMax, 0, 1)];

    const blade = generateBlade(pos, i * VERTEX_COUNT, uv);
    blade.verts.forEach(vert => {
      positions.push(...vert.pos);
      uvs.push(...vert.uv);
      colors.push(...vert.color);
    });
    blade.indices.forEach(indice => indices.push(indice));
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  geom.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
  geom.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3));
  geom.setIndex(indices);
  geom.computeVertexNormals();

  const mesh = new THREE.Mesh(geom, grassMaterial);
  mesh.receiveShadow = true;
  scene.add(mesh);
}

function generateBlade (center, vArrOffset, uv) {
  const MID_WIDTH = BLADE_WIDTH * 0.5;
  const TIP_OFFSET = 0.1;
  const height = BLADE_HEIGHT + (Math.random() * BLADE_HEIGHT_VARIATION);

  const yaw = Math.random() * Math.PI * 2;
  const yawUnitVec = new THREE.Vector3(Math.sin(yaw), 0, -Math.cos(yaw));
  const tipBend = Math.random() * Math.PI * 2;
  const tipBendUnitVec = new THREE.Vector3(Math.sin(tipBend), 0, -Math.cos(tipBend));

  // Find the Bottom Left, Bottom Right, Top Left, Top right, Top Center vertex positions
  const bl = new THREE.Vector3().addVectors(center, new THREE.Vector3().copy(yawUnitVec).multiplyScalar((BLADE_WIDTH / 2) * 1));
  const br = new THREE.Vector3().addVectors(center, new THREE.Vector3().copy(yawUnitVec).multiplyScalar((BLADE_WIDTH / 2) * -1));
  const tl = new THREE.Vector3().addVectors(center, new THREE.Vector3().copy(yawUnitVec).multiplyScalar((MID_WIDTH / 2) * 1));
  const tr = new THREE.Vector3().addVectors(center, new THREE.Vector3().copy(yawUnitVec).multiplyScalar((MID_WIDTH / 2) * -1));
  const tc = new THREE.Vector3().addVectors(center, new THREE.Vector3().copy(tipBendUnitVec).multiplyScalar(TIP_OFFSET));

  tl.y += height / 2;
  tr.y += height / 2;
  tc.y += height;

  // Vertex Colors
  const black = [0, 0, 0];
  const gray = [0.5, 0.5, 0.5];
  const white = [1.0, 1.0, 1.0];

  const verts = [
    { pos: bl.toArray(), uv: uv, color: black },
    { pos: br.toArray(), uv: uv, color: black },
    { pos: tr.toArray(), uv: uv, color: gray },
    { pos: tl.toArray(), uv: uv, color: gray },
    { pos: tc.toArray(), uv: uv, color: white }
  ];

  const indices = [
    vArrOffset,
    vArrOffset + 1,
    vArrOffset + 2,
    vArrOffset + 2,
    vArrOffset + 4,
    vArrOffset + 3,
    vArrOffset + 3,
    vArrOffset,
    vArrOffset + 2
  ];

  return { verts, indices };
}

window.addEventListener('resize', () => {
  // Atualiza a proporção da câmera
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  // Atualiza a resolução mantendo o fator de pixelização
  renderer.setSize(window.innerWidth / pixelFactor, window.innerHeight / pixelFactor, false);
});