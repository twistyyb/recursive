// Main interface for frontend
import './App.css'
import './index.css'
import styled from 'styled-components'
import { AiConfig } from './components/aiConfig'
import Login from './components/Login';
import { useApiInitialization } from './api';

const Title = styled.h1`
  font-family: monospace;
  font-weight: 700;
  font-size: 2.5rem;
  margin-top: 0;
  margin-bottom: 0.5rem;
`;

const Subtitle = styled.p`
  font-family: monospace;
  font-style: italic;
  font-size: 0.875rem;
  font-weight: 900;
  color: #6b7280;
  margin-top: 0;
`;

function App() {
  useApiInitialization();
  
  return (
    <>
      <Login />
      <Title>AI Interview System</Title>
      <Subtitle>
        A 72 hour hackathon project by Bryan Huang
      </Subtitle>
      <AiConfig />
    </>
  );
}

export default App;