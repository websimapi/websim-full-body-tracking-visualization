import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createAvatar, smoothingFactor } from './avatar.js';
import { setupWebcamTracking } from './tracking.js';

let scene, camera, renderer, controls;
let avatarGroup; // Group containing all avatar parts

function init() {
    // --- Scene Setup ---
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);
    scene.fog = new THREE.Fog(0xf0f0f0, 5, 25);

    // --- Camera Setup ---
    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(0, 1.2, 2.5); // Position camera to view the scene centered around the avatar

    // --- Renderer Setup ---
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setPixelRatio(window.devicePixelRatio);
    document.body.appendChild(renderer.domElement);

    // --- Controls ---
    controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1.0, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.update();

    // --- Lighting ---
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(3, 5, 4);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 1024;
    directionalLight.shadow.mapSize.height = 1024;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 15;
    directionalLight.shadow.camera.left = -5;
    directionalLight.shadow.camera.right = 5;
    directionalLight.shadow.camera.top = 5;
    directionalLight.shadow.camera.bottom = -5;
    scene.add(directionalLight);

    // --- Ground Plane ---
    const groundGeometry = new THREE.PlaneGeometry(50, 50);
    const groundMaterial = new THREE.ShadowMaterial({ opacity: 0.4 });
    const groundMesh = new THREE.Mesh(groundGeometry, groundMaterial);
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.position.y = 0;
    groundMesh.receiveShadow = true;
    scene.add(groundMesh);

    // --- Avatar Setup ---
    avatarGroup = createAvatar(); // Function from avatar.js creates and returns the main group
    scene.add(avatarGroup);

    // --- UI Controls ---
    const jitterSlider = document.getElementById('jitter');
    const jitterValueSpan = document.getElementById('jitterValue');
    jitterSlider.addEventListener('input', (event) => {
        smoothingFactor.value = parseFloat(event.target.value);
        jitterValueSpan.textContent = smoothingFactor.value.toFixed(2);
    });
    // Initialize smoothing factor from slider value
    smoothingFactor.value = parseFloat(jitterSlider.value);
    jitterValueSpan.textContent = smoothingFactor.value.toFixed(2);

    // --- Webcam Tracking Setup ---
    const videoElement = document.querySelector('.input_video');
    const infoElement = document.getElementById('info');
    infoElement.textContent = 'Initializing webcam and tracking model...';

    setupWebcamTracking(videoElement, () => {
        // This callback is executed by tracking.js when results are ready
        // The actual application of data happens within tracking.js calling avatar.js
        infoElement.textContent = 'Tracking active';
    }).catch(err => {
        console.error("Failed to setup webcam tracking:", err);
        infoElement.textContent = 'Error initializing tracking. Check console.';
        // Optionally fall back to simulation or show error message
    });


    // --- Event Listeners ---
    window.addEventListener('resize', onWindowResize);

    // --- Start Animation ---
    animate();
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
}

function animate() {
    requestAnimationFrame(animate);

    // MediaPipe processing runs asynchronously via CameraX, triggered by setupWebcamTracking.
    // The `onResults` callback within tracking.js handles data updates.

    // Update camera controls
    controls.update();

    // Render the scene
    renderer.render(scene, camera);
}

// --- Start the application ---
init();