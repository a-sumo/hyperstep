import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { EntityManager, SeekBehavior, Vehicle } from 'yuka';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(5, 5, 5);

const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.update();

const light = new THREE.PointLight(0xffffff, 1, 100);
light.position.set(5, 5, 5);
scene.add(light);

const planeGeometry = new THREE.PlaneGeometry(10, 10);
const planeMaterial = new THREE.MeshPhongMaterial({ color: 0xc0c0c0 });
const plane = new THREE.Mesh(planeGeometry, planeMaterial);
plane.rotation.x = -Math.PI / 2;
scene.add(plane);

animate();

const entityManager = new EntityManager();
const vehicle = new Vehicle();
vehicle.setRenderComponent(new THREE.Group(), sync);
entityManager.add(vehicle);

const seekBehavior = new SeekBehavior();
vehicle.steering.add(seekBehavior);

function sync(entity, renderComponent) {
  renderComponent.position.copy(entity.position);
  renderComponent.quaternion.copy(entity.rotation);
}

function onMouseDown(event) {
  event.preventDefault();
  const targetPosition = new THREE.Vector3(
    event.clientX / window.innerWidth * 2 - 1,
    0,
    -(event.clientY / window.innerHeight) * 2 + 1
  );
  seekBehavior.target.copy(targetPosition);
}

function animate() {
  requestAnimationFrame(animate);
  entityManager.update(0.016);
  renderer.render(scene, camera);
}

document.addEventListener('mousedown', onMouseDown, false);


