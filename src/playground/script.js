import '../style.css';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GUI } from 'three/examples/jsm/libs/lil-gui.module.min.js';
import Stats from 'stats-js';
import { GenerateMeshBVHWorker } from 'three-mesh-bvh/src/workers/GenerateMeshBVHWorker.js';
import { StaticGeometryGenerator } from 'three-mesh-bvh/src/utils/StaticGeometryGenerator.js';
import { GenerateSDFMaterial } from '../utils/GenerateSDFMaterial.js';
import { RayMarchSDFMaterial } from '../utils/RayMarchSDFMaterial.js';
import { RayCastSDFMaterial } from '../utils/RayCastSDFMaterial.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { URLFromFiles } from '../utils/AudioWorkletFunctions.js';
import audioFile1 from "../assets/audio/r2d2_talk.mp3";
import audioFile2 from "../assets/audio/synth_melody.mp3";
import audioFile3 from "../assets/audio/theremin_tone.mp3";
const params = {

	gpuGeneration: true,
	resolution: 75,
	margin: 0.2,
	regenerate: () => updateSDF(),
	mode: 'raycasting',
	surface: -0.3,
	bufferSize: 1024,
	hopSize: 512,
	melNumBands: 96,
	numFrames: 1,

};

let renderer, camera, scene, gui, stats, boxHelper, axesHelper;
let audioCtx, gumStream, source, audioReader;
let mic, gain, melspectrogramNode;
let outputContainer, bvh, geometry, sdfTex, specTex, mesh;
let generateSdfPass, raymarchPass, raycastPass;
let bvhGenerationWorker;
let bufferSize = 1024;
let hopSize = 512;
let melNumBands = 96;
let numFrames = 1;
let exports = {};
exports = require('../utils/ringbuf.js/index.js');
const inverseBoundsMatrix = new THREE.Matrix4();

const fileInput = document.getElementById('loadFileInput');
const recordButton = document.getElementById('recordButton');
const player = document.getElementById("audioPlayer");

const audioFiles = {
	"audio-1": audioFile1,
	"audio-2": audioFile2,
	"audio-3": audioFile3,
}

const blob = window.URL || window.webkitURL;
const buttonGroup = document.getElementById("button-group");

function onLoadFile(inputElement) {
	player.src = blob.createObjectURL(inputElement.files[0]);
	player.load();
}
let scaledMelspectrum = [];

init();
render();

