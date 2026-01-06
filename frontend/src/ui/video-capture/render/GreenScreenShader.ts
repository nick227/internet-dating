type Color = [number, number, number]

export enum GreenScreenColorSpace {
  YUV = 'yuv',
}

export enum GreenScreenSpillMode {
  None = 'none',
  Basic = 'basic',
}

export const GREENSCREEN_KEY_COLOR: Color = [0, 1, 0]
export const GREENSCREEN_INNER_THRESHOLD = 0.12
export const GREENSCREEN_OUTER_THRESHOLD = 0.22
export const GREENSCREEN_SPILL_STRENGTH = 0.25
export const GREENSCREEN_LUMA_BOOST = 0.12
export const GREENSCREEN_COLOR_SPACE = GreenScreenColorSpace.YUV
export const GREENSCREEN_SPILL_MODE = GreenScreenSpillMode.Basic

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
  private innerThresholdLoc: WebGLUniformLocation
  private outerThresholdLoc: WebGLUniformLocation
  private spillStrengthLoc: WebGLUniformLocation
  private lumaBoostLoc: WebGLUniformLocation
  private mirrorLoc: WebGLUniformLocation

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
      uniform float u_innerThreshold;
      uniform float u_outerThreshold;
      uniform float u_spillStrength;
      uniform float u_lumaBoost;
      uniform float u_mirror;

      vec3 toLinear(vec3 c) {
        return pow(c, vec3(2.2));
      }

      vec3 toYuv(vec3 c) {
        float y = dot(c, vec3(0.299, 0.587, 0.114));
        float u = dot(c, vec3(-0.14713, -0.28886, 0.436));
        float v = dot(c, vec3(0.615, -0.51499, -0.10001));
        return vec3(y, u, v);
      }

      void main() {
        vec2 uv = v_texCoord;
        if (u_mirror > 0.5) {
          uv.x = 1.0 - uv.x;
        }
        vec4 sample = texture2D(u_texture, uv);
        vec3 color = toLinear(sample.rgb);
        vec3 key = toLinear(u_keyColor);

        vec3 colorYuv = toYuv(color);
        vec3 keyYuv = toYuv(key);
        float dist = distance(colorYuv.yz, keyYuv.yz);
        float alpha = smoothstep(u_innerThreshold, u_outerThreshold, dist);

        float spill = (1.0 - alpha) * u_spillStrength;
        vec3 spillFixed = color;
        spillFixed.g = max(0.0, spillFixed.g - spill);
        spillFixed = mix(spillFixed, vec3(colorYuv.x + u_lumaBoost), 0.08);
        vec3 outColor = spillFixed * alpha;
        gl_FragColor = vec4(outColor, alpha);
      }
      `
    )

    this.positionLoc = gl.getAttribLocation(this.program, 'a_position')
    this.texCoordLoc = gl.getAttribLocation(this.program, 'a_texCoord')
    const textureLoc = gl.getUniformLocation(this.program, 'u_texture')
    const keyColorLoc = gl.getUniformLocation(this.program, 'u_keyColor')
    const innerThresholdLoc = gl.getUniformLocation(this.program, 'u_innerThreshold')
    const outerThresholdLoc = gl.getUniformLocation(this.program, 'u_outerThreshold')
    const spillStrengthLoc = gl.getUniformLocation(this.program, 'u_spillStrength')
    const lumaBoostLoc = gl.getUniformLocation(this.program, 'u_lumaBoost')
    const mirrorLoc = gl.getUniformLocation(this.program, 'u_mirror')
    if (!textureLoc || !keyColorLoc || !innerThresholdLoc || !outerThresholdLoc || !spillStrengthLoc || !lumaBoostLoc || !mirrorLoc) {
      throw new Error('Shader uniforms missing')
    }
    this.textureLoc = textureLoc
    this.keyColorLoc = keyColorLoc
    this.innerThresholdLoc = innerThresholdLoc
    this.outerThresholdLoc = outerThresholdLoc
    this.spillStrengthLoc = spillStrengthLoc
    this.lumaBoostLoc = lumaBoostLoc
    this.mirrorLoc = mirrorLoc
  }

  destroy() {
    this.gl.deleteProgram(this.program)
  }

  render(params: {
    buffer: WebGLBuffer
    texture: WebGLTexture
    keyColor: Color
    innerThreshold: number
    outerThreshold: number
    spillStrength: number
    lumaBoost: number
    mirror: boolean
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
    gl.uniform1f(this.innerThresholdLoc, params.innerThreshold)
    gl.uniform1f(this.outerThresholdLoc, params.outerThreshold)
    gl.uniform1f(this.spillStrengthLoc, params.spillStrength)
    gl.uniform1f(this.lumaBoostLoc, params.lumaBoost)
    gl.uniform1f(this.mirrorLoc, params.mirror ? 1 : 0)

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }
}
