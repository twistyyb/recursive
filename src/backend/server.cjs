require('dotenv').config();
// Download the helper library from https://www.twilio.com/docs/node/install
const twilio = require("twilio"); // Or, for ESM: import twilio from "twilio";

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
        body: req.body,
        headers: req.headers
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
    var input = req.body.RecordingUrl || req.body.Digits;

    console.log("input", input);
    function say(text){
      twiml.say({voice: 'alice'}, text);
    }
    function respond() {
      res.type('text/xml');
      res.send(twiml.toString());
    }
    
    try {
        // Call the advanceSurvey function
        const result = await SurveyResponse.advanceSurvey({
            phone: phone,
            input: input,
            survey: survey
        });

        const { surveyResponse, nextQuestionIndex } = result;
        
        // Handle the response
        if (nextQuestionIndex < survey.length) {
          const nextQuestion = survey[nextQuestionIndex];
          say(nextQuestion.text);
          
            // Record the response
            twiml.record({
                action: '/voice',
                maxLength: 30,
                minLength: 3,
                transcribe: true,
                transcribeCallback: '/transcription/' + surveyResponse.id + '/' + nextQuestionIndex,
                timeout: 3,
                trim: 'do-not-trim'
            });
          
        } else {
            say('Thank you for completing the survey!');
            if (surveyResponse.id) {
              await updateDoc(doc(db, 'surveyResponses', surveyResponse.id), { complete: true });
            }
            return respond();
        }

    } catch (error) {
        console.error('Error in voice endpoint:', error);
        say('An error occurred. Please try again later.');
    }
    respond();
});

// Trasncription callback - called by Twilio with transcription of recording
// Will update survey response outside the interview call flow
app.post('/transcription/:responseId/:questionIndex', (request, response) => {
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
});






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