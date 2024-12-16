import * as THREE from 'three';
import { GUI } from 'dat.gui/build/dat.gui.min.js';
// import constants
import { audioCtx, bufferSize, hopSize, melNumBands, numFrames } from './constants';

const gui = new GUI( {width: 200 } );

export function setupGUI() {
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