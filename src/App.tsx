import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'
import './index.css'

import { SurveyConfig } from './components/surveyConfig'
import { ResponseDisplay } from './components/ResponseDisplay'

function App() {
  return (
    <>
      <div>
        <a href="https://vitejs.dev" target="_blank">
          <img src={viteLogo} className="logo" alt="Vite logo" />
        </a>
        <a href="https://react.dev" target="_blank">
          <img src={reactLogo} className="logo react" alt="React logo" />
        </a>
      </div>
      <h1>AI Interview System</h1>
      <p className="read-the-docs">
        A 72 hour hackathon project by Bryan Huang
      </p>
      
      <SurveyConfig />
      <ResponseDisplay />
      
    </>
  )
}

export default App