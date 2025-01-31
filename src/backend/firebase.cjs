// Import the functions you need from the SDKs you need
const { initializeApp } = require('firebase/app');
const { getFirestore, collection, query, where, limit, getDocs, addDoc, doc, updateDoc } = require('firebase/firestore');
const { getAuth } = require('firebase/auth');
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional

const firebaseConfig = {
  apiKey: "AIzaSyCR1bKXTVY7KhMFZ-eVE7rkEr5tvj4JAIc",
  authDomain: "recursivefb.firebaseapp.com",
  projectId: "recursivefb",
  storageBucket: "recursivefb.firebasestorage.app",
  messagingSenderId: "353647296474",
  appId: "1:353647296474:web:4db5a055c81f1592f70ae3",
  measurementId: "G-X4WLKE93H3"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Export both the db instance and Firestore methods
module.exports = {
    db,
    collection,
    query,
    where,
    limit,
    getDocs,
    addDoc,
    doc,
    updateDoc
};
