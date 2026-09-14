/// <reference types="@capacitor-firebase/authentication" />
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.mward.signallinglogbook',
  appName: 'Railway Signalling Logbook',
  webDir: 'dist',
  plugins: {
    FirebaseAuthentication: {
      // We sign in on the native layer AND mirror the credential into the
      // Firebase JS SDK (see AuthContext.tsx) so the rest of the app (which
      // uses onAuthStateChanged/Firestore from the JS SDK) keeps working
      // unchanged across Web, iOS, and Android.
      skipNativeAuth: false,
      providers: ['google.com']
    }
  }
};

export default config;
