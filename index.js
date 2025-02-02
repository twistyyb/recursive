import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fastifyStatic from '@fastify/static';

// Import your existing Fastify app
import './api/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Serve static files from the dist directory
fastify.register(fastifyStatic, {
  root: join(__dirname, 'dist'),
  prefix: '/', // Serve the files under the root path
});

// Handle all other routes by serving index.html
fastify.get('*', async (request, reply) => {
  return reply.sendFile('index.html');
}); 