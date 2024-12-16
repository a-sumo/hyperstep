import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { volumeMesh, debugPlaneMesh, planeMesh, createDataTexture, create3dDataTexture } from './objects';
import { camera, renderer, scene, controls, pointer, raycaster, clock } from './globals';

export function initScene() {
    // ... All the scene setup code from init function
}

export function animate() {
    requestAnimationFrame(animate);
    updateMeshTexture();
    updateUniforms();
    renderer.render(scene, camera);
}

// Other functions such as onWindowResize, onPointerMove, etc.
function onWindowResize() {

    // renderer.setSize( window.innerWidth, window.innerHeight );
  
    // const aspect = window.innerWidth / window.innerHeight;
  
    // const frustumHeight = camera.top - camera.bottom;
  
    // camera.left = - frustumHeight * aspect / 2;
    // camera.right = frustumHeight * aspect / 2;
  
    // camera.updateProjectionMatrix();
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  
    renderer.setSize(window.innerWidth, window.innerHeight);
  
    render();
  
  }
  
  function onPointerMove(event) {
  
    pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.y = - (event.clientY / window.innerHeight) * 2 + 1;
  
  }