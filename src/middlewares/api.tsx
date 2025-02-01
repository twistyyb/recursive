import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:3000';

export const createCall = async (phoneNumber: string) => {
  try {
    const response = await axios.post(`${API_BASE_URL}/create-call`, { phone: phoneNumber });
    return response.data;
  } catch (error) {
    console.error('Error creating call:', error);
    throw error;
  }
};