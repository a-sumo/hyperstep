
import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import Stats from 'three/examples/jsm/libs/stats.module';
import WebGL from 'three/examples/jsm/capabilities/WebGL.js';
import { VRButton } from 'three/examples/jsm/webxr/VRButton.js';
import * as mm from '@magenta/music/';
import { SpecParams } from '@magenta/music/esm/core/audio_utils';
import {loadAudioFromFile, resampleAndMakeMono, melSpectrogram, powerToDb} from '@magenta/music/esm/core/audio_utils';
import * as tf from '@tensorflow/tfjs-backend-webgl';
import { Vector3 } from 'three';


if ( WebGL.isWebGL2Available() === false ) {

  document.body.appendChild( WebGL.getWebGL2ErrorMessage() );

}

let camera: THREE.PerspectiveCamera, 
  scene: THREE.Scene, 
  renderer: THREE.WebGLRenderer, 
  controls: OrbitControls, 
  stats: Stats,
  raycaster:  THREE.Raycaster

let planeMesh: THREE.Mesh,
  debugPlaneMesh: THREE.Mesh,
  volumeMesh: THREE.Mesh,
  pointer: THREE.Vector2,
  specTexture: THREE.DataTexture,
  clock: THREE.Clock

// Volume constants
const x_dim = 4;
const y_dim = 4;
const z_dim = 4;
const x_scale = 1;
const y_scale = 1;
const z_scale = 1;

// Magenta constants
const SAMPLE_RATE = 16000;
const MEL_SPEC_BINS = 229;
const SPEC_HOP_LENGTH = 512;

// UI Elements 
const fileInput = document.getElementById('test_fileInput') as HTMLInputElement;

// Set upevent listeners
addEventListener('change', () => loadFile(fileInput, 'test'));

function loadFile(inputElement: HTMLInputElement, prefix: string) {
  //document.getElementById(`${prefix}_fileBtn`).setAttribute('disabled', '');
  const audioBuffer = loadAudioFromFile(inputElement.files[0]);
  return audioBuffer
  .then(
    (buffer) => {return preprocessAudio(buffer)})
  .then(
    (melSpec) => {
      // console.log(Math.max(...[].concat(...melSpec)));
      return createSpecDataTexture(melSpec, melSpec.length, MEL_SPEC_BINS)
      } 
  )
  .then(
    (dataTexture) => {return setMeshTexture(debugPlaneMesh, dataTexture)}
  );
}

// Compute mel spectrogram
async function preprocessAudio(audioBuffer: AudioBuffer) {
  const resampledMonoAudio = await resampleAndMakeMono(audioBuffer);
  return powerToDb(melSpectrogram(resampledMonoAudio, {
    sampleRate: SAMPLE_RATE,
    hopLength: SPEC_HOP_LENGTH,
    nMels: MEL_SPEC_BINS,
    // temporal resolution
    nFft: 2048,
    fMin: 30,
  }));
}

// Define Interface 
interface CurveData {
  positions: Array<Vector3>;
  tangents: Array<Vector3>;
  normals: Array<Vector3>;  
  binormals: Array<Vector3>; 
  numPoints: number;
};

