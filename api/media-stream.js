// media-stream.js
import { openai } from '@ai-sdk/openai';
import { createDataStream } from 'ai';

export const config = {
  runtime: 'edge', // Use Edge Runtime for streaming
};

export default async function handler(request) {
  console.log("entered media-stream.js")
  try {
    console.log("request", request)
    const params = new URL(request.url).searchParams;
    const callId = params.get('callId') || request.query.callId || request.body.callId;
    const body = await request.json();
    const { event, media, start, parameters } = body || {};
    console.log("callId", callId)
    

    const streamCallId = parameters?.callId || callId;
    console.log('Stream parameters:', parameters);
    console.log('Using callId:', streamCallId);

    // Set required headers for streaming
    const headers = new Headers({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const stream = new TransformStream();
    const writer = stream.writable.getWriter();

    const dataStream = createDataStream({
      execute: async dataStreamWriter => {
        try {
          if (event === 'start') {
            console.log('Starting stream');
            
            // Write initial session data
            dataStreamWriter.writeData({
              type: 'session.started',
              streamSid: start.streamSid,
              timestamp: new Date().toISOString()
            });

            // Send initial session configuration
            dataStreamWriter.writeData({
              type: 'session.update',
              session: {
                turn_detection: { type: 'server_vad' },
                input_audio_format: 'g711_ulaw',
                output_audio_format: 'g711_ulaw',
                voice: 'alloy',
                instructions: 'Your name is Nava...', // Get this from your database/storage
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

            for await (const chunk of openaiResponse) {
              if (chunk.type === 'response.audio.delta' && chunk.delta) {
                const audioDelta = {
                  event: 'media',
                  streamSid: start.streamSid,
                  media: { payload: Buffer.from(chunk.delta, 'base64').toString('base64') }
                };
                dataStreamWriter.writeData(audioDelta);
              }
            }
          }
        } catch (error) {
          console.error('Error in stream execution:', error);
          throw error;
        }
      },
      onError: error => {
        console.error('Stream error:', error);
        return error instanceof Error ? error.message : String(error);
      },
    });

    return new Response(dataStream, {
      headers,
      status: 200,
    });
  } catch (error) {
    console.error('Error in media-stream:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}