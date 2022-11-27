import '../style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import Stats from 'three/examples/jsm/libs/stats.module';
import WebGL from 'three/examples/jsm/capabilities/WebGL.js';
import { GUI } from 'dat.gui/build/dat.gui.min.js';
// import msp from './audio-processors/melspectrogram-processor.js?raw'
import audioFile1 from "[javascript/auto]!=!!!file-loader!../assets/audio/r2d2_talk.mp3";
import audioFile2 from "[javascript/auto]!=!!!file-loader!../assets/audio/synth_melody.mp3";
import audioFile3 from "[javascript/auto]!=!!!file-loader!../assets/audio/theremin_tone.mp3";
import {loadAudioFromFile} from '@magenta/music/esm/core/audio_utils';

const audioFiles = {
  "audio-1" : audioFile1,
  "audio-2" : audioFile2,
  "audio-3" : audioFile3,
}

if (WebGL.isWebGL2Available() === false) {

  document.body.appendChild(WebGL.getWebGL2ErrorMessage());

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

/////* START OF RINGBUF CODE */////
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

/////* END OF RINGBUF CODE */////

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

// Shaders 
const raycastVertexShader = /* glsl */`
uniform vec3 volume_scale;
out vec3 vray_dir;
flat out vec3 transformed_eye;

void main(void) {
	vec3 volume_translation = vec3(0.5) - volume_scale * 0.5;
	gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1);
	transformed_eye = (cameraPosition - volume_translation) / volume_scale;
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
uniform highp sampler2D curve_data;
uniform vec3 aabb_min;
uniform vec3 aabb_max;

// playback 
uniform float time;
uniform float playback_progress;
uniform float playback_rate;

//distance field 
uniform int df_type;
uniform vec3 df_scale;
uniform float global_scale;
uniform float df_sphere_tube;
uniform float df_sphere_box;
uniform float df_sphere_plane;
uniform float df_tube_box;
uniform float df_tube_plane;
uniform float df_plane_box;
uniform vec3 df_rot;
uniform vec3 df_translation;
uniform float min_dist;
uniform float max_dist;

// raycasting volume
uniform float dt_scale;
uniform int max_steps;
uniform ivec3 volume_dims;
uniform vec3 volume_scale;
uniform int color_space;
uniform int color_mode;
uniform int color_preset_type;
uniform vec3 uni_color;
uniform vec3 color_1;
uniform vec3 color_2;


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
// Color conversions
// from: http://lolengine.net/blog/2013/07/27/rgb-to-hsv-in-gls
vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));

  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

vec3 hsv2rgb(vec3 c) {
  c = vec3(c.x, clamp(c.yz, 0.0, 1.0));
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

float linear_to_srgb(float x) {
	if (x <= 0.0031308f) {
		return 12.92f * x;
	}
	return 1.055f * pow(x, 1.f / 2.4f) - 0.055f;
}

// Clamping
float smoothClamp(float x, float a, float b)
{
    return smoothstep(0., 1., (x - a)/(b - a))*(b - a) + a;
}

float softClamp(float x, float a, float b)
{
    return smoothstep(0., 1., (2./3.)*(x - a)/(b - a) + (1./6.))*(b - a) + a;
}

float sdSphere( vec3 p, vec3 offset, float scale )
{
  float dist = length(p - offset) - scale;
  return 1.0 - clamp(dist, 0.0, 1.0);
}

float sdPlane( vec3 p, vec3 n, float h )
{
  // n must be normalized
  return dot(p,n) + h;
}

float sdRoundBox( vec3 p, vec3 b, float r )
{
  vec3 q = abs(p) - b;
  return length(max(q,0.0)) + min(max(q.x,max(q.y,q.z)),0.0) - r;
}

//3d rotation: https://gist.github.com/yiwenl/3f804e80d0930e34a0b33359259b556c
mat4 rotationMatrix(vec3 axis, float angle) {
  axis = normalize(axis);
  float s = sin(angle);
  float c = cos(angle);
  float oc = 1.0 - c;
  
  return mat4(oc * axis.x * axis.x + c,           oc * axis.x * axis.y - axis.z * s,  oc * axis.z * axis.x + axis.y * s,  0.0,
              oc * axis.x * axis.y + axis.z * s,  oc * axis.y * axis.y + c,           oc * axis.y * axis.z - axis.x * s,  0.0,
              oc * axis.z * axis.x - axis.y * s,  oc * axis.y * axis.z + axis.x * s,  oc * axis.z * axis.z + c,           0.0,
              0.0,                                0.0,                                0.0,                                1.0);
}

vec3 rotate(vec3 v, vec3 axis, float angle) {
  mat4 m = rotationMatrix(axis, angle);
  return (m * vec4(v, 1.0)).xyz;
}
float distCurve(vec3 p){
  // Experimental: compute distance from 3d curve
  float min_d = 10.0;
  float du = 0.2;
  float u = 0.0;
  while(u < 1.0 ){
    vec2 v_pos = vec2(u, 0.0);
    // point normals are stored in the 3rd row of the texture
    // whose UV.v coordinate is 0.75
    vec2 v_norm = vec2(u, 0.75);
    vec3 dir_vec = p - texture(curve_data, v_pos).rgb ;

    min_d = min(min_d, length(dir_vec));
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

  vec4 spec_val = texture(spectrum, vec2(0.0, 0.0));
  spec_val.rgba = vec4(0.0);

  // Frequency coordinate
  float u_coords = 0.0;
  // Time coordinate
  float v_coords = 0.0;

  float dist = 0.0;

  int step = 0;
	for (float t = t_hit.x; t < t_hit.y; t += dt) {
    if (step > max_steps){
      break;
    }

    // position used for distance field calculation
    vec3 p_dist = p;
    vec3 p_dist_r = vec3(0.0);
    vec3 p_dist_t = vec3(0.0);
    vec3 p_dist_r_t = vec3(0.0);

    // rotate
    p_dist_r = rotate(p_dist, vec3(1.0, 0.0, 0.0) , radians( df_rot.x));
    p_dist_r = rotate(p_dist_r, vec3(0.0, 1.0, 0.0) , radians( df_rot.y));
    p_dist_r = rotate(p_dist_r, vec3(0.0, 0.0, 1.0) , radians( df_rot.z));

    // translate
    p_dist_t = p_dist - df_translation;
    
    // rotate then translate 
    p_dist_r_t = p_dist_r - df_translation;

    // distance function
    // sphere
    float dist_sphere = clamp(length(p_dist_r_t), 0.0, 1.0);
    float u_coords_sphere = playback_progress;

    // tube
    float dist_tube = length(p_dist_r_t.xy);
    float u_coords_tube = (p_dist_r_t.z - 0.5) / playback_rate + playback_progress;

    // plane
    // normal vector 
    vec3 plane_n = vec3(0.0);
    plane_n = rotate(vec3(0.0,1.0,0.0), vec3(1.0, 0.0, 0.0) , radians( df_rot.x));
    plane_n = rotate(plane_n, vec3(0.0, 1.0, 0.0) , radians( df_rot.y));
    plane_n = rotate(plane_n, vec3(0.0, 0.0, 1.0) , radians( df_rot.z));
    float dist_plane = dot(p_dist_t, plane_n);
    float u_coords_plane = playback_progress;

    // round box 
    float dist_box = sdRoundBox(p_dist_r_t, df_scale * global_scale * 1.3, 0.0);
    float u_coords_box = u_coords_sphere;

    // TODO: curve
    float dist_curve = distCurve(p_dist);
    float u_coords_curve = u_coords_tube;

    // Interpolate between distance functions
    if(df_type ==  0){
      u_coords =  mix(u_coords_sphere, u_coords_tube, df_sphere_tube);
      dist =  mix(dist_sphere, dist_tube, df_sphere_tube);
    }
    else if ( df_type == 1){
      u_coords =  mix(u_coords_sphere, u_coords_box, df_sphere_box);
      dist =  mix(dist_sphere, dist_box, df_sphere_box);      
    }
    else if ( df_type == 2){
      u_coords =  mix(u_coords_sphere, u_coords_plane, df_sphere_plane);
      dist =  mix(dist_sphere, dist_plane, df_sphere_plane);         
    }
    else if ( df_type == 3){
      u_coords =  mix(u_coords_tube, u_coords_box, df_tube_box);
      dist =  mix(dist_tube, dist_box, df_tube_box);   
    }
    else if (df_type == 4){
      u_coords =  mix(u_coords_tube, u_coords_plane, df_tube_plane);
      dist =  mix(dist_tube, dist_plane, df_tube_plane);   
    }
    else if (df_type == 5){
      u_coords =  mix(u_coords_plane, u_coords_box, df_plane_box);
      dist =  mix(dist_plane, dist_box, df_plane_box);   
    }

    v_coords = length(df_scale) * global_scale / max(pow(dist,2.0), Epsilon);

    spec_val = texture(spectrum, vec2(u_coords, v_coords));

    // THREE.js sets values outside texture borders(outside the [0,1] x [0,1] range) 
    // to the values at the borders
    // This an undesired effect for our purposes so we set those values 
    // to zero. 
    if (u_coords < 0. || u_coords > 1. || 
      v_coords < 0. || v_coords > 1.){
      spec_val = vec4(0.0);
    }
    // Soft Clamp values
    if (dist < min_dist || dist > max_dist){
      spec_val *= softClamp(dist - max_dist, 0., 1.);
    }
    vec4 val_color = vec4(0.0);

    float mixValue = max(dist, Epsilon);
    vec3 mix_color = vec3(0.0);
    if (color_mode == 0) {
      // Use color presets
      vec4 preset_color = vec4(pow(spec_val.r,10.0) * 1./dist,
      pow(spec_val.r, 2.0),
      pow(spec_val.r, 0.0) * 1./dist, spec_val.r) ;

      // swizzle color components to define presets
      if ( color_preset_type == 0){
        val_color = preset_color.xyzw;
      }
      if ( color_preset_type == 1){
        val_color = preset_color.zxyw;
      }
      else if(color_preset_type == 2) {
        val_color = preset_color.zyxw;
      }
      else if(color_preset_type == 3) {
        val_color = preset_color.xzyw;
      }
      else if(color_preset_type == 4) {
        val_color = preset_color.yxzw;
      }
    }
    else if (color_mode == 1) {
      // Use color  gradient
      if (color_space == 0) {
        // mix color in rgb space
        mix_color = mix(color_1, color_2, mixValue);
      }
      else if (color_space == 1) {
        // Mix color in  hsv space
        vec3 hsv1 = rgb2hsv(color_1);
        vec3 hsv2 = rgb2hsv(color_2);
        float hue = (mod(mod((hsv2.x - hsv1.x), 1.) + 1.5, 1.) - 0.5) * mixValue + hsv1.x;
        vec3 hsv = vec3(hue, mix(hsv1.yz, hsv2.yz, mixValue));
        mix_color = hsv2rgb(hsv);
      }
      val_color = vec4(mix_color, spec_val.r);
    }
    else if (color_mode == 2) {
      // Use unique color

      val_color = vec4(
        pow(spec_val.r, (1.0 - uni_color.x) * 10.0), 
        pow(spec_val.r, (1.0 - uni_color.y) * 10.0), 
        pow(spec_val.r, (1.0 - uni_color.z) * 10.0), 
        spec_val.r);
        val_color.xyz *= 1.0 / max(dist, Epsilon);
    }
    // Opacity correction
    val_color.w = 1.0 - pow(1.0 - val_color.w, dt_scale);

    // Alpha-blending
    color.xyz += (1.0 - color.w) * val_color.w * val_color.xyz;
    color.w += (1.0 - color.w) * val_color.w;
    if (color.w > 0.99) {
      break;
    }
    if (val_color.w < 0.0) {
      discard;
    }
    // step along the ray direction
		p += ray_dir * dt;
    step++;
	}

  color.x = linear_to_srgb(color.x);
  color.y = linear_to_srgb(color.y);
  color.z = linear_to_srgb(color.z);

  gl_FragColor = color;

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
  const new_texture = new THREE.DataTexture(data , width, height);
  new_texture.format = THREE.RGBAFormat;
  // new_texture.type = THREE.FloatType;
  // new_texture.minFilter = THREE.NearestFilter;
  // new_texture.magFilter = THREE.NearestFilter;
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
  let sab = exports.RingBuffer.getStorageForCapacity(melNumBands * 18, Float32Array);
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
  // connect it with a 
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
  // melspectrogramNode.connect(gain);
  // gain.connect(audioCtx.destination);
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