// Shaders 
const raycastVertexShader = /* glsl */`
uniform vec3 volume_scale;
out vec3 vray_dir;
flat out vec3 transformed_eye;
void main(void) {
	// TODO: For non-uniform size volumes we need to transform them differently as well
	// to center them properly
	vec3 volume_translation = vec3(0.5) - volume_scale * 0.5;
	gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1);
	transformed_eye = (cameraPosition - volume_translation) / volume_scale;
	vray_dir = position - transformed_eye;
}`;
const raycastFragmentShader = /* glsl */`
precision highp int;
precision highp float;
uniform highp sampler3D volume;
uniform highp sampler2D spectrum;
uniform highp sampler2D curve_data;
uniform ivec3 volume_dims;
uniform vec3 volume_scale;
uniform float dt_scale;
uniform vec3 aabb_min;
uniform vec3 aabb_max;
uniform float time;
in vec3 vray_dir;
flat in vec3 transformed_eye;

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
// Pseudo-random number gen from
// http://www.reedbeta.com/blog/quick-and-easy-gpu-random-numbers-in-d3d11/
// with some tweaks for the range of values
float wang_hash(int seed) {
	seed = (seed ^ 61) ^ (seed >> 16);
	seed *= 9;
	seed = seed ^ (seed >> 4);
	seed *= 0x27d4eb2d;
	seed = seed ^ (seed >> 15);
	return float(seed % 2147483647) / float(2147483647);
}
float linear_to_srgb(float x) {
	if (x <= 0.0031308f) {
		return 12.92f * x;
	}
	return 1.055f * pow(x, 1.f / 2.4f) - 0.055f;
}
vec4 color_transfer(float intensity)
{
  vec3 high = vec3(0.0, 0.0, 0.0);
  vec3 low = vec3(1.0, 1.0, 1.0);
  float alpha = (exp(intensity) - 1.0) / (exp(1.0) - 1.0);
  return vec4(intensity * high + (1.0 - intensity) * low, alpha);
}

float sdSphere( vec3 p, vec3 offset, float scale )
{
  float dist = length(p - offset) - scale;
  return 1.0 - clamp(dist, 0.0, 1.0);
}
float distCurve(vec3 p){
  float min_dist = 10.0;
  float du = 0.2;
  float u = 0.0;
  while(u < 1.0 ){
    vec2 v_pos = vec2(u, 0.0);
    // point normals are stored in the 3rd row of the texture
    // whose UV.v coordinate is 0,75
    vec2 sample_normal = vec2(u,0.75);
    vec3 dist_vec = texture(curve_data, v_pos).rgb - p;
    min_dist = min(min_dist, length(dist_vec));
    u += du;
  }

  return min_dist;
}
void main(void) {
	vec3 ray_dir = normalize(vray_dir);
  vec4 color = vec4(0.0);
	vec2 t_hit = intersect_box(aabb_min, aabb_max, transformed_eye, ray_dir);
	if (t_hit.x > t_hit.y) {
		discard;
	}
	t_hit.x = max(t_hit.x, 0.0);
	vec3 dt_vec = 1.0 / (vec3(volume_dims) * abs(ray_dir));
	float dt = dt_scale * min(dt_vec.x, min(dt_vec.y, dt_vec.z));
	vec3 p = transformed_eye + (t_hit.x + dt) * ray_dir;
  int step = 0;
  int maxStep = 100 ;
	for (float t = t_hit.x; t < t_hit.y; t += dt) {
    if (step > maxStep){
      break;
    }
    // use distance function
    // infinite tube
    // float dist = length(p.xy)-0.01;
    // sphere 
    // float dist = clamp(length(p),0.0,1.0);
    // curve 
    float dist = distCurve(p) * 1.0;
    // sample spectrogram
    vec4 spec_val = texture(spectrum, vec2(p.z + 0.5 , 0.03 / dist));
    vec4 val_color = vec4(pow(spec_val.r,10.0),pow(spec_val.r,2.0),0.0 * pow(spec_val.r,0.0),spec_val.r);
    //vec4 val_color = vec4(pow(dist,8.0),dist,dist,dist);
    // Opacity correction
    val_color.w = 1.0 - pow(1.0 - val_color.w, dt_scale);

    // Alpha-blending
    color.xyz += (1.0 - color.w) * val_color.w * val_color.xyz;
    color.w += (1.0 - color.w) * val_color.w;
    // if (color.w > 0.99) {
    //   break;
    // }
    if (val_color.w < 0.0) {
      discard;
    }
		p += ray_dir * dt;
    step++;
	}
  color.x = linear_to_srgb(color.x);
  color.y = linear_to_srgb(color.y);
  color.z = linear_to_srgb(color.z);
  gl_FragColor = color;
  //gl_FragColor = vec4(abs(texture(curve_data,vec2(1.0,0.0)).rgb) * 255.0, 1.0);

}
`;

init();
animate();


