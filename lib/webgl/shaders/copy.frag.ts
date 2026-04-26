// Pass-through fragment shader. Used when no LUT layer is active so the
// pipeline can still render through the same final-display step.
export const COPY_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_image;
void main() { outColor = texture(u_image, v_uv); }
`;
