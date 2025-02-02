import Fastify from 'fastify';
import fastifyFormBody from '@fastify/formbody';
import fastifyCors from '@fastify/cors';
import dotenv from 'dotenv';
import Pusher from 'pusher';
import twilio from 'twilio';
import { WebSocket } from 'ws';

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
const openAIConnections = new Map();

// Handle OpenAI WebSocket connection
const connectToOpenAI = async (callId, instruction) => {
  debugLog(`Connecting to OpenAI for call ${callId}`);
  
  const openAiWs = new WebSocket('wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01', {
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "OpenAI-Beta": "realtime=v1"
    }
  });

  openAiWs.on('error', (error) => {
    debugLog(`OpenAI WebSocket error for call ${callId}:`, {
      error: error.message,
      stack: error.stack
    });
  });

  openAiWs.on('open', () => {
    debugLog(`OpenAI WebSocket connected for call ${callId}`);
  });

  openAiWs.on('close', () => {
    debugLog(`OpenAI WebSocket closed for call ${callId}`);
  });

  // Update Pusher trigger with error handling
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

  openAiWs.on('message', (data) => {
    try {
      const response = JSON.parse(data);
      
      if (response.type === 'response.audio.delta' && response.delta) {
        // Send audio through Pusher instead of direct WebSocket
        pusher.trigger(`call-${callId}`, 'audio-chunk', {
          payload: response.delta
        });
      }
      
      if (response.type === 'response.audio_transcript.done') {
        console.log('AI:', response.transcript);
        pusher.trigger(`call-${callId}`, 'transcript', {
          speaker: 'AI',
          text: response.transcript
        });
      }
    } catch (error) {
      console.error('Error processing OpenAI message:', error);
    }
  });

  return openAiWs;
};

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

// Media Stream
fastify.register(async (fastify) => {
  fastify.get('/api/media-stream/:callId', { websocket: true }, (connection, req) => {
    console.log('media-stream route hit');
    
    // Extract callId from params
    const callId = req.params?.callId;
    
    if (!callId) {
      console.error('No valid callId found in params:', req.params);
      connection.socket.close();
      return;
    }

    console.log('Extracted callId:', callId);
    const instruction = activeCallInstructions.get(callId);

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

// Endpoint to handle audio data from Twilio
fastify.post('/api/audio-chunk', async (request, reply) => {
  const { callId, audioData } = request.body;
  
  const openAiWs = openAIConnections.get(callId);
  if (openAiWs && openAiWs.readyState === WebSocket.OPEN) {
    const audioAppend = {
      type: 'input_audio_buffer.append',
      audio: audioData
    };
    openAiWs.send(JSON.stringify(audioAppend));
  }
  
  reply.send({ success: true });
});

// Clean up resources when call ends
fastify.post('/api/call-ended', async (request, reply) => {
  const { callId } = request.body;
  
  const openAiWs = openAIConnections.get(callId);
  if (openAiWs) {
    openAiWs.close();
    openAIConnections.delete(callId);
  }
  
  activeCallInstructions.delete(callId);
  reply.send({ success: true });
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