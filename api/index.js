import Fastify from 'fastify';
import fastifyFormBody from '@fastify/formbody';
import fastifyCors from '@fastify/cors';
import dotenv from 'dotenv';
import Pusher from 'pusher';
import twilio from 'twilio';
import { WebSocket } from 'ws';
import { openai } from '@ai-sdk/openai';

dotenv.config();

// Add after dotenv.config()
const debugLog = (message, data = null) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
  if (data) console.log(JSON.stringify(data, null, 2));
};

// Add after dotenv.config()
const requiredEnvVars = {
  PUSHER_APP_ID: process.env.PUSHER_APP_ID,
  PUSHER_KEY: process.env.PUSHER_KEY,
  PUSHER_SECRET: process.env.PUSHER_SECRET,
  PUSHER_CLUSTER: process.env.PUSHER_CLUSTER,
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
// Initialize Pusher with validated environment variables
const pusher = new Pusher({
  appId: requiredEnvVars.PUSHER_APP_ID,
  key: requiredEnvVars.PUSHER_KEY,
  secret: requiredEnvVars.PUSHER_SECRET,
  cluster: requiredEnvVars.PUSHER_CLUSTER,
  useTLS: true
});

// Add after Pusher initialization, before connectToOpenAI
const safePusherTrigger = async (channel, event, data) => {
  try {
    await pusher.trigger(channel, event, data);
    debugLog(`Pusher event sent: ${event}`, { channel, data });
  } catch (error) {
    debugLog(`Pusher trigger error for ${event}:`, {
      error: error.message,
      channel,
      data
    });
    throw error;
  }
};

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

// Modified initiate-call endpoint
fastify.post('/api/initiate-call', async (request, reply) => {
  try {
    debugLog('Received call initiation request:', request.body);
    
    const { companyName, phoneNumber, jobTitle, targetSkillsQualities, additionalInstructions } = request.body;
    const callId = new Date().toISOString();

    let instruction = `Your name is Nava, you are a kind but professional AI interviewer at the company ${companyName}...`; // Your existing instruction string

    activeCallInstructions.set(callId, instruction);
    
    // Initialize OpenAI connection
    const openAiWs = await connectToOpenAI(callId, instruction);
    openAIConnections.set(callId, openAiWs);

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

    await safePusherTrigger('calls', 'call-created', {
      callSid: call.sid,
      status: 'initiated',
      timestamp: new Date().toISOString()
    });

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
        <Stream url="wss://${request.headers.host}/api/media-stream/${callId}" />
      </Connect>
    </Response>`;

  reply.type('text/xml').send(twimlResponse);
});

fastify.post('/api/media-stream/:callId', async (request, reply) => {
  try {
    const { callId } = request.params;
    const { event, media, start, parameters } = request.body;
    
    // Extract callId from parameters if present
    const streamCallId = parameters?.callId || callId;
    console.log('Stream parameters:', parameters);
    console.log('Using callId:', streamCallId);
    
    // Create data stream for real-time communication
    const dataStream = createDataStream({
      execute: async dataStreamWriter => {
        try {
          const instruction = activeCallInstructions.get(streamCallId);
          
          if (event === 'start') {
            const streamSid = start.streamSid;
            console.log('Stream started:', { streamSid, parameters });
            
            // Write initial session data
            dataStreamWriter.writeData({
              type: 'session.started',
              streamSid,
              timestamp: new Date().toISOString()
            });

            // Initialize OpenAI session
            const sessionUpdate = {
              turn_detection: { type: 'server_vad' },
              input_audio_format: 'g711_ulaw',
              output_audio_format: 'g711_ulaw',
              voice: VOICE,
              instructions: instruction,
              modalities: ["text", "audio"],
              temperature: 0.8,
              input_audio_transcription: {'model': 'whisper-1'},
            };

            dataStreamWriter.writeData({
              type: 'session.update',
              session: sessionUpdate
            });
          }
          
          if (event === 'media' && media?.payload) {
            // Send audio buffer to OpenAI
            dataStreamWriter.writeData({
              type: 'input_audio_buffer.append',
              audio: media.payload
            });

            // Process response from OpenAI
            const openaiResponse = await openai.audio.realtime.process({
              audio: media.payload,
              model: 'gpt-4o-realtime-preview-2024-10-01',
              session: instruction
            });

            // Handle OpenAI response
            for await (const chunk of openaiResponse) {
              // Log event types for debugging
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

          // Handle mark or stop events
          if (event === 'mark' || event === 'stop') {
            console.log(`Stream ${event} received for callId:`, streamCallId);
            // Cleanup for this call
            activeCallInstructions.delete(streamCallId);
            dataStreamWriter.writeData({
              type: 'stream.ended',
              timestamp: new Date().toISOString()
            });
          }
        } finally {
          // Cleanup if the stream ends for any reason
          if (streamCallId) {
            console.log('Cleaning up stream for callId:', streamCallId);
            activeCallInstructions.delete(streamCallId);
          }
        }
      },
      onError: error => {
        // Log error and cleanup
        console.error('Stream error:', error);
        if (streamCallId) {
          activeCallInstructions.delete(streamCallId);
        }
        return error instanceof Error ? error.message : String(error);
      },
    });

    // Set streaming headers
    reply.header('X-Vercel-AI-Data-Stream', 'v1');
    reply.header('Content-Type', 'text/plain; charset=utf-8');

    return reply.send(dataStream);
  } catch (error) {
    // Cleanup in case of error
    if (streamCallId) {
      activeCallInstructions.delete(streamCallId);
    }
    console.error('Error in media-stream:', error);
    reply.code(500).send({ 
      success: false, 
      error: error.message 
    });
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

export default async (req, res) => {
  await fastify.ready();
  fastify.server.emit('request', req, res);
};