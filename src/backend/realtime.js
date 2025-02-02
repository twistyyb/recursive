import WebSocket from 'ws';
import dotenv from 'dotenv';
import Fastify from 'fastify';
import fastifyFormBody from '@fastify/formbody';
import fastifyWs from '@fastify/websocket';
import fastifyCors from '@fastify/cors';

dotenv.config();

const {OPENAI_API_KEY} = process.env;
if( !OPENAI_API_KEY) {
  console.error('OPENAI_API_KEY is not set');
  process.exit(1);
}


const fastify = Fastify();
fastify.register(fastifyFormBody);
fastify.register(fastifyWs);
fastify.register(fastifyCors, {
  origin: [
    process.env.VITE_FRONTEND_URL,
    'https://accounts.google.com',
    'https://www.googleapis.com'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization'],
});

// Update security headers
fastify.addHook('onRequest', async (request, reply) => {
  // Remove COOP header to allow popups
  reply.header('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  // Remove COEP header to allow cross-origin resources
  reply.header('Cross-Origin-Embedder-Policy', 'unsafe-none');
  // Allow cross-origin iframes
  reply.header('Cross-Origin-Resource-Policy', 'cross-origin');
  
  // Standard CORS headers
  reply.header('Access-Control-Allow-Origin', request.headers.origin || process.env.VITE_FRONTEND_URL);
  reply.header('Access-Control-Allow-Credentials', 'true');
  reply.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  reply.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  // Additional security headers
  reply.header('X-Frame-Options', 'SAMEORIGIN');
  reply.header('X-Content-Type-Options', 'nosniff');
  
  // Handle preflight requests
  if (request.method === 'OPTIONS') {
    return reply.send();
  }
});

const SYSTEM_MESSAGE = 'You are a kind but professional AI interviewer. You are interviewing a potential employee for a job. The company is looking for a part time barista. ask nessecary questions to determine if they are a good fit for the role. Always stay positive. Please start the conversation by introducing yourself. Speak as soon as you are connected to the call.'
const VOICE = 'alloy';
const PORT = process.env.PORT || 3000;

const LOG_EVENT_TYPES = [
  'response.content.done',
  'rate_limits.updated',
  'response.done',
  'input_audio_buffer.committed',
  'input_audio_buffer.speech_stopped',
  'input_audio_buffer.speech_started',
  'session.created'
];

const activeCallInstructions = new Map();
const callStatuses = new Map();

fastify.get('/', async (request, reply) => {
  reply.send({message: 'Twilio Media Stream Server is running!'})
});

import twilio from 'twilio';
fastify.post('/api/initiate-call', async (request, reply) => {
  try {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const twilioClient = twilio(accountSid, authToken);
    const companyName = request.body.companyName;
    const phoneNumber = request.body.phoneNumber;
    const jobTitle = request.body.jobTitle;
    const targetSkillsQualities = request.body.targetSkillsQualities;
    const additionalInstructions = request.body.additionalInstructions;
    const callId = new Date().toISOString();



    let instruction = `Your name is Nava, you are a kind but professional AI interviewer at the company ${companyName}. You are interviewing a potential employee for a job. Ask nessecary questions to determine if they are a good fit for the role. Always stay positive. Please start the conversation by introducing yourself. Be slightly briefer in your analysis of the candidate's response. Ask one question at a time, and follow up if a detail needs to be clarified. The following is information provided by the hiring manager, you should ask questions accordingly.${
      jobTitle ? ` Job Title: ${jobTitle}.` : ''
    }${
      targetSkillsQualities.every(skill => skill.length == 0) ? 
        '' : 
        ` Target Skills and Qualities: ${targetSkillsQualities.filter(skill => skill.length > 0).join(', ')}.`
    }${
      additionalInstructions?.trim() ? 
        ` Additional Instructions: ${additionalInstructions}.` : 
        ''
    }`

    console.log('parsed instruction:', instruction);
    activeCallInstructions.set(callId, instruction);
    

    const call = await twilioClient.calls.create({
      to: phoneNumber,
      from: "+18445417040",
      url: `${process.env.SERVER_URL}/api/incoming-call?callId=${callId}`,
      record: true,
      statusCallback: process.env.SERVER_URL + "/api/status-callback",
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed', 'failed', 'busy', 'no-answer'],
      statusCallbackMethod: 'POST'
    });
    // Set initial status
    callStatuses.set(call.sid, 'initiated');

    reply.send({
      success: true,
      callSid: call.sid,
      message: 'Call initiated successfully',
      
    });
  } catch (error) {
    console.error('Error initiating call:', error);
    reply.code(500).send({ 
      error: 'Failed to initiate call',
      details: error.message 
    });
  }
});

fastify.all('/api/incoming-call', async (request, reply) => {
  const callId = request.query.callId || request.body.callId;

  const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
    <Response>
      <Connect>
        <Stream url="wss://${request.headers.host}/api/media-stream/${callId}" />
      </Connect>
    </Response>`;

  reply.type('text/xml').send(twimlResponse);
});

// WebSocket route for media-stream
fastify.register(async (fastify) => {
  fastify.get('/api/media-stream/:callId', { websocket: true }, (connection, req) => {
      const callId = req.params.callId;
      if (!callId) {
        console.error('No callId found');
        connection.socket.close();
        return;
      }

      const instruction = activeCallInstructions.get(callId);
      if (!instruction) {
          console.error('No instruction found for callId:', callId);
          connection.socket.close();
          return;
      }

      console.log('Client connected');
      const openAiWs = new WebSocket('wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01', {
          headers: {
              Authorization: `Bearer ${OPENAI_API_KEY}`,
              "OpenAI-Beta": "realtime=v1"
          }
      });
      let streamSid = null;
      const sendSessionUpdate = () => {
          
          console.log('session update with instruction:', instruction);
          const sessionUpdate = {
              type: 'session.update',
              session: {
                  turn_detection: { type: 'server_vad' },
                  input_audio_format: 'g711_ulaw',
                  output_audio_format: 'g711_ulaw',
                  voice: VOICE,
                  instructions: instruction,
                  modalities: ["text", "audio"],
                  temperature: 0.8,//randomness,
                  input_audio_transcription: {'model': 'whisper-1'},
              }
          };
          openAiWs.send(JSON.stringify(sessionUpdate));
      };
      // Open event for OpenAI WebSocket
      openAiWs.on('open', () => {
          console.log('Connected to the OpenAI Realtime API');
          setTimeout(sendSessionUpdate, 250); // Ensure connection stability, send after .25 seconds
      });
      // Listen for messages from the OpenAI WebSocket (and send to Twilio if necessary)

      openAiWs.on('message', (data) => {
          try {
              const response = JSON.parse(data);
              if (LOG_EVENT_TYPES.includes(response.type)) {
                  //console.log(`Received event: ${response.type}`);
              }
              if (response.type === 'session.updated') {
                  //console.log('Session updated successfully');
              }
              if (response.type === 'conversation.item.input_audio_transcription.completed') {
                  console.log('User:', response.transcript);
              }
              if (response.type === 'response.audio.delta' && response.delta) {
                  const audioDelta = {
                      event: 'media',
                      streamSid: streamSid,
                      media: { payload: Buffer.from(response.delta, 'base64').toString('base64') }
                  };
                  connection.send(JSON.stringify(audioDelta));
              }
              if (response.type === 'response.audio_transcript.done') {
                  console.log('AI:', response.transcript);//Get trancript of AI's response
              }
          } catch (error) {
              console.error('Error processing OpenAI message:', error, 'Raw message:', data);
          }
      });
      // Handle incoming messages from Twilio
      connection.on('message', (message) => {
          try {
              const data = JSON.parse(message);
              switch (data.event) {
                  case 'media':
                      if (openAiWs.readyState === WebSocket.OPEN) {
                          const audioAppend = {
                              type: 'input_audio_buffer.append',
                              audio: data.media.payload
                          };
                          openAiWs.send(JSON.stringify(audioAppend));
                      }
                      break;
                  case 'start':
                      streamSid = data.start.streamSid;
                      console.log('Incoming stream has started', streamSid);
                      break;
                  default:
                      console.log('Received non-media event:', data.event);//here would handle other responses
                      break;
              }
          } catch (error) {
              console.error('Error parsing message:', error, 'Message:', message);
          }
      });
      // Handle connection close
      connection.on('close', () => {
          const urlParams = new URLSearchParams(req.url.split('?')[1]);
          const callSid = urlParams.get('callSid');
          activeCallInstructions.delete(callSid);
          if (openAiWs.readyState === WebSocket.OPEN) openAiWs.close();
          console.log('Client disconnected.');
      });
      // Handle WebSocket close and errors
      openAiWs.on('close', () => {
          console.log('Disconnected from the OpenAI Realtime API');
      });
      openAiWs.on('error', (error) => {
          console.error('Error in the OpenAI WebSocket:', error);
      });
  });
});


// Handle Twilio's POST status callbacks
fastify.post('/api/status-callback', async (request, reply) => {
  try {
    const { CallSid, CallStatus } = request.body;
    
    if (!CallSid || !CallStatus) {
      console.error('Missing required fields in Twilio callback:', request.body);
      return reply.code(400).send({ error: 'CallSid and CallStatus are required' });
    }
    
    // Store the status
    callStatuses.set(CallSid, CallStatus);
    console.log(`Call ${CallSid} status updated to: ${CallStatus}`);
    
    return reply.code(200).send();
  } catch (error) {
    console.error('Error in status-callback POST:', error);
    return reply.code(500).send({ error: 'Internal server error' });
  }
});

// Handle frontend GET status requests
fastify.get('/api/status-callback', async (request, reply) => {
  try {
    const { callSid } = request.query;
    
    if (!callSid) {
      console.error('Missing callSid in GET request');
      return reply.code(400).send({ error: 'CallSid is required' });
    }

    const status = callStatuses.get(callSid);
    
    if (!status) {
      console.log(`No status found for callSid: ${callSid}`);
      return reply.code(404).send({ error: 'Call status not found' });
    }

    return reply.send({ status });
  } catch (error) {
    console.error('Error in status-callback GET:', error);
    return reply.code(500).send({ error: 'Internal server error' });
  }
});

// Update the verify endpoint to handle the request properly
fastify.post('/api/auth/verify', async (request, reply) => {
  try {
    const { token, user } = request.body;
    
    if (!token || !user) {
      console.log('Missing data:', { token: !!token, user: !!user });
      return reply.code(400).send({ 
        success: false, 
        error: 'Token and user data are required' 
      });
    }

    // Log the received data
    console.log('Received verification request:', {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName
    });

    // For now, we'll just verify that we received the data
    return reply.send({
      success: true,
      user: {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL
      }
    });
  } catch (error) {
    console.error('Error in /api/auth/verify:', error);
    return reply.code(500).send({ 
      success: false, 
      error: error.message || 'Verification failed' 
    });
  }
});

fastify.listen({ port: PORT }, (err) => {
  if (err) {

      console.error(err);
      process.exit(1);
  }
  console.log(`Server is listening on port ${PORT}`);
});

