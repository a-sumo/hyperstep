import '../style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import Stats from 'three/examples/jsm/libs/stats.module';
import { GUI } from 'dat.gui/build/dat.gui.min.js';
import audioFile1 from "../assets/audio/r2d2_talk.mp3";
import audioFile2 from "../assets/audio/synth_melody.mp3";
import audioFile3 from "../assets/audio/theremin_tone.mp3";
import noisyBackground from "../assets/images/noisy_background.jpg";
import { raycastVertexShader, raycastFragmentShader} from './shaders.js';

const audioFiles = {
  "audio-1" : audioFile1,
  "audio-2" : audioFile2,
  "audio-3" : audioFile3,
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
  specTexture,
  clock,
  curveMesh,
  curve_data

let AudioContext;
// global var for web audio API AudioContext
let audioCtx;
let bufferSize = 1024;
let hopSize = 512;
let melNumBands = 96;
let numFrames = 1;
let exports = {};
exports = require('../utils/ringbuf.js/index.js')
let scaledMelspectrum = [];
let recording,running

const gui = new GUI( {width: 200 } );
// gui parameters

const params = {
  df_type: 0,dist_func_tube: 1.0, dist_func_box: 1.0, dist_func_plane: 1.0, df_sphere_tube : 0.0,
  df_sphere_box: 0.0, df_sphere_plane: 0.0, df_tube_box: 0.0, df_tube_plane: 0.0, df_plane_box: 0.0,
  scale_x: 1, scale_y: 1, scale_z: 1,
  global_scale: 0.03,  min_dist:0, max_dist:1,
  rot_x: 0, rot_y: 0, rot_z: 0,
  translation_x: 0, translation_y: 0, translation_z: 0,
  playback_rate: 1.0,
  color_mode: 0, color_preset_type: 0, color_space: 0, uni_color: "#9838ff",
  color_1: "#000000", color_2: "#ffffff",
  mel_spec_bins: melNumBands,
  num_frames: numFrames,
  fft_size: bufferSize,
  dt_scale: 0.1,
  max_steps: 100,
};

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
      const blob = new Blob([text], { type: "text/javascript" });

      return URL.createObjectURL(blob);
    });
}

try {
  AudioContext = window.AudioContext || window.webkitAudioContext;
  audioCtx = new AudioContext();
} catch (e) {
  throw "Could not instantiate AudioContext: " + e.message;
}
// global var getUserMedia mic stream
let gumStream;
// global audio node variables
let source, mic;

let gain;
let melspectrogramNode;

// Shared data with AudioWorkletGlobalScope
let audioReader;

// Curve constants
const NUM_CURVE_POINTS = 5;

// Volume constants
const x_dim = 4;
const y_dim = 4;
const z_dim = 4;
const x_scale = 1;
const y_scale = 1;
const z_scale = 1;

// Setup audio

// Some browsers partially implement mediaDevices. We can't assign an object
// with getUserMedia as it would overwrite existing properties.
// Add the getUserMedia property if it's missing.
let navigatorCopy = navigator;
if (navigatorCopy.mediaDevices === undefined) {
  navigatorCopy.mediaDevices = {};
}
// Set up UI Elements
const fileInput = document.getElementById('loadFileInput');
const recordButton = document.getElementById('recordButton');
const player = document.getElementById("audioPlayer");
player.src = audioFiles['audio-1'];
player.load();

const blob = window.URL || window.webkitURL;
const buttonGroup = document.getElementById("button-group");

