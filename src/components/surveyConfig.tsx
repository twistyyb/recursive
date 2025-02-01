import { useEffect, useState } from 'react'
import { phone, PhoneResult } from 'phone'
import styled from 'styled-components'

// Add styled components definitions
const Container = styled.div`
  padding: 1rem;
  border: 4px solid #d1d5db;
  border-radius: 0.5rem;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
`

const Title = styled.h1`
  font-size: 1.5rem;
  font-weight: bold;
  margin-bottom: 1rem;
`

const Form = styled.form`
  margin-bottom: 1.5rem;
`

const InputGroup = styled.div`
  display: flex;
  gap: 0.5rem;
`

const Input = styled.input`
  flex: 1;
  padding: 0.5rem;
  border: 1px solid #d1d5db;
  border-radius: 0.25rem;
`

const Button = styled.button`
  background-color: #3b82f6;
  color: white;
  padding: 0.5rem 1rem;
  border-radius: 0.25rem;
  border: none;
  cursor: pointer;

  &:hover {
    background-color: #2563eb;
  }

  &:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }
`

const QuestionsList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`

const QuestionItem = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
`

const QuestionContent = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex: 1;
`

const QuestionNumber = styled.span`
  font-weight: bold;
  min-width: 2rem;
  text-align: right;
  font-size: 1.125rem;
`

const QuestionText = styled.span`
  font-size: 1.125rem;
`

const ButtonGroup = styled.div`
  display: flex;
  gap: 0.25rem;
  margin-left: 1rem;
`

const IconButton = styled.button<{ $isDisabled?: boolean }>`
  padding: 4px 8px;
  color: ${props => props.$isDisabled ? '#9ca3af' : '#3b82f6'};
  cursor: ${props => props.$isDisabled ? 'not-allowed' : 'pointer'};

  &:hover {
    color: ${props => props.$isDisabled ? '#9ca3af' : '#2563eb'};
  }
`

const DeleteButton = styled.button`
  color: #ef4444;
  padding: 0.25rem 0.5rem;
  font-size: 0.875rem;

  &:hover {
    color: #dc2626;
  }
`

const PhoneInput = styled(Input)<{ $isValid?: boolean }>`
  margin-right: 16px;
  border-color: ${props => props.$isValid ? '#4CAF50' : '#ccc'};
  height: 38px;
  box-sizing: border-box;
  padding: 8px 16px;
  width: calc(33.33% - 16px);
`

const CallButton = styled(Button)`
  width: 66.66%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding: 8px 16px;
  min-width: 200px;
  max-width: 66.66%;
`

const ErrorMessage = styled.p`
  color: #ff4444;
  font-size: 0.8em;
  margin-top: 0.5rem;
`

const StatusMessage = styled.p<{ $isError?: boolean }>`
  margin-top: 16px;
  color: ${props => props.$isError ? '#ff4444' : '#4CAF50'};
`

const PhoneInputGroup = styled.div`
  display: flex;
  align-items: center;
  margin-top: 16px;
  width: 100%;
