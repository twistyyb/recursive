require('dotenv').config();
// Download the helper library from https://www.twilio.com/docs/node/install
const twilio = require("twilio"); // Or, for ESM: import twilio from "twilio";
const {db, doc, updateDoc, deleteDoc} = require("./firebase.cjs");
const cors = require('cors');
const { collection, getDocs } = require('firebase/firestore');

// Find your Account SID and Auth Token at twilio.com/console
// and set the environment variables. See http://twil.io/secure
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken);

const express = require('express');
// Add these middleware configurations before your routes
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({
  origin: process.env.VITE_FRONTEND_URL,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Debug middleware to log all requests
app.use((req, res, next) => {
  console.log(req.method, req.path);
  next();
});


const VoiceResponse = require('twilio').twiml.VoiceResponse;
const SurveyResponse = require('./SurveyResponse.cjs');

// Returns TwiML which prompts the caller to record a message
app.post('/voice', async (req, res) => {
  const twiml = new VoiceResponse();
  var input = req.body.RecordingUrl;
  
  // Get responseId from either query params (first request) or request body (subsequent requests)
  const responseId = req.query.responseId || req.body.responseId;
  console.log('Voice endpoint - responseId:', responseId);

  //helper functions 
  function say(text){
    twiml.say({voice: 'alice'}, text);
  }
  function respond() {
    res.type('text/xml');
    res.send(twiml.toString());
  }

  // Call the advanceSurvey function with the responseId, ask questions, and record responses
  SurveyResponse.advanceSurvey({
    responseId: responseId,
    input: input,
  }, function(err, surveyResponse, questionIndex) {
    if (err || !surveyResponse) {
      console.log("error in advanceSurvey:", err);
      return respond();
    }

    const nextQuestion = surveyResponse.survey[questionIndex];

    if (!nextQuestion) {
      console.log("Survey complete.");
      say('Survey complete.');
      twiml.hangup();
      return respond();
    }

    if (questionIndex === 0){
      say('Welcome to AI Interview System. Please listen carefully to the following questions and respond accordingly.');
    }


    console.log("question: ", nextQuestion);
    say(nextQuestion);
    
    // Record the response
    twiml.record({
      action: `/voice?responseId=${responseId}`,
      maxLength: 30,
      minLength: 3,
      transcribe: true,
      transcribeCallback: '/transcription/' + responseId + '/' + questionIndex,
      timeout: 3,
      playBeep: false,

    });
    respond();
  });
});

// Trasncription callback - called by Twilio with transcription of recording
// Will update survey response outside the interview call flow
app.post('/transcription/:responseId/:questionIndex', (request, response) => {
  var responseId = request.params.responseId;
  var questionIndex = request.params.questionIndex;
  var transcript = request.body.TranscriptionText;

  SurveyResponse.updateTranscription({responseId, questionIndex, transcript});
});


// Create an HTTP server and listen for requests on port 3000
app.listen(3000);
console.log("Server is running on port 3000");


// Store call statuses in memory (consider using a database for production)
const callStatuses = new Map();

// Create call endpoint for prompted interview call, survey seed questions, and create survey response
app.post('/api/create-call', async (req, res) => {
  try {
    const phone = req.body.phone;
    const surveyData = req.body.survey;
    console.log('Creating call to:', {
      phone: phone,
      questions: surveyData
    });

    // First create the survey response
    const dateTime = new Date().toISOString();
    const responseId = "survey" + dateTime;
    


    await SurveyResponse.createSurveyResponse({
      responseId: responseId,
      phone: phone,
      survey: surveyData
    });
    console.log("Survey response created with ID:", responseId);

    // Create the call with the responseId as a parameter
    const call = await client.calls.create({
      from: "+18445417040",
      to: phone,
      url: `${process.env.SERVER_URL}/voice?responseId=${responseId}`,
      statusCallback: process.env.SERVER_URL + "/api/status-callback",
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed', 'failed', 'busy', 'no-answer'],
      statusCallbackMethod: 'POST'
    });

    // Set initial status
    callStatuses.set(call.sid, 'initiated');

    // Verify Twilio connection
    res.json({ success: true, callSid: call.sid });
  } catch (error) {
    console.error('Error creating call:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to create call',
      details: process.env.NODE_ENV === 'development' ? error.toString() : undefined
    });
  }
});


// Handle Status updates
// Handle Twilio's POST callbacks
app.post('/api/status-callback', (req, res) => {
  try {
    const { CallSid, CallStatus } = req.body;
    
    if (!CallSid || !CallStatus) {
      console.error('Missing required fields in Twilio callback:', req.body);
      return res.status(400).json({ error: 'CallSid and CallStatus are required' });
    }
    
    // Store the status
    callStatuses.set(CallSid, CallStatus);
    console.log(`Call ${CallSid} status updated to: ${CallStatus}`);
    
    res.sendStatus(200);
  } catch (error) {
    console.error('Error in status-callback POST:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Handle frontend GET requests
app.get('/api/status-callback', (req, res) => {
  try {
    const { callSid } = req.query;
    
    if (!callSid) {
      console.error('Missing callSid in GET request');
      return res.status(400).json({ error: 'CallSid is required' });
    }

    const status = callStatuses.get(callSid);
    
    if (!status) {
      console.log(`No status found for callSid: ${callSid}`);
      return res.status(404).json({ error: 'Call status not found' });
    }

    res.json({ status });
  } catch (error) {
    console.error('Error in status-callback GET:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update the survey responses endpoint
app.get('/api/survey-responses', async (req, res) => {
  try {
    console.log('Fetching survey responses...');
    const surveyCollection = collection(db, 'surveyResponses');
    const snapshot = await getDocs(surveyCollection);
    
    if (!snapshot) {
      console.log('No snapshot returned');
      return res.json([]);
    }

    const responses = [];
    snapshot.forEach((doc) => {
      responses.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    console.log('Responses fetched:', responses);
    res.setHeader('Content-Type', 'application/json');
    res.json(responses);
  } catch (error) {
    console.error('Error fetching survey responses:', error);
    res.status(500).json({ 
      error: 'Failed to fetch survey responses',
      details: error.message 
    });
  }
});

// delete a survey response
app.delete('/api/delete-response', async (req, res) => {
  try {
    const { responseId } = req.body;
    
    if (!responseId) {
      return res.status(400).json({ 
        success: false, 
        error: 'ResponseId is required' 
      });
    }

    const docRef = doc(db, 'surveyResponses', responseId);
    await deleteDoc(docRef);

    console.log(`Successfully deleted response: ${responseId}`);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting survey response:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to delete survey response',
      details: error.message 
    });
  }
});