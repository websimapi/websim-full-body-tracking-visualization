import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

let scene, camera, renderer, controls;
let avatarGroup;
let bodyMeshGroup, headMesh, leftHandGroup, rightHandGroup;
let facePoints; // THREE.Points for face landmarks

// Object to hold references to individual joint/landmark meshes for easy access
const avatarParts = {
    body: {},
    face: null, // Will hold the THREE.Points object
    leftHand: {},
    rightHand: {}
};

const smoothingFactor = { value: 0.8 }; // Default smoothing factor (0 = raw, 1 = frozen)

// --- Mock Tracking Data ---
// Unified coordinate system: origin at hipCenter (for body),
// face landmarks relative to head joint, hand landmarks relative to wrist joint.
// Units are approximate meters.
const mockTrackingData = {
    timestamp: 0,
    body: {
        hipCenter: { x: 0, y: 0.9, z: 0 }, // Position avatar slightly higher
        spine: { x: 0, y: 1.1, z: -0.02 },
        neck: { x: 0, y: 1.4, z: -0.04 },
        head: { x: 0, y: 1.55, z: -0.05 }, // Head anchor point
        leftShoulder: { x: -0.2, y: 1.4, z: -0.03 },
        leftElbow: { x: -0.4, y: 1.2, z: 0.05 },
        leftWrist: { x: -0.6, y: 1.0, z: 0.1 },
        rightShoulder: { x: 0.2, y: 1.4, z: -0.03 },
        rightElbow: { x: 0.4, y: 1.2, z: 0.05 },
        rightWrist: { x: 0.6, y: 1.0, z: 0.1 },
        leftHip: { x: -0.1, y: 0.9, z: 0 },
        leftKnee: { x: -0.12, y: 0.5, z: 0.05 },
        leftAnkle: { x: -0.14, y: 0.1, z: -0.05 },
        rightHip: { x: 0.1, y: 0.9, z: 0 },
        rightKnee: { x: 0.12, y: 0.5, z: 0.05 },
        rightAnkle: { x: 0.14, y: 0.1, z: -0.05 },
    },
    face: { // Coordinates relative to body.head position
        center: { x: 0, y: 0, z: 0.1 }, // Center of the face slightly forward
        leftEye: { x: -0.04, y: 0.05, z: 0.08 },
        rightEye: { x: 0.04, y: 0.05, z: 0.08 },
        noseTip: { x: 0, y: 0, z: 0.12 },
        mouthCenter: { x: 0, y: -0.05, z: 0.09 },
        leftEar: { x: -0.08, y: 0.05, z: 0.02 },
        rightEar: { x: 0.08, y: 0.05, z: 0.02 },
    },
    leftHand: { // Coordinates relative to body.leftWrist position
        wrist: { x: 0, y: 0, z: 0 }, // Reference point (matches body.leftWrist)
        thumbMetacarpal: { x: 0.01, y: -0.02, z: 0.03 },
        thumbProximal: { x: 0.03, y: -0.01, z: 0.05 },
        thumbDistal: { x: 0.04, y: 0, z: 0.07 },
        thumbTip: { x: 0.05, y: 0.01, z: 0.08 },
        indexMetacarpal: { x: 0, y: 0.01, z: -0.01 },
        indexProximal: { x: 0, y: 0.05, z: 0.01 },
        indexIntermediate: { x: 0, y: 0.08, z: 0.02 },
        indexDistal: { x: 0, y: 0.10, z: 0.02 },
        indexTip: { x: 0, y: 0.11, z: 0.025 },
        middleTip: { x: -0.02, y: 0.11, z: 0.01 }, // Simplified other fingers
        ringTip: { x: -0.04, y: 0.10, z: 0 },
        pinkyTip: { x: -0.06, y: 0.09, z: -0.01 },
        palmCenter: {x: -0.02, y: 0.05, z: 0}
    },
    rightHand: { // Coordinates relative to body.rightWrist position
        wrist: { x: 0, y: 0, z: 0 }, // Reference point
        thumbMetacarpal: { x: -0.01, y: -0.02, z: 0.03 },
        thumbProximal: { x: -0.03, y: -0.01, z: 0.05 },
        thumbDistal: { x: -0.04, y: 0, z: 0.07 },
        thumbTip: { x: -0.05, y: 0.01, z: 0.08 },
        indexMetacarpal: { x: 0, y: 0.01, z: -0.01 },
        indexProximal: { x: 0, y: 0.05, z: 0.01 },
        indexIntermediate: { x: 0, y: 0.08, z: 0.02 },
        indexDistal: { x: 0, y: 0.10, z: 0.02 },
        indexTip: { x: 0, y: 0.11, z: 0.025 },
        middleTip: { x: 0.02, y: 0.11, z: 0.01 },
        ringTip: { x: 0.04, y: 0.10, z: 0 },
        pinkyTip: { x: 0.06, y: 0.09, z: -0.01 },
        palmCenter: {x: 0.02, y: 0.05, z: 0}
    }
};

