import { NextResponse } from 'next/server';
import type { GameExport } from '@/lib/services/games/build-game-export';

/** A built export as a ZIP download. */
export function zipResponse(file: GameExport): NextResponse {
  return new NextResponse(file.content, {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${file.filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
