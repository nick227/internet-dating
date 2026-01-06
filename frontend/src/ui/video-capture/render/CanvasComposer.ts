import {
  GreenScreenShader,
  GREENSCREEN_INNER_THRESHOLD,
  GREENSCREEN_KEY_COLOR,
  GREENSCREEN_LUMA_BOOST,
  GREENSCREEN_OUTER_THRESHOLD,
  GREENSCREEN_SPILL_STRENGTH,
} from './GreenScreenShader'

type CanvasComposerOptions = {
  width: number
  height: number
  backgroundColor: string
}

export enum GreenScreenQualityState {
  High = 'high',
  Medium = 'medium',
  Low = 'low',
}

const QUALITY_PRESETS: Record<GreenScreenQualityState, { long: number; short: number }> = {
  [GreenScreenQualityState.High]: { long: 720, short: 405 },
  [GreenScreenQualityState.Medium]: { long: 640, short: 360 },
  [GreenScreenQualityState.Low]: { long: 480, short: 270 },
}

export class CanvasComposer {
  private canvas: HTMLCanvasElement
  private gl: WebGLRenderingContext
  private shader!: GreenScreenShader
  private buffer!: WebGLBuffer
  private texture!: WebGLTexture
  private offscreen: HTMLCanvasElement
  private offscreenCtx: CanvasRenderingContext2D | null
  private source: HTMLVideoElement | null = null
  private backgroundRgb: [number, number, number]
  private keyColor: [number, number, number] = GREENSCREEN_KEY_COLOR
  private innerThreshold = GREENSCREEN_INNER_THRESHOLD
  private outerThreshold = GREENSCREEN_OUTER_THRESHOLD
  private spillStrength = GREENSCREEN_SPILL_STRENGTH
  private lumaBoost = GREENSCREEN_LUMA_BOOST
  private mirror = true
  private rafId: number | null = null
  private destroyed = false
  private contextLost = false
  private sourceWidth = 0
  private sourceHeight = 0
  private scaleX = 1
  private scaleY = 1
  private lastSourceTime = -1
  private frameCount = 0
  private lastFpsCheck = performance.now()
  private downgradeUntil = 0
  private qualityState: GreenScreenQualityState = GreenScreenQualityState.High
  private readonly handleContextLost: (event: Event) => void
  private readonly handleContextRestored: () => void

