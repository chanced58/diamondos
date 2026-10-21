import * as Linking from 'expo-linking';

/**
 * Links to pages that exist on the web app but not (yet) in the app.
 * Opens in the system browser; returns false when this build has no
 * `EXPO_PUBLIC_API_BASE_URL` to link to.
 */
export function webUrl(path: string, baseUrl = process.env.EXPO_PUBLIC_API_BASE_URL): string | null {
  const base = baseUrl?.trim().replace(/\/+$/, '');
  return base ? `${base}${path.startsWith('/') ? path : `/${path}`}` : null;
}

export async function openOnWeb(path: string): Promise<boolean> {
  const url = webUrl(path);
  if (!url) return false;
  try {
    await Linking.openURL(url);
    return true;
  } catch (err) {
    console.warn(`web-links: could not open ${url}`, err);
    return false;
  }
}
