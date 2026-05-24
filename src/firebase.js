import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";


const firebaseConfig = {
  apiKey: "AIzaSyBq_1YKH4Hf4M65qMHirvWCD_-tyqCDz5E",
  authDomain: "ramit-7e364.firebaseapp.com",
  projectId: "ramit-7e364",
  storageBucket: "ramit-7e364.firebasestorage.app",
  messagingSenderId: "1036691345731",
  appId: "1:1036691345731:web:df8121852c6137e3b35ff6",
  measurementId: "G-99Y1VSYHJG"
};

const app = initializeApp(firebaseConfig);

// ✅ FIX AUTH
export const auth = getAuth(app);

// ✅ FIX DB (THIS FIXES YOUR ERROR)
export const db = getFirestore(app);