function onLoadFile(inputElement){
  player.src = blob.createObjectURL(inputElement.files[0]);
  player.load();
}


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
  camera.position.set( -2, 1, 2 );
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
  let planeMat1 = new THREE.MeshBasicMaterial({ map: createDataTexture(x_dim, y_dim), side: THREE.DoubleSide});
  debugPlaneMesh = new THREE.Mesh(planeGeo1, planeMat1);
  debugPlaneMesh .position.set( -2, 0, -1 );
  // scene.add(debugPlaneMesh);

  specTexture = createDataTexture(numFrames, melNumBands);

  // Curve
  const curve = initCurveData(NUM_CURVE_POINTS);
  const points = curve.getPoints(5);
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({ color: 0xff0000 });

  // Create curveMesh to add to the scene
  curveMesh = new THREE.Line(geometry, material);
  curveMesh.matrixAutoUpdate = false;
  //scene.add(curveMesh);

  // Volume 
  const volumeGeometry = new THREE.BoxGeometry( x_scale, y_scale, z_scale);

  const volumeUniforms =  {
    'volume_scale': { value: new THREE.Vector3( x_scale, y_scale, z_scale ) },
    'volume': { value: create3dDataTexture(x_dim, y_dim, z_dim) },
    'volume_dims': { value: new THREE.Vector3( x_dim, y_dim, z_dim) },
    'min_dist': { value: params.min_dist},
    'max_dist': { value: params.max_dist},
    'color_mode': { value: params.color_mode},
    'color_preset_type': { value: params.color_preset_type},
    'color_space': {value: params.color_space},
    'uni_color': { value: new THREE.Color(params.uni_color) },
    'color_1': { value: new THREE.Color(params.color_1) },
    'color_2': { value: new THREE.Color(params.color_2)},
    'aabb_min': { value: new THREE.Vector3()},
    'aabb_max': { value: new THREE.Vector3()},
    'dt_scale': { value: params.dt_scale},
    'max_steps': { value: params.max_steps},
    'spectrum': { value: createDataTexture(x_dim, y_dim) },
    'noise_texture': { value: new THREE.TextureLoader().load(noisyBackground) },
    'curve_data': { value: createCurveDataTexture(curve_data) },
    'time': {value: clock.getElapsedTime()},
    'playback_progress': {value: 0.0},
    'df_sphere_tube': {value: params.df_sphere_tube},
    'df_sphere_box': {value: params.df_sphere_box},
    'df_sphere_plane': {value: params.df_sphere_plane},
    'df_tube_box': {value: params.df_tube_box},
    'df_tube_plane': {value: params.df_tube_plane},
    'df_plane_box': {value: params.df_plane_box},
    'playback_rate': {value: 1.0},
    'df_translation': {value: new THREE.Vector3(params.translation_x,params.translation_y,params.translation_z)},
    'df_rot': {value: new THREE.Vector3(params.rot_x,params.rot_y,params.rot_z)},
    'df_scale': {value: new THREE.Vector3(params.scale_x,params.scale_y,params.scale_z)},
    'global_scale': {value: params.global_scale},
    'df_type':{value: 0}
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
  const planeMat = new THREE.MeshBasicMaterial({ visible: false });
  planeMesh = new THREE.Mesh(planeGeo, planeMat);
  planeMesh.rotation.x = -0.5 * Math.PI;
  // scene.add(planeMesh);
  // planeMesh.name = 'plane';

  raycaster = new THREE.Raycaster();

  // Add helpers
  //addHelpers(scene);
  render();
  document.addEventListener('pointermove', onPointerMove);
  window.addEventListener('resize', onWindowResize);
  recordButton.addEventListener('click', onRecordClickHandler);
  player.addEventListener('play', startAudioProcessingMediaElt);
  player.addEventListener('pause', stopAudioProcessingMediaElt);
  
  fileInput.addEventListener('change', () => {onLoadFile(fileInput)});
  buttonGroup.addEventListener("click", (e) => { 
    const isButton = e.target.nodeName === 'BUTTON';
    if(!isButton) {
      return
    }
    player.src = audioFiles[e.target.id];
    player.load();
  });
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

function updateUniforms(){
  (volumeMesh.material).uniforms['time']['value'] = clock.getElapsedTime();
  (volumeMesh.material).uniforms['curve_data']['value'] =  updateCurveData(curveMesh, NUM_CURVE_POINTS);
  (volumeMesh.material).uniforms['playback_progress']['value'] = (player.currentTime) / player.duration;
}
function animate() {
  requestAnimationFrame(animate);
  updateMeshTexture();
  updateUniforms();
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

function updateSpectrumData(texture, new_data) {
  const width = numFrames;
  const height = melNumBands;
  const data = texture.image.data;
  let stride = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x < width - 1) {
        // shift the index by 4 to get R,G,B or A value of the subsequent column
        data[stride] = data[stride + 4];
      } else {
        // set red value of texture
        data[stride] = new_data[y];
      }
      data[stride + 1] = 0;
      data[stride + 2] = 0;
      data[stride + 3] = 1;
      stride += 4;
    }
  }
  const new_texture = new THREE.DataTexture(data, width, height);
  new_texture.format = THREE.RGBAFormat;
  // Enable linear filtering for smoother texture interpolation
  new_texture.minFilter = THREE.LinearFilter;
  new_texture.magFilter = THREE.LinearFilter;
  // Optionally, enable anisotropic filtering for improved quality at oblique angles
  new_texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  
  new_texture.unpackAlignment = 1;
  new_texture.needsUpdate = true; 
  setMeshTexture(new_texture);
  new_texture.dispose();

}
function createCurveDataTexture(data) {
  const d = new Float32Array(data.numPoints * 4 * 4);
  let stride = 0;
  const pt_data = [data.positions, data.tangents, data.normals, data.binormals];
  for (let j = 0; j < 4; j++) {
    for (let k = 0; k < data.numPoints; k++) {
      d[stride + 0] = pt_data[j][k].x;
      d[stride + 1] = pt_data[j][k].y;
      d[stride + 2] = pt_data[j][k].z;
      d[stride + 3] = 1.0;
      stride += 4;
    }
  }
  const texture = new THREE.DataTexture(d, data.numPoints, 1);
  texture.type = THREE.FloatType;
  texture.format = THREE.RGBAFormat;
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  return texture
}

