
import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import Stats from 'three/examples/jsm/libs/stats.module';
import WebGL from 'three/examples/jsm/capabilities/WebGL.js';
import {loadAudioFromFile, resampleAndMakeMono, melSpectrogram, powerToDb} from '@magenta/music/esm/core/audio_utils';
import { GUI } from 'dat.gui/build/dat.gui.min.js';
if ( WebGL.isWebGL2Available() === false ) {

  document.body.appendChild( WebGL.getWebGL2ErrorMessage() );

}

let camera, 
  scene, 
  renderer, 
  controls, 
  stats

let debugPlaneMesh,
  volumeMesh,
  clock,
  curveMesh,
  curve_data

let analyser,
  fileURL,
  audioBuffer


// global var for web audio API AudioContext
let audioCtx;

try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    //audioCtx = new AudioContext();
} catch (e) {
    throw "Could not instantiate AudioContext: " + e.message;
}

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
const F_MIN = 30;
const F_MAX = SAMPLE_RATE / 2;

// Live Audio spectrogram constants

const FFT_SIZE = 2048;
const NUM_FRAMES = 1024;
const MIN_DB = -80;
const MAX_DB = -10;
analyser = audioCtx.createAnalyser();

// Curve constants
const NUM_CURVE_POINTS = 5;

// GUI
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
  sample_rate: SAMPLE_RATE,
  mel_spec_bins: MEL_SPEC_BINS,
  fft_size: FFT_SIZE,
  spec_hop_length: SPEC_HOP_LENGTH,
  f_min: F_MIN,
  f_max: F_MAX,
  dt_scale: 0.1,
  max_steps: 100,
};

// Set up UI Elements 
const fileInput = document.getElementById('loadFileInput');
const audioEl = document.getElementById('audio')
const blob = window.URL || window.webkitURL;
// const updateEl = document.getElementById('update'); 
// updateEl.addEventListener('click', () => loadFile(fileInput));
fileInput.addEventListener('change', () => loadFile(fileInput));


// Load audio file, generate mel spectrogram 
// and return the spectrogram's data texture
function loadFile(inputElement) {
  //document.getElementById(`${prefix}_fileBtn`).setAttribute('disabled', '');
  audioBuffer = loadAudioFromFile(inputElement.files[0]);
  fileURL = blob.createObjectURL(inputElement.files[0]);
  audioEl.src = fileURL;
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
    sampleRate: params.sample_rate,
    hopLength: params.spec_hop_length,
    nMels: params.mel_spec_bins,
    nFft: params.fft_size,
    fMin: params.f_min,
    fMax: params.f_max,
  }));
}
// Play Audio File
// async function playAudio(audioBuffer){
//   const source = audioCtx.createBufferSource();
//   source.buffer = audioBuffer;
//   source.connect(audioCtx.destination);
//   source.start();
// }


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

  // Clock
  clock = new THREE.Clock();

  // Controls
  controls = new OrbitControls( camera, renderer.domElement );
  controls.addEventListener( 'change', render );
  controls.minZoom = 0.1;
  controls.maxZoom = 10;
  controls.enablePan = false;
  controls.update();

  // GUI
  addGUI();

  // Debug spectrogram texture
  let planeGeo1 = new THREE.PlaneGeometry(2, 2);
  let planeMat1 = new THREE.MeshBasicMaterial({ map: createDataTexture(x_dim, y_dim), side: THREE.DoubleSide});
  debugPlaneMesh = new THREE.Mesh(planeGeo1, planeMat1);
  debugPlaneMesh .position.set( -2, 0, -1 );
  // scene.add(debugPlaneMesh);


  const curve = initCurveData(NUM_CURVE_POINTS);
  const points = curve.getPoints( 5 );
  const curve_geometry = new THREE.BufferGeometry().setFromPoints( points );
  const curve_material = new THREE.LineBasicMaterial( { color: 0xff0000 } );

  // Create curveMesh to add to the scene
  curveMesh = new THREE.Line( curve_geometry, curve_material );
  curveMesh.matrixAutoUpdate = false;
  // scene.add(curveMesh);

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
    'spectrum': { value: createDataTexture(NUM_FRAMES, FFT_SIZE / 2) },
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

  //addHelpers(scene);
  window.addEventListener( 'resize', onWindowResize );
  
  render();

}


function animate(){
  requestAnimationFrame(animate);
  updateUniforms();
  //stats.update();
  render();
}
function render() {
  renderer.render(scene, camera);
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

function addHelpers (scene) {
  const gridHelper = new THREE.GridHelper( 10, 10);
  scene.add( gridHelper );
  stats = Stats();
  document.body.appendChild(stats.dom)
  const axesHelper = new THREE.AxesHelper( 1 );
  scene.add( axesHelper );
}

function updateUniforms(){
  (volumeMesh.material).uniforms['time']['value'] = clock.getElapsedTime();
  (volumeMesh.material).uniforms['curve_data']['value'] =  updateCurveData(curveMesh, NUM_CURVE_POINTS);
  (volumeMesh.material).uniforms['playback_progress']['value'] = (audioEl.currentTime) / audioEl.duration;
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
        d[stride + 3] = 255;
				stride += 4;
			}
		}
	}
	const texture = new THREE.Data3DTexture( d, width, height, depth );
	texture.format = THREE.RGBAFormat;
  //texture.type = THREE.FloatType;
	texture.minFilter = THREE.NearestFilter;
	texture.magFilter = THREE.NearestFilter;
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

function addGUI() {
  gui.add( params, 'playback_rate').step(0.001).name( 'playback_rate' ).onChange( function ( value ) {
    (volumeMesh.material).uniforms['playback_rate']['value'] = 1.0 / value;
    audioEl.playbackRate = value;
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
  spectrogram_folder.add( params, 'sample_rate',16000, 41000 ).step(1000).name( 'sample_rate' ).onChange( function ( value ) {
  } );
  spectrogram_folder.add( params, 'mel_spec_bins', 229,512).step(1).name( 'mel_spec_bins' );
  // spectrogram_folder.add( params, 'spec_hop_length', 8,).step(1).name( 'spec_hop_length' );
  // spectrogram_folder.add( params, 'fft_size', {'128': 128, '256': 256,
  //  '512':512, '1024': 1024, '2048':2048} ).name( 'fft_size' );
  spectrogram_folder.add( params, 'f_min', 30, ).step(10).name( 'f_min' );
  spectrogram_folder.add( params, 'f_max', 30, 16000).step(10).name( 'f_max' );
  // Raycasting
  const raycasting_folder = gui.addFolder('raycasting') ;
  raycasting_folder.add( params, 'dt_scale', 0.005,).step(0.001).name( 'dt_scale' ).onChange( function ( value ) {
    (volumeMesh.material).uniforms['dt_scale']['value'] = value;    
  } );
  raycasting_folder.add( params, 'max_steps', 1,).step(1).name( 'max_steps' ).onChange( function ( value ) {
    (volumeMesh.material).uniforms['max_steps']['value'] = value;    
  } );
}
