// Backend for making a call using the user-prompted question and response system
require('dotenv').config();
// Download the helper library from https://www.twilio.com/docs/node/install
const twilio = require("twilio"); // Or, for ESM: import twilio from "twilio";
const {db, doc, updateDoc} = require("./firebase.ts");

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

// Debug middleware to log all requests
app.use((req, res, next) => {
  console.log('Incoming request:', {
    method: req.method,
    path: req.path,
  });
  next();
});


const VoiceResponse = require('twilio').twiml.VoiceResponse;
const SurveyResponse = require('../components/SurveyResponse.cjs');


const phone = "+17473347145";
const survey = require('../assets/survey_data.cjs').survey;


// Returns TwiML which prompts the caller to record a message
app.post('/voice', async (req, res) => {
  const twiml = new VoiceResponse();
  var input = req.body.RecordingUrl;

  console.log("input", input);
  //helper functions 
  function say(text){
    twiml.say({voice: 'alice'}, text);
  }
  function respond() {
    res.type('text/xml');
    res.send(twiml.toString());
  }

  // Call the advanceSurvey function
  SurveyResponse.advanceSurvey({
    phone: phone,
    input: input,
    survey: survey
  }, function(err, surveyResponse, questionIndex) {
    const nextQuestion = survey[questionIndex];
    
    if (err || !surveyResponse) {
      console.log("error in advanceSurvey");
      return respond();
    }

    if (!nextQuestion) {
      console.log("Survey complete.");
      say('Survey complete.');
      twiml.hangup();
      return respond();
    }

    if (questionIndex === 0){
      say('Survey start.');
    }

    console.log("question: ", nextQuestion);
    say(nextQuestion);
    
    // Record the response
    twiml.record({
      action: '/voice',
      maxLength: 30,
      minLength: 3,
      transcribe: true,
      transcribeCallback: '/transcription/' + surveyResponse.id + '/' + questionIndex,
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

  console.log("Transcription callback received:", {
    responseId,
    questionIndex,
    transcript,
    rawParams: request.params
  });
  
  SurveyResponse.updateTranscription({responseId, questionIndex, transcript});
});






// Create an HTTP server and listen for requests on port 3000
app.listen(3000);
console.log("Server is running on port 3000");

//creates an outgoing call to bryan's number at the moment
async function createCall(phone) {
  const call = await client.calls.create({
    from: "+18445417040",
    to: phone,
    url: process.env.SERVER_URL + "/voice",
  });

  console.log(call.sid);
}

module.exports = { createCall };

//createCall();