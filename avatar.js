import * as THREE from 'three';
import { lerpVector3, deepClone } from './utils.js';

// Object to hold references to individual joint/landmark meshes for easy access
export const avatarParts = {
    body: {},
    face: null, // Will hold the THREE.Points object
    leftHand: {},
    rightHand: {}
};

// Exported for modification by UI
export const smoothingFactor = { value: 0.8 }; // Default smoothing factor

// Previous frame data for smoothing - managed internally
let previousData = null;

// --- Avatar Creation ---
export function createAvatar() {
    const avatarGroup = new THREE.Group();
    avatarGroup.name = "Avatar";

    // Materials
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x4488ff, roughness: 0.5, metalness: 0.1 });
    const headMaterial = new THREE.MeshStandardMaterial({ color: 0xffaaaa, roughness: 0.6, metalness: 0.1 });
    const handMaterial = new THREE.MeshStandardMaterial({ color: 0xffcc88, roughness: 0.5, metalness: 0.1 });
    const facePointMaterial = new THREE.PointsMaterial({ color: 0xff0000, size: 3, sizeAttenuation: false }); // Smaller points

    const bodyJointSize = 0.03;
    const headSize = 0.1;
    const handJointSize = 0.012;

    // Body Joints Group (Placeholder geometries, positions updated by tracking)
    const bodyMeshGroup = new THREE.Group();
    bodyMeshGroup.name = "BodyJoints";
    avatarGroup.add(bodyMeshGroup);
    // Define expected body joints based on MediaPipe Pose Landmarks indices/names
    const bodyJointNames = [
        'nose', 'left_eye_inner', 'left_eye', 'left_eye_outer', 'right_eye_inner', 'right_eye', 'right_eye_outer',
        'left_ear', 'right_ear', 'mouth_left', 'mouth_right', 'left_shoulder', 'right_shoulder',
        'left_elbow', 'right_elbow', 'left_wrist', 'right_wrist', 'left_pinky', 'right_pinky',
        'left_index', 'right_index', 'left_thumb', 'right_thumb', 'left_hip', 'right_hip',
        'left_knee', 'right_knee', 'left_ankle', 'right_ankle', 'left_heel', 'right_heel',
        'left_foot_index', 'right_foot_index' // 33 landmarks
    ];
     // We won't create meshes for *all* of these, just the major skeleton ones
     const majorBodyJoints = [
        'left_shoulder', 'right_shoulder', 'left_elbow', 'right_elbow', 'left_wrist', 'right_wrist',
        'left_hip', 'right_hip', 'left_knee', 'right_knee', 'left_ankle', 'right_ankle'
     ];
     // Add spine/neck approximation if needed later
     const headAnchorName = 'nose'; // Use nose or average of eyes/ears as head anchor

    for (const jointName of majorBodyJoints) {
        const sphere = new THREE.Mesh(new THREE.SphereGeometry(bodyJointSize), bodyMaterial);
        sphere.name = jointName; // Use MediaPipe names directly if possible
        sphere.castShadow = true;
        sphere.receiveShadow = true;
        bodyMeshGroup.add(sphere);
        avatarParts.body[jointName] = sphere; // Store reference
    }
     // Add a representation for the center hip (calculated)
     const hipCenterSphere = new THREE.Mesh(new THREE.SphereGeometry(bodyJointSize * 0.8), new THREE.MeshStandardMaterial({color: 0x00ff00}));
     hipCenterSphere.name = 'hipCenter';
     bodyMeshGroup.add(hipCenterSphere);
     avatarParts.body['hipCenter'] = hipCenterSphere;

    // Head Representation
    // We'll use the head position from tracking, but place the mesh there.
    const headMesh = new THREE.Mesh(new THREE.SphereGeometry(headSize), headMaterial);
    headMesh.name = 'headRepresentation';
    headMesh.castShadow = true;
    headMesh.receiveShadow = true;
    avatarGroup.add(headMesh); // Add head mesh directly to avatar group
    avatarParts.body['head'] = headMesh; // Store reference under body parts

    // Face Points (Placeholder, geometry updated by tracking)
    const faceGeometry = new THREE.BufferGeometry();
    // MediaPipe has 468 face landmarks! Initialize buffer large enough.
    const facePositions = new Float32Array(478 * 3); // Increased size for MediaPipe v2 landmarks
    faceGeometry.setAttribute('position', new THREE.BufferAttribute(facePositions, 3));
    const facePoints = new THREE.Points(faceGeometry, facePointMaterial);
    facePoints.name = 'facePoints';
    headMesh.add(facePoints); // Make points relative to head mesh's transform
    avatarParts.face = facePoints;


    // --- Hand Groups and Joints (Placeholders) ---
    const mediapipeHandJointNames = [
        'WRIST', 'THUMB_CMC', 'THUMB_MCP', 'THUMB_IP', 'THUMB_TIP',
        'INDEX_FINGER_MCP', 'INDEX_FINGER_PIP', 'INDEX_FINGER_DIP', 'INDEX_FINGER_TIP',
        'MIDDLE_FINGER_MCP', 'MIDDLE_FINGER_PIP', 'MIDDLE_FINGER_DIP', 'MIDDLE_FINGER_TIP',
        'RING_FINGER_MCP', 'RING_FINGER_PIP', 'RING_FINGER_DIP', 'RING_FINGER_TIP',
        'PINKY_MCP', 'PINKY_PIP', 'PINKY_DIP', 'PINKY_TIP' // 21 landmarks per hand
    ];

    // Left Hand Group
    const leftHandGroup = new THREE.Group();
    leftHandGroup.name = 'leftHandGroup';
    avatarGroup.add(leftHandGroup);
    for (const jointName of mediapipeHandJointNames) {
         const sphere = new THREE.Mesh(new THREE.SphereGeometry(handJointSize), handMaterial);
         sphere.name = `left_${jointName}`; // Prefix to distinguish
         sphere.castShadow = true;
         sphere.receiveShadow = true;
         leftHandGroup.add(sphere); // Add joint meshes to the hand group
         avatarParts.leftHand[jointName] = sphere; // Store reference using MP name
    }

    // Right Hand Group
    const rightHandGroup = new THREE.Group();
    rightHandGroup.name = 'rightHandGroup';
    avatarGroup.add(rightHandGroup);
     for (const jointName of mediapipeHandJointNames) {
         const sphere = new THREE.Mesh(new THREE.SphereGeometry(handJointSize), handMaterial);
         sphere.name = `right_${jointName}`; // Prefix to distinguish
         sphere.castShadow = true;
         sphere.receiveShadow = true;
         rightHandGroup.add(sphere); // Add joint meshes to the hand group
         avatarParts.rightHand[jointName] = sphere; // Store reference using MP name
    }


    return avatarGroup; // Return the main group containing all parts
}


