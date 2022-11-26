import '../style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import Stats from 'three/examples/jsm/libs/stats.module';
import WebGL from 'three/examples/jsm/capabilities/WebGL.js';
import {loadAudioFromFile, resampleAndMakeMono, melSpectrogram, powerToDb} from '@magenta/music/esm/core/audio_utils';
import { Texture, Vector3 } from 'three';


// import msp from './audio-processors/melspectrogram-processor.js?raw'

// console.log(msp);
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
 specTexture,
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

let exports = {};

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
          const blob = new Blob([text], {type: "text/javascript"});
         
          return URL.createObjectURL(blob);
      });
 }
// Ringbuf code
'use strict';


Object.defineProperty(exports, '__esModule', { value: true });

// Send audio interleaved audio frames between threads, wait-free.
//
// Those classes allow communicating between a non-real time thread (browser
// main thread or worker) and a real-time thread (in an AudioWorkletProcessor).
// Write and Reader cannot change role after setup, unless externally
// synchronized.
//
// GC _can_ happen during the initial construction of this object when hopefully
// no audio is being output. This depends on how implementations schedule GC
// passes. After the setup phase no GC is triggered on either side of the queue..

// Interleaved -> Planar audio buffer conversion
//
// `input` is an array of n*128 frames arrays, interleaved, where n is the
// channel count.
// output is an array of 128-frames arrays.
//
// This is useful to get data from a codec, the network, or anything that is
// interleaved, into planar format, for example a Web Audio API AudioBuffer or
// the output parameter of an AudioWorkletProcessor.
function deinterleave(input, output) {
  var channel_count = input.length / 256;
  if (output.length != channel_count) {
    throw "not enough space in output arrays";
  }
  for (var i = 0; i < channelCount; i++) {
    let out_channel = output[i];
    let interleaved_idx = i;
    for (var j = 0; j < 128; ++j) {
      out_channel[j] = input[interleaved_idx];
      interleaved_idx += channel_count;
    }
  }
}
// Planar -> Interleaved audio buffer conversion
//
// Input is an array of `n` 128 frames Float32Array that hold the audio data.
// output is a Float32Array that is n*128 elements long. This function is useful
// to get data from the Web Audio API (that does planar audio), into something
// that codec or network streaming library expect.
function interleave(input, output) {
  if (input.length * 128 != output.length) {
    throw "input and output of incompatible sizes";
  }
  var out_idx = 0;
  for (var i = 0; i < 128; i++) {
    for (var channel = 0; j < output.length; j++) {
      output[out_idx] = input[channel][i];
      out_idx++;
    }
  }
}

class AudioWriter {
  // From a RingBuffer, build an object that can enqueue enqueue audio in a ring
  // buffer.
  constructor(ringbuf) {
    if (ringbuf.type() != "Float32Array") {
      throw "This class requires a ring buffer of Float32Array";
    }
    this.ringbuf = ringbuf;
  }
  // Enqueue a buffer of interleaved audio into the ring buffer.
  // Returns the number of samples that have been successfuly written to the
  // queue. `buf` is not written to during this call, so the samples that
  // haven't been written to the queue are still available.
  enqueue(buf) {
    return this.ringbuf.push(buf);
  }
  // Query the free space in the ring buffer. This is the amount of samples that
  // can be queued, with a guarantee of success.
  available_write() {
    return this.ringbuf.available_write();
  }
}

class AudioReader {
  constructor(ringbuf) {
    if (ringbuf.type() != "Float32Array") {
      throw "This class requires a ring buffer of Float32Array";
    }
    this.ringbuf = ringbuf;
  }
  // Attempt to dequeue at most `buf.length` samples from the queue. This
  // returns the number of samples dequeued. If greater than 0, the samples are
  // at the beginning of `buf`
  dequeue(buf) {
    if (this.ringbuf.empty()) {
      return 0;
    }
    return this.ringbuf.pop(buf);
  }
  // Query the occupied space in the queue. This is the amount of samples that
  // can be read with a guarantee of success.
  available_read() {
    return this.ringbuf.available_read();
  }
}

