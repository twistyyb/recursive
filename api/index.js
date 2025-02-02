import Fastify from 'fastify';
import fastifyFormBody from '@fastify/formbody';
import fastifyCors from '@fastify/cors';
import dotenv from 'dotenv';
import Pusher from 'pusher-js';
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
const pusher = new Pusher(requiredEnvVars.PUSHER_APP_ID,{
  key: requiredEnvVars.PUSHER_KEY,
  secret: requiredEnvVars.PUSHER_SECRET,
  cluster: requiredEnvVars.PUSHER_CLUSTER,
  useTLS: true
});


const fastify = Fastify();
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
const callStatuses = new Map();
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
    try {
      const call = await twilioClient.calls.create({
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

fastify.get('/api/health', async (request, reply) => {
  try {
    // Basic API health check
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      mode: 'serverless'
    };
  } catch (error) {
    console.error('Health check failed:', error);
    reply.code(500).send({ 
      status: 'error',
      error: error.message 
    });
  }
});

// Add after the fastify initialization
const start = async () => {
  try {
    await fastify.listen({ 
      port: process.env.PORT || 3000,
      host: '0.0.0.0'
    });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

// Only start the server if we're not in a Vercel serverless environment
if (process.env.VERCEL !== '1') {
  start();
}

// Export for serverless
export default async (req, res) => {
  await fastify.ready();
  fastify.server.emit('request', req, res);
};