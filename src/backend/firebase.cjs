// Import the functions you need from the SDKs you need
const { initializeApp } = require('firebase/app');
const { getFirestore, collection, query, where, limit, getDocs, addDoc, setDoc, getDoc, doc, updateDoc } = require('firebase/firestore');
const { getAuth } = require('firebase/auth');
require('dotenv').config();  // Add this if not already present
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID
};

// Add error handling for initialization
try {
    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const db = getFirestore(app);
    
    console.log('Firebase initialized successfully');  // Debug log
    
    module.exports = {
        db,
        collection,
        query,
        where,
        limit,
        getDocs,
        addDoc,
        setDoc,
        doc,
        updateDoc,
        getDoc,
        app
    };
} catch (error) {
    console.error('Firebase initialization error:', error);
    throw error;
}