// Previous frame data for smoothing
let previousData = null;

function init() {
    // --- Scene Setup ---
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);
    scene.fog = new THREE.Fog(0xf0f0f0, 5, 25); // Atmospheric perspective

    // --- Camera Setup ---
    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(0, 1.2, 2.5); // Position camera to view the scene centered around the avatar

    // --- Renderer Setup ---
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true; // Enable shadows
    renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Softer shadows
    renderer.setPixelRatio(window.devicePixelRatio); // Better resolution on high DPI screens
    document.body.appendChild(renderer.domElement);

    // --- Controls ---
    controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1.0, 0); // Target the approximate center of the avatar's torso
    controls.enableDamping = true; // Smooth camera movement
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
    // const helper = new THREE.CameraHelper( directionalLight.shadow.camera ); // Optional: visualize shadow camera
    // scene.add( helper );

    // --- Ground Plane ---
    const groundGeometry = new THREE.PlaneGeometry(50, 50);
    const groundMaterial = new THREE.ShadowMaterial({ opacity: 0.4 }); // Material to receive shadows
    const groundMesh = new THREE.Mesh(groundGeometry, groundMaterial);
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.position.y = 0; // Ground at y=0
    groundMesh.receiveShadow = true;
    scene.add(groundMesh);

    // --- Avatar Setup ---
    avatarGroup = new THREE.Group();
    scene.add(avatarGroup);

    // Materials
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x4488ff, roughness: 0.5, metalness: 0.1 });
    const headMaterial = new THREE.MeshStandardMaterial({ color: 0xffaaaa, roughness: 0.6, metalness: 0.1 });
    const handMaterial = new THREE.MeshStandardMaterial({ color: 0xffcc88, roughness: 0.5, metalness: 0.1 });
    const facePointMaterial = new THREE.PointsMaterial({ color: 0xff0000, size: 5, sizeAttenuation: false }); // sizeAttenuation false makes points constant size regardless of distance

    const bodyJointSize = 0.03;
    const headSize = 0.1;
    const handJointSize = 0.012;

    // Body Joints Group
    bodyMeshGroup = new THREE.Group();
    avatarGroup.add(bodyMeshGroup);
    for (const jointName in mockTrackingData.body) {
        if (jointName === 'head') continue; // Head is handled separately
        const sphere = new THREE.Mesh(new THREE.SphereGeometry(bodyJointSize), bodyMaterial);
        sphere.name = jointName;
        sphere.castShadow = true;
        sphere.receiveShadow = true;
        bodyMeshGroup.add(sphere);
        avatarParts.body[jointName] = sphere; // Store reference
    }

    // Head Representation
    headMesh = new THREE.Mesh(new THREE.SphereGeometry(headSize), headMaterial);
    headMesh.name = 'headRepresentation';
    headMesh.castShadow = true;
    headMesh.receiveShadow = true;
    avatarGroup.add(headMesh); // Add head mesh directly to avatar group
    avatarParts.body['head'] = headMesh; // Store reference under body parts

    // Face Points (added as child of headMesh for relative positioning)
    const faceGeometry = new THREE.BufferGeometry();
    const initialFacePositions = new Float32Array(Object.keys(mockTrackingData.face).length * 3);
    faceGeometry.setAttribute('position', new THREE.BufferAttribute(initialFacePositions, 3));
    facePoints = new THREE.Points(faceGeometry, facePointMaterial);
    facePoints.name = 'facePoints';
    headMesh.add(facePoints); // Make points relative to head mesh's transform
    avatarParts.face = facePoints;

    // Left Hand Group
    leftHandGroup = new THREE.Group();
    leftHandGroup.name = 'leftHandGroup';
    avatarGroup.add(leftHandGroup);
    for (const jointName in mockTrackingData.leftHand) {
         const sphere = new THREE.Mesh(new THREE.SphereGeometry(handJointSize), handMaterial);
         sphere.name = `left_${jointName}`;
         sphere.castShadow = true;
         sphere.receiveShadow = true;
         leftHandGroup.add(sphere); // Add joint meshes to the hand group
         avatarParts.leftHand[jointName] = sphere; // Store reference
    }

    // Right Hand Group
    rightHandGroup = new THREE.Group();
    rightHandGroup.name = 'rightHandGroup';
    avatarGroup.add(rightHandGroup);
    for (const jointName in mockTrackingData.rightHand) {
         const sphere = new THREE.Mesh(new THREE.SphereGeometry(handJointSize), handMaterial);
         sphere.name = `right_${jointName}`;
         sphere.castShadow = true;
         sphere.receiveShadow = true;
         rightHandGroup.add(sphere); // Add joint meshes to the hand group
         avatarParts.rightHand[jointName] = sphere; // Store reference
    }

    // --- Initial Pose ---
    applyTrackingData(mockTrackingData); // Apply initial mock data to set positions
    previousData = deepClone(mockTrackingData); // Store initial data for smoothing

    // --- UI Controls ---
    const jitterSlider = document.getElementById('jitter');
    const jitterValueSpan = document.getElementById('jitterValue');
    jitterSlider.addEventListener('input', (event) => {
        smoothingFactor.value = parseFloat(event.target.value);
        jitterValueSpan.textContent = smoothingFactor.value.toFixed(2);
    });
    smoothingFactor.value = parseFloat(jitterSlider.value); // Set initial value from slider
    jitterValueSpan.textContent = smoothingFactor.value.toFixed(2);

    // --- Event Listeners ---
    window.addEventListener('resize', onWindowResize);

    // --- Start Animation ---
    animate();
}