function initCurveData(num_points) {

  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.0, -0.5),
    new THREE.Vector3(0, 0.0, -0.25),
    new THREE.Vector3(0, 0.0, 0),
    new THREE.Vector3(0, 0.0, 0.25),
    new THREE.Vector3(0, 0.0, 0.5)
  ]);
  const cPoints = curve.getSpacedPoints(num_points);
  const cObjects = curve.computeFrenetFrames(num_points, true);

  curve_data = {
    positions: cPoints,
    tangents: cObjects.tangents,
    normals: cObjects.normals,
    binormals: cObjects.binormals,
    numPoints: num_points
  }
  return curve;
}

function updateCurveData(curve_mesh, num_points) {

  const geo_array = curve_mesh.geometry.attributes.position.array;

  // rebuild the curve
  const positions = Array(num_points);
  let i3 = 0;
  for (let i = 0; i < num_points; i++) {
    if (i == num_points - 1) {
      positions[i] = new THREE.Vector3(
        geo_array[i3 + 0],
        geo_array[i3 + 1] + Math.abs(Math.sin(clock.getElapsedTime())),
        geo_array[i3 + 2]);
    }
    else {
      positions[i] = new THREE.Vector3(
        geo_array[i3 + 0],
        geo_array[i3 + 1],
        geo_array[i3 + 2]);
    }
    i3 += 3;
  }

  const curve = new THREE.CatmullRomCurve3(positions);
  const cPoints = curve.getSpacedPoints(num_points);
  const cObjects = curve.computeFrenetFrames(num_points, true);

  // update curve_data interface
  curve_data = {
    positions: cPoints,
    tangents: cObjects.tangents,
    normals: cObjects.normals,
    binormals: cObjects.binormals,
    numPoints: num_points
  }

  return createCurveDataTexture(curve_data);
}
function setMeshTexture(texture) {
  (debugPlaneMesh.material).map = texture;
  (volumeMesh.material).uniforms['spectrum']['value'] = texture;
  texture.dispose();
}


function onRecordClickHandler() {
  recording = recordButton.classList.contains("recording");
  if (recording) {
    recordButton.classList.remove("recording");
    recordButton.innerHTML = "Record";
    recordButton.classList.remove("bg-emerald-200");
    recordButton.disabled = false;
    stopMicRecordStream();
  } else {

    recordButton.disabled = true;
    // start microphone stream using getUserMedia and run feature extraction
    startMicRecordStream();
  }
}

// record native microphone input and do further audio processing on each audio buffer using the given callback functions
function startMicRecordStream() {
  if (navigator.mediaDevices.getUserMedia) {
    console.log("Initializing audio...");
    navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      .then(startAudioProcessingStream)
      .catch(function (message) {
        throw "Could not access microphone - " + message;
      });
  } else {
    throw "Could not access microphone - getUserMedia not available";
  }
}

