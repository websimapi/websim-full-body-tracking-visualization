// Utility functions

// Simple deep clone for plain objects/arrays/primitives used in tracking data
export function deepClone(obj) {
    if (obj === null || typeof obj !== 'object') {
        return obj;
    }
    // Handle Date (though not expected in tracking data)
    if (obj instanceof Date) {
        return new Date(obj.getTime());
    }
    // Handle Array
    if (Array.isArray(obj)) {
        const arrCopy = [];
        for (let i = 0; i < obj.length; i++) {
            arrCopy[i] = deepClone(obj[i]);
        }
        return arrCopy;
    }
    // Handle Object
    if (obj instanceof Object) {
        const objCopy = {};
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                objCopy[key] = deepClone(obj[key]);
            }
        }
        return objCopy;
    }
    // Should not happen for JSON-like data
    throw new Error("Unable to copy obj! Its type isn't supported.");
}


// Linear interpolation function for numbers
export function lerp(start, end, alpha) {
    return start + (end - start) * alpha;
}

// Linear interpolation for simple {x, y, z} vector objects
export function lerpVector3(vStart, vEnd, alpha, target) {
     // Ensure target exists and is an object
    if (!target || typeof target !== 'object') {
        target = { x: 0, y: 0, z: 0 }; // Create a new object if target is invalid
    }
    target.x = lerp(vStart.x, vEnd.x, alpha);
    target.y = lerp(vStart.y, vEnd.y, alpha);
    target.z = lerp(vStart.z, vEnd.z, alpha);
    return target; // Return the modified or new target vector
}