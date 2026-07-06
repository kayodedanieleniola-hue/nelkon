import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth, GoogleAuthProvider } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const firebaseConfig = {
    apiKey: "AIzaSyDVeRtwzgErRsH_oMKrjKMPSdN-nFp9dYo",
    authDomain: "nakconel-3dfaa.firebaseapp.com",
    projectId: "nakconel-3dfaa",
    storageBucket: "nakconel-3dfaa.firebasestorage.app",
    messagingSenderId: "543244921514",
    appId: "1:543244921514:web:24ec97918c46af176b3ed3",
    measurementId: "G-WNPD1RRYDS"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
