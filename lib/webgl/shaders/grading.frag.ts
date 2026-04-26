/**
 * Main grading fragment shader.
 *
 * Pipeline (matching Lightroom's broad ordering):
 *   sRGB→linear → WB → exposure → tonal regions → contrast →
 *   vibrance/saturation → HSL bands → master curve →
 *   split-toning → vignette → linear→sRGB
 *
 * All math is in highp to avoid banding on dark gradients.
 */
export const GRADING_FRAG = /* glsl */ `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 outColor;

uniform sampler2D u_image;
uniform sampler2D u_curveLut;     // 256x1, RGBA8 (R/G/B = per-channel curve, A = master)
uniform vec2  u_resolution;       // canvas pixels

// White balance + light
uniform float u_temperature;      // -1..+1 (normalised from -100..+100)
uniform float u_tint;             // -1..+1
uniform float u_exposure;         // stops, -3..+3
uniform float u_contrast;         // -1..+1
uniform float u_highlights;       // -1..+1
uniform float u_shadows;          // -1..+1
uniform float u_whites;           // -1..+1
uniform float u_blacks;           // -1..+1

// Presence
uniform float u_vibrance;         // -1..+1
uniform float u_saturation;       // -1..+1
uniform float u_clarity;          // -1..+1 (placeholder, unsharp mask comes later)

// HSL — 8 bands × (hue, sat, lum). Packed as three vec4s of 8 floats each.
// Each value in -1..+1.
uniform float u_hslHue[8];
uniform float u_hslSat[8];
uniform float u_hslLum[8];

// Split toning
uniform vec3  u_shadowTint;       // RGB (hue×sat baked in CPU-side)
uniform vec3  u_highlightTint;
uniform float u_splitBalance;     // -1..+1

// Vignette
uniform float u_vignetteAmount;   // -1..+1
uniform float u_vignetteMidpoint; // 0..1
uniform float u_vignetteFeather;  // 0..1

// ─── Color space helpers ────────────────────────────────────────
vec3 srgb_to_linear(vec3 c) {
  bvec3 cutoff = lessThan(c, vec3(0.04045));
  vec3 high = pow((c + 0.055) / 1.055, vec3(2.4));
  vec3 low  = c / 12.92;
  return mix(high, low, vec3(cutoff));
}

vec3 linear_to_srgb(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  bvec3 cutoff = lessThan(c, vec3(0.0031308));
  vec3 high = 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055;
  vec3 low  = c * 12.92;
  return mix(high, low, vec3(cutoff));
}

vec3 rgb_to_hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0/3.0, 2.0/3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)),
              d / (q.x + e),
              q.x);
}

vec3 hsv_to_rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

float luminance(vec3 c) {
  // Rec. 709 in linear
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

// ─── Tonal region masks (operate on luminance) ──────────────────
float shadowMask(float L)    { return smoothstep(0.5, 0.0, L); }
float highlightMask(float L) { return smoothstep(0.5, 1.0, L); }
float whitesMask(float L)    { return smoothstep(0.6, 1.0, L); }
float blacksMask(float L)    { return smoothstep(0.4, 0.0, L); }

// ─── HSL band weight ────────────────────────────────────────────
// Returns 0..1; peaks at 'center' hue, falls off ±30°.
float bandWeight(float hue, float center) {
  float d = abs(hue - center);
  d = min(d, 1.0 - d);              // wrap on [0,1]
  return smoothstep(60.0/360.0, 15.0/360.0, d);
}

// 8 band centers in 0..1
const float BAND_CENTERS[8] = float[8](
  0.0/360.0, 30.0/360.0, 60.0/360.0, 120.0/360.0,
  180.0/360.0, 240.0/360.0, 280.0/360.0, 320.0/360.0
);

void main() {
  // Image is uploaded top→bottom, so we flip Y when sampling. After the second
  // pass copies this FBO to the canvas with the same v_uv mapping, the on-screen
  // orientation matches the original image.
  vec3 srgb = texture(u_image, vec2(v_uv.x, 1.0 - v_uv.y)).rgb;
  vec3 c = srgb_to_linear(srgb);

  // ── White balance (channel scaling, Lightroom-flavoured) ──────
  // Warm: lift R, tame B. Tint: shift G against M.
  c.r *= 1.0 + u_temperature * 0.35;
  c.b *= 1.0 - u_temperature * 0.35;
  c.g *= 1.0 - u_tint * 0.20;
  c.r *= 1.0 + u_tint * 0.10;
  c.b *= 1.0 + u_tint * 0.10;
  c = max(c, vec3(0.0));

  // ── Exposure (linear multiply) ─────────────────────────────────
  c *= exp2(u_exposure);

  // ── Tonal regions (operate on a soft-clipped working space) ───
  // Move into a 0..1-ish display-referred space for region work.
  vec3 disp = c / (1.0 + c);                     // Reinhard-like compress
  float L = luminance(disp);

  float sM = shadowMask(L);
  float hM = highlightMask(L);
  float wM = whitesMask(L);
  float bM = blacksMask(L);

  disp += disp * (u_shadows    *  0.6) * sM;
  disp += (1.0 - disp) * (u_highlights * -0.6) * hM;
  disp += (1.0 - disp) * (u_whites     *  0.6) * wM;
  disp += disp * (u_blacks    * -0.6) * bM;

  c = disp / max(1.0 - disp, 1e-4);              // back to linear-ish
  c = clamp(c, 0.0, 64.0);

  // ── Contrast (S-curve around mid grey in display space) ───────
  vec3 dispC = c / (1.0 + c);
  float k = 1.0 + u_contrast * 1.8;
  dispC = (dispC - 0.5) * k + 0.5;
  dispC = clamp(dispC, 0.0, 1.0);
  c = dispC / max(1.0 - dispC, 1e-4);

  // ── Vibrance + Saturation ────────────────────────────────────
  vec3 hsv = rgb_to_hsv(clamp(c / (1.0 + c), 0.0, 1.0));
  // Saturation: simple multiplier in HSV-S.
  hsv.y *= 1.0 + u_saturation;
  // Vibrance: stronger lift on low-sat pixels, plus a skin-tone protector.
  float skinProtect = 1.0 - smoothstep(0.02, 0.10, abs(hsv.x - 25.0/360.0));
  float vib = u_vibrance * (1.0 - hsv.y) * (1.0 - 0.6 * skinProtect);
  hsv.y = clamp(hsv.y + vib, 0.0, 1.0);

  // ── HSL per-channel ──────────────────────────────────────────
  float hueShift = 0.0, satShift = 0.0, lumShift = 0.0;
  for (int i = 0; i < 8; i++) {
    float w = bandWeight(hsv.x, BAND_CENTERS[i]);
    hueShift += u_hslHue[i] * w;
    satShift += u_hslSat[i] * w;
    lumShift += u_hslLum[i] * w;
  }
  hsv.x = fract(hsv.x + hueShift * (30.0 / 360.0));
  hsv.y = clamp(hsv.y * (1.0 + satShift), 0.0, 1.0);
  hsv.z = clamp(hsv.z * (1.0 + lumShift * 0.6), 0.0, 1.5);

  vec3 dispV = hsv_to_rgb(hsv);

  // ── Master tone curve via 1D LUT (sampled per channel) ────────
  dispV.r = texture(u_curveLut, vec2(dispV.r, 0.5)).a;
  dispV.g = texture(u_curveLut, vec2(dispV.g, 0.5)).a;
  dispV.b = texture(u_curveLut, vec2(dispV.b, 0.5)).a;

  // ── Split toning ─────────────────────────────────────────────
  float Ld = luminance(dispV);
  float pivot = 0.5 + u_splitBalance * 0.4;
  float wHi = smoothstep(pivot - 0.25, pivot + 0.25, Ld);
  float wLo = 1.0 - wHi;
  vec3 tint = u_shadowTint * wLo + u_highlightTint * wHi;
  // Soft-light style blend so tints don't crush.
  dispV = mix(dispV, dispV * (1.0 - 0.5) + tint * 0.5, length(tint) * 0.6);

  // ── Vignette ─────────────────────────────────────────────────
  vec2 ndc = v_uv * 2.0 - 1.0;
  ndc.x *= u_resolution.x / u_resolution.y;
  float r = length(ndc) / 1.4142;                // 0 at center, ~1 at corners
  float vMask = smoothstep(u_vignetteMidpoint,
                           u_vignetteMidpoint + u_vignetteFeather + 1e-3,
                           r);
  dispV *= 1.0 + u_vignetteAmount * 0.7 * vMask;

  // ── Output ───────────────────────────────────────────────────
  // dispV lives in Reinhard-tonemapped display-referred space (c/(1+c)).
  // Invert the tonemap to recover linear-light, then encode to sRGB. This
  // makes the identity path round-trip exactly: srgb→linear→reinhard→…→
  // inverse-reinhard→linear→srgb.
  vec3 displayLinear = dispV / max(1.0 - dispV, 1e-4);
  outColor = vec4(linear_to_srgb(clamp(displayLinear, 0.0, 1.0)), 1.0);
}
`;
