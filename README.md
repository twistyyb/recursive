# Ai Interview System

This is a simple AI interview system that uses OpenAI's Realtime API to conduct interviews.

# SETUP
1. Clone the repository
2. Run `npm install`
3. Run `npm run dev`
4. Run `node api/index.js`
5. Open ngrok tunnel `ngrok http 3000` 


# Info
All get and post calls MUST go through url/api/...

index.html -> main.tsx -> App.tsx -> aiConfig.tsx & login.tsx

aiConfig reslies on index.js for its api calls. realtime uses fastify for its api.

the latest deployment is always available at https://recursive-ten.vercel.app

# Known Issues
twilio stream requires websocket. i am trying to deploy on vercel which prohibits websocket. Consider using a split architecture 