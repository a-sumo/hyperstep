export const shaderCurveStructs = /* glsl */`

struct BezierCurve {
	sampler2D position;
};
`
export const shaderDistFunction = /* glsl */`

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
    
    // vec3  g = b*(b2-b1) + d*(b1-b0) + a*(b2-b0)*0.5;
    vec3  g =  (d-b)*b1 + (b+a*0.5)*b2 + (-d-a*0.5)*b0;
    float f = a*a*0.25-b*d;
    vec3  k = b0-2.0*b1+b2;
    float t = clamp((a*0.5+b-0.5*f*dot(g,k)/dot(g,g))/m, 0.0, 1.0 );
    
    return vec2(length(mix(mix(b0,b1,t), mix(b1,b2,t),t)),t);
}
`