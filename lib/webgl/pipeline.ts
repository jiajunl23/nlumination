/**
 * Grading render pipeline.
 *
 * Owns:
 *  - the WebGL2 context bound to a canvas
 *  - the grading + LUT (or copy) shader programs
 *  - the source-image texture and (optional) 3D LUT texture
 *  - a 256×1 curve LUT texture (master tone curve)
 *  - one ping-pong framebuffer used as the grading-pass target
 *
 * Public surface:
 *   new Pipeline(canvas)
 *   setImage(source)            ← upload a new image
 *   setLut(lut | null)          ← swap or remove the 3D LUT
 *   setParams(params)           ← apply new GradingParams
 *   render()                    ← draw the current state to the canvas
 *   exportBlob(mime, quality)   ← full-res offscreen render → Blob
 *   dispose()
 */

import {
  collectUniforms,
  createFullScreenQuad,
  linkProgram,
  type UniformMap,
} from "./program";
import { VERTEX_SHADER } from "./shaders/vertex";
import { GRADING_FRAG } from "./shaders/grading.frag";
import { LUT_FRAG } from "./shaders/lut.frag";
import { COPY_FRAG } from "./shaders/copy.frag";
import {
  createCurveTexture,
  createFramebuffer,
  createLut3DTexture,
  disposeFramebuffer,
  updateCurveTexture,
  uploadImageTexture,
  type Framebuffer,
  type ImageSource,
} from "./textures";
import type { CubeLut } from "./lut-loader";
import { buildCurveLut } from "../grading/curve";
import { paramsToUniforms } from "../grading/uniforms";
import { DEFAULT_PARAMS, type GradingParams } from "../grading/params";

const GRADING_UNIFORM_NAMES = [
  "u_image",
  "u_curveLut",
  "u_resolution",
  "u_temperature",
  "u_tint",
  "u_exposure",
  "u_contrast",
  "u_highlights",
  "u_shadows",
  "u_whites",
  "u_blacks",
  "u_vibrance",
  "u_saturation",
  "u_clarity",
  "u_shadowTint",
  "u_highlightTint",
  "u_splitBalance",
  "u_vignetteAmount",
  "u_vignetteMidpoint",
  "u_vignetteFeather",
  ...Array.from({ length: 8 }, (_, i) => `u_hslHue[${i}]`),
  ...Array.from({ length: 8 }, (_, i) => `u_hslSat[${i}]`),
  ...Array.from({ length: 8 }, (_, i) => `u_hslLum[${i}]`),
] as const;

export class Pipeline {
  private gl: WebGL2RenderingContext;
  private quad: ReturnType<typeof createFullScreenQuad>;

  private gradingProgram: WebGLProgram;
  private gradingU: UniformMap;
  private lutProgram: WebGLProgram;
  private lutU: UniformMap;
  private copyProgram: WebGLProgram;
  private copyU: UniformMap;

