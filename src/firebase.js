import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

// These values come from your Firebase project settings
// (Project settings → General → Your apps → SDK setup and configuration).
// They are safe to expose in client code — Firebase security is enforced
// by Firestore Rules (see firestore.rules), not by hiding these values.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
// Real, server-verified admin login (Firebase Authentication). The password
// is checked by Firebase's servers, never compared in the browser.
export const auth = getAuth(app);
// Note: product photos are uploaded to Cloudinary (see App.jsx), not Firebase
// Storage — so this project works on the free Firebase "Spark" plan too.

// Firebase Authentication always needs an identifier (email/phone/etc.)
// alongside the password — the login screen only shows a password box, so
// this fixed identifier is used behind the scenes. Set it in your .env file;
// you'll also enter this exact email when creating the admin user in
// Firebase Console → Authentication → Users.
export const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL || "admin@stepby.local";
