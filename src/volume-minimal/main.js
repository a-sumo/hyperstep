import '../style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import Stats from 'three/examples/jsm/libs/stats.module';
import { GUI } from 'dat.gui/build/dat.gui.min.js';


let camera,
    scene,
    renderer,
    controls,
    stats

let planeMesh,
    debugPlaneMesh,
    volumeMesh,
    pointer,
    clock


const gui = new GUI({ width: 200 });
// gui parameters

const params = {
    dt_scale: 0.1,
    max_steps: 100,
};

// Volume constants
const x_dim = 100;
const y_dim = 100;
const z_dim = 100;
const x_scale = 1;
const y_scale = 1;
const z_scale = 1;


// Shaders 
const raycastVertexShader = /* glsl */`
out vec3 vray_dir;
flat out vec3 transformed_eye;

void main(void) {

	gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1);
	transformed_eye = cameraPosition;
	vray_dir = position - transformed_eye;
}`;
const raycastFragmentShader = /* glsl */`
precision highp int;
precision highp float;
in vec3 vray_dir;
flat in vec3 transformed_eye;
const float Epsilon = 1e-10;
// Scene
uniform highp sampler3D volume;
uniform highp sampler2D spectrum;
uniform vec3 aabb_min;
uniform vec3 aabb_max;


// raycasting volume
uniform float dt_scale;
uniform int max_steps;
uniform ivec3 volume_dims;

// Axis-Aligned Bounding Box intersection
vec2 intersect_box(vec3 aabbMin, vec3 aabbMax, vec3 orig, vec3 dir) {

	vec3 inv_dir = 1.0 / dir;
	vec3 tmin_tmp = (aabbMin - orig) * inv_dir;
	vec3 tmax_tmp = (aabbMax - orig) * inv_dir;
	vec3 tmin = min(tmin_tmp, tmax_tmp);
	vec3 tmax = max(tmin_tmp, tmax_tmp);
	float t0 = max(tmin.x, max(tmin.y, tmin.z));
	float t1 = min(tmax.x, min(tmax.y, tmax.z));
	return vec2(t0, t1);
}

float linear_to_srgb(float x) {
	if (x <= 0.0031308f) {
		return 12.92f * x;
	}
	return 1.055f * pow(x, 1.f / 2.4f) - 0.055f;
}

void main(void) {
    vec3 ray_dir = normalize(vray_dir);
    vec2 t_hit = intersect_box(aabb_min, aabb_max, transformed_eye, ray_dir);

    if (t_hit.x > t_hit.y) {
        discard;
    }

    t_hit.x = max(t_hit.x, 0.0);
    vec3 dt_vec = 1.0 / (vec3(volume_dims) * abs(ray_dir));
    float dt = dt_scale * min(dt_vec.x, min(dt_vec.y, dt_vec.z));
    vec3 p = transformed_eye + (t_hit.x + dt) * ray_dir;

    vec4 spec_val = texture(volume, p);

    int step = 0;
    for (float t = t_hit.x; t < t_hit.y; t += dt) {
    if (step > max_steps){
        break;
    }
    vec4 val_color = spec_val;

    // Opacity correction
    val_color.w = 1.0 - pow(1.0 - val_color.w, dt_scale);

    // Alpha-blending
    gl_FragColor.rgb += (1.0 - gl_FragColor.a) * val_color.w * val_color.xyz;
    gl_FragColor.a += (1.0 - gl_FragColor.a) * val_color.w;
    if (gl_FragColor.a > 0.99) {
        break;
    }
    if (val_color.w < 0.0) {
        discard;
    }
    // step along the ray direction
        p += ray_dir * dt;
    step++;
    }

    gl_FragColor.r = linear_to_srgb(gl_FragColor.r);
    gl_FragColor.g = linear_to_srgb(gl_FragColor.g);
    gl_FragColor.b = linear_to_srgb(gl_FragColor.b);

    //gl_FragColor = color;

}
`;

// Main body
init();
animate();

