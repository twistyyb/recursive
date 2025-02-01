import { useEffect, useState } from 'react'
import { phone, PhoneResult } from 'phone'

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
    <div className="p-4 border-4 border-gray-300 rounded-lg shadow-md">
      <h1 className="text-2xl font-bold mb-4">Survey Configuration</h1>
      
      {/* Question input form */}
      <form onSubmit={handleAddQuestion} className="mb-6">
        <div className="flex gap-2">
          <input
            type="text"
            value={newQuestion}
            onChange={(e) => setNewQuestion(e.target.value)}
            placeholder="Enter a survey question..."
            className="flex-1 p-2 border rounded"
          />
          <button 
            type="submit"
            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
          >
            Add Question
          </button>
        </div>
      </form>

      {/* Questions list */}
      <div className="space-y-2">
        {questions.map((question, index) => (
          <div key={index} className="flex items-center justify-between gap-2 p-3 border border-gray-300 rounded-md shadow-sm">
            <div className="flex items-center gap-2 flex-1">
              <span className="font-bold min-w-[2rem] text-lg text-right">{index + 1}.</span>
              <span className="text-lg">{question}</span>
            </div>
            <div className="flex gap-1 ml-4">
              <button
                onClick={() => handleMoveQuestion(index, 'up')}
                disabled={index === 0}
                className={`px-2 py-1 ${index === 0 ? 'text-gray-400' : 'text-blue-500 hover:text-blue-700'}`}
              >
                ↑
              </button>
              <button
                onClick={() => handleMoveQuestion(index, 'down')}
                disabled={index === questions.length - 1}
                className={`px-2 py-1 ${index === questions.length - 1 ? 'text-gray-400' : 'text-blue-500 hover:text-blue-700'}`}
              >
                ↓
              </button>
              <button
                onClick={() => handleRemoveQuestion(index)}
                className="text-red-500 hover:text-red-700 text-sm px-2 py-1"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Phone number input and start interview button */}
      <div className="card">
        <input
          type="tel"
          value={phoneNumber}
          onChange={handlePhoneChange}
          placeholder="Enter phone number (e.g. +1234567890)"
          style={{
            padding: '0.5rem',
            marginRight: '1rem',
            borderRadius: '4px',
            border: `1px solid ${validatedPhone?.isValid ? '#4CAF50' : '#ccc'}`
          }}
        />
        <button
          onClick={() => validatedPhone?.isValid ? handleCreateCall(validatedPhone.phoneNumber) : undefined}
          disabled={isLoading || !validatedPhone?.isValid}
          style={{ opacity: (isLoading || !validatedPhone?.isValid) ? 0.7 : 1 }}
        >
          {isLoading ? 'Creating Call...' : `Start Interview Call ${validatedPhone?.phoneNumber || ''}`}
        </button>
        {!validatedPhone?.isValid && phoneNumber && (
          <p style={{ color: '#ff4444', fontSize: '0.8em', marginTop: '0.5rem' }}>
            Please enter a valid phone number with country code (e.g. +1234567890)
          </p>
        )}
        {callStatus && (
          <p className="status-message" style={{
            marginTop: '1rem',
            color: callStatus.includes('Error') ? '#ff4444' : '#4CAF50'
          }}>
            {callStatus}
          </p>
        )}
      </div>

      
    </div>
  );
}

