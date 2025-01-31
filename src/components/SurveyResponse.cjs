require('dotenv').config();
const { 
    db, 
    collection, 
    query, 
    where, 
    limit, 
    getDocs, 
    addDoc, 
    doc, 
    updateDoc 
} = require("../backend/firebase.cjs");

// Export functions that server.cjs will use
const SurveyResponse = {
    // Function to advance the survey
    async advanceSurvey({ phone, input, survey }) {
        try {
            //console.log('Starting advanceSurvey with:', { phone, input, survey });
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
                surveyResponse = { id: document.id, ...document.data() };//should this simply be docs[0]
            } else {
                surveyResponse = {
                    phone: phone,
                    complete: false,
                    responses: []
                };
            }

            // Process the input
            const responseLength = surveyResponse.responses.length;
            const currentQuestion = survey[responseLength];
            console.log("length of responses", responseLength);
            console.log("input", input);

            // If no input, re-ask the current question
            function reask() {
              return { surveyResponse, nextQuestionIndex: responseLength };
            }
            if (input === undefined) {
              return { surveyResponse, nextQuestionIndex: responseLength };
            }

            // Save the question type and answer
            const questionResponse = {};
            questionResponse.answer = input;
            questionResponse.text = currentQuestion.text;
            surveyResponse.responses.push(questionResponse);

            // Check if survey is complete
            if (surveyResponse.responses.length === survey.length) {
                surveyResponse.complete = true;
            }

            // Save to Firebase
            if (surveyResponse.id) {
                const docRef = doc(db, 'surveyResponses', surveyResponse.id);
                await updateDoc(docRef, surveyResponse);
            } else {
                const docRef = await addDoc(collection(db, 'surveyResponses'), surveyResponse);
                surveyResponse.id = docRef.id;
            }

            return { 
                surveyResponse, 
                nextQuestionIndex: responseLength + 1 
            };
        } catch (error) {
            console.error('Error in advanceSurvey:', error);
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
    }
})();

module.exports = SurveyResponse;
