// src/components/Login.js
import { useEffect, useState } from "react";
import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User } from "firebase/auth";
import { auth } from "../backend/firebase.cjs";

const Login = () => {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setUser(user);
      } else {
        setUser(null);
      }
    });

    return () => unsubscribe();
  }, []);

  const handleGoogleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      console.log("Logged in user:", user);
    } catch (error) {
      console.error("Error during login:", error);
    }
  };

  return (
    <div style={{border: '1px solid black', padding: '10px'}}>
      <h1>Login</h1>
      {user ? (
        <div>
          <p>Welcome, {user.displayName}!</p>
        </div>
      ) : (
        <button onClick={handleGoogleLogin}>Sign in with Google</button>
      )}
    </div>
  );
};

export default Login;