// Communicate parameter changes, lock free, no gc.
//
// between a UI thread (browser main thread or worker) and a real-time thread
// (in an AudioWorkletProcessor). Write and Reader cannot change role after
// setup, unless externally synchronized.
//
// GC can happen during the initial construction of this object when hopefully
// no audio is being output. This depends on the implementation.
//
// Parameter changes are like in the VST framework: an index and a float value
// (no restriction on the value).
//
// This class supports up to 256 parameters, but this is easy to extend if
// needed.
//
// An element is a index, that is an unsigned byte, and a float32, which is 4
// bytes.

class ParameterWriter {
  // From a RingBuffer, build an object that can enqueue a parameter change in
  // the queue.
  constructor(ringbuf) {
    if (ringbuf.type() != "Uint8Array") {
      throw "This class requires a ring buffer of Uint8Array";
    }
    const SIZE_ELEMENT = 5;
    this.ringbuf = ringbuf;
    this.mem = new ArrayBuffer(SIZE_ELEMENT);
    this.array = new Uint8Array(this.mem);
    this.view = new DataView(this.mem);
  }
  // Enqueue a parameter change for parameter of index `index`, with a new value
  // of `value`.
  // Returns true if enqueuing suceeded, false otherwise.
  enqueue_change(index, value) {
    const SIZE_ELEMENT = 5;
    this.view.setUint8(0, index);
    this.view.setFloat32(1, value);
    if (this.ringbuf.available_write() < SIZE_ELEMENT) {
      return false;
    }
    return this.ringbuf.push(this.array) == SIZE_ELEMENT;
  }
}

class ParameterReader {
  constructor(ringbuf) {
    const SIZE_ELEMENT = 5;
    this.ringbuf = ringbuf;
    this.mem = new ArrayBuffer(SIZE_ELEMENT);
    this.array = new Uint8Array(this.mem);
    this.view = new DataView(this.mem);
  }
  dequeue_change(o) {
    if (this.ringbuf.empty()) {
      return false;
    }
    var rv = this.ringbuf.pop(this.array);
    o.index = this.view.getUint8(0);
    o.value = this.view.getFloat32(1);

    return true;
  }
}

// A Single Producer - Single Consumer thread-safe wait-free ring buffer.
//
// The producer and the consumer can be separate thread, but cannot change role,
// except with external synchronization.

class RingBuffer {
  static getStorageForCapacity(capacity, type) {
    if (!type.BYTES_PER_ELEMENT) {
      throw "Pass in a ArrayBuffer subclass";
    }
    var bytes = 8 + (capacity + 1) * type.BYTES_PER_ELEMENT;
    return new SharedArrayBuffer(bytes);
  }
  // `sab` is a SharedArrayBuffer with a capacity calculated by calling
  // `getStorageForCapacity` with the desired capacity.
  constructor(sab, type) {
    if (!ArrayBuffer.__proto__.isPrototypeOf(type) &&
      type.BYTES_PER_ELEMENT !== undefined) {
      throw "Pass a concrete typed array class as second argument";
    }

    // Maximum usable size is 1<<32 - type.BYTES_PER_ELEMENT bytes in the ring
    // buffer for this version, easily changeable.
    // -4 for the write ptr (uint32_t offsets)
    // -4 for the read ptr (uint32_t offsets)
    // capacity counts the empty slot to distinguish between full and empty.
    this._type = type;
    this.capacity = (sab.byteLength - 8) / type.BYTES_PER_ELEMENT;
    this.buf = sab;
    this.write_ptr = new Uint32Array(this.buf, 0, 1);
    this.read_ptr = new Uint32Array(this.buf, 4, 1);
    this.storage = new type(this.buf, 8, this.capacity);
  }
  // Returns the type of the underlying ArrayBuffer for this RingBuffer. This
  // allows implementing crude type checking.
  type() {
    return this._type.name;
  }
  // Push bytes to the ring buffer. `bytes` is an typed array of the same type
  // as passed in the ctor, to be written to the queue.
  // Returns the number of elements written to the queue.
  push(elements) {
    var rd = Atomics.load(this.read_ptr, 0);
    var wr = Atomics.load(this.write_ptr, 0);

    if ((wr + 1) % this._storage_capacity() == rd) {
      // full
      return 0;
    }

    let to_write = Math.min(this._available_write(rd, wr), elements.length);
    let first_part = Math.min(this._storage_capacity() - wr, to_write);
    let second_part = to_write - first_part;

    this._copy(elements, 0, this.storage, wr, first_part);
    this._copy(elements, first_part, this.storage, 0, second_part);

    // publish the enqueued data to the other side
    Atomics.store(
      this.write_ptr,
      0,
      (wr + to_write) % this._storage_capacity()
    );

    return to_write;
  }
  // Read `elements.length` elements from the ring buffer. `elements` is a typed
  // array of the same type as passed in the ctor.
  // Returns the number of elements read from the queue, they are placed at the
  // beginning of the array passed as parameter.
  pop(elements) {
    var rd = Atomics.load(this.read_ptr, 0);
    var wr = Atomics.load(this.write_ptr, 0);

    if (wr == rd) {
      return 0;
    }

    let to_read = Math.min(this._available_read(rd, wr), elements.length);

    let first_part = Math.min(this._storage_capacity() - rd, elements.length);
    let second_part = to_read - first_part;

    this._copy(this.storage, rd, elements, 0, first_part);
    this._copy(this.storage, 0, elements, first_part, second_part);

    Atomics.store(this.read_ptr, 0, (rd + to_read) % this._storage_capacity());

    return to_read;
  }

