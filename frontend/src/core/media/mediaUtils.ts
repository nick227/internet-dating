import type { MediaType } from '../../api/types'
import { parseEmbedUrl } from './embedMedia'

export function isVideoUrl(url: string): boolean {
  return /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(url)
}

export function isAudioUrl(url: string): boolean {
  return /\.(mp3|wav|ogg|m4a|aac)(\?|#|$)/i.test(url)
}

export function toMediaType(type: MediaType | undefined, url: string): MediaType {
  if (type) return type
  if (parseEmbedUrl(url)) return 'EMBED'
  if (isVideoUrl(url)) return 'VIDEO'
  if (isAudioUrl(url)) return 'AUDIO'
  return 'IMAGE'
}
