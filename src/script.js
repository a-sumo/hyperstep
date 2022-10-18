import './style.css';
import * as THREE from 'three';

import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GUI } from 'three/examples/jsm/libs/lil-gui.module.min.js';
import Stats from 'three/examples/jsm/libs/stats.module';


let camera, 
  scene, 
  renderer, 
  controls, 
  stats

function init() {
  scene = new THREE.Scene();


  // Create renderer
  renderer = new THREE.WebGLRenderer({antialias: true});
  renderer.setPixelRatio( window.devicePixelRatio );
  renderer.setSize( window.innerWidth, window.innerHeight );
  document.body.appendChild( renderer.domElement );

  // Create camera
  const width = 10;
  const h = 2 * width; // frustum height
  const aspect = window.innerWidth / window.innerHeight;
  camera = new THREE.OrthographicCamera( - h * aspect / 2, h * aspect / 2, h / 2, - h / 2, 0.01, 1000 );
  camera.position.set( 10, 10, 10 );

  scene = new THREE.Scene();

  // Create controls
  controls = new OrbitControls( camera, renderer.domElement );
  controls.addEventListener( 'change', render );
  controls.minZoom = 0.1;
  controls.maxZoom = 10;
  controls.enablePan = false;
  controls.update();

  // Add helpers
  addHelpers(scene);

  render();

  window.addEventListener( 'resize', onWindowResize );  
}

function render() {

  renderer.render( scene, camera );

}

function onWindowResize() {

  renderer.setSize( window.innerWidth, window.innerHeight );

  const aspect = window.innerWidth / window.innerHeight;

  const frustumHeight = camera.top - camera.bottom;

  camera.left = - frustumHeight * aspect / 2;
  camera.right = frustumHeight * aspect / 2;

  camera.updateProjectionMatrix();

  render();

}

function addHelpers (scene) {
  const gridHelper = new THREE.GridHelper( 10, 10);
  scene.add( gridHelper );

  const axesHelper = new THREE.AxesHelper( 3 );
  scene.add( axesHelper );

  stats = new Stats();
  document.body.appendChild( stats.dom );
}

init()