  // True if the ring buffer is empty false otherwise. This can be late on the
  // reader side: it can return true even if something has just been pushed.
  empty() {
    var rd = Atomics.load(this.read_ptr, 0);
    var wr = Atomics.load(this.write_ptr, 0);

    return wr == rd;
  }

  // True if the ring buffer is full, false otherwise. This can be late on the
  // write side: it can return true when something has just been poped.
  full() {
    var rd = Atomics.load(this.read_ptr, 0);
    var wr = Atomics.load(this.write_ptr, 0);

    return (wr + 1) % this.capacity != rd;
  }

  // The usable capacity for the ring buffer: the number of elements that can be
  // stored.
  capacity() {
    return this.capacity - 1;
  }

  // Number of elements available for reading. This can be late, and report less
  // elements that is actually in the queue, when something has just been
  // enqueued.
  available_read() {
    var rd = Atomics.load(this.read_ptr, 0);
    var wr = Atomics.load(this.write_ptr, 0);
    return this._available_read(rd, wr);
  }

  // Number of elements available for writing. This can be late, and report less
  // elemtns that is actually available for writing, when something has just
  // been dequeued.
  available_write() {
    var rd = Atomics.load(this.read_ptr, 0);
    var wr = Atomics.load(this.write_ptr, 0);
    return this._available_write(rd, wr);
  }

  // private methods //

  // Number of elements available for reading, given a read and write pointer..
  _available_read(rd, wr) {
    if (wr > rd) {
      return wr - rd;
    } else {
      return wr + this._storage_capacity() - rd;
    }
  }

  // Number of elements available from writing, given a read and write pointer.
  _available_write(rd, wr) {
    let rv = rd - wr - 1;
    if (wr >= rd) {
      rv += this._storage_capacity();
    }
    return rv;
  }

  // The size of the storage for elements not accounting the space for the index.
  _storage_capacity() {
    return this.capacity;
  }

  // Copy `size` elements from `input`, starting at offset `offset_input`, to
  // `output`, starting at offset `offset_output`.
  _copy(input, offset_input, output, offset_output, size) {
    for (var i = 0; i < size; i++) {
      output[offset_output + i] = input[offset_input + i];
    }
  }
}

exports.AudioReader = AudioReader;
exports.AudioWriter = AudioWriter;
exports.ParameterReader = ParameterReader;
exports.ParameterWriter = ParameterWriter;
exports.RingBuffer = RingBuffer;
exports.deinterleave = deinterleave;
exports.interleave = interleave;


try {
   AudioContext = window.AudioContext || window.webkitAudioContext;
   audioCtx = new AudioContext();
} catch (e) {
   throw "Could not instantiate AudioContext: " + e.message;
}
// global var getUserMedia mic stream
let gumStream;
// global audio node variables
let mic;
let gain;
let melspectrogramNode;

