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
} = require("../backend/firebase.cjs");
const { getFirestore } = require('firebase/firestore');
const modifier = new Date().toISOString();

// Export functions that server.cjs will use
const SurveyResponse = {
  // Function to advance the survey
  async advanceSurvey({ phone, input, survey }, cb) {
    try {
      console.log('Starting advanceSurvey');
      //create reference to surveyResponses collection
      const surveyCollection = collection(db, 'surveyResponses');

      // Find an incomplete survey response
      const q = query(
        surveyCollection,
        where('phone', '==', phone),
        where('complete', '==', false),
        limit(1)
      );
      const querySnapshot = await getDocs(q);
      console.log('Query executed, empty?', querySnapshot.empty);
      
      // Get or create survey response
      let surveyResponse;
      if (!querySnapshot.empty) {
        const document = querySnapshot.docs[0];
        surveyResponse = { id: document.id, ...document.data() };
      } else {
        surveyResponse = {
          id: "survey" + modifier,//assign a unique id to the survey response
          phone: phone,
          complete: false,
          responses: [],
          intialized: false
        };
        console.log("newid", surveyResponse.id);
      }

      // Process the input
      const responseLength = surveyResponse.responses.length;
      const currentQuestion = survey[responseLength];
      console.log("# of responses", responseLength);
      console.log("input", input);

      // If no input, re-ask the current question
      function reask() {
        console.log("attempting callback");
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
      if (surveyResponse.responses.length === survey.length) {
        surveyResponse.complete = true;
      }

      // Save to Firebase
      if (!Array.isArray(survey) || survey.length === 0) {
        throw new Error('Invalid survey data');
      }
      
      try {
        if (surveyResponse.intialized) {
          const docRef = doc(db, 'surveyResponses', surveyResponse.id);
          await updateDoc(docRef, surveyResponse);
          console.log('Updated existing document:', {
            docId: docRef.id,
            surveyResponseId: surveyResponse.id
          });
        } else {
          console.log("creating new response doc")
          surveyResponse.intialized = true;
          const docRef = doc(surveyCollection, surveyResponse.id);
          await setDoc(docRef, surveyResponse);
          console.log('Created new document:', {
            docId: docRef.id,
            surveyResponseId: surveyResponse.id
          });
        }
        
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
      console.log('Starting updateTranscription with:', {
        responseId,
        questionIndex,
        transcript
      });
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
      const querySnapshot = await getDocs(q);
      
      if (querySnapshot.empty) {
        console.error('Document not found with ID:', responseId);
        throw new Error('Survey response not found');
      }
      const document = querySnapshot.docs[0];
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
