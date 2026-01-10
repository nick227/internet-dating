export type EmbedInfo = {
  type: 'youtube' | 'vimeo' | 'soundcloud' | 'spotify' | 'unknown';
  id: string;
  url: string;
  provider: 'youtube' | 'vimeo' | 'soundcloud' | 'spotify';
  embedUrl: string;
  thumbUrl?: string | null;
};

export function parseEmbedUrl(url: string): EmbedInfo | null {
  if (!url) return null;

  // YouTube
  const youtubeMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/);
  if (youtubeMatch) {
    const videoId = youtubeMatch[1];
    return {
      type: 'youtube',
      provider: 'youtube',
      id: videoId,
      url,
      embedUrl: `https://www.youtube.com/embed/${videoId}`,
      thumbUrl: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
    };
  }

  // Vimeo
  const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
  if (vimeoMatch) {
    const videoId = vimeoMatch[1];
    return {
      type: 'vimeo',
      provider: 'vimeo',
      id: videoId,
      url,
      embedUrl: `https://player.vimeo.com/video/${videoId}`,
      thumbUrl: null
    };
  }

  // SoundCloud
  if (url.includes('soundcloud.com')) {
    return {
      type: 'soundcloud',
      provider: 'soundcloud',
      id: url,
      url,
      embedUrl: `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}`,
      thumbUrl: null
    };
  }

  // Spotify
  const spotifyMatch = url.match(/spotify\.com\/track\/([^?\s]+)/);
  if (spotifyMatch) {
    const trackId = spotifyMatch[1];
    return {
      type: 'spotify',
      provider: 'spotify',
      id: trackId,
      url,
      embedUrl: `https://open.spotify.com/embed/track/${trackId}`,
      thumbUrl: null
    };
  }

  return null;
}
