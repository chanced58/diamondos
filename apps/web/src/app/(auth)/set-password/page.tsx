import { redirect } from 'next/navigation';

/**
 * Password setup is no longer used — the app uses magic-link authentication only.
 * Redirect any stale bookmarks or cached links to the dashboard.
 */
export default function SetPasswordPage() {
  redirect('/dashboard');
}