  private imageTex: WebGLTexture | null = null;
  private imageW = 0;
  private imageH = 0;
  private curveTex: WebGLTexture;
  private lutTex: WebGLTexture | null = null;
  private intermediate: Framebuffer | null = null;
  private params: GradingParams = DEFAULT_PARAMS;

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", {
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
      antialias: false,
      alpha: true,
    });
    if (!gl) throw new Error("Pipeline: WebGL2 not supported in this browser");
    this.gl = gl;

    // Required for sampler3D + RGB16F.
    const colorFloat = gl.getExtension("EXT_color_buffer_float");
    if (!colorFloat) {
      // Not strictly fatal — RGB16F might still work as sampler-only.
      console.warn("EXT_color_buffer_float not available; LUT may be limited");
    }

    this.quad = createFullScreenQuad(gl);

    this.gradingProgram = linkProgram(gl, VERTEX_SHADER, GRADING_FRAG, "grading");
    this.gradingU = collectUniforms(gl, this.gradingProgram, GRADING_UNIFORM_NAMES);

    this.lutProgram = linkProgram(gl, VERTEX_SHADER, LUT_FRAG, "lut");
    this.lutU = collectUniforms(gl, this.lutProgram, ["u_image", "u_lut", "u_opacity"]);

    this.copyProgram = linkProgram(gl, VERTEX_SHADER, COPY_FRAG, "copy");
    this.copyU = collectUniforms(gl, this.copyProgram, ["u_image"]);

    this.curveTex = createCurveTexture(gl);
    updateCurveTexture(
      gl,
      this.curveTex,
      buildCurveLut(DEFAULT_PARAMS.curve.points),
    );
  }

  setImage(source: ImageSource) {
    const gl = this.gl;
    if (this.imageTex) gl.deleteTexture(this.imageTex);
    const { texture, width, height } = uploadImageTexture(gl, source);
    this.imageTex = texture;
    this.imageW = width;
    this.imageH = height;
    this.fitCanvas();
    this.allocIntermediate();
  }

  setLut(lut: CubeLut | null) {
    const gl = this.gl;
    if (this.lutTex) {
      gl.deleteTexture(this.lutTex);
      this.lutTex = null;
    }
    if (lut) this.lutTex = createLut3DTexture(gl, lut);
  }

  setParams(p: GradingParams) {
    this.params = p;
    updateCurveTexture(this.gl, this.curveTex, buildCurveLut(p.curve.points));
  }

  /** Render the current state to the canvas. Cheap to call per frame. */
  render() {
    if (!this.imageTex || !this.intermediate) return;
    const gl = this.gl;
    const { width: cw, height: ch } = gl.canvas as HTMLCanvasElement;

    // ── Pass 1: grading → intermediate FBO ───────────────────────
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.intermediate.fb);
    gl.viewport(0, 0, this.intermediate.width, this.intermediate.height);
    gl.useProgram(this.gradingProgram);
    this.bindGradingUniforms();
    gl.bindVertexArray(this.quad.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // ── Pass 2: LUT (if present) or copy → canvas ───────────────
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, cw, ch);
    if (this.lutTex && this.params.lutOpacity > 0.001) {
      gl.useProgram(this.lutProgram);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.intermediate.texture);
      if (this.lutU.u_image) gl.uniform1i(this.lutU.u_image, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_3D, this.lutTex);
      if (this.lutU.u_lut) gl.uniform1i(this.lutU.u_lut, 1);
      if (this.lutU.u_opacity) gl.uniform1f(this.lutU.u_opacity, this.params.lutOpacity);
    } else {
      gl.useProgram(this.copyProgram);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.intermediate.texture);
      if (this.copyU.u_image) gl.uniform1i(this.copyU.u_image, 0);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null);
  }

  /** Render the current state at full image resolution to an off-screen buffer, then encode. */
  async exportBlob(mime = "image/jpeg", quality = 0.95): Promise<Blob> {
    if (!this.imageTex) throw new Error("exportBlob: no image loaded");
    const gl = this.gl;

    const w = this.imageW;
    const h = this.imageH;
    const fb = createFramebuffer(gl, w, h);

    // Pass 1: grading → fb
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb.fb);
    gl.viewport(0, 0, w, h);
    gl.useProgram(this.gradingProgram);
    this.bindGradingUniforms(w, h);
    gl.bindVertexArray(this.quad.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // Pass 2: LUT or copy → second fb
    const fb2 = createFramebuffer(gl, w, h);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb2.fb);
    gl.viewport(0, 0, w, h);
    if (this.lutTex && this.params.lutOpacity > 0.001) {
      gl.useProgram(this.lutProgram);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, fb.texture);
      if (this.lutU.u_image) gl.uniform1i(this.lutU.u_image, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_3D, this.lutTex);
      if (this.lutU.u_lut) gl.uniform1i(this.lutU.u_lut, 1);
      if (this.lutU.u_opacity) gl.uniform1f(this.lutU.u_opacity, this.params.lutOpacity);
    } else {
      gl.useProgram(this.copyProgram);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, fb.texture);
      if (this.copyU.u_image) gl.uniform1i(this.copyU.u_image, 0);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null);

    // Read pixels & encode via OffscreenCanvas (handles flip + JPEG/PNG encode).
    const pixels = new Uint8Array(w * h * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb2.fb);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    disposeFramebuffer(gl, fb);
    disposeFramebuffer(gl, fb2);

    const off = new OffscreenCanvas(w, h);
    const ctx = off.getContext("2d");
    if (!ctx) throw new Error("exportBlob: 2d context unavailable");
    const imageData = ctx.createImageData(w, h);
    // WebGL stores y-flipped relative to ImageData → flip on copy.
    for (let y = 0; y < h; y++) {
      const src = (h - 1 - y) * w * 4;
      const dst = y * w * 4;
      imageData.data.set(pixels.subarray(src, src + w * 4), dst);
    }
    ctx.putImageData(imageData, 0, 0);
    return await off.convertToBlob({ type: mime, quality });
  }

  fitCanvas() {
    if (!this.imageW) return;
    const gl = this.gl;
    const canvas = gl.canvas as HTMLCanvasElement;
    const dpr = Math.min(window.devicePixelRatio ?? 1, 2);
    const cssRect = canvas.getBoundingClientRect();
    const cssW = Math.max(1, Math.round(cssRect.width));
    const cssH = Math.max(1, Math.round(cssRect.height));
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);

    // Intermediate FBO matches canvas backing store (display-res render).
    if (
      this.intermediate &&
      (this.intermediate.width !== canvas.width ||
        this.intermediate.height !== canvas.height)
    ) {
      disposeFramebuffer(gl, this.intermediate);
      this.intermediate = null;
    }
    this.allocIntermediate();
  }

  dispose() {
    const gl = this.gl;
    if (this.imageTex) gl.deleteTexture(this.imageTex);
    if (this.lutTex) gl.deleteTexture(this.lutTex);
    gl.deleteTexture(this.curveTex);
    if (this.intermediate) disposeFramebuffer(gl, this.intermediate);
    gl.deleteProgram(this.gradingProgram);
    gl.deleteProgram(this.lutProgram);
    gl.deleteProgram(this.copyProgram);
    gl.deleteVertexArray(this.quad.vao);
    gl.deleteBuffer(this.quad.vbo);
  }

  // ─────────────────────────────────────────────────────────────
  private allocIntermediate() {
    if (this.intermediate) return;
    const canvas = this.gl.canvas as HTMLCanvasElement;
    if (!canvas.width || !canvas.height) return;
    this.intermediate = createFramebuffer(this.gl, canvas.width, canvas.height);
  }

  private bindGradingUniforms(forceW?: number, forceH?: number) {
    const gl = this.gl;
    const u = this.gradingU;
    const uf = paramsToUniforms(this.params);
    const canvas = gl.canvas as HTMLCanvasElement;
    const w = forceW ?? canvas.width;
    const h = forceH ?? canvas.height;

    // Texture units
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.imageTex);
    if (u.u_image) gl.uniform1i(u.u_image, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.curveTex);
    if (u.u_curveLut) gl.uniform1i(u.u_curveLut, 1);

    if (u.u_resolution) gl.uniform2f(u.u_resolution, w, h);
    set1(u.u_temperature, uf.temperature);
    set1(u.u_tint, uf.tint);
    set1(u.u_exposure, uf.exposure);
    set1(u.u_contrast, uf.contrast);
    set1(u.u_highlights, uf.highlights);
    set1(u.u_shadows, uf.shadows);
    set1(u.u_whites, uf.whites);
    set1(u.u_blacks, uf.blacks);
    set1(u.u_vibrance, uf.vibrance);
    set1(u.u_saturation, uf.saturation);
    set1(u.u_clarity, uf.clarity);
    set1(u.u_splitBalance, uf.splitBalance);
    set1(u.u_vignetteAmount, uf.vignetteAmount);
    set1(u.u_vignetteMidpoint, uf.vignetteMidpoint);
    set1(u.u_vignetteFeather, uf.vignetteFeather);
    if (u.u_shadowTint) gl.uniform3fv(u.u_shadowTint, uf.shadowTint);
    if (u.u_highlightTint) gl.uniform3fv(u.u_highlightTint, uf.highlightTint);

    for (let i = 0; i < 8; i++) {
      set1(u[`u_hslHue[${i}]`], uf.hslHue[i]);
      set1(u[`u_hslSat[${i}]`], uf.hslSat[i]);
      set1(u[`u_hslLum[${i}]`], uf.hslLum[i]);
    }

    function set1(loc: WebGLUniformLocation | undefined, v: number) {
      if (loc) gl.uniform1f(loc, v);
    }
  }
}