function deepClone(obj) {
    // Simple deep clone for plain objects/arrays/primitives
    return JSON.parse(JSON.stringify(obj));
}

function lerp(start, end, alpha) {
    return start + (end - start) * alpha;
}

function lerpVector3(vStart, vEnd, alpha, target) {
    target.x = lerp(vStart.x, vEnd.x, alpha);
    target.y = lerp(vStart.y, vEnd.y, alpha);
    target.z = lerp(vStart.z, vEnd.z, alpha);
    return target; // Return the modified target vector
}

// Function to apply smoothed tracking data
function applySmoothedTrackingData(currentData) {
    if (!previousData) {
        previousData = deepClone(currentData); // Initialize if first frame
    }

    // Use a smaller alpha for more smoothing (closer to previous frame)
    // alpha = 1 means no smoothing (current frame)
    // alpha = 0 means frozen (previous frame)
    const alpha = 1.0 - smoothingFactor.value;

    const smoothedData = deepClone(currentData); // Start with current data structure

    // Smooth body points (world space)
    for (const jointName in currentData.body) {
        if (previousData.body[jointName] && avatarParts.body[jointName]) {
            lerpVector3(previousData.body[jointName], currentData.body[jointName], alpha, smoothedData.body[jointName]);
        }
    }

    // Smooth face points (relative to head)
    for (const landmarkName in currentData.face) {
         if (previousData.face[landmarkName]) {
            lerpVector3(previousData.face[landmarkName], currentData.face[landmarkName], alpha, smoothedData.face[landmarkName]);
        }
    }

    // Smooth left hand points (relative to wrist)
    for (const jointName in currentData.leftHand) {
         if (previousData.leftHand[jointName] && avatarParts.leftHand[jointName]) {
             lerpVector3(previousData.leftHand[jointName], currentData.leftHand[jointName], alpha, smoothedData.leftHand[jointName]);
         }
    }

     // Smooth right hand points (relative to wrist)
    for (const jointName in currentData.rightHand) {
         if (previousData.rightHand[jointName] && avatarParts.rightHand[jointName]) {
            lerpVector3(previousData.rightHand[jointName], currentData.rightHand[jointName], alpha, smoothedData.rightHand[jointName]);
         }
    }

    applyTrackingData(smoothedData); // Apply the smoothed data to the 3D model

    // Update previous data *after* applying, using the smoothed result
    previousData = smoothedData;
}

