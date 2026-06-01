import { ImageResponse } from 'next/og';
import { getLeagueHomeData } from '@/lib/league-home/load';

export const runtime = 'nodejs';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Og({ params }: { params: { slug: string } }) {
  // OG cards are public surfaces; load as an anonymous viewer. For signed-in-only
  // (blocked) or missing leagues, render a generic card so private league names
  // aren't exposed to social crawlers.
  const data = await getLeagueHomeData(params.slug, false);
  const isPublic = 'ok' in data;
  const name = isPublic ? data.league.name : 'Private League';
  const accent = isPublic ? data.theme.accentColor : '#1e90ff';
  const subtitle = isPublic ? 'Standings & League Leaders' : 'Sign in to view this league';

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
        <div style={{ fontSize: 28, fontWeight: 400, marginTop: 16 }}>{subtitle}</div>
      </div>
    ),
    { ...size },
  );
}
