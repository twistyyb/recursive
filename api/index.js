import Fastify from 'fastify';
import fastifyFormBody from '@fastify/formbody';
import fastifyCors from '@fastify/cors';
import dotenv from 'dotenv';
import twilio from 'twilio';
import { openai } from '@ai-sdk/openai';
import { createDataStream } from 'ai';

dotenv.config();

// Add after dotenv.config()
const debugLog = (message, data = null) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
  if (data) console.log(JSON.stringify(data, null, 2));
};

// Add after dotenv.config()
const requiredEnvVars = {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
  SERVER_URL: process.env.SERVER_URL,
  VITE_FRONTEND_URL: process.env.VITE_FRONTEND_URL
};

const missingVars = Object.entries(requiredEnvVars)
  .filter(([_, value]) => !value)
  .map(([key]) => key);

if (missingVars.length > 0) {
  debugLog('Missing required environment variables:', {
    missing: missingVars
  });
  process.exit(1);
}
console.log(requiredEnvVars);

const fastify = Fastify({ logger: true });
const callStatuses = new Map(); // Add this to store call statuses

// Register plugins
fastify.register(fastifyFormBody);
fastify.register(fastifyCors, {
  origin: [
    process.env.VITE_FRONTEND_URL,
    'https://accounts.google.com',
    'https://www.googleapis.com',
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization'],
});

// Maintain state
const activeCallInstructions = new Map();

// Add after environment variables
const VOICE = 'alloy';

// Add after VOICE definition
const LOG_EVENT_TYPES = [
  'session.updated',
  'conversation.item.input_audio_transcription.completed',
  'response.audio_transcript.done'
];

// Modified initiate-call endpoint
fastify.post('/api/initiate-call', async (request, reply) => {
  try {
    debugLog('Received call initiation request:', request.body);
    
    const { companyName, phoneNumber, jobTitle, targetSkillsQualities, additionalInstructions } = request.body;
    const callId = new Date().toISOString();

    let instruction = `Your name is Nava, you are a kind but professional AI interviewer at the company ${companyName}...`; // Your existing instruction string

    activeCallInstructions.set(callId, instruction);

    // Create Twilio call
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const twilioClient = twilio(accountSid, authToken);

    // Create Twilio call with enhanced error handling
    let call; // Declare call variable in the outer scope
    try {
      call = await twilioClient.calls.create({
        to: phoneNumber,
        from: "+18445417040",
        url: `${process.env.SERVER_URL}/api/incoming-call?callId=${callId}`,
        record: true,
        statusCallback: process.env.SERVER_URL + "/api/status-callback",
        statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed', 'failed', 'busy', 'no-answer'],
        statusCallbackMethod: 'POST'
      });
      debugLog('Twilio call created:', { callSid: call.sid });
    } catch (twilioError) {
      debugLog('Twilio call creation failed:', {
        error: twilioError.message,
        code: twilioError.code,
        moreInfo: twilioError.moreInfo
      });
      throw twilioError;
    }

    callStatuses.set(call.sid, 'initiated');

    reply.send({
      success: true,
      callSid: call.sid,
      message: 'Call initiated successfully'
    });
  } catch (error) {
    debugLog('Call initiation failed:', {
      error: error.message,
      stack: error.stack
    });
    reply.code(500).send({ 
      error: 'Failed to initiate call', 
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

fastify.all('/api/incoming-call', async (request, reply) => {
  const callId = request.query.callId || request.body.callId;

  const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
    <Response>
      <Say>Connecting you to the interviewer...</Say>
      <Connect>
        <Stream url="${process.env.SERVER_URL}/api/media-stream">
          <Parameter name="callId" value="${callId}"/>
        </Stream>
      </Connect>
    </Response>`;

  reply.type('text/xml').send(twimlResponse);
});

// Change from POST to handle both GET and POST
fastify.route({
  method: ['GET', 'POST'],
  url: '/api/media-stream/:callId',
  handler: async (request, reply) => {
    try {
      const callId = request.params.callId || request.query.callId || request.body.callId || request.body.parameters.callId;
      const { event, media, start, parameters } = request.body || {};
      
      const streamCallId = parameters?.callId || callId;
      console.log('Stream parameters:', parameters);
      console.log('Using callId:', streamCallId);
      
      const dataStream = createDataStream({
        execute: async dataStreamWriter => {
          try {
            const instruction = activeCallInstructions.get(streamCallId);
            let openaiConnection = null;

            if (event === 'start') {
              console.log('Starting stream with instruction:', instruction);
              
              // Write initial session data
              dataStreamWriter.writeData({
                type: 'session.started',
                streamSid: start.streamSid,
                timestamp: new Date().toISOString()
              });

              // Send initial session configuration through dataStream
              dataStreamWriter.writeData({
                type: 'session.update',
                session: {
                  turn_detection: { type: 'server_vad' },
                  input_audio_format: 'g711_ulaw',
                  output_audio_format: 'g711_ulaw',
                  voice: VOICE,
                  instructions: instruction,
                  modalities: ["text", "audio"],
                  temperature: 0.8,
                  input_audio_transcription: {'model': 'whisper-1'},
                }
              });
            }

            if (event === 'media' && media?.payload) {
              // Process audio through OpenAI
              const openaiResponse = await openai.audio.realtime.process({
                model: 'gpt-4o-realtime-preview-2024-10-01',
                audio: media.payload,
                headers: {
                  Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
                  'OpenAI-Beta': 'realtime=v1'
                }
              });

              // Handle OpenAI response chunks
              for await (const chunk of openaiResponse) {
                if (LOG_EVENT_TYPES.includes(chunk.type)) {
                  console.log(`Received event: ${chunk.type}`);
                }

                switch (chunk.type) {
                  case 'session.updated':
                    console.log('Session updated successfully');
                    break;

                  case 'response.audio.delta':
                    if (chunk.delta) {
                      const audioDelta = {
                        event: 'media',
                        streamSid: start.streamSid,
                        media: { payload: Buffer.from(chunk.delta, 'base64').toString('base64') }
                      };
                      dataStreamWriter.writeData(audioDelta);
                    }
                    break;

                  case 'conversation.item.input_audio_transcription.completed':
                    console.log('User:', chunk.transcript);
                    dataStreamWriter.writeData({
                      type: 'transcription',
                      speaker: 'User',
                      text: chunk.transcript
                    });
                    break;

                  case 'response.audio_transcript.done':
                    console.log('AI:', chunk.transcript);
                    dataStreamWriter.writeData({
                      type: 'transcription',
                      speaker: 'AI',
                      text: chunk.transcript
                    });
                    break;

                  case 'input_audio_buffer.committed':
                  case 'input_audio_buffer.speech_started':
                  case 'input_audio_buffer.speech_stopped':
                    dataStreamWriter.writeData({
                      type: chunk.type,
                      timestamp: new Date().toISOString()
                    });
                    break;

                  case 'response.content.done':
                  case 'response.done':
                    dataStreamWriter.writeData({
                      type: chunk.type,
                      timestamp: new Date().toISOString()
                    });
                    break;

                  case 'rate_limits.updated':
                    console.log('Rate limits updated:', chunk);
                    break;
                }
              }
            }

            // Handle connection close
            openaiConnection?.on('close', () => {
              console.log('OpenAI connection closed');
              activeCallInstructions.delete(streamCallId);
            });

          } catch (error) {
            console.error('Error in stream execution:', error);
            throw error;
          }
        },
        onError: error => {
          console.error('Stream error:', error);
          if (streamCallId) {
            activeCallInstructions.delete(streamCallId);
          }
          return error instanceof Error ? error.message : String(error);
        },
      });

      reply.header('X-Vercel-AI-Data-Stream', 'v1');
      reply.header('Content-Type', 'text/plain; charset=utf-8');
      return reply.send(dataStream);
    } catch (error) {
      console.error('Error in media-stream:', error);
      reply.code(500).send({ 
        success: false, 
        error: error.message 
      });
    }
  }
});

// Add status callback endpoints
fastify.post('/api/status-callback', async (request, reply) => {
  try {
    const { CallSid, CallStatus } = request.body;
    
    if (!CallSid || !CallStatus) {
      console.error('Missing required fields in Twilio callback:', request.body);
      return reply.code(400).send({ error: 'CallSid and CallStatus are required' });
    }
    
    callStatuses.set(CallSid, CallStatus);
    console.log(`Call ${CallSid} status updated to: ${CallStatus}`);
    
    return reply.code(200).send();
  } catch (error) {
    console.error('Error in status-callback POST:', error);
    return reply.code(500).send({ error: 'Internal server error' });
  }
});

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

// Add a health check endpoint
fastify.get('/api/health', async (request, reply) => {
  return { status: 'ok' };
});

// Start the server
const start = async () => {
  try {
    await fastify.listen({ port: process.env.PORT || 3000, host: '0.0.0.0' });
    console.log(`Server listening on ${fastify.server.address().port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();

export default async function handler(req, res) {
  await fastify.ready();
  fastify.server.emit('request', req, res);
}