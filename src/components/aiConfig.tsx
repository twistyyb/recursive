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
  }
`
const Input = styled.input`
  flex: 1;
  padding: 0.5rem;
  border: 1px solid #d1d5db;
  border-radius: 0.25rem;
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

const InputGroup = styled.div`
  margin-bottom: 1rem;
`

const Label = styled.label`
  display: block;
  font-size: 0.95rem;
  font-weight: 700;
  color: #374151;
  margin-bottom: 0.5rem;
`

const TextArea = styled.textarea`
  width: 100%;
  padding: 0.5rem 1rem;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  resize: vertical;
  min-height: 100px;
  box-sizing: border-box;
  margin-right: 1rem;

  &:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }
`

const SkillItem = styled.div`
  display: flex;
  gap: 0.5rem;
  margin-top: 0.5rem;
`

const DeleteButton = styled.button`
  color: #ef4444;
  padding: 0.25rem, 0.5rem;
  background: white;
  cursor: pointer;
  font-weight: bold;
  font-size: 1rem;

  &:hover:not(:disabled) {
    color:rgb(168, 29, 29);
  }

  &:disabled {
    opacity: 0.5;
    border-color: #9ca3af;
    color: #9ca3af;
  }
`

const AddButton = styled.button`
  color: #9ca3af;
  padding: 0.1rem 0.1rem;
  border: none;
  background: none;
  cursor: pointer;
  font-size: 1.5rem;
  width: 100%;
  text-align: center;
  padding-left: 0.5rem;

  &:hover {
    color: #374151;
  }
`

const RequiredStar = styled.span`
  color: #ff4444;
  margin-left: 4px;
`;

export function AiConfig() {
  const [callStatus, setCallStatus] = useState<string>('')
  const [isLoading, setIsLoading] = useState(false)
  const [phoneNumber, setPhoneNumber] = useState('')
  const [validatedPhone, setValidatedPhone] = useState<PhoneResult | null>(phone('7473347145'))
  const [isCallActive, setIsCallActive] = useState(false)
  const [callSid, setCallSid] = useState<string | null>(null)
  const [companyName, setCompanyName] = useState('')
  const [jobTitle, setJobTitle] = useState('')
  const [targetSkillsQualities, setTargetSkillsQualities] = useState<string[]>([''])
  const [additionalInstructions, setAdditionalInstructions] = useState('')

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
        companyName: 'Cafe Strada',
        endpoint: `${import.meta.env.VITE_API_URL}/api/initiate-call`
      });

      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/initiate-call`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',


        },
        body: JSON.stringify({
          phoneNumber: number,
          companyName: companyName,
          jobTitle: jobTitle,
          targetSkillsQualities: targetSkillsQualities,
          additionalInstructions: additionalInstructions,
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
          const response = await fetch(`${import.meta.env.VITE_API_URL}/api/status-callback?callSid=${callSid}`, {
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

  const handleAddSkill = () => {
    setTargetSkillsQualities([...targetSkillsQualities, '']);
  };

  const handleRemoveSkill = (index: number) => {
    if (targetSkillsQualities.length === 1) {
      // If it's the last item, clear it instead of removing
      setTargetSkillsQualities(['']);
    } else {
      // Otherwise remove the item
      const newSkills = targetSkillsQualities.filter((_, i) => i !== index);
      setTargetSkillsQualities(newSkills);
    }
  };

  const handleSkillChange = (index: number, value: string) => {
    const newSkills = [...targetSkillsQualities];
    newSkills[index] = value;
    setTargetSkillsQualities(newSkills);
  };

  const isFormValid = () => {
    return companyName.trim() !== '' && 
           jobTitle.trim() !== '' && 
           validatedPhone?.isValid;
  };

  return (
    <Container>
      <Title>AI Interview Configuration</Title>

      <div className="space-y-4 p-4">
        <InputGroup>
          <Label>
            Company Name
            <RequiredStar>*</RequiredStar>
          </Label>
          <Input
            type="text"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="Enter company name"
          />
        </InputGroup>

        <InputGroup>
          <Label>
            Job Title
            <RequiredStar>*</RequiredStar>
          </Label>
          <Input
            type="text"
            value={jobTitle}
            onChange={(e) => setJobTitle(e.target.value)}
            placeholder="Enter job title"
          />
        </InputGroup>

        <InputGroup>
          <Label>Target Skills & Qualities</Label>
          {targetSkillsQualities.map((skill, index) => (
            <SkillItem key={index}>
              <Input
                type="text"
                value={skill}
                onChange={(e) => handleSkillChange(index, e.target.value)}
                placeholder="Enter skill or quality"
              />
              <DeleteButton
                onClick={() => handleRemoveSkill(index)}
                disabled={targetSkillsQualities.length === 1 && targetSkillsQualities[0] === ''}
              >
                ✕
              </DeleteButton>
            </SkillItem>
          ))}
          <AddButton onClick={handleAddSkill}>
            +
          </AddButton>
        </InputGroup>

        <InputGroup>
          <Label>Additional Instructions</Label>
          <TextArea
            value={additionalInstructions}
            onChange={(e) => setAdditionalInstructions(e.target.value)}
            placeholder="Enter any additional instructions for the AI interviewer"
          />
        </InputGroup>
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
          disabled={isLoading || !isFormValid()}
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
      {!isFormValid() && (
        <ErrorMessage>
          {!companyName.trim() && 'Company name is required. '}
          {!jobTitle.trim() && 'Job title is required. '}
          {!validatedPhone?.isValid && phoneNumber && 'Please enter a valid phone number with country code (e.g. +1234567890)'}
        </ErrorMessage>
      )}
      </div>

    </Container>
  );
}

