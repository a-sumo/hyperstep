import './style.css';
import * as THREE from 'three';

import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GUI } from 'three/examples/jsm/libs/lil-gui.module.min.js';
import Stats from 'three/examples/jsm/libs/stats.module';
import * as YUKA from 'yuka'

let camera, 
  scene, 
  renderer, 
  controls, 
  stats,
  raycaster

let vehicle,
  target,
  planeMesh,
  entityManager,
  seekBehavior,
  arriveBehavior,
  pointer




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

  // Add vehicle
  const vehicleGeometry = new THREE.ConeGeometry(0.1, 0.5, 8);
  vehicleGeometry.rotateX(Math.PI * 0.5);
  const vehicleMaterial = new THREE.MeshNormalMaterial();
  const vehicleMesh = new THREE.Mesh(vehicleGeometry, vehicleMaterial);

  vehicleMesh.matrixAutoUpdate = false;
  scene.add(vehicleMesh);


  vehicle = new YUKA.Vehicle();
  vehicle.setRenderComponent(vehicleMesh, sync);

  // The entity manager tracks and updates
  // the state of our scene entities
  entityManager = new YUKA.EntityManager();
  entityManager.add(vehicle);

  target = new YUKA.GameEntity();
  // target.setRenderComponent(targetMesh, sync);
  entityManager.add(target);

  // Define vehicle behavior

  seekBehavior = new YUKA.SeekBehavior(target.position);
  vehicle.steering.add(seekBehavior);

  arriveBehavior = new YUKA.ArriveBehavior(target.position, 3, 0.5);
  vehicle.steering.add(arriveBehavior);

  vehicle.position.set(-3, 0, -3);

  vehicle.maxSpeed = 1.5;

  pointer = new THREE.Vector2();

  window.addEventListener('pointerMove', onPointerMove);

  const planeGeo = new THREE.PlaneGeometry(25, 25);
  const planeMat = new THREE.MeshBasicMaterial({visible: false});
  planeMesh = new THREE.Mesh(planeGeo, planeMat);
  planeMesh.rotation.x = -0.5 * Math.PI;
  scene.add(planeMesh);
  planeMesh.name = 'plane';

  raycaster = new THREE.Raycaster();


  // Add helpers
  addHelpers(scene);

  renderer.render(scene, camera);

  document.addEventListener( 'pointermove', onPointerMove );
  window.addEventListener( 'resize', onWindowResize );  
  window.addEventListener('click', onMouseClick);


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
function onMouseClick() {

  raycaster.setFromCamera(pointer, camera);
  const intersects = raycaster.intersectObjects(scene.children);
  for(let i = 0; i < intersects.length; i++){
    if(intersects[i].object.name === 'plane'){
      target.position.set(intersects[i].point.x, 0, intersects[i].point.z);
    }
  }
}

function onPointerMove( event ) {

  pointer.x = ( event.clientX / window.innerWidth ) * 2 - 1;
  pointer.y = - ( event.clientY / window.innerHeight ) * 2 + 1;

}

function addHelpers (scene) {
  const gridHelper = new THREE.GridHelper( 10, 10);
  scene.add( gridHelper );

  const axesHelper = new THREE.AxesHelper( 3 );
  scene.add( axesHelper );

  stats = new Stats();
  document.body.appendChild( stats.dom );
}

function sync(entity, renderComponent){
  renderComponent.matrix.copy(entity.worldMatrix);
}

const time = new YUKA.Time();

function animate(){
  const delta = time.update().getDelta();
  entityManager.update(delta);
  renderer.render(scene, camera);
  stats.update();
}

init();
renderer.setAnimationLoop(animate);