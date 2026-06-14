precision highp float;
varying vec2 vUv;
uniform vec2 uResolution;
uniform float uTime;
uniform vec2 uMouse;       // -1..1
uniform float uBlobCount;  // 0..8
uniform vec3 uBlobs[8];    // xy position (-1.5..1.5), z = radius

float smin(float a, float b, float k){
  float h = clamp(0.5 + 0.5*(b-a)/k, 0.0, 1.0);
  return mix(b, a, h) - k*h*(1.0-h);
}
float map(vec3 p){
  float d = 1e5;
  for(int i=0;i<8;i++){
    if(float(i) >= uBlobCount) break;
    vec3 b = uBlobs[i];
    d = smin(d, length(p - vec3(b.xy, 0.0)) - b.z, 0.35);
  }
  d = smin(d, length(p - vec3(uMouse*1.2, 0.0)) - 0.16, 0.4);
  return d;
}
vec3 nrm(vec3 p){ vec2 e=vec2(0.0015,0.0);
  return normalize(vec3(map(p+e.xyy)-map(p-e.xyy),
                        map(p+e.yxy)-map(p-e.yxy),
                        map(p+e.yyx)-map(p-e.yyx))); }
void main(){
  vec2 uv = vUv*2.0-1.0; uv.x *= uResolution.x/uResolution.y;
  vec3 ro = vec3(0.0,0.0,3.0);
  vec3 rd = normalize(vec3(uv, -2.2));
  float t=0.0; bool hit=false;
  for(int i=0;i<72;i++){
    float d = map(ro+rd*t);
    if(d<0.001){ hit=true; break; }
    if(t>6.0) break;
    t += d*0.9;
  }
  vec3 cream = vec3(0.984,0.965,0.925);
  vec4 col = vec4(cream, 0.0);
  if(hit){
    vec3 p = ro+rd*t; vec3 n = nrm(p);
    float diff = clamp(dot(n, normalize(vec3(0.4,0.7,0.8))), 0.0, 1.0);
    float ao = clamp(map(p+n*0.2)/0.2, 0.0, 1.0);
    vec3 coral = vec3(1.0,0.435,0.380), coralDark = vec3(0.909,0.364,0.314);
    vec3 c = mix(coralDark, coral, diff) * (0.6+0.4*ao);
    float rim = pow(1.0-clamp(dot(n,-rd),0.0,1.0), 2.0);
    c += rim*0.15*coral;
    col = vec4(c, 1.0);
  }
  gl_FragColor = col;
}