function init() {

	outputContainer = document.getElementById('output');

	// renderer setup
	renderer = new THREE.WebGLRenderer({ antialias: true });
	renderer.setPixelRatio(window.devicePixelRatio);
	renderer.setSize(window.innerWidth, window.innerHeight);
	renderer.setClearColor(0, 0);
	renderer.outputEncoding = THREE.sRGBEncoding;
	document.body.appendChild(renderer.domElement);

	// scene setup
	scene = new THREE.Scene();

	const light = new THREE.DirectionalLight(0xffffff, 1);
	light.position.set(1, 1, 1);
	scene.add(light);
	scene.add(new THREE.AmbientLight(0xffffff, 0.2));

	// camera setup
	camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 50);
	camera.position.set(1, 1, 2);
	camera.far = 100;
	camera.updateProjectionMatrix();

	boxHelper = new THREE.Box3Helper(new THREE.Box3());
	scene.add(boxHelper);
	const axesHelper = new THREE.AxesHelper(3);
	scene.add(axesHelper);

	new OrbitControls(camera, renderer.domElement);

	// stats setup
	stats = new Stats();
	//document.getElementById('stats').appendChild(stats.dom);
	//document.body.appendChild(stats.dom);

	// sdf pass to generate the 3d texture
	generateSdfPass = new FullScreenQuad(new GenerateSDFMaterial());


	// screen pass to render the sdf ray marching
	raymarchPass = new FullScreenQuad(new RayMarchSDFMaterial());

	// screen pass to render the sdf ray casting
	raycastPass = new FullScreenQuad(new RayCastSDFMaterial());

	// load model and generate bvh
	bvhGenerationWorker = new GenerateMeshBVHWorker();

	new GLTFLoader()
		.setMeshoptDecoder(MeshoptDecoder)
		.loadAsync('https://raw.githubusercontent.com/gkjohnson/3d-demo-data/main/models/stanford-bunny/bunny.glb')
		.then(gltf => {

			gltf.scene.updateMatrixWorld(true);

			const staticGen = new StaticGeometryGenerator(gltf.scene);
			staticGen.attributes = ['position', 'normal'];
			staticGen.useGroups = false;

			geometry = staticGen.generate().center();

			return bvhGenerationWorker.generate(geometry, { maxLeafTris: 1 });

		})
		.then(result => {

			bvh = result;

			mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
			scene.add(mesh);

			updateSDF();

		});

	rebuildGUI();
	// Some browsers partially implement mediaDevices. We can't assign an object
	// with getUserMedia as it would overwrite existing properties.
	// Add the getUserMedia property if it's missing.
	let navigatorCopy = navigator;
	if (navigatorCopy.mediaDevices === undefined) {
		navigatorCopy.mediaDevices = {};
	}
	try {
		AudioContext = window.AudioContext || window.webkitAudioContext;
		audioCtx = new AudioContext();
	} catch (e) {
		throw "Could not instantiate AudioContext: " + e.message;
	}
	player.src = audioFiles['audio-1'];
	player.load();
	createDataTexture(numFrames, melNumBands);
	window.addEventListener('resize', function () {

		camera.aspect = window.innerWidth / window.innerHeight;
		camera.updateProjectionMatrix();

		renderer.setSize(window.innerWidth, window.innerHeight);

	}, false);
	recordButton.addEventListener('click', onRecordClickHandler);
	player.addEventListener('play', onPlayClickHandler);
	player.addEventListener('pause', onPlayClickHandler);
	fileInput.addEventListener('change', () => { onLoadFile(fileInput) });
	buttonGroup.addEventListener("click", (e) => {

		const isButton = e.target.nodeName === 'BUTTON';
		if (!isButton) {
			return
		}

		player.src = audioFiles[e.target.id];
		player.load();
	});


}
function createDataTexture(width, height) {

	specTex = new THREE.DataTexture(new Uint8Array(width * height * 4), width, height);
	specTex.format = THREE.RGBAFormat;
	// texture.type = THREE.FloatType;
	specTex.minFilter = THREE.LinearFilter;
	specTex.magFilter = THREE.LinearFilter;
	specTex.unpackAlignment = 1;
	specTex.needsUpdate = true;

	let stride = 0;
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			specTex[stride + 0] = 255;
			specTex[stride + 1] = 0;
			specTex[stride + 2] = 0;
			specTex[stride + 3] = 255;
			stride += 4;
		}
	}
}
// build the gui with parameters based on the selected display mode
function rebuildGUI() {

	if (gui) {

		gui.destroy();

	}

	gui = new GUI();

	const generationFolder = gui.addFolder('generation');
	generationFolder.add(params, 'gpuGeneration');
	generationFolder.add(params, 'resolution', 10, 200, 1);
	generationFolder.add(params, 'margin', 0, 1);
	generationFolder.add(params, 'regenerate');

	const displayFolder = gui.addFolder('display');
	displayFolder.add(params, 'mode', ['geometry', 'raymarching', 'raycasting']).onChange(() => {

		rebuildGUI();

	});
	if (params.mode === 'raymarching') {

		displayFolder.add(params, 'surface', - 0.2, 0.5);

	}
	if (params.mode === 'raycasting') {

		displayFolder.add(params, 'surface', - 0.5, 0.5);

	}

}

