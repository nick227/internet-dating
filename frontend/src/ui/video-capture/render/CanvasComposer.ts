import { GreenScreenShader } from './GreenScreenShader'

type CanvasComposerOptions = {
  width: number
  height: number
  backgroundColor: string
}

export class CanvasComposer {
  private canvas: HTMLCanvasElement
  private gl: WebGLRenderingContext
  private shader: GreenScreenShader
  private buffer: WebGLBuffer
  private texture: WebGLTexture
  private source: HTMLVideoElement | null = null
  private backgroundColor: string
  private backgroundRgb: [number, number, number]
  private keyColor: [number, number, number] = [0, 1, 0]
  private threshold = 0.35
  private rafId: number | null = null
  private destroyed = false

  constructor({ width, height, backgroundColor }: CanvasComposerOptions) {
    this.canvas = document.createElement('canvas')
    this.canvas.width = width
    this.canvas.height = height
    this.canvas.style.width = '100%'
    this.canvas.style.height = '100%'
    this.canvas.style.display = 'block'

    const gl = this.canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false })
    if (!gl) {
      throw new Error('WebGL unavailable')
    }
    this.gl = gl
    this.shader = new GreenScreenShader(gl)
    this.backgroundColor = backgroundColor
    this.backgroundRgb = CanvasComposer.parseColor(backgroundColor)

    const buffer = gl.createBuffer()
    if (!buffer) {
      throw new Error('Failed to create buffer')
    }
    this.buffer = buffer
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([
        -1, -1, 0, 0,
        1, -1, 1, 0,
        -1, 1, 0, 1,
        1, 1, 1, 1,
      ]),
      gl.STATIC_DRAW
    )

    const texture = gl.createTexture()
    if (!texture) {
      throw new Error('Failed to create texture')
    }
    this.texture = texture
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
  }

  getCanvas() {
    return this.canvas
  }

  setSource(video: HTMLVideoElement) {
    this.source = video
  }

  setBackgroundColor(color: string) {
    this.backgroundColor = color
    this.backgroundRgb = CanvasComposer.parseColor(color)
  }

  setThreshold(value: number) {
    this.threshold = value
  }

  setKeyColor(color: [number, number, number]) {
    this.keyColor = color
  }

  start() {
    if (this.rafId !== null) return
    const draw = () => {
      if (this.source && this.source.readyState >= 2) {
        const gl = this.gl
        gl.viewport(0, 0, this.canvas.width, this.canvas.height)
        gl.clearColor(this.backgroundRgb[0], this.backgroundRgb[1], this.backgroundRgb[2], 1)
        gl.clear(gl.COLOR_BUFFER_BIT)

        gl.bindTexture(gl.TEXTURE_2D, this.texture)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.source)
        this.shader.render({
          buffer: this.buffer,
          texture: this.texture,
          keyColor: this.keyColor,
          threshold: this.threshold,
        })
      }
      this.rafId = requestAnimationFrame(draw)
    }
    this.rafId = requestAnimationFrame(draw)
  }

  stop() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
  }

  getStream(fps = 30) {
    return this.canvas.captureStream(fps)
  }

  destroy() {
    this.stop()
    this.source = null
    if (this.destroyed) return
    this.destroyed = true
    this.shader.destroy()
    this.gl.deleteTexture(this.texture)
    this.gl.deleteBuffer(this.buffer)
  }

  private static parseColor(value: string): [number, number, number] {
    const hex = value.replace('#', '')
    if (hex.length === 6) {
      const r = parseInt(hex.slice(0, 2), 16) / 255
      const g = parseInt(hex.slice(2, 4), 16) / 255
      const b = parseInt(hex.slice(4, 6), 16) / 255
      return [r, g, b]
    }
    return [0, 0, 0]
  }
}
