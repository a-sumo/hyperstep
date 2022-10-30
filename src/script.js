
import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import Stats from 'three/examples/jsm/libs/stats.module';
import WebGL from 'three/examples/jsm/capabilities/WebGL.js';
import {loadAudioFromFile, resampleAndMakeMono, melSpectrogram, powerToDb} from '@magenta/music/esm/core/audio_utils';
import { Texture, Vector3 } from 'three';
import { GUI } from 'dat.gui/build/dat.gui.min.js';

if ( WebGL.isWebGL2Available() === false ) {

  document.body.appendChild( WebGL.getWebGL2ErrorMessage() );

}

let camera, 
  scene, 
  renderer, 
  controls, 
  stats,
  raycaster

let planeMesh,
  debugPlaneMesh,
  volumeMesh,
  pointer,
  clock,
  curveMesh,
  curve_data

let analyser

let AudioContext;
// global var for web audio API AudioContext
let audioCtx;
let bufferSize = 1024;
let hopSize = 512;
let melNumBands = 96;

try {
    AudioContext = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContext();
} catch (e) {
    throw "Could not instantiate AudioContext: " + e.message;
}
// global var getUserMedia mic stream
let gumStream;
// global audio node variables
let gain;

// Volume constants
const x_dim = 4;
const y_dim = 4;
const z_dim = 4;
const x_scale = 1;
const y_scale = 1;
const z_scale = 1;

// Magenta Music  spectrogram constants
const SAMPLE_RATE = 16000;
const MEL_SPEC_BINS = 229;
const SPEC_HOP_LENGTH = 512;

// Live Audio spectrogram constants
const FFT_SIZE = 2048;
const NUM_FRAMES = 100;
const MIN_DB = -80;
const MAX_DB = -10;

// Curve constants
const NUM_CURVE_POINTS = 5;

// gui parameters
const params = {
  playback_progress: 1.0,
  distance_func_type: 0,
  distance_func_scale: 1.0,
};
// Set up UI Elements 
const fileInput = document.getElementById('loadFileInput');
const recordButton = document.getElementById('recordButton');

// Set up event listeners

addEventListener('change', () => loadFile(fileInput, 'loadFileBtn'));
// Load audio file, generate mel spectrogram 
// and return the spectrogram's data texture
function loadFile(inputElement, prefix) {
  //document.getElementById(`${prefix}_fileBtn`).setAttribute('disabled', '');
  const audioBuffer = loadAudioFromFile(inputElement.files[0]);
  return audioBuffer
  .then(
    (buffer) => {return preprocessAudio(buffer)})
  .then(
    (melSpec) => {
      return createMMSpectrumDataTexture(melSpec, melSpec.length, MEL_SPEC_BINS)
      } 
  )
  .then(
    (dataTexture) => {return setMeshTexture(dataTexture)}
  );
}