// update the sdf texture based on the selected parameters
function updateSDF() {

	const dim = params.resolution;
	const matrix = new THREE.Matrix4();
	const center = new THREE.Vector3();
	const quat = new THREE.Quaternion();
	const scale = new THREE.Vector3();

	// compute the bounding box of the geometry including the margin which is used to
	// define the range of the SDF
	geometry.boundingBox.getCenter(center);
	scale.subVectors(geometry.boundingBox.max, geometry.boundingBox.min);
	scale.x += 2 * params.margin;
	scale.y += 2 * params.margin;
	scale.z += 2 * params.margin;
	matrix.compose(center, quat, scale);
	inverseBoundsMatrix.copy(matrix).invert();

	// update the box helper
	boxHelper.box.copy(geometry.boundingBox);
	boxHelper.box.min.x -= params.margin;
	boxHelper.box.min.y -= params.margin;
	boxHelper.box.min.z -= params.margin;
	boxHelper.box.max.x += params.margin;
	boxHelper.box.max.y += params.margin;
	boxHelper.box.max.z += params.margin;

	// dispose of the existing sdf
	if (sdfTex) {

		sdfTex.dispose();

	}

	const pxWidth = 1 / dim;
	const halfWidth = 0.5 * pxWidth;

	const startTime = window.performance.now();
	if (params.gpuGeneration) {

		// create a new 3d render target texture
		sdfTex = new THREE.WebGL3DRenderTarget(dim, dim, dim);
		sdfTex.texture.format = THREE.RedFormat;
		sdfTex.texture.type = THREE.FloatType;
		sdfTex.texture.minFilter = THREE.LinearFilter;
		sdfTex.texture.magFilter = THREE.LinearFilter;
		sdfTex.needsUpdate = true;

		// prep the sdf generation material pass
		generateSdfPass.material.uniforms.bvh.value.updateFrom(bvh);
		generateSdfPass.material.uniforms.matrix.value.copy(matrix);

		// render into each layer
		for (let i = 0; i < dim; i++) {

			generateSdfPass.material.uniforms.zValue.value = i * pxWidth + halfWidth;

			renderer.setRenderTarget(sdfTex, i);
			generateSdfPass.render(renderer);

		}

		// initiate read back to get a rough estimate of time taken to generate the sdf
		renderer.readRenderTargetPixels(sdfTex, 0, 0, 1, 1, new Float32Array(4));
		renderer.setRenderTarget(null);

	} else {

		// create a new 3d data texture
		sdfTex = new THREE.Data3DTexture(new Float32Array(dim ** 3), dim, dim, dim);
		sdfTex.format = THREE.RedFormat;
		sdfTex.type = THREE.FloatType;
		sdfTex.minFilter = THREE.LinearFilter;
		sdfTex.magFilter = THREE.LinearFilter;

		const posAttr = geometry.attributes.position;
		const indexAttr = geometry.index;
		const point = new THREE.Vector3();
		const normal = new THREE.Vector3();
		const delta = new THREE.Vector3();
		const tri = new THREE.Triangle();
		const target = {};

		// iterate over all pixels and check distance
		for (let x = 0; x < dim; x++) {

			for (let y = 0; y < dim; y++) {

				for (let z = 0; z < dim; z++) {

					// adjust by half width of the pixel so we sample the pixel center
					// and offset by half the box size.
					point.set(
						halfWidth + x * pxWidth - 0.5,
						halfWidth + y * pxWidth - 0.5,
						halfWidth + z * pxWidth - 0.5,
					).applyMatrix4(matrix);

					const index = x + y * dim + z * dim * dim;
					const dist = bvh.closestPointToPoint(point, target).distance;

					// get the face normal to determine if the distance should be positive or negative
					const faceIndex = target.faceIndex;
					const i0 = indexAttr.getX(faceIndex * 3 + 0);
					const i1 = indexAttr.getX(faceIndex * 3 + 1);
					const i2 = indexAttr.getX(faceIndex * 3 + 2);
					tri.setFromAttributeAndIndices(posAttr, i0, i1, i2);
					tri.getNormal(normal);
					delta.subVectors(target.point, point);

					// set the distance in the texture data
					sdfTex.image.data[index] = normal.dot(delta) > 0.0 ? - dist : dist;

				}

			}

		}

	}

	// update the timing display
	const delta = window.performance.now() - startTime;
	outputContainer.innerText = `${delta.toFixed(2)}ms`;

	rebuildGUI();

}
// update the spectrum texture based on new data
function updateSpectrum() {
	let melspectrumBuffer = new Float32Array(melNumBands);
	if (audioReader !== undefined) {
		if (audioReader.available_read() >= melNumBands) {
			let toread = audioReader.dequeue(melspectrumBuffer);
			if (toread !== 0) {
				// scale spectrum values to 0 - 255
				scaledMelspectrum = melspectrumBuffer.map(x => Math.round(x * 35.5));
			}
		}
	}
	// dispose of the existing spectrum texture
	if (specTex) {

		specTex.dispose();

	}

}

