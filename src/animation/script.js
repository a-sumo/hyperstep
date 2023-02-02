import '../style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import Stats from 'three/examples/jsm/libs/stats.module';
import { GUI } from 'three/examples/jsm/libs/lil-gui.module.min.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
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

let instructions, behavior, behavioral_attention

init();
animate();

function init() {

    scene = new THREE.Scene()

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000)
    camera.position.x = 7
    camera.position.y = 7
    camera.position.z = 7

    renderer = new THREE.WebGLRenderer()
    renderer.setSize(window.innerWidth, window.innerHeight)
    document.body.appendChild(renderer.domElement)

    controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(8, 0, 0)

    object1 = new THREE.Mesh(
        new RoundedBoxGeometry( 2, 2, 2, 7, 0.4 ),
        new THREE.MeshStandardMaterial( { roughness: 0.1} )
    )
    
    object1.position.set(0, 0, 0)
    scene.add(object1)
    console.log(object1.position, object1.rotation)

    object1.add(new THREE.AxesHelper(5))

    object2 = new THREE.Mesh(
        new RoundedBoxGeometry( 2, 2, 2, 7, 0.4 ),
        new THREE.MeshStandardMaterial( { roughness: 0.1} )
    )
    object2.position.set(4, 0, 0)
    object1.add(object2)
    object2.add(new THREE.AxesHelper(5))

    object3 = new THREE.Mesh(
        new RoundedBoxGeometry( 2, 2, 2, 7, 0.4 ),
        new THREE.MeshStandardMaterial( { roughness: 0.1 } )
    )
    object3.position.set(4, 0, 0)
    object2.add(object3)
    object3.add(new THREE.AxesHelper(5))

    // define instructions as a string of characters from 'a to c'
    
    //vocabulary = ["a1", "a2", "b1", "b2", "c1", "c2"]
    instructions = ["a1", "a1"]
    // the reponse to inputs defines the behavior
    behavior = {
        "a1" : {
            targets: object1.rotation,
            x: object1.rotation.x - Math.PI/2,
            y: object1.rotation.y - 0,
            z: object1.rotation.z - 0,
            duration: 200,
            easing: 'spring',
            update: camera.updateProjectionMatrix()
        }, 
        "a2" : {
            targets: object1.rotation,
            x: object1.rotation.x - 0,
            y: object1.rotation.y - 0,
            z: object1.rotation.z - 0,
            duration: 500,
            easing: 'linear',
            update: camera.updateProjectionMatrix()
        }, 
        "b1": {
            targets: object2.rotation,
            x: 0,
            y: -Math.PI/2,
            z: 0,
            duration: 400,
            easing: 'linear',
            update: camera.updateProjectionMatrix()
    },
        "b2": {
            targets: object2.rotation,
            x: 0,
            y: 0,
            z: Math.PI/2,
            duration: 1000,
            easing: 'linear',
            update: camera.updateProjectionMatrix()
    },
        "c1": {
            targets: object1.rotation,
            x: 0,
            y: 0,
            z: -Math.PI/2,
            duration: 100,
            easing: 'linear',
            update: camera.updateProjectionMatrix()
        },
        "c2": {
            targets: object1.rotation,
            x: Math.PI/2,
            y: 0,
            z: 0,
            duration: 1000,
            easing: 'linear',
            update: camera.updateProjectionMatrix()
        }
    }
    // the behavioral attention defines the parts being actuated 
    behavioral_attention = [[0,1], [1], [2], []]

    // create timeline
    timeline = anime.timeline({
        autoplay: true,
        duration: instructions-length * 500,
        easing: 'easeOutSine'
    });
    for (let i = 0; i < instructions.length; i++) {
        timeline.add(behavior[instructions[i]])
    }

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

    const environment = new RoomEnvironment();
    const pmremGenerator = new THREE.PMREMGenerator( renderer );

    scene.environment = pmremGenerator.fromScene( environment ).texture;
    scene.background =  new THREE.Color("rgb(100, 100,100)") ;
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