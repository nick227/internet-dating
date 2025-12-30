// Global video playback manager to limit simultaneous playback
class VideoPlaybackManager {
  private activeVideo: HTMLVideoElement | null = null
  private autoplayEnabled = true

  setAutoplayEnabled(enabled: boolean) {
    this.autoplayEnabled = enabled
  }

  requestPlay(video: HTMLVideoElement): boolean {
    if (!this.autoplayEnabled) return false

    // Pause currently active video
    if (this.activeVideo && this.activeVideo !== video && !this.activeVideo.paused) {
      this.activeVideo.pause()
    }

    this.activeVideo = video
    return true
  }

  release(video: HTMLVideoElement) {
    if (this.activeVideo === video) {
      this.activeVideo = null
    }
  }

  pauseAll() {
    if (this.activeVideo && !this.activeVideo.paused) {
      this.activeVideo.pause()
    }
    this.activeVideo = null
  }
}

export const videoPlaybackManager = new VideoPlaybackManager()
