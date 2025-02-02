import './App.css'
import './index.css'
import styled from 'styled-components'
import { AiConfig } from './components/aiConfig'
import Login from './components/Login';

const Title = styled.h1`
  font-family: 'JetBrains Mono', 'Courier New', monospace;
  font-weight: 700;
  font-size: 2.5rem;
  margin-bottom: 0.5rem;
`;

const Subtitle = styled.p`
  font-family: 'JetBrains Mono', 'Courier New', monospace;
  font-style: italic;
  font-size: 0.875rem;
  font-weight: 900;
  color: #6b7280;
  margin-top: 0;
`;

function App() {
  return (
    <>
      <Login />
      <Title>AI Interview System</Title>
      <Subtitle>
        A 72 hour hackathon project by Bryan Huang
      </Subtitle>
      <AiConfig />
    </>
  )
}

export default App;