/**
 * Optional 3D-LUT look pass.
 * Samples a sampler3D loaded from a .cube file. Blends with the pre-LUT
 * input by u_opacity so users can dial the strength.
 */
export const LUT_FRAG = /* glsl */ `#version 300 es
precision highp float;
precision highp sampler3D;

in vec2 v_uv;
out vec4 outColor;

uniform sampler2D u_image;     // grading-pass result, sRGB-encoded
uniform sampler3D u_lut;
uniform float     u_opacity;

void main() {
  vec3 src = texture(u_image, v_uv).rgb;
  vec3 looked = texture(u_lut, src).rgb;
  outColor = vec4(mix(src, looked, u_opacity), 1.0);
}
`;
