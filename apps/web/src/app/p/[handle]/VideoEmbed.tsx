import type { JSX } from 'react';
import type { PlayerHighlightVideo, VideoProvider } from '@baseball/shared';

function safeParseHttpUrl(url: string): URL | null {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    return u;
  } catch {
    return null;
  }
}

function toEmbedUrl(url: string, provider: VideoProvider): string | null {
  const u = safeParseHttpUrl(url);
  if (!u) return null;

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
    if (u.pathname.includes('/embed')) return u.toString();
    return u.toString().replace('/v/', '/embed/v/');
  }
  return null;
}

export function VideoEmbed({ video }: { video: PlayerHighlightVideo }): JSX.Element {
  const embedUrl = toEmbedUrl(video.url, video.provider);
  // Gate the fallback link on the same protocol check so a bad URL can't
  // render as javascript: in the anchor href.
  const safeHref = safeParseHttpUrl(video.url)?.toString() ?? null;

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
        ) : safeHref ? (
          <a
            href={safeHref}
            target="_blank"
            rel="noreferrer"
            className="flex w-full h-full items-center justify-center text-white text-sm hover:underline"
          >
            Open video ↗
          </a>
        ) : (
          <div className="flex w-full h-full items-center justify-center text-white text-sm">
            Invalid video URL
          </div>
        )}
      </div>
      <div className="px-4 py-3">
        <p className="text-sm font-semibold text-gray-900">{video.title}</p>
        <p className="text-xs text-gray-400 uppercase mt-0.5">{video.provider}</p>
      </div>
    </div>
  );
}
