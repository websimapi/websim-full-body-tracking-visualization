import { Holistic } from '@mediapipe/holistic';
import * as cam from '@mediapipe/camera_utils';
import { applySmoothedTrackingData } from './avatar.js'; // Import the function to update the avatar

// Define the mapping from MediaPipe pose landmark indices to names
// Based on https://google.github.io/mediapipe/solutions/pose#pose-landmark-model-card
const POSE_LANDMARKS_MAP = [
    'nose', 'left_eye_inner', 'left_eye', 'left_eye_outer', 'right_eye_inner', 'right_eye', 'right_eye_outer', // 0-6
    'left_ear', 'right_ear', 'mouth_left', 'mouth_right', // 7-10
    'left_shoulder', 'right_shoulder', 'left_elbow', 'right_elbow', 'left_wrist', 'right_wrist', // 11-16
    'left_pinky', 'right_pinky', 'left_index', 'right_index', 'left_thumb', 'right_thumb', // 17-22
    'left_hip', 'right_hip', 'left_knee', 'right_knee', 'left_ankle', 'right_ankle', // 23-28
    'left_heel', 'right_heel', 'left_foot_index', 'right_foot_index' // 29-32
];

// Define the mapping from MediaPipe hand landmark indices to names
// Based on https://google.github.io/mediapipe/solutions/hands#hand-landmark-model
const HAND_LANDMARKS_MAP = [
    'WRIST', 'THUMB_CMC', 'THUMB_MCP', 'THUMB_IP', 'THUMB_TIP', // 0-4
    'INDEX_FINGER_MCP', 'INDEX_FINGER_PIP', 'INDEX_FINGER_DIP', 'INDEX_FINGER_TIP', // 5-8
    'MIDDLE_FINGER_MCP', 'MIDDLE_FINGER_PIP', 'MIDDLE_FINGER_DIP', 'MIDDLE_FINGER_TIP', // 9-12
    'RING_FINGER_MCP', 'RING_FINGER_PIP', 'RING_FINGER_DIP', 'RING_FINGER_TIP', // 13-16
    'PINKY_MCP', 'PINKY_PIP', 'PINKY_DIP', 'PINKY_TIP' // 17-20
];

