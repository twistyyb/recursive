import { useState, useEffect } from 'react';
import styled from 'styled-components';

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

const Container = styled.div`
  margin-top: 16px;
  padding: 12px;
  border: 2px solid #e5e7eb;
  border-radius: 4px;
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
`;

const Title = styled.h2`
  font-size: 20px;
  font-weight: bold;
`;

const RefreshButton = styled.button`
  padding: 4px 12px;
  font-size: 14px;
  background-color: #3b82f6;
  color: white;
  border-radius: 4px;
  border: none;
  cursor: pointer;
  transition: background-color 0.2s;

  &:hover {
    background-color: #2563eb;
  }
`;

const ResponseCard = styled.div`
  border: 1px solid #e5e7eb;
  border-radius: 4px;
  padding: 8px;
  margin-bottom: 16px;
`;

const ResponseHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 14px;
  margin-bottom: 8px;
`;

const LeftHeaderSection = styled.div`
  display: flex;
  align-items: center;
`;

const PhoneText = styled.span`
  font-weight: 500;
`;

const DateText = styled.span`
  color: #6B7280;
  font-size: 12px;
  margin-left: 8px;
`;

const StatusText = styled.span<{ $complete: boolean }>`
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 12px;
  background-color: ${props => props.$complete ? '#10B981' : '#F59E0B'};
  color: white;
`;

const ResponseItem = styled.div`
  background-color: #f9fafb;
  padding: 8px;
  border-radius: 4px;
  font-size: 14px;
  margin-bottom: 8px;
`;

const Question = styled.p`
  font-weight: 500;
`;

const Transcription = styled.p`
  color: #4b5563;
  font-size: 12px;
  margin-top: 2px;
`;

const DeleteText = styled.span`
  color: #EF4444;
  text-decoration: underline;
  cursor: pointer;
  font-size: 12px;
  margin-left: 8px;

  &:hover {
    color: #DC2626;
  }
`;

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

  const formatDateTime = (responseId: string) => {
    const dateString = responseId.replace('survey', '');
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const deleteResponse = async (responseId: string) => {
    try {
      const response = await fetch(`http://localhost:3000/api/delete-response`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          responseId: responseId
        })
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      setDoRefresh(prev => !prev);
    } catch (error) {
      console.error('Error deleting response:', error);
      setError(error instanceof Error ? error.message : 'Failed to delete response');
    }
  };

  if (isLoading) {
    return <Container>Loading responses...</Container>;
  }

  if (error) {
    return <Container style={{ color: '#EF4444' }}>Error: {error}</Container>;
  }

  return (
    <Container>
      <Header>
        <Title>Responses</Title>
        <RefreshButton onClick={() => setDoRefresh(prev => !prev)}>
          Refresh
        </RefreshButton>
      </Header>
      
      {responses.length === 0 ? (
        <p style={{ color: '#6B7280' }}>No responses yet.</p>
      ) : (
        <div>
          {responses.map((response) => (
            <ResponseCard key={response.responseId}>
              <ResponseHeader>
                <LeftHeaderSection>
                  <PhoneText>Survey outbound to {response.phone}</PhoneText>
                  <DateText>{formatDateTime(response.responseId)}</DateText>
                  <DeleteText onClick={() => deleteResponse(response.responseId)}>
                    delete
                  </DeleteText>
                </LeftHeaderSection>
                <StatusText $complete={response.complete}>
                  {response.complete ? 'complete' : 'in progress'}
                </StatusText>
              </ResponseHeader>
              
              <div>
                {response.responses?.map((resp, index) => (
                  <ResponseItem key={index}>
                    <Question>{index + 1}. {resp.text}</Question>
                    {resp.transcription && (
                      <Transcription>"{resp.transcription}"</Transcription>
                    )}
                  </ResponseItem>
                ))}
              </div>
            </ResponseCard>
          ))}
        </div>
      )}
    </Container>
  );
} 