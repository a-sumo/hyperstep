import '../style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import Stats from 'three/examples/jsm/libs/stats.module';
import WebGL from 'three/examples/jsm/capabilities/WebGL.js';
import { GUI } from 'dat.gui/build/dat.gui.min.js';


if (WebGL.isWebGL2Available() === false) {

  document.body.appendChild(WebGL.getWebGL2ErrorMessage());

}

let camera,
  scene,
  renderer,
  controls,
  stats