// Function to transform MediaPipe Holistic results into the format needed by applyTrackingData
function transformMediaPipeResults(results) {
    const transformedData = {
        body: {},
        face: [], // Array for face landmarks
        leftHand: {},
        rightHand: {}
    };

    // --- Body Transformation (using poseWorldLandmarks) ---
    if (results.poseWorldLandmarks) {
        // MediaPipe world landmarks are in meters, Y-up, Z forward (towards camera).
        // Three.js is Y-up, Z *out* of the screen (away from camera). Invert Z.
        // Hip center is roughly the origin for poseWorldLandmarks. Let's calculate it.
        const leftHip = results.poseWorldLandmarks[23];
        const rightHip = results.poseWorldLandmarks[24];
        let hipCenterX = 0, hipCenterY = 0, hipCenterZ = 0;
        if (leftHip && rightHip) {
             hipCenterX = (leftHip.x + rightHip.x) / 2;
             hipCenterY = (leftHip.y + rightHip.y) / 2;
             hipCenterZ = (leftHip.z + rightHip.z) / 2;
             transformedData.body['hipCenter'] = { x: hipCenterX, y: hipCenterY, z: -hipCenterZ };
        }

        results.poseWorldLandmarks.forEach((landmark, index) => {
            const name = POSE_LANDMARKS_MAP[index];
            if (name) {
                 // Offset world landmarks so the hip center is at (0, worldY, 0) roughly
                 // And invert Z axis for Three.js coordinate system
                transformedData.body[name] = {
                    x: landmark.x - hipCenterX,
                    y: landmark.y - hipCenterY + 0.9, // Lift the avatar baseline to ~0.9m
                    z: -(landmark.z - hipCenterZ) // Invert Z
                };
            }
        });

         // Define the 'head' position for the head mesh - use nose or average of eyes/ears
         const headAnchor = transformedData.body['nose'] || transformedData.body['left_eye'] || {x:0, y:1.5, z:0}; // Fallback
         transformedData.body['head'] = { ...headAnchor }; // Copy the anchor position

    }

    // --- Face Transformation (using faceLandmarks) ---
    // These are Normalized Device Coordinates [0, 1]. We need them relative to the head anchor.
    if (results.faceLandmarks && transformedData.body['head']) {
        const headWorldPos = transformedData.body['head'];
        const noseWorldPos = transformedData.body['nose']; // Use nose as a reference scale point if available

        // Estimate head size for scaling - based on distance between eyes or ears in world space
        const leftEye = transformedData.body['left_eye'];
        const rightEye = transformedData.body['right_eye'];
        let eyeDist = 0.1; // Default approximate eye distance in meters
        if (leftEye && rightEye) {
            const dx = leftEye.x - rightEye.x;
            const dy = leftEye.y - rightEye.y;
            const dz = leftEye.z - rightEye.z;
            eyeDist = Math.sqrt(dx*dx + dy*dy + dz*dz) * 1.5; // Scale factor based on eye dist
        }


        // Use the nose landmark (index 1 in faceLandmarks) as the relative center [0,0,0] for other points.
        // This is approximate. A better approach might involve full 3D reconstruction.
        const noseNDC = results.faceLandmarks[1]; // Assuming index 1 is a central nose point

        if (noseNDC) {
             transformedData.face = results.faceLandmarks.map(landmark => {
                 if (!landmark) return null;
                 // Calculate difference from nose in NDC space, scale based on estimated head size
                 // Y is inverted (NDC Y=0 is top, Three.js Y=0 is center/bottom depending on context)
                 // Z from faceLandmarks is depth relative to image plane, smaller is closer - map this conceptually
                 const relativeX = (landmark.x - noseNDC.x) * eyeDist;
                 const relativeY = -(landmark.y - noseNDC.y) * eyeDist; // Invert Y
                  // Approximate Z based on NDC Z and scale. This is highly approximate.
                 const relativeZ = (landmark.z - noseNDC.z) * eyeDist * 0.5;

                 return { x: relativeX, y: relativeY, z: relativeZ };
             });
        }
    }

    // --- Hand Transformation (using left/rightHandLandmarks) ---
    // Similar to face: landmarks are NDC relative to video frame. Make them relative to wrist world pos.
    const processHand = (handLandmarks, wristWorldPos, handDataStore) => {
        if (handLandmarks && wristWorldPos) {
            const wristNDC = handLandmarks[0]; // WRIST is index 0

            // Estimate hand size for scaling - based on wrist-to-middle-finger MCP distance?
            const middleMCP = handLandmarks[9]; // MIDDLE_FINGER_MCP index
            let handScale = 0.15; // Default size guess
             if (wristNDC && middleMCP) {
                // Estimate scale based on wrist-MCP distance in NDC * relative to estimated body size
                const dx = wristNDC.x - middleMCP.x;
                const dy = wristNDC.y - middleMCP.y;
                // Simple scaling based on world distance from shoulder to wrist
                const shoulder = transformedData.body[handDataStore === transformedData.leftHand ? 'left_shoulder' : 'right_shoulder'];
                 if (shoulder) {
                    const sdx = shoulder.x - wristWorldPos.x;
                    const sdy = shoulder.y - wristWorldPos.y;
                    const sdz = shoulder.z - wristWorldPos.z;
                    const armLength = Math.sqrt(sdx*sdx + sdy*sdy + sdz*sdz);
                    handScale = armLength * 0.3; // Hand is roughly 30% of forearm length? Guess.
                 }

             }

            handLandmarks.forEach((landmark, index) => {
                const name = HAND_LANDMARKS_MAP[index];
                if (name && landmark) {
                    // Calculate difference from wrist in NDC space, scale appropriately
                    const relativeX = (landmark.x - wristNDC.x) * handScale * 1.5; // Scale X more?
                    const relativeY = -(landmark.y - wristNDC.y) * handScale * 1.5; // Invert and Scale Y
                    // Approximate Z based on NDC depth relative to wrist
                    const relativeZ = (landmark.z - wristNDC.z) * handScale ; // Depth scaling might need adjustment

                    handDataStore[name] = {
                        x: relativeX,
                        y: relativeY,
                        z: relativeZ,
                        // visibility: landmark.visibility // Optional: Pass visibility
                    };
                }
            });
        }
    };

    processHand(results.leftHandLandmarks, transformedData.body.left_wrist, transformedData.leftHand);
    processHand(results.rightHandLandmarks, transformedData.body.right_wrist, transformedData.rightHand);

    return transformedData;
}

// --- MediaPipe Holistic Setup ---
let holistic;
let camera;

export async function setupWebcamTracking(videoElement, onResultsCallback) {
    holistic = new Holistic({locateFile: (file) => {
      return `https://cdn.jsdelivr.net/npm/@mediapipe/holistic@0.5.1675471629/${file}`;
    }});

    holistic.setOptions({
        modelComplexity: 1, // 0, 1, or 2. Higher = more accuracy, lower = faster.
        smoothLandmarks: true, // Use MediaPipe internal smoothing
        enableSegmentation: false, // We don't need segmentation mask
        smoothSegmentation: false,
        refineFaceLandmarks: true, // Get more detailed face landmarks
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
    });

    // Define the callback for when MediaPipe processes results
    holistic.onResults((results) => {
        const transformedData = transformMediaPipeResults(results);
        applySmoothedTrackingData(transformedData); // Call avatar update function
        if (onResultsCallback) {
             onResultsCallback(); // Notify main script that results are coming
             onResultsCallback = null; // Call only once on first result
        }
    });

    // Setup CameraX
    camera = new cam.Camera(videoElement, {
        onFrame: async () => {
            await holistic.send({image: videoElement});
        },
        width: 640, // Lower resolution for performance
        height: 480
    });

    // Start the camera feed
    await camera.start();
    console.log("Webcam tracking started.");
}