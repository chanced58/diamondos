import { ImageResponse } from 'next/og';
import { getLeagueHomeData } from '@/lib/league-home/load';

export const runtime = 'nodejs';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Og({ params }: { params: { slug: string } }) {
  // OG cards are public surfaces; load as an anonymous viewer.
  const data = await getLeagueHomeData(params.slug, false);
  const name = 'ok' in data ? data.league.name : 'blocked' in data ? data.league.name : 'League';
  const accent = 'ok' in data ? data.theme.accentColor : '#1e90ff';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          background: accent,
          color: 'white',
          fontSize: 64,
          fontWeight: 700,
        }}
      >
        <div>{name}</div>
        <div style={{ fontSize: 28, fontWeight: 400, marginTop: 16 }}>Standings &amp; League Leaders</div>
      </div>
    ),
    { ...size },
  );
}