function startAudioProcessingStream(stream) {
  gumStream = stream;
  if (gumStream.active) {
    if (audioCtx.state == "closed") {
      audioCtx = new AudioContext();
    }
    else if (audioCtx.state == "suspended") {
      audioCtx.resume();
    }

    mic = audioCtx.createMediaStreamSource(gumStream);
    gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0, audioCtx.currentTime);

    let codeForProcessorModule = ["https://cdn.jsdelivr.net/npm/essentia.js@0.1.3/dist/essentia-wasm.umd.js",
      "https://cdn.jsdelivr.net/npm/essentia.js@0.1.3/dist/essentia.js-extractor.umd.js",
      "https://raw.githack.com/MTG/essentia.js/master/examples/demos/melspectrogram-rt/melspectrogram-processor.js",
      "https://unpkg.com/ringbuf.js@0.1.0/dist/index.js"];

    // inject Essentia.js code into AudioWorkletGlobalScope context, then setup audio graph and start animation
    URLFromFiles(codeForProcessorModule)
      .then((concatenatedCode) => {
        audioCtx.audioWorklet.addModule(concatenatedCode)
          .then(setupAudioGraphStream)
          .catch(function moduleLoadRejected(msg) {
            console.log(`There was a problem loading the AudioWorklet module code: \n ${msg}`);
          });
      })
      .catch((msg) => {
        console.log(`There was a problem retrieving the AudioWorklet module code: \n ${msg}`);
      })
    //  // set button to stop
    recordButton.classList.add("recording");
    recordButton.innerHTML = "Stop";
    recordButton.classList.add("bg-emerald-200");
    recordButton.disabled = false;
  } else {
    throw "Mic stream not active";
  }
}
function startAudioProcessingMediaElt() {
  if (audioCtx.state == "closed") {
    audioCtx = new AudioContext();
  }
  else if (audioCtx.state == "suspended") {
    audioCtx.resume();
  }

  source = audioCtx.createMediaElementSource(player);
  gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0, audioCtx.currentTime);
  let codeForProcessorModule = ["https://cdn.jsdelivr.net/npm/essentia.js@0.1.3/dist/essentia-wasm.umd.js",
    "https://cdn.jsdelivr.net/npm/essentia.js@0.1.3/dist/essentia.js-extractor.umd.js",
    "https://raw.githack.com/MTG/essentia.js/master/examples/demos/melspectrogram-rt/melspectrogram-processor.js",
    "https://unpkg.com/ringbuf.js@0.1.0/dist/index.js"];

  // inject Essentia.js code into AudioWorkletGlobalScope context, then setup audio graph and start animation
  URLFromFiles(codeForProcessorModule)
    .then((concatenatedCode) => {
      audioCtx.audioWorklet.addModule(concatenatedCode)
        .then(setupAudioGraphMediaElt)
        .catch(function moduleLoadRejected(msg) {
          console.log(`There was a problem loading the AudioWorklet module code: \n ${msg}`);
        });
    })
    .catch((msg) => {
      console.log(`There was a problem retrieving the AudioWorklet module code: \n ${msg}`);
    })
}
function stopMicRecordStream() {
  // stop mic stream
  gumStream.getAudioTracks().forEach(function (track) {
    track.stop();
    gumStream.removeTrack(track);
  });

  audioCtx.close().then(function () {
    // manage button state
    recordButton.classList.remove("recording");
    recordButton.innerHTML = 'Record';

    // disconnect nodes
    mic.disconnect();
    melspectrogramNode.disconnect();
    gain.disconnect();
    mic = undefined;
    melspectrogramNode = undefined;
    gain = undefined;

    console.log("Stopped recording ...");
  });
}
function stopAudioProcessingMediaElt() {
  player.pause();
  audioCtx.close().then(function () {
    // disconnect nodes
    source.disconnect();
    melspectrogramNode.disconnect();
    source = undefined;
    melspectrogramNode = undefined;
  });
}
function setupAudioGraphStream() {
  // increase buffer size in case of glitches
  let sab = exports.RingBuffer.getStorageForCapacity(melNumBands * 42, Float32Array);
  let rb = new exports.RingBuffer(sab, Float32Array);
  audioReader = new exports.AudioReader(rb);

  melspectrogramNode = new AudioWorkletNode(audioCtx, 'melspectrogram-processor', {
    processorOptions: {
      bufferSize: bufferSize,
      hopSize: hopSize,
      melNumBands: melNumBands,
      sampleRate: audioCtx.sampleRate,
    }
  });

  try {
    melspectrogramNode.port.postMessage({
      sab: sab,
    });
  } catch (_) {
    alert("No SharedArrayBuffer transfer support, try another browser.");
    recordButton.disabled = true;
    return;
  }
  recording = recordButton.classList.contains("recording");
  mic.connect(melspectrogramNode);
  melspectrogramNode.connect(gain);
  gain.connect(audioCtx.destination);

}

