type Color = [number, number, number]

function compileShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)
  if (!shader) throw new Error('Failed to create shader')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const msg = gl.getShaderInfoLog(shader) || 'Shader compile failed'
    gl.deleteShader(shader)
    throw new Error(msg)
  }
  return shader
}

function createProgram(gl: WebGLRenderingContext, vert: string, frag: string) {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vert)
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, frag)
  const program = gl.createProgram()
  if (!program) throw new Error('Failed to create program')
  gl.attachShader(program, vs)
  gl.attachShader(program, fs)
  gl.linkProgram(program)
  gl.deleteShader(vs)
  gl.deleteShader(fs)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const msg = gl.getProgramInfoLog(program) || 'Program link failed'
    gl.deleteProgram(program)
    throw new Error(msg)
  }
  return program
}

export class GreenScreenShader {
  private gl: WebGLRenderingContext
  private program: WebGLProgram
  private positionLoc: number
  private texCoordLoc: number
  private textureLoc: WebGLUniformLocation
  private keyColorLoc: WebGLUniformLocation
  private thresholdLoc: WebGLUniformLocation

  constructor(gl: WebGLRenderingContext) {
    this.gl = gl
    this.program = createProgram(
      gl,
      `
      attribute vec2 a_position;
      attribute vec2 a_texCoord;
      varying vec2 v_texCoord;
      void main() {
        v_texCoord = a_texCoord;
        gl_Position = vec4(a_position, 0.0, 1.0);
      }
      `,
      `
      precision mediump float;
      varying vec2 v_texCoord;
      uniform sampler2D u_texture;
      uniform vec3 u_keyColor;
      uniform float u_threshold;

      vec3 toLinear(vec3 c) {
        return pow(c, vec3(2.2));
      }

      void main() {
        vec4 sample = texture2D(u_texture, v_texCoord);
        vec3 color = toLinear(sample.rgb);
        vec3 key = toLinear(u_keyColor);
        float dist = distance(color, key);
        float alpha = step(u_threshold, dist);
        gl_FragColor = vec4(sample.rgb, alpha);
      }
      `
    )

    this.positionLoc = gl.getAttribLocation(this.program, 'a_position')
    this.texCoordLoc = gl.getAttribLocation(this.program, 'a_texCoord')
    const textureLoc = gl.getUniformLocation(this.program, 'u_texture')
    const keyColorLoc = gl.getUniformLocation(this.program, 'u_keyColor')
    const thresholdLoc = gl.getUniformLocation(this.program, 'u_threshold')
    if (!textureLoc || !keyColorLoc || !thresholdLoc) {
      throw new Error('Shader uniforms missing')
    }
    this.textureLoc = textureLoc
    this.keyColorLoc = keyColorLoc
    this.thresholdLoc = thresholdLoc
  }

  destroy() {
    this.gl.deleteProgram(this.program)
  }

  render(params: {
    buffer: WebGLBuffer
    texture: WebGLTexture
    keyColor: Color
    threshold: number
  }) {
    const { gl } = this
    gl.useProgram(this.program)
    gl.bindBuffer(gl.ARRAY_BUFFER, params.buffer)
    gl.enableVertexAttribArray(this.positionLoc)
    gl.enableVertexAttribArray(this.texCoordLoc)
    gl.vertexAttribPointer(this.positionLoc, 2, gl.FLOAT, false, 16, 0)
    gl.vertexAttribPointer(this.texCoordLoc, 2, gl.FLOAT, false, 16, 8)

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, params.texture)
    gl.uniform1i(this.textureLoc, 0)
    gl.uniform3f(this.keyColorLoc, params.keyColor[0], params.keyColor[1], params.keyColor[2])
    gl.uniform1f(this.thresholdLoc, params.threshold)

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }
}