// --- Avatar Update Functions ---

// Function to apply tracking data (received from tracking.js) to the 3D model
// Assumes data is already transformed into the appropriate world/relative coordinates
export function applyTrackingData(data) {
    if (!data) return;

    // --- Body Update ---
    // Update positions of all tracked body joint meshes
    for (const jointName in data.body) {
        const jointData = data.body[jointName];
        const jointMesh = avatarParts.body[jointName];
        if (jointMesh && jointData) {
            jointMesh.position.set(jointData.x, jointData.y, jointData.z);
            // Special case: Update the head mesh position using the 'head' data point
             if (jointName === 'head') {
                 avatarParts.body['head'].position.set(jointData.x, jointData.y, jointData.z);
             }
        }
    }

    // --- Face Update ---
    // Update the relative positions of face landmarks within the head mesh
    if (data.face && avatarParts.face) {
        const facePositions = avatarParts.face.geometry.attributes.position.array;
        let visiblePoints = 0;
        for (let i = 0; i < data.face.length; i++) {
            const landmarkData = data.face[i];
            if (landmarkData) {
                 // Coordinates are pre-calculated relative to the head anchor in tracking.js
                facePositions[visiblePoints * 3 + 0] = landmarkData.x;
                facePositions[visiblePoints * 3 + 1] = landmarkData.y;
                facePositions[visiblePoints * 3 + 2] = landmarkData.z;
                visiblePoints++;
            }
        }
         // Important: Update draw range to only show points with data
         avatarParts.face.geometry.setDrawRange(0, visiblePoints);
        avatarParts.face.geometry.attributes.position.needsUpdate = true;
    }


    // --- Hand Update ---
    // Position the hand *groups* based on the world position of the wrists
    const leftWristPos = data.body.left_wrist;
    const rightWristPos = data.body.right_wrist;

    const leftHandGroup = avatarParts.leftHand['WRIST']?.parent; // Get the group
    const rightHandGroup = avatarParts.rightHand['WRIST']?.parent;

    if (leftWristPos && leftHandGroup && data.leftHand) {
        leftHandGroup.position.set(leftWristPos.x, leftWristPos.y, leftWristPos.z);
        // Position individual hand joints *relative* to the hand group (wrist)
        for (const jointName in data.leftHand) {
            const jointData = data.leftHand[jointName];
            const jointMesh = avatarParts.leftHand[jointName];
            if (jointMesh && jointData) {
                 // Coordinates are pre-calculated relative to the wrist anchor in tracking.js
                 jointMesh.position.set(jointData.x, jointData.y, jointData.z);
                 // Hide joints if visibility is low (optional)
                 // jointMesh.visible = jointData.visibility > 0.5;
            }
        }
    } else if (leftHandGroup) {
        // Hide hand if wrist is not tracked
        // leftHandGroup.visible = false; // Or just don't update positions
    }

     if (rightWristPos && rightHandGroup && data.rightHand) {
        rightHandGroup.position.set(rightWristPos.x, rightWristPos.y, rightWristPos.z);
         // Position individual hand joints *relative* to the hand group (wrist)
        for (const jointName in data.rightHand) {
            const jointData = data.rightHand[jointName];
            const jointMesh = avatarParts.rightHand[jointName];
            if (jointMesh && jointData) {
                 // Coordinates are pre-calculated relative to the wrist anchor in tracking.js
                 jointMesh.position.set(jointData.x, jointData.y, jointData.z);
                 // jointMesh.visible = jointData.visibility > 0.5;
            }
        }
     } else if (rightHandGroup) {
        // rightHandGroup.visible = false;
     }
}


