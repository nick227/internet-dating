export type EmbedProvider = 'youtube' | 'soundcloud';

export type EmbedInfo = {
  provider: EmbedProvider;
  url: string;
  thumbUrl?: string | null;
};

export function parseEmbedUrl(input: string): EmbedInfo | null {
  if (!input || typeof input !== 'string') return null;

  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    return null;
  }

  const host = parsed.hostname.replace(/^www\./, '').toLowerCase();

  if (host === 'youtu.be' || host.endsWith('youtube.com')) {
    const videoId = extractYoutubeId(parsed, host);
    if (!videoId) return null;
    return {
      provider: 'youtube',
      url: input,
      thumbUrl: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
    };
  }

  if (host === 'on.soundcloud.com' || host.endsWith('soundcloud.com')) {
    return { provider: 'soundcloud', url: input };
  }

  return null;
}

function extractYoutubeId(parsed: URL, host: string): string | null {
  if (host === 'youtu.be') {
    const id = parsed.pathname.split('/').filter(Boolean)[0];
    return id || null;
  }

  if (parsed.pathname === '/watch') {
    const id = parsed.searchParams.get('v');
    return id || null;
  }

  const pathParts = parsed.pathname.split('/').filter(Boolean);
  if (pathParts[0] === 'embed' && pathParts[1]) {
    return pathParts[1];
  }
  if (pathParts[0] === 'shorts' && pathParts[1]) {
    return pathParts[1];
  }

  return null;
}