// Function to apply tracking data to the 3D model
function applyTrackingData(data) {
    // --- Body Update ---
    // Update positions of all body joint meshes based on world coordinates in data.body
    for (const jointName in data.body) {
        const jointData = data.body[jointName];
        const jointMesh = avatarParts.body[jointName]; // Use stored reference
        if (jointMesh) {
            jointMesh.position.set(jointData.x, jointData.y, jointData.z);
        }
    }

    // --- Face Update ---
    // Head mesh position is already set above as part of the body update.
    // Now update the relative positions of face landmarks.
    const facePositions = facePoints.geometry.attributes.position.array;
    let i = 0;
    for (const landmarkName in data.face) {
        const landmarkData = data.face[landmarkName];
        // Coordinates are relative to the head anchor, and facePoints is a child of headMesh
        facePositions[i++] = landmarkData.x;
        facePositions[i++] = landmarkData.y;
        facePositions[i++] = landmarkData.z;
    }
    facePoints.geometry.attributes.position.needsUpdate = true; // Important!

    // --- Hand Update ---
    // Position the hand *groups* based on the world position of the wrists from body tracking
    const leftWristPos = data.body.leftWrist;
    const rightWristPos = data.body.rightWrist;

    if (leftWristPos && leftHandGroup) {
        leftHandGroup.position.set(leftWristPos.x, leftWristPos.y, leftWristPos.z);
        // Position individual hand joints *relative* to the hand group (wrist)
        for (const jointName in data.leftHand) {
            const jointData = data.leftHand[jointName];
            const jointMesh = avatarParts.leftHand[jointName];
            if (jointMesh) {
                 jointMesh.position.set(jointData.x, jointData.y, jointData.z);
            }
        }
    }

     if (rightWristPos && rightHandGroup) {
        rightHandGroup.position.set(rightWristPos.x, rightWristPos.y, rightWristPos.z);
         // Position individual hand joints *relative* to the hand group (wrist)
        for (const jointName in data.rightHand) {
            const jointData = data.rightHand[jointName];
            const jointMesh = avatarParts.rightHand[jointName];
            if (jointMesh) {
                 jointMesh.position.set(jointData.x, jointData.y, jointData.z);
            }
        }
    }
}

