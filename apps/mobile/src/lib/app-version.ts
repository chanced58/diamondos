import Constants from 'expo-constants';

/** The app's version from app.json, sent with every API call and error report. */
export const APP_VERSION: string | null = Constants.expoConfig?.version ?? null;