// Compute mel spectrogram
async function preprocessAudio(audioBuffer) {
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
uniform float playback_progress;
uniform int df_type;
uniform float df_scale;
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
    // whose UV.v coordinate is 0.75
    vec2 v_norm = vec2(u, 0.75);
    vec3 dir_vec = p - texture(curve_data, v_pos).rgb ;

    min_dist = min(min_dist, length(dir_vec));
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
    float dist = 0.0;
    vec4 spec_val = texture(spectrum, vec2(0.0, 0.0));
    spec_val.rgba = vec4(0.0);
    float u_coords = 0.0;
    float v_coords = 0.0;
    if(df_type == 0){
      // tube
      dist = length(p.xy) - 0.01;
      // sample spectrogram
      u_coords = p.z + playback_progress - 0.5;
      v_coords = df_scale * 0.03 / dist;
    }
    else if(df_type == 1){
      // sphere
      dist = clamp(length(p), 0.0, 1.0);
      u_coords = playback_progress;
      v_coords = df_scale * 0.03 / dist;
    }
    else if(df_type == 2){
      // curve
      dist = distCurve(p);
      u_coords = p.z + playback_progress - 0.5;
      v_coords = df_scale * 0.03 / dist;
    }
    spec_val = texture(spectrum, vec2(u_coords, v_coords));

    // If UV coordinates fit the range [0, 1] x [0, 1] then 
    // sample the texture, otherwise set value to zero.
    if (u_coords < 0. || u_coords > 1. || 
      v_coords < 0. || v_coords > 1.){
      spec_val = vec4(0.0);
    }
    vec4 val_color = vec4(pow(spec_val.r,10.0) * 1.0/dist ,pow(spec_val.r, 2.0), 1.0/dist  * pow(spec_val.r,0.0),spec_val.r);
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
  //gl_FragColor = vec4(texture(spectrum,vec2(0.0,0.0)).rgb * 255.0, 1.0);

}
`;

// Main body
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
  
  // GUI
  const gui = new GUI(); 
  gui.add( params, 'playback_progress', 0, 1).step(0.001).name( 'playback progress' ).onChange( function ( value ) {
    (volumeMesh.material).uniforms['playback_progress']['value'] = value;
  } );
  const df_folder = gui.addFolder('distance function') 
  df_folder.add( params, 'distance_func_type', { Tube: 0, Sphere: 1}).name( 'type' ).onChange( function ( value ) {
    (volumeMesh.material).uniforms['df_type']['value'] = value;
  } );
  df_folder.add( params, 'distance_func_scale', 0, 5).step(0.05).name( 'scale' ).onChange( function ( value ) {
    (volumeMesh.material).uniforms['df_scale']['value'] = value;
  } );
  // Debug spectrogram texture
  let planeGeo1 = new THREE.PlaneGeometry(2, 2);
  let planeMat1 = new THREE.MeshBasicMaterial({ map: createDataTexture(x_dim, y_dim), side: THREE.DoubleSide});
  debugPlaneMesh = new THREE.Mesh(planeGeo1, planeMat1);
  debugPlaneMesh .position.set( -2, 0, -1 );
  scene.add(debugPlaneMesh);

  // Volume 
  const volumeGeometry = new THREE.BoxGeometry( x_scale, y_scale, z_scale);
  clock = new THREE.Clock();

  const curve = initCurveData(NUM_CURVE_POINTS);
  const points = curve.getPoints( 5 );
  const geometry = new THREE.BufferGeometry().setFromPoints( points );
  const material = new THREE.LineBasicMaterial( { color: 0xff0000 } );

  // Create curveMesh to add to the scene
  curveMesh = new THREE.Line( geometry, material );
  curveMesh.matrixAutoUpdate = false;
  scene.add(curveMesh);

  const volumeUniforms =  {
    'volume_scale': { value: new THREE.Vector3( x_scale, y_scale, z_scale ) },
    'volume': { value: create3dDataTexture(x_dim, y_dim, z_dim) },
    'volume_dims': { value: new THREE.Vector3( x_dim, y_dim, z_dim) },
    'aabb_min': { value: new THREE.Vector3()},
    'aabb_max': { value: new THREE.Vector3()},
    'dt_scale': { value: 0.1},
    'spectrum': { value: createDataTexture(NUM_FRAMES, FFT_SIZE / 2) },
    'curve_data': { value: createCurveDataTexture(curve_data) },
    'time': {value: clock.getElapsedTime()},
    'playback_progress': {value: 0.0},
    'df_type':{value: 0},
    'df_scale': {value: 1.0}
  };

  const volumeMaterial = new THREE.ShaderMaterial({
    uniforms: volumeUniforms,
    vertexShader: raycastVertexShader,
    fragmentShader: raycastFragmentShader,
    side: THREE.DoubleSide,
    transparent: true
  });

  volumeMesh = new THREE.Mesh( volumeGeometry, volumeMaterial);
  volumeMesh.matrixAutoUpdate = true;
  volumeMesh.geometry.computeBoundingBox();

  (volumeMesh.material).uniforms['aabb_min']['value'] = volumeMesh.geometry.boundingBox.min;
  (volumeMesh.material).uniforms['aabb_max']['value'] = volumeMesh.geometry.boundingBox.max;
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
  // recordButton.addEventListener('click', onRecordClickHandler);
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

function onPointerMove(event) {

  pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
  pointer.y = - (event.clientY / window.innerHeight) * 2 + 1;

}

function addHelpers (scene) {
  const gridHelper = new THREE.GridHelper( 10, 10);
  // scene.add( gridHelper );
  stats = Stats();
  document.body.appendChild(stats.dom)
  const axesHelper = new THREE.AxesHelper( 1 );
  // scene.add( axesHelper );
}

function updateUniforms(){
  (volumeMesh.material).uniforms['time']['value'] = clock.getElapsedTime();
  (volumeMesh.material).uniforms['curve_data']['value'] =  updateCurveData(curveMesh, NUM_CURVE_POINTS);
}
function animate(){
  requestAnimationFrame(animate);
  updateUniforms();
  stats.update();
  //displayLiveSpectrum();
  render();
}

// Creates 3D texture with RGB gradient along the XYZ axes
function create3dDataTexture(width, height, depth) {
	const d = new Uint8Array( width * height * depth * 4 );
	let stride = 0;

	for ( let z = 0; z < depth; z ++ ) {
		for ( let y = 0; y < height; y ++ ) {
			for ( let x = 0; x < width; x ++ ) {
 				d[stride + 0] = (x / width) * 255;
				d[stride + 1] = (y / height) * 255;
				d[stride + 2] = (z / depth) * 255; 
        // debug: looking at texture from side should give accumulated alpha of 1
        d[stride + 3] = 255;
				stride += 4;
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
function createDataTexture(width, height) {

	const d = new Float32Array( width * height * 4 );

	let stride = 0;
  for ( let y = 0; y < height; y ++ ) {
    for ( let x = 0; x < width; x ++ ) {
      d[stride + 0] = 0;
      d[stride + 1] = 0;
      d[stride + 2] = 0;
      d[stride + 3] = 1;
      stride += 4;
    }
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
function createMMSpectrumDataTexture(data, width, height) {
	const d = new Float32Array( width * height * 4 );
	let stride = 0;
  for ( let y = 0; y < height; y ++ ) {
    for ( let x = 0; x < width; x ++ ) {
      d[stride + 0] = data[x][y];
      d[stride + 1] = 0;
      d[stride + 2] = 0;
      d[stride + 3] = 0;
      stride += 4;
    }
	}
  var max = -Infinity; 
  var min = Infinity; 
  for(var i = 0; i < d.length; i++ ) if (d[i] > max) max = d[i];
  for(var i = 0; i < d.length; i++ ) if (d[i] < min) min = d[i];

  // normalize array 
  stride = 0;
  while(stride < width * height * 4 ){
    d[stride] = (d[stride] - min) / (max - min);
    stride +=4;
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
function createSpectrumDataTexture(width, height) {
  let data = [];
  for (let x = 0; x < width; x++){
    data.push(new Float32Array(height));
  }
  return data;
}

function updateSpectrumData(texture, new_data) {
  const width = NUM_FRAMES;
  const height = FFT_SIZE / 2;
  const data = texture.image.data;
  let stride = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x < width - 10) {
        // see https://webaudio.github.io/web-audio-api/#dom-analysernode-getbytefrequencydata
        data[stride] = new_data[y] ;
      } else {
        data[stride] = data[stride + 4] ;
      }
      //data[stride] = Math.abs(Math.sin(clock.getElapsedTime()));
      data[stride + 1] = 0;
      data[stride + 2] = 0;
      data[stride + 3] = 1;
      stride += 4;
    }
  }
  // const d_max = Math.max.apply(null, data);
  // const d_min = Math.min.apply(null, data);
  // // normalize array 
  // stride = 0;
  // while(stride < width * height * 4 ){
  //   data[stride] = (data[stride] - d_min) / (d_max - d_min);
  //   stride +=4;
  // }
  // console.log(d_max);
}
function createCurveDataTexture(data){
	const d = new Float32Array( data.numPoints *  4 * 4 );
	let stride = 0;
  const pt_data = [data.positions, data.tangents, data.normals, data.binormals];
  for ( let j = 0; j < 4; j ++ ) {
    for ( let k = 0; k < data.numPoints; k ++ ) {
      d[stride + 0] = pt_data[j][k].x;
      d[stride + 1] = pt_data[j][k].y;
      d[stride + 2] = pt_data[j][k].z;
      d[stride + 3] = 1.0;
      stride += 4; 
    }
  }
  const texture = new THREE.DataTexture( d, data.numPoints, 1 );
  texture.type = THREE.FloatType;
  texture.format = THREE.RGBAFormat;
  texture.minFilter = THREE.NearestFilter;
	texture.magFilter = THREE.NearestFilter;
	texture.unpackAlignment = 1;
	texture.needsUpdate = true;
  return texture
}

function initCurveData(num_points){

  const curve = new THREE.CatmullRomCurve3( [
    new THREE.Vector3( 0, 0.0, -0.5 ),
    new THREE.Vector3(0, 0.0,  -0.25 ),
    new THREE.Vector3( 0, 0.0 , 0),
    new THREE.Vector3( 0, 0.0, 0.25 ),
    new THREE.Vector3( 0, 0.0, 0.5 )
  ] );
  const cPoints = curve.getSpacedPoints(num_points);
  const  cObjects = curve.computeFrenetFrames(num_points, true);

  curve_data =  {
    positions : cPoints,
    tangents :cObjects.tangents,
    normals : cObjects.normals,
    binormals : cObjects.binormals,
    numPoints : num_points
  }
  return curve;
}

function updateCurveData(curve_mesh, num_points){

  const geo_array = curve_mesh.geometry.attributes.position.array;

  // rebuild the curve
  const positions = Array(num_points);
  let i3 = 0;
	for (let i = 0; i < num_points ; i ++ ) {
    if(i == num_points - 1){
      positions[i] = new THREE.Vector3(
        geo_array[i3 + 0],
        geo_array[i3 + 1] + Math.abs(Math.sin(clock.getElapsedTime())),
        geo_array[i3 + 2]);
    }
    else{
      positions[i] = new THREE.Vector3(
        geo_array[i3 + 0],
        geo_array[i3 + 1],
        geo_array[i3 + 2]);   
    }
    i3 += 3;
  }

  const curve = new THREE.CatmullRomCurve3(positions); 
  const cPoints = curve.getSpacedPoints(num_points);
  const  cObjects = curve.computeFrenetFrames(num_points, true);

  // update curve_data interface
  curve_data =  {
    positions : cPoints,
    tangents :cObjects.tangents,
    normals : cObjects.normals,
    binormals : cObjects.binormals,
    numPoints : num_points
  }

  return createCurveDataTexture(curve_data);
}
function setMeshTexture(texture){
  (debugPlaneMesh.material).map = texture;
  (debugPlaneMesh.material).dispose();
  (volumeMesh.material).uniforms['spectrum']['value'] = texture;
  (volumeMesh.material).dispose();
}
function render() {
  renderer.render(scene, camera);
}
// function onAudioMute(muteBtn: HTMLElement, gainNode: GainNode) {
//   if (muteBtn.id == "") {
//     gainNode.gain.value = 0;
//     muteBtn.id = "activated";
//     muteBtn.innerHTML = "Unmute";
//   } else {
//     gainNode.gain.value = 1;
//     muteBtn.id = "";
//     muteBtn.innerHTML = "Mute";
//   }
// }

function displayLiveSpectrum() {
  analyser.fftSize = FFT_SIZE;
  let bufferLength = analyser.frequencyBinCount;
  let newFFTData = new Uint8Array(bufferLength);
  analyser.getByteFrequencyData(newFFTData); 
  const texture = (volumeMesh.material).uniforms['spectrum']['value'];
  updateSpectrumData(texture, Float32Array.from(newFFTData));
  texture.needsUpdate = true;
  if (clock.getElapsedTime() < 0.1){
    console.log((volumeMesh.material).uniforms['spectrum']['value']);
    console.log((volumeMesh.material).uniforms['spectrum']['value'].format);
  }
}

// From a series of URL to js files, get an object URL that can be loaded in an
// AudioWorklet. This is useful to be able to use multiple files (utils, data
// structure, main DSP, etc.) without either using static imports, eval, manual
// concatenation with or without a build step, etc.
function URLFromFiles(files) {
  const promises = files
      .map((file) => fetch(file)
          .then((response) => response.text()));
  return Promise
      .all(promises)
      .then((texts) => {
          texts.unshift("var exports = {};"); // hack to make injected umd modules work
          const text = texts.join('');
          const blob = new Blob([text], {type: "application/javascript"});

          return URL.createObjectURL(blob);
      });
}

// Utils:
function arraySum(total, num) {
    return total + num;
}


function onRecordClickHandler() {
    let recording = recordButton.classList.contains("recording");
      if (!recording) {
        recordButton.setAttribute("disabled", true);
        // start microphone stream using getUserMedia and runs the feature extraction
        startMicRecordStream();
      } else {
        stopMicRecordStream();
      }
}

// record native microphone input and do further audio processing on each audio buffer using the given callback functions
function startMicRecordStream() {
    if (navigator.mediaDevices.getUserMedia) {
        console.log("Initializing audio...");
        navigator.mediaDevices.getUserMedia({ audio: true, video: false })
        .then(startAudioProcessing)
        .catch(function(message) {
                throw "Could not access microphone - " + message;
        });
    } else {
        throw "Could not access microphone - getUserMedia not available";
    }
}

function startAudioProcessing(stream) {
    gumStream = stream;
    if (gumStream.active) {
        // In most platforms where the sample rate is 44.1 kHz or 48 kHz,
        // and the default bufferSize will be 4096, giving 10-12 updates/sec.
        if (audioCtx.state == "closed") {
            audioCtx = new AudioContext();
        }
        else if (audioCtx.state == "suspended") {
            audioCtx.resume();
        }
        console.log('Started processing');
        mic = audioCtx.createMediaStreamSource(gumStream);
        gain = audioCtx.createGain();
        gain.gain.setValueAtTime(0, audioCtx.currentTime);
        // set button to stop
        recordButton.classList.add("recording");
        recordButton.innerHTML = "STOP";
        recordButton.setAttribute("disabled", false);
    } else {
        throw "Mic stream not active";
    }
}

function setValue() {
  data.innerHTML = text.message;
  data.style.color = text.color;
  data.style.fontSize = text.fontSize+"px";
  data.style.fontFamily = text.fontFamily;
  if(text.border) {
    data.style.border = "solid 1px black";
    data.style.padding = "10px";
  }
  else {
    data.style.border = "none";
    data.style.padding = "0px";
  }
}