function render() {

	stats.update();
	requestAnimationFrame(render);

	if (!(sdfTex)) {

		// render nothing
		return;

	} else if (params.mode === 'geometry') {

		// render the rasterized geometry
		renderer.render(scene, camera);

	} else if (params.mode === 'raymarching') {

		// render the ray marched texture
		camera.updateMatrixWorld();
		mesh.updateMatrixWorld();

		let tex;
		if (sdfTex.isData3DTexture) {

			tex = sdfTex;

		} else {

			tex = sdfTex.texture;

		}

		const { width, depth, height } = tex.image;
		raymarchPass.material.uniforms.sdfTex.value = tex;
		console.log
		raymarchPass.material.uniforms.normalStep.value.set(1 / width, 1 / height, 1 / depth);
		raymarchPass.material.uniforms.surface.value = params.surface;
		raymarchPass.material.uniforms.projectionInverse.value.copy(camera.projectionMatrixInverse);
		raymarchPass.material.uniforms.sdfTransformInverse.value.copy(mesh.matrixWorld).invert().premultiply(inverseBoundsMatrix).multiply(camera.matrixWorld);
		raymarchPass.render(renderer);

	} else if (params.mode === 'raycasting') {
		let melspectrumBuffer = new Float32Array(melNumBands);
		if (audioReader !== undefined) {
			if (audioReader.available_read() >= melNumBands) {
				let toread = audioReader.dequeue(melspectrumBuffer);
				if (toread !== 0) {
					// scale spectrum values to 0 - 255
					scaledMelspectrum = melspectrumBuffer.map(x => Math.round(x * 35.5));
				}
			}
		}

		const widthS = numFrames;
		const heightS = melNumBands;
		specTex = new THREE.DataTexture(new Uint8Array(widthS * heightS * 4), widthS, heightS);
		specTex.format = THREE.RGBAFormat;
		// specTex.type = THREE.FloatType;
		specTex.minFilter = THREE.NearestFilter;
		specTex.magFilter = THREE.NearestFilter;
		specTex.unpackAlignment = 1;
		specTex.needsUpdate = true;
		const data = specTex.image.data;
		let stride = 0;
		for (let y = 0; y < heightS; y++) {
			for (let x = 0; x < widthS; x++) {
				if (x < widthS - 1) {
					// shift the index by 4 to get the color value of the subsequent column
					specTex.image.data[stride] = specTex.image.data[stride + 4];
				} else {
					// set the red value of the texture
					specTex.image.data[stride] = scaledMelspectrum[y];
				}
				specTex.image.data[stride + 1] = 0;
				specTex.image.data[stride + 2] = 0;
				specTex.image.data[stride + 3] = 1;
				stride += 4;
			}
		}
		// render the ray cast texture
		camera.updateMatrixWorld();
		mesh.updateMatrixWorld();

		let tex;
		if (sdfTex.isData3DTexture) {

			tex = sdfTex;

		} else {

			tex = sdfTex.texture;

		}

		const { width, depth, height } = tex.image;
		raycastPass.material.uniforms.sdfTex.value = tex.texture;
		raycastPass.material.uniforms.dataTex.value = specTex;
		raycastPass.material.uniforms.normalStep.value.set(1 / width, 1 / height, 1 / depth);
		raycastPass.material.uniforms.surface.value = params.surface;
		raycastPass.material.uniforms.projectionInverse.value.copy(camera.projectionMatrixInverse);
		raycastPass.material.uniforms.sdfTransformInverse.value.copy(mesh.matrixWorld).invert().premultiply(inverseBoundsMatrix).multiply(camera.matrixWorld);
		raycastPass.render(renderer);

	}
}


function onRecordClickHandler() {
	const recording = recordButton.classList.contains("recording");
	if (recording) {
		recordButton.classList.remove("recording");
		recordButton.innerHTML = "Record";
		recordButton.classList.remove("bg-emerald-200");
		recordButton.disabled = false;
		stopMicRecordStream();
	} else {
		recordButton.classList.add("recording");
		recordButton.innerHTML = "Stop";
		recordButton.classList.add("bg-emerald-200");
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
function onPlayClickHandler() {
	if (!player.paused) {
		startAudioProcessingMediaElt();
	} else {
		stopAudioProcessingMediaElt();
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

		// inject Essentia.js code into AudioWorkletGlobalScope context, then setup audio graph
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
	audioCtx.close().then(function () {
		// disconnect nodes
		source.disconnect();
		melspectrogramNode.disconnect();
		source = undefined;
		melspectrogramNode = undefined;
	});
}

function setupAudioGraphStream() {
	// increase buffer size to reduce audio artifacts
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

