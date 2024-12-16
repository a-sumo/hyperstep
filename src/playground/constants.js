// Constant values used in the project

let audioCtx;
let bufferSize = 1024;
let hopSize = 512;
let melNumBands = 96;
let numFrames = 1;

const params = {
    df_type: 0, dist_func_tube: 1.0, dist_func_box: 1.0, dist_func_plane: 1.0, df_sphere_tube: 0.0,
    df_sphere_box: 0.0, df_sphere_plane: 0.0, df_tube_box: 0.0, df_tube_plane: 0.0, df_plane_box: 0.0,
    scale_x: 1, scale_y: 1, scale_z: 1,
    global_scale: 0.03, min_dist: 0, max_dist: 1,
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

