import { useEffect, useState } from "react";
import { GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import { auth } from "../backend/firebase";
import styled from 'styled-components';

// Define the user data structure
interface UserData {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

const LoginContainer = styled.div`
  position: absolute;
  top: 1rem;
  right: 1rem;
  padding: 1rem;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  background-color: white;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  min-width: 200px;
`;

const UserInfo = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  width: 100%;
`;

const UserProfile = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

const ProfilePhoto = styled.img`
  width: 24px;
  height: 24px;
  border-radius: 50%;
  object-fit: cover;
`;

const WelcomeText = styled.p`
  margin: 0;
  font-size: 0.875rem;
  font-weight: 500;
  color: #374151;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 150px;
`;

const Button = styled.button`
  background-color: #3b82f6;
  color: white;
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 0.375rem;
  cursor: pointer;
  font-size: 0.875rem;
  transition: background-color 0.2s;
  white-space: nowrap;

  &:hover {
    background-color: #2563eb;
  }

  &:focus {
    outline: none;
    ring: 2px;
    ring-offset: 2px;
    ring-blue-500;
  }
`;

const LoadingText = styled.div`
  color: #6b7280;
  font-size: 0.875rem;
  text-align: center;
`;

const Login = () => {
  const [user, setUser] = useState<UserData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Check localStorage first
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      setUser(JSON.parse(storedUser) as UserData);
      setIsLoading(false);
    }

    // Set up auth state listener
    const unsubscribe = auth.onAuthStateChanged((firebaseUser) => {
      if (firebaseUser) {
        const userData: UserData = {
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName,
          photoURL: firebaseUser.photoURL
        };
        setUser(userData);
        localStorage.setItem('user', JSON.stringify(userData));
      } else if (!storedUser) {
        setUser(null);
        localStorage.removeItem('user');
      }
      setIsLoading(false);
    }, (error) => {
      console.error("Auth state error:", error);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      
      if (result.user) {
        const token = await result.user.getIdToken();
        const userData: UserData = {
          uid: result.user.uid,
          email: result.user.email,
          displayName: result.user.displayName,
          photoURL: result.user.photoURL
        };

        try {
          const response = await fetch(`${import.meta.env.VITE_API_URL}/auth/verify`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            credentials: 'include',
            body: JSON.stringify({ token, user: userData })
          });

          const data = await response.json();
          if (data.success && data.user) {
            setUser(data.user);
            localStorage.setItem('user', JSON.stringify(data.user));
            setError(null);
          }
        } catch (error) {
          console.warn("Non-critical error during verification:", error);
        }
      }
    } catch (error) {
      console.error("Login error:", error);
      setError(error instanceof Error ? error.message : 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    setIsLoading(true);
    try {
      await signOut(auth);
      setUser(null);
      localStorage.removeItem('user');
      setError(null);
    } catch (error) {
      console.error("Logout error:", error);
      setError(error instanceof Error ? error.message : 'Logout failed');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <LoginContainer>
        <LoadingText>Loading...</LoadingText>
      </LoginContainer>
    );
  }

  return (
    <LoginContainer>
      {error && (
        <div style={{ color: 'red', marginBottom: '0.5rem', fontSize: '0.875rem' }}>
          {error}
        </div>
      )}
      {user ? (
        <UserInfo>
          <UserProfile>
            {user.photoURL && <ProfilePhoto src={user.photoURL} alt={user.displayName || 'User'} />}
            <WelcomeText>{user.displayName}</WelcomeText>
          </UserProfile>
          <Button onClick={handleLogout}>Sign Out</Button>
        </UserInfo>
      ) : (
        <Button onClick={handleGoogleLogin}>Sign in with Google</Button>
      )}
    </LoginContainer>
  );
};

export default Login;