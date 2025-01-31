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
var survey = require('../assets/survey_data.cjs');

const app = express();
const phone = "+17473347145";

// Returns TwiML which prompts the caller to record a message
app.post('/voice', (request, response) => {
  var input = undefined;
  var twiml = new VoiceResponse();

  function say(text) {
    twiml.say({ voice: 'Polly.Amy'}, text);
  }
  function respond() {
    response.type('text/xml');
    response.send(twiml.toString());
  }

  say('Welcome to Recursive Interview.');

  // Find an in-progess survey if one exists, otherwise create one
  SurveyResponse.advanceSurvey({
    phone: phone,
    input: input,
    survey: survey}, function(err, surveyResponse, questionIndex) {
    var question = survey[questionIndex];

    if (err || !surveyResponse) {
        say('Terribly sorry, but an error has occurred. Goodbye.');
        return respond();
    }

    // If question is null, we're done!
    if (!question) {
        say('Thank you for taking this survey. Goodbye!');
        return respond();
    }

    // Add a greeting if this is the first question
    if (questionIndex === 0) {
        say('Thank you for taking our survey. Please listen carefully '
            + 'to the following questions.');
    }

    // Otherwise, ask the next question
    say(question.text);

    // Depending on the type of question, we either need to get input via
    // DTMF tones or recorded speech
    if (question.type === 'text') {
        say('Please record your response after the beep. '
            + 'Press any key to finish.');
        twiml.record({
            transcribe: true,
            transcribeCallback: '/voice/' + surveyResponse._id
                + '/transcribe/' + questionIndex,
            maxLength: 60
        });
    } else if (question.type === 'boolean') {
        say('Press one for "yes", and any other key for "no".');
        twiml.gather({
            timeout: 10,
            numDigits: 1
        });
    } else {
        // Only other supported type is number
        say('Enter the number using the number keys on your telephone.'
            + ' Press star to finish.');
        twiml.gather({
            timeout: 10,
            finishOnKey: '*'
        });
    }

    // render TwiML response
    respond();
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