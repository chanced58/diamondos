export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || process.env.NODE_ENV !== 'production') return;

  try {
    const { findMissingEnv, REQUIRED_ENV, RECOMMENDED_ENV } = await import('./lib/env/required-env');

    const missing = findMissingEnv(process.env, REQUIRED_ENV);
    if (missing.length > 0) {
      const { reportError } = await import('./lib/errors/report-error');
      reportError('config', 'Missing required environment variables', { details: { missing } });
    }

    const missingRecommended = findMissingEnv(process.env, RECOMMENDED_ENV);
    if (missingRecommended.length > 0) {
      console.warn(`Missing recommended environment variables: ${missingRecommended.join(', ')}`);
    }
  } catch (error) {
    console.error('Startup configuration check failed', error);
  }
}
