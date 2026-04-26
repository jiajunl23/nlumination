/**
 * Texture helpers for the grading pipeline.
 *
 * - `uploadImageTexture(gl, source)`     — RGBA8 2D from an ImageBitmap / HTMLImage / Canvas.
 * - `createCurveTexture(gl)`             — 256×1 RGBA8 2D, written by `updateCurveTexture`.
 * - `updateCurveTexture(gl, tex, lut)`   — refresh from a Uint8Array curve LUT.
 * - `createLut3DTexture(gl, lut)`        — RGB16F sampler3D from a parsed .cube.
 * - `createFramebuffer(gl, w, h)`        — RGBA8 ping-pong target.
 */

import type { CubeLut } from "./lut-loader";

export type ImageSource = TexImageSource;

export function uploadImageTexture(
  gl: WebGL2RenderingContext,
  source: ImageSource,
): { texture: WebGLTexture; width: number; height: number } {
  const texture = gl.createTexture();
  if (!texture) throw new Error("uploadImageTexture: createTexture failed");

  // Source dimensions — TexImageSource has no unified type for width/height, so probe each variant.
  let width = 0;
  let height = 0;
  if ("width" in source && "height" in source) {
    width = (source as { width: number }).width;
    height = (source as { height: number }).height;
  }
  if (!width || !height) {
    throw new Error("uploadImageTexture: source has no dimensions");
  }

  gl.bindTexture(gl.TEXTURE_2D, texture);
  // Image rows are top→bottom in memory; with UNPACK_FLIP_Y_WEBGL=false, V=0
  // corresponds to image top. The grading pass flips V=1-y when sampling so
  // screen-top maps to image-top after the FBO→canvas copy pass.
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    source as unknown as TexImageSource,
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_2D, null);

  return { texture, width, height };
}

export function createCurveTexture(gl: WebGL2RenderingContext): WebGLTexture {
  const tex = gl.createTexture();
  if (!tex) throw new Error("createCurveTexture: alloc failed");
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    256,
    1,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    null,
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return tex;
}

export function updateCurveTexture(
  gl: WebGL2RenderingContext,
  tex: WebGLTexture,
  rgba: Uint8Array,
) {
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texSubImage2D(
    gl.TEXTURE_2D,
    0,
    0,
    0,
    256,
    1,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    rgba,
  );
  gl.bindTexture(gl.TEXTURE_2D, null);
}

export function createLut3DTexture(
  gl: WebGL2RenderingContext,
  lut: CubeLut,
): WebGLTexture {
  const tex = gl.createTexture();
  if (!tex) throw new Error("createLut3DTexture: alloc failed");
  gl.bindTexture(gl.TEXTURE_3D, tex);
  gl.texImage3D(
    gl.TEXTURE_3D,
    0,
    gl.RGB16F,
    lut.size,
    lut.size,
    lut.size,
    0,
    gl.RGB,
    gl.FLOAT,
    lut.data,
  );
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_3D, null);
  return tex;
}

export type Framebuffer = {
  fb: WebGLFramebuffer;
  texture: WebGLTexture;
  width: number;
  height: number;
};

export function createFramebuffer(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
): Framebuffer {
  const fb = gl.createFramebuffer();
  const texture = gl.createTexture();
  if (!fb || !texture) throw new Error("createFramebuffer: alloc failed");
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA8,
    width,
    height,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    null,
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER,
    gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_2D,
    texture,
    0,
  );
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
    throw new Error("createFramebuffer: incomplete attachment");
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return { fb, texture, width, height };
}

export function disposeFramebuffer(
  gl: WebGL2RenderingContext,
  fb: Framebuffer,
) {
  gl.deleteFramebuffer(fb.fb);
  gl.deleteTexture(fb.texture);
}