// Function to apply smoothed tracking data
export function applySmoothedTrackingData(currentData) {
    if (!currentData) return;

    if (!previousData) {
        previousData = deepClone(currentData); // Initialize if first frame
        applyTrackingData(currentData); // Apply raw data on first frame
        return;
    }

    // Use a smaller alpha for more smoothing (closer to previous frame)
    const alpha = 1.0 - smoothingFactor.value;

    // Create a structure for smoothed data
    const smoothedData = { body: {}, face: [], leftHand: {}, rightHand: {} };

    // --- Smooth Body Points (World Space) ---
    for (const jointName in currentData.body) {
        if (currentData.body[jointName] && previousData.body?.[jointName]) {
            smoothedData.body[jointName] = smoothedData.body[jointName] || {x:0, y:0, z:0}; // Initialize if needed
            lerpVector3(previousData.body[jointName], currentData.body[jointName], alpha, smoothedData.body[jointName]);
        } else if (currentData.body[jointName]) {
            smoothedData.body[jointName] = deepClone(currentData.body[jointName]); // Use current if no previous
        }
    }

    // --- Smooth Face Points (Relative to Head) ---
     // Ensure arrays are of the same length for safe lerping
    const numFacePoints = Math.min(currentData.face?.length || 0, previousData.face?.length || 0);
    smoothedData.face = new Array(currentData.face?.length || 0).fill(null); // Initialize array size

    for (let i = 0; i < numFacePoints; i++) {
        const currentPoint = currentData.face[i];
        const previousPoint = previousData.face[i];
         if (currentPoint && previousPoint) {
            smoothedData.face[i] = smoothedData.face[i] || {x:0, y:0, z:0};
            lerpVector3(previousPoint, currentPoint, alpha, smoothedData.face[i]);
        } else if (currentPoint) {
             smoothedData.face[i] = deepClone(currentPoint); // Use current if no previous
         }
    }
    // Copy any remaining points from current data if arrays were different lengths
     if (currentData.face) {
        for (let i = numFacePoints; i < currentData.face.length; i++) {
             if (currentData.face[i]) smoothedData.face[i] = deepClone(currentData.face[i]);
         }
     }


    // --- Smooth Left Hand Points (Relative to Wrist) ---
    for (const jointName in currentData.leftHand) {
         if (currentData.leftHand[jointName] && previousData.leftHand?.[jointName]) {
            smoothedData.leftHand[jointName] = smoothedData.leftHand[jointName] || {x:0, y:0, z:0};
             lerpVector3(previousData.leftHand[jointName], currentData.leftHand[jointName], alpha, smoothedData.leftHand[jointName]);
             // Copy visibility if it exists
             if (currentData.leftHand[jointName].visibility !== undefined) {
                 smoothedData.leftHand[jointName].visibility = currentData.leftHand[jointName].visibility;
             }
         } else if (currentData.leftHand[jointName]) {
             smoothedData.leftHand[jointName] = deepClone(currentData.leftHand[jointName]); // Use current if no previous
         }
    }

     // --- Smooth Right Hand Points (Relative to Wrist) ---
    for (const jointName in currentData.rightHand) {
         if (currentData.rightHand[jointName] && previousData.rightHand?.[jointName]) {
             smoothedData.rightHand[jointName] = smoothedData.rightHand[jointName] || {x:0, y:0, z:0};
            lerpVector3(previousData.rightHand[jointName], currentData.rightHand[jointName], alpha, smoothedData.rightHand[jointName]);
             // Copy visibility if it exists
            if (currentData.rightHand[jointName].visibility !== undefined) {
                 smoothedData.rightHand[jointName].visibility = currentData.rightHand[jointName].visibility;
            }
         } else if (currentData.rightHand[jointName]) {
            smoothedData.rightHand[jointName] = deepClone(currentData.rightHand[jointName]); // Use current if no previous
         }
    }

    applyTrackingData(smoothedData); // Apply the smoothed data to the 3D model

    // Update previous data *after* applying, using the smoothed result
    previousData = smoothedData;
}