`

export function SurveyConfig() {
  const [callStatus, setCallStatus] = useState<string>('')
  const [isLoading, setIsLoading] = useState(false)
  const [phoneNumber, setPhoneNumber] = useState('')
  const [validatedPhone, setValidatedPhone] = useState<PhoneResult | null>(phone('7473347145'))
  const [isCallActive, setIsCallActive] = useState(false)
  const [callSid, setCallSid] = useState<string | null>(null)
  const [questions, setQuestions] = useState<string[]>([]);
  const [newQuestion, setNewQuestion] = useState('');

  const handleAddQuestion = (e: React.FormEvent) => {
    e.preventDefault();
    if (newQuestion.trim()) {
      const updatedQuestions = [...questions, newQuestion.trim()];
      setQuestions(updatedQuestions);
      setNewQuestion('');
      console.log(updatedQuestions);
    }
  };

  const handleRemoveQuestion = (index: number) => {
    const updatedQuestions = questions.filter((_, i) => i !== index);
    setQuestions(updatedQuestions);
    console.log(updatedQuestions);
  };

  const handleMoveQuestion = (index: number, direction: 'up' | 'down') => {
    const newQuestions = [...questions];
    if (direction === 'up' && index > 0) {
      [newQuestions[index], newQuestions[index - 1]] = [newQuestions[index - 1], newQuestions[index]];
    } else if (direction === 'down' && index < questions.length - 1) {
      [newQuestions[index], newQuestions[index + 1]] = [newQuestions[index + 1], newQuestions[index]];
    }
    setQuestions(newQuestions);
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target.value
    setPhoneNumber(input)
    
    // Validate phone number
    const result = phone(input)
    setValidatedPhone(result.isValid ? result : null)
  }

  const handleCreateCall = async (number: string) => {
    setIsLoading(true)
    setCallStatus('Initiating call...')

    try {
      console.log('Making POST request to create call:', {
        phone: number,
        survey: questions,
        endpoint: 'http://localhost:3000/api/create-call'
      });
      const response = await fetch('http://localhost:3000/api/create-call', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phone: number,
          survey: questions,
        })
      })
     

      const data = await response.json()
     
      if (data.success) {
        setCallStatus(`Call created successfully! SID: ${data.callSid}`)
        setIsCallActive(true)
        setCallSid(data.callSid)
        console.log('Call created:', data.callSid)
      } else {
        setCallStatus(`Failed to create call: ${data.error}`)
        console.error('Call creation failed:', data.error)
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
      setCallStatus(`Error: ${errorMessage}`)
      console.error('Error creating call:', error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    let statusInterval: NodeJS.Timeout;

    if (isCallActive && callSid) {
      const checkCallStatus = async () => {
        try {
          const response = await fetch(`http://localhost:3000/api/status-callback?callSid=${callSid}`, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
            }
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to fetch call status');
          }

          const data = await response.json();
          if (data.status) {
            setCallStatus(`Call status: ${data.status}`);
            console.log('Status update:', data.status);
            
            const finalStates = ['completed', 'failed', 'busy', 'no-answer', 'canceled'];
            if (finalStates.includes(data.status.toLowerCase())) {
              setIsCallActive(false);
              setCallSid(null);
              clearInterval(statusInterval);
            }
          }
        } catch (error) {
          console.error('Error checking call status:', error);
          setCallStatus(`Error: ${error instanceof Error ? error.message : 'Failed to check call status'}`);
          setIsCallActive(false);
          setCallSid(null);
          clearInterval(statusInterval);
        }
      };

      statusInterval = setInterval(checkCallStatus, 2000);
      checkCallStatus();
    }

    return () => {
      if (statusInterval) {
        clearInterval(statusInterval);
      }
    };
  }, [isCallActive, callSid]);


  return (
    <Container>
      <Title>Survey Configuration</Title>
      
      <Form onSubmit={handleAddQuestion}>
        <InputGroup>
          <Input
            type="text"
            value={newQuestion}
            onChange={(e) => setNewQuestion(e.target.value)}
            placeholder="Enter a survey question..."
          />
          <Button type="submit">
            Add Question
          </Button>
        </InputGroup>
      </Form>

      <QuestionsList>
        {questions.map((question, index) => (
          <QuestionItem key={index}>
            <QuestionContent>
              <QuestionNumber>{index + 1}.</QuestionNumber>
              <QuestionText>{question}</QuestionText>
            </QuestionContent>
            <ButtonGroup>
              <IconButton
                onClick={() => handleMoveQuestion(index, 'up')}
                $isDisabled={index === 0}
                disabled={index === 0}
              >
                ↑
              </IconButton>
              <IconButton
                onClick={() => handleMoveQuestion(index, 'down')}
                $isDisabled={index === questions.length - 1}
                disabled={index === questions.length - 1}
              >
                ↓
              </IconButton>
              <DeleteButton onClick={() => handleRemoveQuestion(index)}>
                ✕
              </DeleteButton>
            </ButtonGroup>
          </QuestionItem>
        ))}
      </QuestionsList>

      <PhoneInputGroup>
        <PhoneInput
          type="tel"
          value={phoneNumber}
          onChange={handlePhoneChange}
          placeholder="Enter phone number (e.g. +1234567890)"
          $isValid={validatedPhone?.isValid}
        />
        <CallButton
          onClick={() => validatedPhone?.isValid ? handleCreateCall(validatedPhone.phoneNumber) : undefined}
          disabled={isLoading || !validatedPhone?.isValid}
        >
          {isLoading ? 'Creating Call...' : `Start Interview Call`}
        </CallButton>
      </PhoneInputGroup>
        

      {!validatedPhone?.isValid && phoneNumber && (
        <ErrorMessage>
          Please enter a valid phone number with country code (e.g. +1234567890)
        </ErrorMessage>
      )}
      {callStatus && (
        <StatusMessage $isError={callStatus.includes('Error')}>
          {callStatus}
        </StatusMessage>
      )}

    </Container>
  );
}