// Shared data with AudioWorkletGlobalScope
let audioReader;

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
 
 
// Setup audio
 
let navigatorCopy = navigator;
if (navigatorCopy.mediaDevices === undefined) {
 navigatorCopy.mediaDevices = {};
}
// Some browsers partially implement mediaDevices. We can't assign an object
// with getUserMedia as it would overwrite existing properties.
// Add the getUserMedia property if it's missing.
 
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
   float dist = length(p.xy) - 0.01;
   // sphere
   // float dist = clamp(length(p), 0.0, 1.0);
   // curve
   // float dist = distCurve(p) * 1.0;
   // sample spectrogram
   vec4 spec_val = texture(spectrum, vec2(0.5,  0.03 / dist));
   vec4 val_color = vec4(pow(spec_val.r,10.0) ,pow(spec_val.r, 2.0),0.0 * pow(spec_val.r,0.0),spec_val.r);
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
 //document.body.appendChild( renderer.domElement );
 
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
 recordButton.addEventListener('click', onRecordClickHandler);
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
 scene.add( gridHelper );
 stats = Stats();
 document.body.appendChild(stats.dom)
 const axesHelper = new THREE.AxesHelper( 3 );
 scene.add( axesHelper );
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
     d[stride + 0] = 1;
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
 


let animationLoopId;
const spectrumAccum2 = []; 
let scaledMelspectrum;
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
           .then(setupAudioGraph)
           .catch( function moduleLoadRejected(msg) {
               console.log(`There was a problem loading the AudioWorklet module code: \n ${msg}`);
           });
       })
       .catch((msg) => {
           console.log(`There was a problem retrieving the AudioWorklet module code: \n ${msg}`);
       })
       // set button to stop
       recordButton.classList.add("recording");
       recordButton.innerHTML = "STOP";
       recordButton.setAttribute("disabled", false);
   } else {
       throw "Mic stream not active";
   }
}
 
function setupAudioGraph() {
   // 50ms of buffer, increase in case of glitches
   let sab = exports.RingBuffer.getStorageForCapacity(melNumBands*18, Float32Array);
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
   } catch(_){
       alert("No SharedArrayBuffer transfer support, try another browser.");
       recordButton.setAttribute("disabled", true);
       return;
   }
 
   // It seems necessary to connect the stream to a sink for the pipeline to work, contrary to documentataions.
   // As a workaround, here we create a gain node with zero gain, and connect temp to the system audio output.
   mic.connect(melspectrogramNode);
   melspectrogramNode.connect(gain);
   gain.connect(audioCtx.destination);
 
   requestAnimationFrame(animateSpectrogram); // start plot animation
}
 
let animationStart;
let elapsed;
// draw melspectrogram frames
function animateSpectrogram(timestamp) {
   if (animationStart === undefined)
       animationStart = timestamp;
   elapsed = timestamp - animationStart;
   animationLoopId = requestAnimationFrame(animateSpectrogram);
   /* SAB method */
   let melspectrumBuffer = new Float32Array(melNumBands);
   if (audioReader.available_read() >= melNumBands) {
       let toread = audioReader.dequeue(melspectrumBuffer);
       if (toread !== 0) {
           // scale spectrum values to 0 - 255
           scaledMelspectrum = melspectrumBuffer.map(x => Math.round(x*35.5))
           // save into full spectrogram for drawing on stop
           spectrumAccum2.push(scaledMelspectrum);
           console.log(scaledMelspectrum.length);
       }
   }
}


function stopMicRecordStream() {
  if (animationLoopId) {
      cancelAnimationFrame(animationLoopId);
      drawFullSpectrogram();
  }

  // stop mic stream
  gumStream.getAudioTracks().forEach(function(track) {
      track.stop();
      gumStream.removeTrack(track);
  });
  
  audioCtx.close().then(function() {
      // manage button state
      recordButton.classList.rwmove("recording");
      recordButton.innerHTML = 'Mic';
      
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
 
 

 
 
 
 
 