function setupAudioGraphMediaElt() {
  // increase buffer size in case of glitches
  let sab = exports.RingBuffer.getStorageForCapacity(melNumBands * 18, Float32Array);
  let rb = new exports.RingBuffer(sab, Float32Array);
  audioReader = new exports.AudioReader(rb);
  melspectrogramNode = new AudioWorkletNode(audioCtx, 'melspectrogram-processor', {
    processorOptions: {
      bufferSize: 1024,
      hopSize: 512,
      melNumBands: melNumBands,
      sampleRate: audioCtx.sampleRate,
    }
  });
  // The AudioWorklet node causes cracking noises during playback so we 
  // connect it with a gain node to avoid this.
  try {
    melspectrogramNode.port.postMessage({
      sab: sab,
    });
  } catch (_) {
    alert("No SharedArrayBuffer transfer support, try another browser.");
    return;
  }
  // connect source to destination for playback
  source.connect(audioCtx.destination);
  // connect source to AudioWorklet node for feature extraction
  source.connect(melspectrogramNode);
  melspectrogramNode.connect(gain);
  gain.connect(audioCtx.destination);
}

function updateMeshTexture() {
  let melspectrumBuffer = new Float32Array(melNumBands);
  if (audioReader !== undefined){
    if (audioReader.available_read() >= melNumBands) {
      let toread = audioReader.dequeue(melspectrumBuffer);
      if (toread !== 0) {
        // scale spectrum values to 0 - 255
        scaledMelspectrum = melspectrumBuffer.map(x => Math.round(x * 35.5))
      }
    }
  }
  updateSpectrumData(specTexture, scaledMelspectrum);
}