function init() {
  scene = new THREE.Scene();

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
  camera.position.set( 0, 0, 10 );
  
  scene.add(camera);

  // Controls
  controls = new OrbitControls( camera, renderer.domElement );
  controls.addEventListener( 'change', render );
  controls.minZoom = 0.1;
  controls.maxZoom = 10;
  controls.enablePan = false;
  controls.update();
  // Vehicle

  // Cone Vehicle
  const vehicleGeometry = new THREE.ConeGeometry(0.1, 0.5, 8);
  vehicleGeometry.rotateX(Math.PI * 0.5);

  const vehicleMaterial = new THREE.MeshNormalMaterial();
  const vehicleMesh = new THREE.Mesh(vehicleGeometry, vehicleMaterial);
  vehicleMesh.matrixAutoUpdate = false;
  // scene.add(vehicleMesh);

  var planeGeo1 = new THREE.PlaneGeometry(2, 2);
  var planeMat1 = new THREE.MeshBasicMaterial({ map: createDataTexture(x_dim, y_dim), side: THREE.DoubleSide});
  // var planeMat1 = new THREE.MeshBasicMaterial({ map: createDataTexture(x_dim, y_dim), side: THREE.DoubleSide});
  debugPlaneMesh = new THREE.Mesh(planeGeo1, planeMat1);
  debugPlaneMesh .position.set( -2, 0, -1 );
  scene.add(debugPlaneMesh);

  // Volume Vehicle
  const volumeGeometry = new THREE.BoxGeometry( x_scale, y_scale, z_scale);
  clock = new THREE.Clock();

  // Test curve
  const curve = new THREE.CatmullRomCurve3( [
    new THREE.Vector3( 0, -0.0, -0.5 ),
    new THREE.Vector3(0, 0.0,  -0.2 ),
    new THREE.Vector3( 0, 0.0 , 0),
    new THREE.Vector3( 0, 0.0, 0.2 ),
    new THREE.Vector3( 0, -0.0, 0.5 )
  ] );

  const points = curve.getPoints( 20 );
  const numPoints = 5;
  const cPoints = curve.getSpacedPoints(numPoints);
  const  cObjects = curve.computeFrenetFrames(numPoints, true);

  const curve_data: CurveData =  {
    positions : cPoints,
    tangents :cObjects.normals,
    normals : cObjects.normals,
    binormals : cObjects.binormals,
    numPoints : numPoints
  }

  const geometry = new THREE.BufferGeometry().setFromPoints( points );
  const material = new THREE.LineBasicMaterial( { color: 0xff0000 } );

  // Create the final object to add to the scene
  const splineObject = new THREE.Line( geometry, material );
  splineObject.matrixAutoUpdate = false;
  scene.add(splineObject);

  const volumeUniforms =  {
    'volume_scale': { value: new THREE.Vector3( x_scale, y_scale, z_scale ) },
    'volume': { value: create3dDataTexture(x_dim, y_dim, z_dim) },
    'volume_dims': { value: new THREE.Vector3( x_dim, y_dim, z_dim) },
    'aabb_min': { value: new THREE.Vector3()},
    'aabb_max': { value: new THREE.Vector3()},
    'dt_scale': { value: 0.1},
    'spectrum': { value: createDataTexture(x_dim, y_dim) },
    'curve_data': { value: createCurveDataTexture(curve_data) },
    'time': {value: clock.getElapsedTime()}
  };

  const volumeMaterial = new THREE.ShaderMaterial({
    uniforms: volumeUniforms,
    vertexShader: raycastVertexShader,
    fragmentShader: raycastFragmentShader,
    side: THREE.DoubleSide,
    transparent: true
  });

  volumeMesh = new THREE.Mesh( volumeGeometry, volumeMaterial);
  volumeMesh.matrixAutoUpdate = false;
  volumeMesh.geometry.computeBoundingBox();
  // We use the Non-null Assertion Operator (Postfix!) syntax for removing null 
  // and undefined from a type without doing any explicit checking.
  (volumeMesh.material as THREE.ShaderMaterial).uniforms['aabb_min']['value'] = volumeMesh!.geometry!.boundingBox!.min;
  (volumeMesh.material as THREE.ShaderMaterial).uniforms['aabb_max']['value'] = volumeMesh!.geometry!.boundingBox!.max;
  scene.add(volumeMesh);

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
  render();
  document.addEventListener( 'pointermove', onPointerMove );
  window.addEventListener( 'resize', onWindowResize );  

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

  renderer.setSize( window.innerWidth, window.innerHeight );

  render();

}

function onPointerMove(event: any) {

  pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
  pointer.y = - (event.clientY / window.innerHeight) * 2 + 1;

}

function addHelpers (scene: THREE.Scene) {
  const gridHelper = new THREE.GridHelper( 10, 10);
  scene.add( gridHelper );
  stats = Stats();
  document.body.appendChild(stats.dom)
  const axesHelper = new THREE.AxesHelper( 3 );
  scene.add( axesHelper );
}

function updateUniforms(){
  (volumeMesh.material as THREE.ShaderMaterial).uniforms['time']['value'] = clock.getElapsedTime();

}
function animate(){
  // renderer.setAnimationLoop(render);
  updateUniforms();
  stats.update();
  requestAnimationFrame(animate);
  render();

}