  constructor({ width, height, backgroundColor }: CanvasComposerOptions) {
    this.canvas = document.createElement('canvas')
    this.canvas.width = width
    this.canvas.height = height
    this.canvas.style.width = '100%'
    this.canvas.style.height = '100%'
    this.canvas.style.display = 'block'

    this.offscreen = document.createElement('canvas')
    this.offscreenCtx = this.offscreen.getContext('2d')

    const gl = this.canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true })
    if (!gl) {
      throw new Error('WebGL unavailable')
    }
    this.gl = gl
    this.backgroundRgb = CanvasComposer.parseColor(backgroundColor)

    this.handleContextLost = (event: Event) => {
      event.preventDefault()
      this.contextLost = true
      this.stop()
    }
    this.handleContextRestored = () => {
      if (this.destroyed) return
      this.contextLost = false
      this.initResources()
      if (this.source) {
        this.start()
      }
    }

    this.canvas.addEventListener('webglcontextlost', this.handleContextLost, false)
    this.canvas.addEventListener('webglcontextrestored', this.handleContextRestored, false)

    this.initResources()
  }

  getCanvas() {
    return this.canvas
  }

  setSource(video: HTMLVideoElement) {
    this.source = video
  }

  setBackgroundColor(color: string) {
    this.backgroundRgb = CanvasComposer.parseColor(color)
  }

  setThreshold(value: number) {
    this.innerThreshold = Math.max(0.01, value - 0.06)
    this.outerThreshold = Math.max(this.innerThreshold + 0.02, value + 0.06)
  }

  setKeyColor(color: [number, number, number]) {
    this.keyColor = color
  }

  setMirror(enabled: boolean) {
    this.mirror = enabled
  }

  downgradeQuality() {
    if (this.qualityState === GreenScreenQualityState.High) {
      this.qualityState = GreenScreenQualityState.Medium
    } else if (this.qualityState === GreenScreenQualityState.Medium) {
      this.qualityState = GreenScreenQualityState.Low
    }
    this.applyQuality()
  }

  getQualityState() {
    return this.qualityState
  }

  start() {
    if (this.rafId !== null) return
    const draw = () => {
      if (this.contextLost) {
        this.rafId = requestAnimationFrame(draw)
        return
      }
      if (document.hidden) {
        this.rafId = requestAnimationFrame(draw)
        return
      }
      if (this.source && this.source.readyState >= 2) {
        if (this.source.currentTime === this.lastSourceTime) {
          this.rafId = requestAnimationFrame(draw)
          return
        }
        this.lastSourceTime = this.source.currentTime
        this.updateSourceSize(this.source.videoWidth, this.source.videoHeight)
        if (this.offscreenCtx) {
          this.offscreenCtx.drawImage(this.source, 0, 0, this.offscreen.width, this.offscreen.height)
        }
        const gl = this.gl
        gl.viewport(0, 0, this.canvas.width, this.canvas.height)
        gl.clearColor(this.backgroundRgb[0], this.backgroundRgb[1], this.backgroundRgb[2], 1)
        gl.clear(gl.COLOR_BUFFER_BIT)

        gl.bindTexture(gl.TEXTURE_2D, this.texture)
        try {
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.offscreen)
        } catch {
          // Ignore transient texture update errors on mobile.
        }
        this.shader.render({
          buffer: this.buffer,
          texture: this.texture,
          keyColor: this.keyColor,
          innerThreshold: this.innerThreshold,
          outerThreshold: this.outerThreshold,
          spillStrength: this.spillStrength,
          lumaBoost: this.lumaBoost,
          mirror: this.mirror,
        })

        this.trackPerformance()
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
    this.canvas.removeEventListener('webglcontextlost', this.handleContextLost, false)
    this.canvas.removeEventListener('webglcontextrestored', this.handleContextRestored, false)
    if (!this.contextLost) {
      this.shader.destroy()
      this.gl.deleteTexture(this.texture)
      this.gl.deleteBuffer(this.buffer)
    }
  }

  private initResources() {
    const gl = this.gl
    this.shader = new GreenScreenShader(gl)
    this.sourceWidth = 0
    this.sourceHeight = 0

    const buffer = gl.createBuffer()
    if (!buffer) {
      throw new Error('Failed to create buffer')
    }
    this.buffer = buffer
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    this.updateQuad(this.canvas.width, this.canvas.height)

    const texture = gl.createTexture()
    if (!texture) {
      throw new Error('Failed to create texture')
    }
    this.texture = texture
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
  }

  private updateSourceSize(width: number, height: number) {
    if (!width || !height) return
    if (width === this.sourceWidth && height === this.sourceHeight) {
      this.applyQuality()
      return
    }
    this.sourceWidth = width
    this.sourceHeight = height
    this.canvas.width = width
    this.canvas.height = height
    this.applyQuality()
  }

  private updateQuad(canvasWidth: number, canvasHeight: number) {
    const gl = this.gl
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer)
    const sourceAspect = this.sourceWidth && this.sourceHeight
      ? this.sourceWidth / this.sourceHeight
      : canvasWidth / canvasHeight
    const canvasAspect = canvasWidth / canvasHeight
    let scaleX = 1
    let scaleY = 1
    if (sourceAspect > canvasAspect) {
      scaleY = canvasAspect / sourceAspect
    } else if (sourceAspect < canvasAspect) {
      scaleX = sourceAspect / canvasAspect
    }
    this.scaleX = scaleX
    this.scaleY = scaleY
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([
        -scaleX, -scaleY, 0, 0,
        scaleX, -scaleY, 1, 0,
        -scaleX, scaleY, 0, 1,
        scaleX, scaleY, 1, 1,
      ]),
      gl.STATIC_DRAW
    )
  }

  sampleKeyColor(normX: number, normY: number, radius = 2) {
    if (!this.offscreenCtx) return false
    const { x, y } = this.mapToSource(normX, normY)
    if (x === null || y === null) return false

    const startX = Math.max(0, Math.floor(x - radius))
    const startY = Math.max(0, Math.floor(y - radius))
    const endX = Math.min(this.offscreen.width - 1, Math.floor(x + radius))
    const endY = Math.min(this.offscreen.height - 1, Math.floor(y + radius))
    const width = Math.max(1, endX - startX + 1)
    const height = Math.max(1, endY - startY + 1)

    const data = this.offscreenCtx.getImageData(startX, startY, width, height).data
    let r = 0
    let g = 0
    let b = 0
    const count = data.length / 4
    for (let i = 0; i < data.length; i += 4) {
      r += data[i]
      g += data[i + 1]
      b += data[i + 2]
    }
    this.keyColor = [r / (255 * count), g / (255 * count), b / (255 * count)]
    return true
  }

  private mapToSource(normX: number, normY: number) {
    if (!this.sourceWidth || !this.sourceHeight) return { x: null, y: null }
    const canvasWidth = this.canvas.width
    const canvasHeight = this.canvas.height
    const viewWidth = canvasWidth * this.scaleX
    const viewHeight = canvasHeight * this.scaleY
    const offsetX = (canvasWidth - viewWidth) / 2
    const offsetY = (canvasHeight - viewHeight) / 2

    const px = normX * canvasWidth
    const py = normY * canvasHeight
    if (px < offsetX || px > offsetX + viewWidth || py < offsetY || py > offsetY + viewHeight) {
      return { x: null, y: null }
    }
    const relX = (px - offsetX) / viewWidth
    const relY = (py - offsetY) / viewHeight
    return {
      x: relX * this.offscreen.width,
      y: relY * this.offscreen.height,
    }
  }

  private trackPerformance() {
    this.frameCount += 1
    const now = performance.now()
    const elapsed = now - this.lastFpsCheck
    if (elapsed < 1000) return
    const fps = (this.frameCount * 1000) / elapsed
    this.frameCount = 0
    this.lastFpsCheck = now

    if (now < this.downgradeUntil) return
    if (fps < 22 && this.qualityState !== GreenScreenQualityState.Low) {
      this.downgradeQuality()
      this.downgradeUntil = now + 3000
    }
  }

  private applyQuality() {
    if (!this.sourceWidth || !this.sourceHeight) return
    const internal = this.getInternalSize(this.sourceWidth, this.sourceHeight)
    if (this.offscreen.width !== internal.width || this.offscreen.height !== internal.height) {
      this.offscreen.width = internal.width
      this.offscreen.height = internal.height
    }
    this.updateQuad(this.canvas.width, this.canvas.height)
  }

  private getInternalSize(width: number, height: number) {
    const preset = QUALITY_PRESETS[this.qualityState]
    const aspect = width / height
    if (aspect >= 1) {
      let outHeight = preset.short
      let outWidth = Math.round(outHeight * aspect)
      if (outWidth > preset.long) {
        const scale = preset.long / outWidth
        outWidth = preset.long
        outHeight = Math.round(outHeight * scale)
      }
      return { width: outWidth, height: outHeight }
    }
    let outWidth = preset.short
    let outHeight = Math.round(outWidth / aspect)
    if (outHeight > preset.long) {
      const scale = preset.long / outHeight
      outHeight = preset.long
      outWidth = Math.round(outWidth * scale)
    }
    return { width: outWidth, height: outHeight }
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
