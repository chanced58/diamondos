import type { JSX } from 'react';
import type { PlayerHighlightVideo, VideoProvider } from '@baseball/shared';

function toEmbedUrl(url: string, provider: VideoProvider): string | null {
  try {
    const u = new URL(url);
    if (provider === 'youtube') {
      // youtu.be/VIDEO_ID | youtube.com/watch?v=VIDEO_ID | youtube.com/shorts/VIDEO_ID
      if (u.hostname.endsWith('youtu.be')) {
        const id = u.pathname.replace(/^\//, '');
        if (id) return `https://www.youtube.com/embed/${id}`;
      }
      const v = u.searchParams.get('v');
      if (v) return `https://www.youtube.com/embed/${v}`;
      const shortsMatch = u.pathname.match(/\/shorts\/([^/]+)/);
      if (shortsMatch) return `https://www.youtube.com/embed/${shortsMatch[1]}`;
    }
    if (provider === 'vimeo') {
      const idMatch = u.pathname.match(/\/(\d+)/);
      if (idMatch) return `https://player.vimeo.com/video/${idMatch[1]}`;
    }
    if (provider === 'hudl') {
      // Hudl's playable share URLs are already embeddable in an iframe via /embed.
      if (u.pathname.includes('/embed')) return url;
      return url.replace('/v/', '/embed/v/');
    }
  } catch {
    return null;
  }
  return null;
}

export function VideoEmbed({ video }: { video: PlayerHighlightVideo }): JSX.Element {
  const embedUrl = toEmbedUrl(video.url, video.provider);

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="aspect-video bg-black">
        {embedUrl ? (
          <iframe
            src={embedUrl}
            title={video.title}
            allowFullScreen
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            className="w-full h-full"
          />
        ) : (
          <a
            href={video.url}
            target="_blank"
            rel="noreferrer"
            className="flex w-full h-full items-center justify-center text-white text-sm hover:underline"
          >
            Open video ↗
          </a>
        )}
      </div>
      <div className="px-4 py-3">
        <p className="text-sm font-semibold text-gray-900">{video.title}</p>
        <p className="text-xs text-gray-400 uppercase mt-0.5">{video.provider}</p>
      </div>
    </div>
  );
}
