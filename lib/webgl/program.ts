/**
 * Minimal WebGL2 program helpers — compile, link, locate uniforms safely.
 * Throws on failure with the GLSL log included so iteration is fast.
 */

export function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
  label: string,
): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error(`createShader(${label}) returned null`);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? "(no log)";
    gl.deleteShader(shader);
    throw new Error(`Shader compile failed (${label}):\n${log}`);
  }
  return shader;
}

export function linkProgram(
  gl: WebGL2RenderingContext,
  vertexSource: string,
  fragmentSource: string,
  label: string,
): WebGLProgram {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vertexSource, `${label}.vs`);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource, `${label}.fs`);
  const program = gl.createProgram();
  if (!program) throw new Error(`createProgram(${label}) returned null`);
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.bindAttribLocation(program, 0, "a_position");
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) ?? "(no log)";
    gl.deleteProgram(program);
    throw new Error(`Program link failed (${label}):\n${log}`);
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return program;
}

export type UniformMap = Record<string, WebGLUniformLocation>;

export function collectUniforms(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  names: readonly string[],
): UniformMap {
  const map: UniformMap = {};
  for (const name of names) {
    const loc = gl.getUniformLocation(program, name);
    // Some uniforms may be optimised away by the compiler when their value is unused.
    // Allow null; the setter will just no-op.
    if (loc !== null) map[name] = loc;
  }
  return map;
}

/** Allocates a unit quad VAO bound to attribute 0. Reused across all passes. */
export function createFullScreenQuad(gl: WebGL2RenderingContext) {
  const vao = gl.createVertexArray();
  const vbo = gl.createBuffer();
  if (!vao || !vbo) throw new Error("createFullScreenQuad: alloc failed");
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  // Two triangles covering [-1,1]^2.
  // prettier-ignore
  const verts = new Float32Array([
    -1, -1,  1, -1,  -1, 1,
    -1,  1,  1, -1,   1, 1,
  ]);
  gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  return { vao, vbo };
}
