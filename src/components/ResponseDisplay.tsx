import { useState, useEffect } from 'react';

interface Response {
  answer: string;
  text: string;
  transcription?: string;
}

interface SurveyResponseData {
  responseId: string;
  phone: string;
  complete: boolean;
  responses: Response[];
  survey: string[];
}

export function ResponseDisplay() {
  const [responses, setResponses] = useState<SurveyResponseData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [doRefresh, setDoRefresh] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    const fetchResponses = async () => {
      try {
        setIsLoading(true);
        const response = await fetch('http://localhost:3000/api/survey-responses');
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        setResponses(Array.isArray(data) ? data : []);
        setError(null);
      } catch (error) {
        console.error('Error fetching responses:', error);
        setError(error instanceof Error ? error.message : 'Failed to fetch responses');
        setResponses([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchResponses();
  }, [doRefresh]);

  if (isLoading) {
    return <div className="mt-4 p-3 border-2 border-gray-200 rounded">Loading responses...</div>;
  }

  if (error) {
    return <div className="mt-4 p-3 border-2 border-gray-200 rounded text-red-500">Error: {error}</div>;
  }

  return (
    <div className="mt-4 p-3 border-2 border-gray-200 rounded">
      <div className="flex justify-between items-center mb-3">
        <h2 className="text-xl font-bold">Responses</h2>
        <button
          onClick={() => setDoRefresh(prev => !prev)}
          className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
        >
          Refresh
        </button>
      </div>
      
      {responses.length === 0 ? (
        <p className="text-gray-500">No responses yet.</p>
      ) : (
        <div className="space-y-4">
          {responses.slice(-1).map((response) => (
            <div key={response.responseId} className="border border-gray-200 rounded p-2">
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="font-medium">{response.phone}</span>


                <span className={`px-1.5 py-0.5 rounded text-xs ${
                  response.complete ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                }`}>
                  {response.complete ? 'Complete' : 'In Progress'}
                </span>
              </div>
              
              <div className="space-y-2">
                {response.responses?.map((resp, index) => (
                  <div key={index} className="bg-gray-50 p-2 rounded text-sm">
                    <div className="flex gap-2">
                      <span className="font-medium w-6 text-right">{index + 1}.</span>
                      <div className="flex-1">
                        <p className="font-medium">{resp.text}</p>
                        {resp.transcription && (
                          <p className="text-gray-600 text-xs mt-0.5">"{resp.transcription}"</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
} 