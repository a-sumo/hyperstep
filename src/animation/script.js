import '../style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import Stats from 'three/examples/jsm/libs/stats.module';
import { GUI } from 'three/examples/jsm/libs/lil-gui.module.min.js';
import anime from 'animejs/lib/anime.es.js';

let camera, 
  scene, 
  renderer, 
  controls, 
  stats,
  gui,
  debug

let mesh,
object1,
object2,
object3

let timeline

init();
animate();

function init() {

    scene = new THREE.Scene()

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000)
    camera.position.x = 4
    camera.position.y = 4
    camera.position.z = 4

    renderer = new THREE.WebGLRenderer()
    renderer.setSize(window.innerWidth, window.innerHeight)
    document.body.appendChild(renderer.domElement)

    controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(8, 0, 0)

    const light1 = new THREE.PointLight()
    light1.position.set(10, 10, 10)
    scene.add(light1)

    const light2 = new THREE.PointLight()
    light2.position.set(-10, 10, 10)
    scene.add(light2)

    object1 = new THREE.Mesh(
        new THREE.BoxGeometry(),
        new THREE.MeshPhongMaterial({ color: 0xff0000 })
    )
    object1.position.set(4, 0, 0)
    scene.add(object1)
    console.log(object1.position, object1.rotation)

    object1.add(new THREE.AxesHelper(5))

    object2 = new THREE.Mesh(
        new THREE.BoxGeometry(),
        new THREE.MeshPhongMaterial({ color: 0x00ff00 })
    )
    object2.position.set(4, 0, 0)
    object1.add(object2)
    object2.add(new THREE.AxesHelper(5))

    object3 = new THREE.Mesh(
        new THREE.BoxGeometry(),
        new THREE.MeshPhongMaterial({ color: 0x0000ff })
    )
    object3.position.set(4, 0, 0)
    object2.add(object3)
    object3.add(new THREE.AxesHelper(5))
    timeline = anime.timeline({
        autoplay: true,
        duration: 4500,
        easing: 'easeOutSine'
    });
    timeline.add({
        targets: object1.rotation,
        x: -Math.PI/2,
        y: 0,
        z: 0,
        loop: 3,
        duration: 500,
        easing: 'linear',
        update: camera.updateProjectionMatrix()
    })
    timeline.add({
        targets: object1.rotation,
        x: Math.PI/2,
        y: 0,
        z: 0,
        duration: 500,
        easing: 'linear',
        update: camera.updateProjectionMatrix()
    })
    timeline.add({
        targets: object2.rotation,
        x: 0,
        y: Math.PI/2,
        z: 0,
        duration: 500,
        easing: 'linear',
        update: camera.updateProjectionMatrix()
    });


    window.addEventListener('resize', onWindowResize, false)

    function onWindowResize() {
        camera.aspect = window.innerWidth / window.innerHeight
        camera.updateProjectionMatrix()
        renderer.setSize(window.innerWidth, window.innerHeight)
        render()
    }

    gui = new GUI()
    const object1Folder = gui.addFolder('Object1')
    object1Folder.add(object1.position, 'x', 0, 10, 0.01).name('X Position')
    object1Folder.add(object1.rotation, 'y', 0, Math.PI * 2, 0.01).name('Y Rotation')
    object1Folder.add(object1.scale, 'x', 0, 2, 0.01).name('X Scale')
    object1Folder.open()
    const object2Folder = gui.addFolder('Object2')
    object2Folder.add(object2.position, 'x', 0, 10, 0.01).name('X Position')
    object2Folder.add(object2.rotation, 'z', 0, Math.PI * 2, 0.01).name('Z Rotation')
    object2Folder.add(object2.scale, 'x', 0, 2, 0.01).name('X Scale')
    object2Folder.open()
    const object3Folder = gui.addFolder('Object3')
    object3Folder.add(object3.position, 'x', 0, 10, 0.01).name('X Position')
    object3Folder.add(object3.rotation, 'x', 0, Math.PI * 2, 0.01).name('X Rotation')
    object3Folder.add(object3.scale, 'x', 0, 2, 0.01).name('X Scale')
    object3Folder.open()

    stats = Stats()
    document.body.appendChild(stats.dom)

    // geometry

    stats = new Stats();
    document.body.appendChild( stats.dom );

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
    requestAnimationFrame(animate)
    controls.update()
    render()
    const object1WorldPosition = new THREE.Vector3()
    object1.getWorldPosition(object1WorldPosition)
    const object2WorldPosition = new THREE.Vector3()
    object2.getWorldPosition(object2WorldPosition)
    const object3WorldPosition = new THREE.Vector3()
    object3.getWorldPosition(object3WorldPosition)
    stats.update()
}

function render() {

    renderer.render( scene, camera );

}