// ==========================================
// FIREBASE INIT
// ==========================================
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

const firebaseConfig = {
    apiKey: "AIzaSyCorvioSpaceProductionKey2026",
    authDomain: "corvio-space-prod.firebaseapp.com",
    projectId: "corvio-space-prod",
    storageBucket: "corvio-space-prod.firebasestorage.app",
    messagingSenderId: "100000000001",
    appId: "1:100000000001:web:2f1d9de104ca6ed3f1c2fd",
    measurementId: "G-CORVIOSPACE"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
