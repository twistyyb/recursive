const { db } = require("../backend/firebase.cjs"); // Assuming Firebase is initialized elsewhere
const { collection, query, where, limit, getDocs, addDoc, doc, updateDoc } = require('firebase/firestore');

class SurveyResponse {
  constructor(data) {
    this.phone = data.phone;
    this.complete = data.complete || false;
    this.responses = data.responses || [];
    this.id = data.id || null; // Firestore document ID
  }

  // Save the survey response to Firestore
  async save() {
    try {
      if (this.id) {
        // Update existing document
        const docRef = doc(db, 'surveyResponses', this.id);
        await updateDoc(docRef, {
          phone: this.phone,
          complete: this.complete,
          responses: this.responses,
        });
      } else {
        // Create new document
        const collectionRef = collection(db, 'surveyResponses');
        const docRef = await addDoc(collectionRef, {
          phone: this.phone,
          complete: this.complete,
          responses: this.responses,
        });
        this.id = docRef.id;
      }
    } catch (error) {
      console.error('Error saving survey response:', error);
      throw error;
    }
  }

  // Static method to advance the survey
  static async advanceSurvey(args) {
    const { phone, input, survey } = args;

    try {
      // Find an incomplete survey response
      const surveyCollection = collection(db, 'surveyResponses');
      const q = query(
        surveyCollection,
        where('phone', '==', phone),
        where('complete', '==', false),
        limit(1)
      );
      const querySnapshot = await getDocs(q);
      
      let surveyResponse;
      if (!querySnapshot.empty) {
        const doc = querySnapshot.docs[0];
        surveyResponse = new SurveyResponse({ id: doc.id, ...doc.data() });
      } else {
        surveyResponse = new SurveyResponse({ phone });
      }

      // Process the input
      const responseLength = surveyResponse.responses.length;
      const currentQuestion = survey[responseLength];

      // If no input, re-ask the current question
      if (input === undefined) {
        return { surveyResponse, nextQuestionIndex: responseLength };
      }

      // Process the input based on the question type
      const questionResponse = {};
      if (currentQuestion.type === 'boolean') {
        questionResponse.answer = input === '1' || input.toLowerCase() === 'yes';
      } else if (currentQuestion.type === 'number') {
        const num = Number(input);
        if (isNaN(num)) {
          // Invalid input, re-ask the question
          return { surveyResponse, nextQuestionIndex: responseLength };
        } else {
          questionResponse.answer = num;
        }
      } else if (input.indexOf('http') === 0) {
        // Input is a recording URL
        questionResponse.recordingUrl = input;
      } else {
        // Default to raw input
        questionResponse.answer = input;
      }

      // Save the question type
      questionResponse.type = currentQuestion.type;
      surveyResponse.responses.push(questionResponse);

      // Mark as complete if all questions are answered
      if (surveyResponse.responses.length === survey.length) {
        surveyResponse.complete = true;
      }

      // Save the updated survey response
      await surveyResponse.save();

      // Return the updated survey response and the next question index
      return { surveyResponse, nextQuestionIndex: responseLength + 1 };
    } catch (error) {
      console.error('Error advancing survey:', error);
      throw error;
    }
  }
}
var SurveyResponse = model('SurveyResponse', SurveyResponseSchema);
