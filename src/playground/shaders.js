// GLSL shader code
export const raycastVertexShader = /* glsl */`
uniform vec3 volume_scale;
out vec3 vray_dir;
flat out vec3 transformed_eye;

void main(void) {
	vec3 volume_translation = vec3(0.5) - volume_scale * 0.5;
	gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1);
	transformed_eye = (cameraPosition - volume_translation) / volume_scale;
	vray_dir = position - transformed_eye;
}`;

export const raycastFragmentShader = /* glsl */`
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
uniform highp sampler2D noise_texture;
// playback 
uniform float time;
uniform float playback_progress;
uniform float playback_rate;

// distance field 
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

// from http://www.java-gaming.org/index.php?topic=35123.0
vec4 cubic(float v){
    vec4 n = vec4(1.0, 2.0, 3.0, 4.0) - v;
    vec4 s = n * n * n;
    float x = s.x;
    float y = s.y - 4.0 * s.x;
    float z = s.z - 4.0 * s.y + 6.0 * s.x;
    float w = 6.0 - x - y - z;
    return vec4(x, y, z, w) * (1.0/6.0);
}

vec4 textureBicubic(sampler2D sampler, vec2 texCoords){

   vec2 texSize = vec2(textureSize(sampler, 0));
   vec2 invTexSize = 1.0 / texSize;
   
   texCoords = texCoords * texSize - 0.5;

   
    vec2 fxy = fract(texCoords);
    texCoords -= fxy;

    vec4 xcubic = cubic(fxy.x);
    vec4 ycubic = cubic(fxy.y);

    vec4 c = texCoords.xxyy + vec2 (-0.5, +1.5).xyxy;
    
    vec4 s = vec4(xcubic.xz + xcubic.yw, ycubic.xz + ycubic.yw);
    vec4 offset = c + vec4 (xcubic.yw, ycubic.yw) / s;
    
    offset *= invTexSize.xxyy;
    
    vec4 sample0 = texture(sampler, offset.xz);
    vec4 sample1 = texture(sampler, offset.yz);
    vec4 sample2 = texture(sampler, offset.xw);
    vec4 sample3 = texture(sampler, offset.yw);

    float sx = s.x / (s.x + s.y);
    float sy = s.z / (s.z + s.w);

    return mix(
       mix(sample3, sample2, sx), mix(sample1, sample0, sx)
    , sy);
}


void main(void) {
	vec3 ray_dir = normalize(vray_dir);
	vec2 t_hit = intersect_box(aabb_min, aabb_max, transformed_eye, ray_dir);

	if (t_hit.x > t_hit.y) {
		discard;
	}

	t_hit.x = max(t_hit.x, 0.0);
	vec3 dt_vec = 1.0 / (vec3(volume_dims) * abs(ray_dir));
  
	float dt = dt_scale * min(dt_vec.x, min(dt_vec.y, dt_vec.z));
	vec3 p = transformed_eye + (t_hit.x + dt) * ray_dir;

  vec4 spec_val = textureBicubic(spectrum, vec2(0.0, 0.0));
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
    // Sample the noise texture to modulate the step length
    vec2 noiseCoords = p.xy * 0.1; // 'noiseScale' controls the noise frequency
    float noiseFactor = texture(noise_texture, noiseCoords).r;

    // Modulate 'dt' using the noise factor
    float noiseIntensity = 0.0; // Adjust this to control the effect intensity
    float modulatedDt = dt * (1.0 + noiseFactor * noiseIntensity);

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
    float u_coords_tube = (p_dist_r_t.z - 0.5) / playback_rate + 1.;

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

    spec_val = textureBicubic(spectrum, vec2(u_coords, v_coords));
    // interpolateTricubicFast(spectrum, p / volumeSize, volumeSize);

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
    gl_FragColor.rgb += (1.0 - gl_FragColor.a) * val_color.w * val_color.xyz;
    gl_FragColor.a += (1.0 - gl_FragColor.a) * val_color.w;
    if (gl_FragColor.a > 0.99) {
      break;
    }
    if (val_color.w < 0.0) {
      discard;
    }
    // step along the ray direction
		p += ray_dir * modulatedDt;
    step++;
	}

  gl_FragColor.r = linear_to_srgb(gl_FragColor.r);
  gl_FragColor.g = linear_to_srgb(gl_FragColor.g);
  gl_FragColor.b = linear_to_srgb(gl_FragColor.b);

  //gl_FragColor = color;

}
`;