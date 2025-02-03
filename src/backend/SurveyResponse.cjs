// Handle survey response and survey progress
require('dotenv').config();
const { 
    db, 
    collection, 
    query, 
    where, 
    limit, 
    getDocs, 
    setDoc,
    doc, 
    updateDoc,
    getDoc 
} = require("./firebase.js");
const { getFirestore } = require('firebase/firestore');

// Export functions that server.cjs will use
const SurveyResponse = {
  
  // Function to create a new survey response
  async createSurveyResponse({ responseId, phone, survey }) {      //create reference to surveyResponses collection
    const surveyCollection = collection(db, 'surveyResponses');
    const surveyResponse = {
      responseId: responseId,//assign a unique id to the survey response
      phone: phone,
      complete: false,
      responses: [],
      survey: survey
    };

    const docRef = doc(surveyCollection, responseId);
    await setDoc(docRef, surveyResponse);
    console.log('Created new document:', {
      docId: docRef.id,
      surveyResponseId: surveyResponse.responseId
    });
    return;
  },

  // Function to advance the survey
  async advanceSurvey({ responseId, input }, cb) {
    try {
      console.log('Starting advanceSurvey with responseId:', responseId);

      // Find correlated survey response
      let surveyResponse;
      try {
        const docRef = doc(db, 'surveyResponses', responseId);
        const docSnapshot = await getDoc(docRef);
        
        if (!docSnapshot.exists()) {
          console.error('Survey response not found:', responseId);
          throw new Error('Survey response not found');
        }
        
        surveyResponse = { id: docSnapshot.id, ...docSnapshot.data() };
      } catch (error) {
        console.error('Unable to find survey response:', {
          code: error.code,
          message: error.message,
          stack: error.stack
        });
        throw error;
      }

      // Process the input
      const responseLength = surveyResponse.responses.length;
      const currentQuestion = surveyResponse.survey[responseLength];
      console.log("# of responses", responseLength);
      console.log("input", input);

      // If no input, re-ask the current question
      function reask() {
        console.log("attempting callback");
        console.log("surveyResponse", surveyResponse);
        cb.call(surveyResponse, null, surveyResponse, responseLength);
      }
      if (input === undefined) {
        return reask();
      }

      // Save the question type and answer
      const questionResponse = {};
      questionResponse.answer = input;
      questionResponse.text = currentQuestion;
      surveyResponse.responses.push(questionResponse);

      // Check if survey is complete
      if (surveyResponse.responses.length === surveyResponse.survey.length) {
        surveyResponse.complete = true;
      }

      // Save to Firebase      
      try {
        const docRef = doc(db, 'surveyResponses', surveyResponse.id);
        await updateDoc(docRef, surveyResponse);
        console.log('Updated existing document:', {
          docId: docRef.id,
          surveyResponseId: surveyResponse.id
        });
        
        // Only call the callback after Firestore update is complete
        cb.call(surveyResponse, null, surveyResponse, responseLength+1);
      } catch (error) {
        console.error('Error saving to Firestore:', error);
        cb.call(surveyResponse, error, null, responseLength);
      }

    } catch (error) {
      console.error('Error in advanceSurvey:', {
          code: error.code,
          message: error.message,
          stack: error.stack
      });
      throw error;
    }
  },

  async updateTranscription({ responseId, questionIndex, transcript }) {
    try {
      const surveyCollection = collection(db, 'surveyResponses');

      // First try direct document reference
      const docRef = doc(db, 'surveyResponses', responseId);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        console.log('Found document directly');
        let surveyResponse = { id: docSnap.id, ...docSnap.data() };
        if (transcript == undefined) {
          surveyResponse.responses[questionIndex].transcription = "No transcription";
        } else {
          surveyResponse.responses[questionIndex].transcription = transcript;
        }
        await updateDoc(docRef, surveyResponse);
        console.log('Transcription updated successfully');
        return;

      }

      // Fallback to query if direct lookup fails
      console.log("Direct lookup failed, trying query...");
      const q = query(
        surveyCollection,
        where('id', '==', responseId),
        limit(1)
      );
      const docSnapshot = await getDocs(q);
      
      if (docSnapshot.empty) {
        console.error('Document not found with ID:', responseId);
        throw new Error('Survey response not found');
      }
      const document = docSnapshot.docs[0];
      console.log('Found document through query:', document.id);
      let surveyResponse = { id: document.id, ...document.data() };
      surveyResponse.responses[questionIndex].transcription = transcript;
      await updateDoc(doc(db, 'surveyResponses', document.id), surveyResponse);
      
      console.log('Transcription updated');
      
    } catch (error) {
      console.error('Error in updateTranscription:', error);
      console.error('Error details:', {
        code: error.code,
        message: error.message,
        stack: error.stack
      });
      throw error;
    }
  }
};

// Test the Firebase connection when the module loads
(async function testConnection() {
    try {
        const testCollection = collection(db, 'surveyResponses');
        const testQuery = query(testCollection, limit(1));
        await getDocs(testQuery);
        console.log('Firebase connection test successful');
    } catch (error) {
        console.error('Firebase connection test failed:', error);
        process.exit(1);
    }
})();

module.exports = SurveyResponse;
