export type LinkPreview = {
  url: string
  title?: string
  description?: string
  image?: string
  siteName?: string
  type: 'youtube' | 'image' | 'website'
}

export async function fetchLinkPreview(url: string, signal?: AbortSignal): Promise<LinkPreview | null> {
  try {
    if (signal?.aborted) return null
    const parsed = new URL(url)
    const host = parsed.hostname.replace(/^www\./, '')

    // YouTube handling
    if (host === 'youtube.com' || host === 'youtu.be') {
      const videoId = host === 'youtu.be' ? parsed.pathname.slice(1) : parsed.searchParams.get('v')
      if (videoId) {
        if (signal?.aborted) return null
        return {
          url,
          title: 'YouTube Video',
          type: 'youtube',
          image: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
          siteName: 'YouTube',
        }
      }
    }

    // Image URL handling
    const ext = parsed.pathname.split('.').pop()?.toLowerCase()
    if (ext && ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
      if (signal?.aborted) return null
      return {
        url,
        type: 'image',
        image: url,
      }
    }

    // Try to fetch OpenGraph data (CORS may block, so this is best-effort)
    try {
      // In a real implementation, you'd use a backend proxy to fetch OpenGraph data
      // For now, return basic website type
      return {
        url,
        type: 'website',
        siteName: host,
      }
    } catch {
      if (signal?.aborted) return null
      return {
        url,
        type: 'website',
        siteName: host,
      }
    }
  } catch {
    return null
  }
}