function addGUI() {
  gui.add( params, 'playback_rate').step(0.001).name( 'playback_rate' ).onChange( function ( value ) {
    (volumeMesh.material).uniforms['playback_rate']['value'] = 1.0 / value;
    player.playbackRate = value;
  } );
  gui.add( params, 'num_frames').step(1).name( 'num_frames' ).onChange( function ( value ) {
    specTexture = createDataTexture(value, melNumBands);
    updateMeshTexture();
    numFrames = value;
  } );
  // Distance Function
  const df_folder = gui.addFolder('distance function') ;
  df_folder.add( params, 'min_dist').step(0.01).name( 'min_dist' ).onChange( function ( value ) {
    (volumeMesh.material).uniforms['min_dist']['value'] = value;
  } );
  df_folder.add( params, 'max_dist').step(0.01).name( 'max_dist' ).onChange( function ( value ) {
    (volumeMesh.material).uniforms['max_dist']['value'] = value;
  } );
  df_folder.add( params, 'df_type', {
    'Sphere - Tube': 0,'Sphere - Box': 1,'Sphere - Plane': 2,
    'Tube - Box': 3, 'Tube - Plane': 4,'Plane - Box': 5}).name( 'sphere/tube' ).onChange( function ( value ) {
    (volumeMesh.material).uniforms['df_type']['value'] = value;
  } );
  df_folder.add( params, 'df_sphere_tube', 0, 1).step(0.01).name( 'sphere/tube' ).onChange( function ( value ) {
    (volumeMesh.material).uniforms['df_sphere_tube']['value'] = value;
  } );
  df_folder.add( params, 'df_sphere_box', 0, 1).step(0.01).name( 'sphere/box' ).onChange( function ( value ) {
    (volumeMesh.material).uniforms['df_sphere_box']['value'] = value;
  } );
  df_folder.add( params, 'df_sphere_plane', 0, 1).step(0.01).name( 'sphere/plane' ).onChange( function ( value ) {
    (volumeMesh.material).uniforms['df_sphere_plane']['value'] = value;
  } );
  df_folder.add( params, 'df_tube_box', 0, 1).step(0.01).name( 'tube/box' ).onChange( function ( value ) {
    (volumeMesh.material).uniforms['df_tube_box']['value'] = value;
  } );
  df_folder.add( params, 'df_tube_plane', 0, 1).step(0.01).name( 'tube/plane' ).onChange( function ( value ) {
    (volumeMesh.material).uniforms['df_tube_plane']['value'] = value;
  } );
  df_folder.add( params, 'df_plane_box', 0, 1).step(0.01).name( 'plane/box' ).onChange( function ( value ) {
    (volumeMesh.material).uniforms['df_plane_box']['value'] = value;
  } );
  df_folder.add( params, 'global_scale').step(0.0001).name( 'global_scale' ).onChange( function ( value ) {
    (volumeMesh.material).uniforms['global_scale']['value'] = value;
  } );
  const transforms = gui.addFolder('transforms') ;
  transforms.add( params, 'scale_x', 0, 1).step(0.00001).name( 'scale_x' ).onChange( function ( value ) {
    (volumeMesh.material).uniforms['df_scale']['value'] = new THREE.Vector3(value, params.scale_y, params.scale_z);
  } );
  transforms .add( params, 'scale_y', 0, 1).step(0.00001).name( 'scale_y' ).onChange( function ( value ) {
    (volumeMesh.material).uniforms['df_scale']['value'] = new THREE.Vector3(params.scale_x, value, params.scale_z);
  } );
  transforms.add( params, 'scale_z', 0, 1).step(0.00001).name( 'scale_z' ).onChange( function ( value ) {
    (volumeMesh.material).uniforms['df_scale']['value'] = new THREE.Vector3(params.scale_x, params.scale_y, value);
  } );
  transforms.add( params, 'rot_x', -360, 360).step(0.1).name( 'rotate_x' ).onChange( function ( value ) {
    (volumeMesh.material).uniforms['df_rot']['value'] = new THREE.Vector3(value, params.rot_y, params.rot_z);
  } );
  transforms.add( params, 'rot_y', -360, 360).step(0.1).name( 'rotate_y' ).onChange( function ( value ) {
    (volumeMesh.material).uniforms['df_rot']['value'] = new THREE.Vector3(params.rot_x, value, params.rot_z);
  } );
  transforms.add( params, 'rot_z', -360, 360).step(0.1).name( 'rotate_z' ).onChange( function ( value ) {
    (volumeMesh.material).uniforms['df_rot']['value'] = new THREE.Vector3(params.rot_x, params.rot_y, value);
  } );
  transforms.add( params, 'translation_x').step(0.01).name( 'translate_x' ).onChange( function ( value ) {
    (volumeMesh.material).uniforms['df_translation']['value'] = new THREE.Vector3(value, params.translation_y, params.translation_z);
  } );
  transforms.add( params, 'translation_y').step(0.01).name( 'translate_y' ).onChange( function ( value ) {
    (volumeMesh.material).uniforms['df_translation']['value'] = new THREE.Vector3(params.translation_x, value, params.translation_z);
  } );
  transforms.add( params, 'translation_z').step(0.01).name( 'translate_z' ).onChange( function ( value ) {
    (volumeMesh.material).uniforms['df_translation']['value'] = new THREE.Vector3(params.translation_x, params.translation_y, value);
  } );
  // Color
  const color_folder = gui.addFolder('color') ;
  color_folder.add( params, 'color_mode', {'Presets': 0, 'Gradient': 1, 'Unicolor': 2}).name( 'color_mode' ).onChange( function ( value ) {
    (volumeMesh.material).uniforms['color_mode']['value'] = value;
  } );
  color_folder.add( params, 'color_preset_type', 0, 4).step(1).name( 'color_preset' ).onChange( function ( value ) {
    (volumeMesh.material).uniforms['color_preset_type']['value'] = value;
  } );
  color_folder.add( params, 'color_space', {'RBG': 0, 'HSV': 1}).name( 'color_space' ).onChange( function ( value ) {
    (volumeMesh.material).uniforms['color_space']['value'] = value ;
  } );
  color_folder.addColor( params, 'uni_color').name( 'unicolor' ).onChange( function ( value ) {
    (volumeMesh.material).uniforms['uni_color']['value'] = new THREE.Color(value) ;
  } );
  color_folder.addColor( params, 'color_1').name( 'color_1' ).onChange( function ( value ) {
    (volumeMesh.material).uniforms['color_1']['value'] = new THREE.Color(value) ;
  } );
  color_folder.addColor( params, 'color_2').name( 'color_2' ).onChange( function ( value ) {
    (volumeMesh.material).uniforms['color_2']['value'] = new THREE.Color(value) ;
  } ); 
  // Spectrogram
  const spectrogram_folder = gui.addFolder('spectrogram') ;
  spectrogram_folder.add( params, 'mel_spec_bins', 10, 96).step(1).name( 'mel_spec_bins' ).onChange( function ( value ) {
    melNumBands = value ;
  } ); 
  // Raycasting
  const raycasting_folder = gui.addFolder('raycasting') ;
  raycasting_folder.add( params, 'dt_scale', 0.005,).step(0.001).name( 'dt_scale' ).onChange( function ( value ) {
    (volumeMesh.material).uniforms['dt_scale']['value'] = value;    
  } );
  raycasting_folder.add( params, 'max_steps', 1,).step(1).name( 'max_steps' ).onChange( function ( value ) {
    (volumeMesh.material).uniforms['max_steps']['value'] = value;    
  } );
}










