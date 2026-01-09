export type EmbedInfo = {
  type: 'youtube' | 'vimeo' | 'soundcloud' | 'spotify' | 'unknown';
  id: string;
  url: string;
};

export function parseEmbedUrl(url: string): EmbedInfo | null {
  if (!url) return null;

  // YouTube
  const youtubeMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/);
  if (youtubeMatch) {
    return {
      type: 'youtube',
      id: youtubeMatch[1],
      url
    };
  }

  // Vimeos URLS
  const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
  if (vimeoMatch) {
    return {
      type: 'vimeo',
      id: vimeoMatch[1],
      url
    };
  }

  // SoundCloud
  if (url.includes('soundcloud.com')) {
    return {
      type: 'soundcloud',
      id: url,
      url
    };
  }

  // Spotify
  const spotifyMatch = url.match(/spotify\.com\/track\/([^?\s]+)/);
  if (spotifyMatch) {
    return {
      type: 'spotify',
      id: spotifyMatch[1],
      url
    };
  }

  return null;
}