// Creates 3D texture with RGB gradient along the XYZ axes
function create3dDataTexture(width: number, height: number, depth: number) {
	const d = new Uint8Array( width * height * depth * 4 );
	let i4 = 0;

	for ( let z = 0; z < depth; z ++ ) {
		for ( let y = 0; y < height; y ++ ) {
			for ( let x = 0; x < width; x ++ ) {
 				d[i4 + 0] = (x / width) * 255;
				d[i4 + 1] = (y / height) * 255;
				d[i4 + 2] = (z / depth) * 255; 
        // debug: looking at texture from side should give accumulated alpha of 1
        d[i4 + 3] = 255;
				i4 += 4;
			}
		}
	}
	const texture = new THREE.Data3DTexture( d, width, height, depth );
	texture.format = THREE.RGBAFormat;
  //texture.type = THREE.FloatType;
	// texture.minFilter = THREE.NearestFilter;
	// texture.magFilter = THREE.NearestFilter;
	texture.unpackAlignment = 1;
	texture.needsUpdate = true;

	return texture;
}
function createDataTexture(width: number, height: number) {

	const d = new Uint8Array( width * height * 4 );
	let i4 = 0;

  for ( let y = 0; y < height; y ++ ) {
    for ( let x = 0; x < width; x ++ ) {
      d[i4 + 0] = (x / width) * 255;
      d[i4 + 1] = (y / height) * 255;
      d[i4 + 2] = 0;
      d[i4 + 3] = 255.0;
      i4 += 4;
    }
	}
	const texture = new THREE.DataTexture( d, width, height );
	texture.format = THREE.RGBAFormat;
  //texture.type = THREE.FloatType;
	texture.minFilter = THREE.NearestFilter;
	texture.magFilter = THREE.NearestFilter;
	texture.unpackAlignment = 1;
	texture.needsUpdate = true;

	return texture;
}
function createSpecDataTexture(data: Float32Array[], width: number, height: number) {

	const d = new Float32Array( width * height * 4 );
	let i4 = 0;

  for ( let y = 0; y < height; y ++ ) {
    for ( let x = 0; x < width; x ++ ) {
      d[i4 + 0] = data[x][y];
      d[i4 + 1] = 0;
      d[i4 + 2] = 0;
      d[i4 + 3] = 0;
      i4 += 4;
    }
	}
  
  const d_max = Math.max.apply(null, d);
  const d_min = Math.min.apply(null, d);
  // normalize array
  i4 = 0;
  while(i4 < width * height * 4 ){
    d[i4] = (d[i4] - d_min) / (d_max - d_min);
    i4 +=4;
  }
	const texture = new THREE.DataTexture( d, width, height );
	texture.format = THREE.RGBAFormat;
  texture.type = THREE.FloatType;
	texture.minFilter = THREE.NearestFilter;
	texture.magFilter = THREE.NearestFilter;
	texture.unpackAlignment = 1;
	texture.needsUpdate = true;

	return texture;
}
function createCurveDataTexture(data: CurveData){
	const d = new Float32Array( data.numPoints *  4 * 4 );
	let i4 = 0;
  const pt_data = [data.positions, data.tangents, data.normals, data.binormals];
  for ( let j = 0; j < 4; j ++ ) {
    for ( let k = 0; k < data.numPoints; k ++ ) {
      d[i4 + 0] = pt_data[j][k].x;
      d[i4 + 1] = pt_data[j][k].y;
      d[i4 + 2] = pt_data[j][k].z;
      d[i4 + 3] = 1.0;
      i4 += 4;
    }
  }
  const texture = new THREE.DataTexture( d, data.numPoints, 1 );
  texture.type = THREE.FloatType;
  texture.format = THREE.RGBAFormat;
  texture.minFilter = THREE.NearestFilter;
	texture.magFilter = THREE.NearestFilter;
	texture.unpackAlignment = 1;
	texture.needsUpdate = true;
  console.log(texture.image);
  return texture
}

function setMeshTexture(mesh: THREE.Mesh, texture: THREE.DataTexture){
  (mesh.material as THREE.MeshStandardMaterial).map = texture;
  (volumeMesh.material as THREE.ShaderMaterial).uniforms['spectrum']['value'] = texture;
}
function render() {
  renderer.render(scene, camera);
}

