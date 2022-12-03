import { ShaderMaterial, Matrix4, Vector3 } from 'three';

export class RayCastSDFMaterial extends ShaderMaterial {

	constructor( params ) {

		super( {

			defines: {

				MAX_STEPS: 100,
				SURFACE_EPSILON: 0.001,

			},

			uniforms: {

				surface: { value: 0 },
				sdfTex: { value: null },
                dataTex: { value: null},
				normalStep: { value: new Vector3() },
				projectionInverse: { value: new Matrix4() },
				sdfTransformInverse: { value: new Matrix4() }

			},

			vertexShader: /* glsl */`
				varying vec2 vUv;
				void main() {
					vUv = uv;
					gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
				}
			`,

			fragmentShader: /* glsl */`
				precision highp sampler3D;
				varying vec2 vUv;
				uniform float surface;
				uniform sampler3D sdfTex;
                uniform sampler2D dataTex;
				uniform sampler2D curvePositions;
				uniform vec3 normalStep;
				uniform mat4 projectionInverse;
				uniform mat4 sdfTransformInverse;
				#include <common>
				// distance to box bounds
				vec2 rayBoxDist( vec3 boundsMin, vec3 boundsMax, vec3 rayOrigin, vec3 rayDir ) {
					vec3 t0 = ( boundsMin - rayOrigin ) / rayDir;
					vec3 t1 = ( boundsMax - rayOrigin ) / rayDir;
					vec3 tmin = min( t0, t1 );
					vec3 tmax = max( t0, t1 );
					float distA = max( max( tmin.x, tmin.y ), tmin.z );
					float distB = min( tmax.x, min( tmax.y, tmax.z ) );
					float distToBox = max( 0.0, distA );
					float distInsideBox = max( 0.0, distB - distToBox );
					return vec2( distToBox, distInsideBox );
				}
				vec2 sdBezier( vec3 p, vec3 b0, vec3 b1, vec3 b2 )
				{
					b0 -= p;
					b1 -= p;
					b2 -= p;
				   
					vec3 b01 = cross(b0,b1);
					vec3 b12 = cross(b1,b2);
					vec3 b20 = cross(b2,b0);
					
					vec3 n =  b01+b12+b20;
					
					float a = -dot(b20,n);
					float b = -dot(b01,n);
					float d = -dot(b12,n);
			
					float m = -dot(n,n);
					
				  //vec3  g = b*(b2-b1) + d*(b1-b0) + a*(b2-b0)*0.5;
					vec3  g =  (d-b)*b1 + (b+a*0.5)*b2 + (-d-a*0.5)*b0;
					float f = a*a*0.25-b*d;
					vec3  k = b0-2.0*b1+b2;
					float t = clamp((a*0.5+b-0.5*f*dot(g,k)/dot(g,g))/m, 0.0, 1.0 );
					
					return vec2(length(mix(mix(b0,b1,t), mix(b1,b2,t),t)),t);
				}
				vec3 map( vec3 p ) {
					vec3 a = vec3(0.0,0.0,0.0);
					vec3 b = vec3(0.0, 0.1,0.0);
					vec3 c = vec3(0.0, 0.5,1.0);
					float hm = 0.0;
					float id = 0.0;
					float am = 0.0;
					
					float dm = length(p-a);
					
					vec3 pb = vec3(1.0,0.0,0.0);
					float off = 0.0;
					for( int i=0; i<3; i++ )
					{	
						//vec3 bboxMi = min(a,min(b,c))-0.3;
						//vec3 bboxMa = max(a,max(b,c))+0.3;
						
						vec2 h = sdBezier( p, a, b, c );
						float kh = (float(i) + h.y)/8.0;


						// #if COMPUTE_UV==1
						// 	vec3 bb = normalize(cross(b-a,c-a));
						// 	vec3 qq = bezier(a,b,c,h.y);
						// 	vec3 tq = normalize(bezier_dx(a,b,c,h.y));
						// 	vec3 nq = normalize(cross(bb,tq));
						// 	vec2 uv = vec2(dot(p-qq,nq),dot(p-qq,bb));
						// 	float ad = acos( dot(pb,bb) );
						// 	if( i==3 ) ad = -ad; // hack
						// 	off += ad;
						// 	float ka = atan(uv.y,uv.x) - off;
						// 	pb = bb;
						// #else
						float ka = 0.0;
						//#endif
						
						// grow next segment
						vec3 na = c;
						vec3 nb = c + (c-b);
						vec3 dir = vec3(0,1,0);
						vec3 nc = nb + 1.0*dir*sign(-dot(c-b,dir));
						id += 3.71;
						a = na;
						b = nb;
						c = nc;
					}

					return vec3( dm*0.5, hm, am );
				}
				void main() {
					// get the inverse of the sdf box transform
					mat4 sdfTransform = inverse( sdfTransformInverse );
					// convert the uv to clip space for ray transformation
					vec2 clipSpace = 2.0 * vUv - vec2( 1.0 );
					// get world ray direction
					vec3 rayOrigin = vec3( 0.0 );
					vec4 homogenousDirection = projectionInverse * vec4( clipSpace, - 1.0, 1.0 );
					vec3 rayDirection = normalize( homogenousDirection.xyz / homogenousDirection.w );
					// transform ray into local coordinates of sdf bounds
					vec3 sdfRayOrigin = ( sdfTransformInverse * vec4( rayOrigin, 1.0 ) ).xyz;
					vec3 sdfRayDirection = normalize( ( sdfTransformInverse * vec4( rayDirection, 0.0 ) ).xyz );
					// find whether our ray hits the box bounds in the local box space
					vec2 boxIntersectionInfo = rayBoxDist( vec3( - 0.5 ), vec3( 0.5 ), sdfRayOrigin, sdfRayDirection );
					float distToBox = boxIntersectionInfo.x;
					float distInsideBox = boxIntersectionInfo.y;
					bool intersectsBox = distInsideBox > 0.0;
					gl_FragColor = vec4( 0.0 );
					if ( intersectsBox ) {
						// find the surface point in world space
						bool intersectsSurface = false;
						vec4 localPoint = vec4( sdfRayOrigin + sdfRayDirection * ( distToBox + 1e-5 ), 1.0 );
						vec4 point = sdfTransform * localPoint;
						int step = 0;
						// ray march
						for ( int i = 0; i < MAX_STEPS; i ++ ) {
							// sdf box extends from - 0.5 to 0.5
							// transform into the local bounds space [ 0, 1 ] and check if we're inside the bounds
							vec3 uv = ( sdfTransformInverse * point ).xyz + vec3( 0.5 );
							if ( uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0 || uv.z < 0.0 || uv.z > 1.0 ) {
								break;
							}
							// // get the distance to surface and exit the loop if we're close to the surface
							// float distanceToSurface = texture2D( sdfTex, uv ).r - surface;
							// if ( distanceToSurface < SURFACE_EPSILON ) {
							// 	intersectsSurface = true;
							// 	break;
							// }
                            // get the distance value
							// float distance = abs(texture2D( sdfTex, uv ).r);
							float distance = map(uv).x;
							//distance = distance * 0.1; 
							//distance = clamp(length(uv-vec3(0.5)), 0.0, 1.0);
							// sample data texture along distance value
                            vec2 uv2 = vec2(0., distance);
                            float dataSample = texture(dataTex, uv2).r;
							vec4 baseColor = vec4(pow(dataSample,10.0) * distance,
							pow(dataSample, 2.0),
							pow(dataSample, 0.0) * distance, dataSample) ;
					
							// vec4 baseColor = vec4(distance,0., 0., 0.4);
							// baseColor.rgb = uv;
							// baseColor.w = 1.0;
                            // Opacity correction
							baseColor.w = 1.0 - pow(1.0 - baseColor.w, 0.01);
                            // Alpha-blending
                            gl_FragColor.rbg += (1.0 -  gl_FragColor.a) * baseColor.a * baseColor.xyz;
							gl_FragColor.a += (1.0 - gl_FragColor.a) * baseColor.w;
                            // exit the loop if the accumulated alpha is close to 1
                            // if (gl_FragColor.a > 0.9) {
                            //   break;
                            // }
							// step the ray
							point.xyz += rayDirection * 0.01;
						}
	
						// // find the surface normal
						// if ( intersectsSurface ) {
						// 	// compute the surface normal
						// 	vec3 uv = ( sdfTransformInverse * point ).xyz + vec3( 0.5 );
						// 	float dx = texture( sdfTex, uv + vec3( normalStep.x, 0.0, 0.0 ) ).r - texture( sdfTex, uv - vec3( normalStep.x, 0.0, 0.0 ) ).r;
						// 	float dy = texture( sdfTex, uv + vec3( 0.0, normalStep.y, 0.0 ) ).r - texture( sdfTex, uv - vec3( 0.0, normalStep.y, 0.0 ) ).r;
						// 	float dz = texture( sdfTex, uv + vec3( 0.0, 0.0, normalStep.z ) ).r - texture( sdfTex, uv - vec3( 0.0, 0.0, normalStep.z ) ).r;
						// 	vec3 normal = normalize( vec3( dx, dy, dz ) );
						// 	// compute some basic lighting effects
						// 	vec3 lightDirection = normalize( vec3( 1.0 ) );
						// 	float lightIntensity =
						// 		saturate( dot( normal, lightDirection ) ) +
						// 		saturate( dot( normal, - lightDirection ) ) * 0.05 +
						// 		0.1;
						// 	gl_FragColor.rgb = vec3( lightIntensity );
						// 	gl_FragColor.a = 1.0;
						// }
					}
					//#include <encodings_fragment>
				}
			`

		} );

		this.setValues( params );

	}

}