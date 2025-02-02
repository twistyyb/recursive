# Ai Interview System

This is a simple AI interview system that uses OpenAI's Realtime API to conduct interviews.

# SETUP
1. Clone the repository
2. Run `npm install`
3. Run `npm run dev`
4. Run `node src/backend/realtime.js`
5. Open ngrok tunnel `ngrok http 3000`


# Info
all get and post calls MUST go through url/api/...

index.html -> main.tsx -> App.tsx -> aiConfig.tsx & login.tsx

aiConfig reslies on realtime.js for its api calls. realtime uses fastify for its api.

#example input forapi/initiate-call
{
    "companyName": "Cafe Strada",
    "phoneNumber": "+17473347145",
    "jobTitle": "barista",
    "targetSkillsQualities": [""],
    "additionalInstructions": ""
}