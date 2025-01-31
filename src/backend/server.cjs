require('dotenv').config();
// Download the helper library from https://www.twilio.com/docs/node/install
const twilio = require("twilio"); // Or, for ESM: import twilio from "twilio";

// Find your Account SID and Auth Token at twilio.com/console
// and set the environment variables. See http://twil.io/secure
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken);

const express = require('express');
const VoiceResponse = require('twilio').twiml.VoiceResponse;
const SurveyResponse = require('../components/SurveyResponse.cjs');

const app = express();

const phone = "+17473347145";
const survey = require('../assets/survey_data.cjs').survey;
var input = undefined;



// Returns TwiML which prompts the caller to record a message
app.post('/voice', async (req, res) => {
    const twiml = new VoiceResponse();
    
    try {
        console.log('Received Twilio request:', {
            From: req.body.From,
            RecordingUrl: req.body.RecordingUrl,
            Digits: req.body.Digits
        });

        const result = await SurveyResponse.advanceSurvey({
            phone: req.body.From,
            input: req.body.RecordingUrl || req.body.Digits,
            survey: survey
        });

        const { surveyResponse, nextQuestionIndex } = result;
        
        if (nextQuestionIndex < survey.length) {
            const nextQuestion = survey[nextQuestionIndex];
            twiml.say({ voice: 'alice' }, nextQuestion.text);
            
            if (nextQuestion.type === 'voice') {
                // For voice recording questions
                twiml.record({
                    action: '/voice',  // Important: This makes it loop back
                    maxLength: 30,
                    timeout: 5,
                    transcribe: true
                });
            } else {
                // For numeric input questions
                const gather = twiml.gather({
                    action: '/voice',  // Important: This makes it loop back
                    numDigits: 1,
                    timeout: 10
                });
                gather.say({ voice: 'alice' }, 'Press a number to respond.');
            }
        } else {
            twiml.say({ voice: 'alice' }, 'Thank you for completing the survey!');
            twiml.hangup();
        }

    } catch (error) {
        console.error('Error in voice endpoint:', error);
        twiml.say({ voice: 'alice' }, 'An error occurred. Please try again later.');
        twiml.hangup();
    }

    res.type('text/xml');
    res.send(twiml.toString());
});

// Trasncription callback - called by Twilio with transcription of recording
// Will update survey response outside the interview call flow
exports.transcription = function(request, response) {
  var responseId = request.params.responseId;
  var questionIndex = request.params.questionIndex;
  var transcript = request.body.TranscriptionText;

  SurveyResponse.findById(responseId, function(err, surveyResponse) {
      if (err || !surveyResponse || !surveyResponse.responses[questionIndex]) {
          console.log("Error could not find survey response");
          return response.status(500).end();
      }
      // Update appropriate answer field
      surveyResponse.responses[questionIndex].answer = transcript;
      surveyResponse.markModified('responses');
      surveyResponse.save(function(err, doc) {
          return response.status(err ? 500 : 200).end();
      });
  });
};






// Create an HTTP server and listen for requests on port 3000
app.listen(3000);

//creates an outgoing call to bryan's number at the moment
async function createCall() {
  const call = await client.calls.create({
    from: "+18445417040",
    to: "+17473347145",
    url: "https://9427-2607-f140-400-ac-d97a-275a-5cfb-74df.ngrok-free.app/voice",
  });

  console.log(call.sid);
}

createCall();
//console.log(survey.survey.length);