// Function to simulate receiving new tracking data with some motion
function getSimulatedTrackingData() {
    const time = Date.now() * 0.0005; // Slower time for smoother simulation
    const jitterAmount = 0.003; // Small random jitter

    // Start with a fresh copy of the base pose data
    const newData = deepClone(mockTrackingData);
    newData.timestamp = time;

    // --- Simulate Body Movement (e.g., idle sway, breathing) ---
    const swayX = Math.sin(time * 1.2) * 0.02;
    const swayZ = Math.cos(time * 0.8) * 0.015;
    const breathY = Math.sin(time * 1.5) * 0.01; // Subtle up/down for spine/shoulders

    for (const jointName in newData.body) {
        const jointData = newData.body[jointName];
        jointData.x += swayX;
        jointData.z += swayZ;
        // Add breathing effect, more pronounced higher up
        if (jointName.includes('Shoulder') || jointName.includes('Spine') || jointName.includes('Neck') || jointName.includes('Head')) {
            jointData.y += breathY;
        }
         // Add jitter
        jointData.x += (Math.random() - 0.5) * jitterAmount;
        jointData.y += (Math.random() - 0.5) * jitterAmount;
        jointData.z += (Math.random() - 0.5) * jitterAmount;
    }

     // --- Simulate Face Movement (e.g., slight look around, expression) ---
    const lookX = Math.sin(time * 0.7 + 1) * 0.01; // Horizontal gaze shift (relative)
    const lookY = Math.cos(time * 0.5 + 2) * 0.01; // Vertical gaze shift (relative)
    for (const landmarkName in newData.face) {
        const landmarkData = newData.face[landmarkName];
        // Apply subtle relative shifts for expression/gaze - these are relative to head anchor
        landmarkData.x += lookX;
        landmarkData.y += lookY;
         // Add jitter
        landmarkData.x += (Math.random() - 0.5) * jitterAmount * 0.5; // Less jitter on face
        landmarkData.y += (Math.random() - 0.5) * jitterAmount * 0.5;
        landmarkData.z += (Math.random() - 0.5) * jitterAmount * 0.5;
    }

     // --- Simulate Hand Movement (e.g., finger curl, wrist rotation implied by joint positions) ---
    const handWaveSpeed = 1.5;
    const handWaveAmount = 0.15;
     // Make right hand wave slightly using elbow and wrist
    newData.body.rightElbow.x += Math.sin(time * handWaveSpeed) * handWaveAmount * 0.5;
    newData.body.rightElbow.z += Math.cos(time * handWaveSpeed * 0.8) * handWaveAmount * 0.3;
    newData.body.rightWrist.x += Math.sin(time * handWaveSpeed + 0.5) * handWaveAmount;
    newData.body.rightWrist.z += Math.cos(time * handWaveSpeed * 0.8 + 0.5) * handWaveAmount * 0.6;


    const fingerCurlSpeed = 2.5;
    const fingerCurlAmount = 0.015;
    // Curl right index finger slightly (relative Z movement)
    newData.rightHand.indexProximal.z -= Math.abs(Math.sin(time * fingerCurlSpeed)) * fingerCurlAmount * 0.5;
    newData.rightHand.indexIntermediate.z -= Math.abs(Math.sin(time * fingerCurlSpeed)) * fingerCurlAmount * 0.8;
    newData.rightHand.indexDistal.z -= Math.abs(Math.sin(time * fingerCurlSpeed)) * fingerCurlAmount;
    newData.rightHand.indexTip.z -= Math.abs(Math.sin(time * fingerCurlSpeed)) * fingerCurlAmount * 1.1;


    // Add jitter to hand joints (relative coords)
    for (const jointName in newData.leftHand) {
        const jointData = newData.leftHand[jointName];
        jointData.x += (Math.random() - 0.5) * jitterAmount;
        jointData.y += (Math.random() - 0.5) * jitterAmount;
        jointData.z += (Math.random() - 0.5) * jitterAmount;
    }
     for (const jointName in newData.rightHand) {
        const jointData = newData.rightHand[jointName];
        jointData.x += (Math.random() - 0.5) * jitterAmount;
        jointData.y += (Math.random() - 0.5) * jitterAmount;
        jointData.z += (Math.random() - 0.5) * jitterAmount;
    }

    return newData;
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
     renderer.setPixelRatio(window.devicePixelRatio); // Update pixel ratio on resize too
}

function animate() {
    requestAnimationFrame(animate);

    // 1. Get new tracking data (simulated)
    const currentTrackingData = getSimulatedTrackingData();

    // 2. Apply smoothing and update the 3D model
    applySmoothedTrackingData(currentTrackingData);
    // To see raw data without smoothing:
    // applyTrackingData(currentTrackingData);
    // previousData = deepClone(currentTrackingData); // Need to update previous even when not smoothing for lerp


    // 3. Update controls (for damping)
    controls.update();

    // 4. Render the scene
    renderer.render(scene, camera);
}

// --- Start the application ---
init();