function init() {
    scene = new THREE.Scene();

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    // Camera
    // Perspective
    const aspect = window.innerWidth / window.innerHeight;
    camera = new THREE.PerspectiveCamera(45, aspect, 0.01, 1000);
    // // Orthographic
    // const width = 5;
    // const h = 2 * width; // frustum height
    // const aspect = window.innerWidth / window.innerHeight;
    // camera = new THREE.OrthographicCamera( - h * aspect / 2, h * aspect / 2, h / 2, - h / 2, 0.01, 1000 );
    camera.position.set(-2, 1, 2);
    scene.add(camera);

    // Controls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.addEventListener('change', render);
    controls.minZoom = 0.1;
    controls.maxZoom = 10;
    controls.enablePan = false;
    controls.update();

    // GUI
    addGUI();

    // Clock 
    clock = new THREE.Clock();

    // Debug spectrogram texture
    let planeGeo1 = new THREE.PlaneGeometry(2, 2);
    let planeMat1 = new THREE.MeshBasicMaterial({ map: createDataTexture(x_dim, y_dim), side: THREE.DoubleSide });
    debugPlaneMesh = new THREE.Mesh(planeGeo1, planeMat1);
    debugPlaneMesh.position.set(-2, 0, -1);
    // scene.add(debugPlaneMesh);

    // Volume 
    const volumeGeometry = new THREE.BoxGeometry(x_scale, y_scale, z_scale);

    const volumeUniforms = {
        'volume': { value: create3dDataTexture(x_dim, y_dim, z_dim) },
        'volume_dims': { value: new THREE.Vector3( x_dim, y_dim, z_dim) },
        'aabb_min': { value: new THREE.Vector3()},
        'aabb_max': { value: new THREE.Vector3()},
        'dt_scale': { value: params.dt_scale },
        'max_steps': { value: params.max_steps },
    };

    const volumeMaterial = new THREE.ShaderMaterial({
        uniforms: volumeUniforms,
        vertexShader: raycastVertexShader,
        fragmentShader: raycastFragmentShader,
        side: THREE.DoubleSide,
        transparent: true
    });

    volumeMesh = new THREE.Mesh(volumeGeometry, volumeMaterial);
    volumeMesh.matrixAutoUpdate = true;
    volumeMesh.geometry.computeBoundingBox();

    (volumeMesh.material).uniforms['aabb_min']['value'] = volumeMesh.geometry.boundingBox.min;
    (volumeMesh.material).uniforms['aabb_max']['value'] = volumeMesh.geometry.boundingBox.max;

    scene.add(volumeMesh);

    pointer = new THREE.Vector2();

    window.addEventListener('pointerMove', onPointerMove);

    const planeGeo = new THREE.PlaneGeometry(25, 25);
    const planeMat = new THREE.MeshBasicMaterial({ visible: false });
    planeMesh = new THREE.Mesh(planeGeo, planeMat);
    planeMesh.rotation.x = -0.5 * Math.PI;

    // Add helpers
    //addHelpers(scene);
    render();
    document.addEventListener('pointermove', onPointerMove);
    window.addEventListener('resize', onWindowResize);
}

function render() {
    renderer.render(scene, camera);
}

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

function addHelpers(scene) {
    // const gridHelper = new THREE.GridHelper(10, 10);
    // scene.add(gridHelper);
    // stats = Stats();
    //document.body.appendChild(stats.dom)
    const axesHelper = new THREE.AxesHelper(3);
    scene.add(axesHelper);
}


function animate() {
    requestAnimationFrame(animate);
    //stats.update();
    render();
}

// Creates 3D texture with RGB gradient along the XYZ axes
function create3dDataTexture(width, height, depth) {
    const d = new Uint8Array(width * height * depth * 4);
    let stride = 0;

    for (let z = 0; z < depth; z++) {
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                d[stride + 0] = (x / width) * 255;
                d[stride + 1] = (y / height) * 255;
                d[stride + 2] = (z / depth) * 255;
                d[stride + 3] = 255;
                stride += 4;
            }
        }
    }
    const texture = new THREE.Data3DTexture(d, width, height, depth);
    texture.format = THREE.RGBAFormat;
    // texture.type = THREE.FloatType;
    // texture.minFilter = THREE.NearestFilter;
    // texture.magFilter = THREE.NearestFilter;
    texture.unpackAlignment = 1;
    texture.needsUpdate = true;

    return texture;
}
function createDataTexture(width, height) {

    const d = new Uint8Array(width * height * 4);

    let stride = 0;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            d[stride + 0] = 1;
            d[stride + 1] = 0;
            d[stride + 2] = 0;
            d[stride + 3] = 1;
            stride += 4;
        }
    }
    const texture = new THREE.DataTexture(d, width, height);
    texture.format = THREE.RedFormat;
    // texture.type = THREE.FloatType;
    // texture.minFilter = THREE.NearestFilter;
    // texture.magFilter = THREE.NearestFilter;
    texture.unpackAlignment = 1;

    return texture;
}


function addGUI() {
    // Raycasting
    const raycasting_folder = gui.addFolder('raycasting');
    raycasting_folder.add(params, 'dt_scale', 0.005,).step(0.001).name('dt_scale').onChange(function (value) {
        (volumeMesh.material).uniforms['dt_scale']['value'] = value;
    });
    raycasting_folder.add(params, 'max_steps', 1,).step(1).name('max_steps').onChange(function (value) {
        (volumeMesh.material).uniforms['max_steps']['value'] = value;
    });
}










