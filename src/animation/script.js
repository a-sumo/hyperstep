import '../style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import Stats from 'three/examples/jsm/libs/stats.module';
import { GUI } from 'three/examples/jsm/libs/lil-gui.module.min.js';

let camera, 
  scene, 
  renderer, 
  controls, 
  stats

let mesh;
const amount = 10;
const count = Math.pow( amount, 3 );
const dummy = new THREE.Object3D();

init();
animate();

function init() {

    scene = new THREE.Scene();
    scene.background = new THREE.Color( '#ffffff' );
    // Renderer
    renderer = new THREE.WebGLRenderer({antialias: true});
    renderer.setPixelRatio( window.devicePixelRatio );
    renderer.setSize( window.innerWidth, window.innerHeight );
    document.body.appendChild( renderer.domElement );
  
    // Camera
    // Perspective
    const aspect = window.innerWidth / window.innerHeight;
    camera = new THREE.PerspectiveCamera( 45, aspect, 0.01, 1000 );
    // // Orthographic
    // const width = 5;
    // const h = 2 * width; // frustum height
    // const aspect = window.innerWidth / window.innerHeight;
    // camera = new THREE.OrthographicCamera( - h * aspect / 2, h * aspect / 2, h / 2, - h / 2, 0.01, 1000 );
    camera.position.set( 20, 20, 20 );
    scene.add(camera);
  
    // Controls
    controls = new OrbitControls( camera, renderer.domElement );
    controls.addEventListener( 'change', render );
    controls.minZoom = 0.1;
    controls.maxZoom = 10;
    //controls.enablePan = false;
    controls.update();

    // geometry

    //

    const gui = new GUI();
    gui.add( mesh, 'count', 0, count );

    stats = new Stats();
    document.body.appendChild( stats.dom );

    //

    window.addEventListener( 'resize', onWindowResize );

}

function onWindowResize() {
    // Orthographic Camera
    // renderer.setSize( window.innerWidth, window.innerHeight );
  
    // const aspect = window.innerWidth / window.innerHeight;
  
    // const frustumHeight = camera.top - camera.bottom;
  
    // camera.left = - frustumHeight * aspect / 2;
    // camera.right = frustumHeight * aspect / 2;
  
    // Perspective Camera
    // camera.updateProjectionMatrix();
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  
    renderer.setSize( window.innerWidth, window.innerHeight );
    render();
  
  }

//

function animate() {

    requestAnimationFrame( animate );
    render();
    stats.update();

}

function render() {

    renderer.render( scene, camera );

}