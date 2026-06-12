// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore } from "firebase/firestore"; 
import { getAuth, GoogleAuthProvider } from "firebase/auth"; 

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBsHA-v7QaJDLA11KUXwkcnc4cD5qIsRKo",
  authDomain: "football67-f9e7f.firebaseapp.com",
  projectId: "football67-f9e7f",
  storageBucket: "football67-f9e7f.firebasestorage.app",
  messagingSenderId: "387632276252",
  appId: "1:387632276252:web:b5f3a352efcbec899350d9",
  measurementId: "G-LF3897Y4BS"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

// Initialize and export it
export const db = getFirestore(app); 
export const auth = getAuth(app); 

// Initialize and export Google Auth Provider
export const googleProvider = new GoogleAuthProvider();