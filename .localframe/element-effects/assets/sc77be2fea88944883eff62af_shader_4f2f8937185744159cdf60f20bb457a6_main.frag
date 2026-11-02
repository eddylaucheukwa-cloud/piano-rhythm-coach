precision highp float;
in vec2 vTextureCoord;
out vec4 finalColor;
uniform float uTime;
uniform vec2 uResolution;
uniform vec2 uPointer;
uniform sampler2D uTexture;
void main() {
  float c = mod(floor(vTextureCoord.x * 16.0) + floor(vTextureCoord.y * 16.0), 2.0);
  finalColor = vec4(vec3(mix(0.12, 0.16, c)), 1.0);
}