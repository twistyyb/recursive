import { useEffect } from 'react';

export function useApiInitialization() {
  useEffect(() => {
    const initApi = async () => {
      try {
        const response = await fetch(`${import.meta.env.VITE_API_URL}/api/health`);
        if (!response.ok) {
          console.error('API health check failed');
        }
      } catch (error) {
        console.error('Failed to initialize API:', error);
      }
    };

    initApi();
  }, []);
} 