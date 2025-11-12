// src/apiService.js
const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://127.0.0.1:8000';
const API_KEY = process.env.REACT_APP_API_KEY;

// Validate API key on load
if (!API_KEY) {
  console.error('❌ REACT_APP_API_KEY is not set in .env file!');
  console.error('Please create a .env file with: REACT_APP_API_KEY=your-api-key');
}

class APIService {
  constructor() {
    // Log configuration on initialization (helpful for debugging)
    console.log('🔧 API Service Configuration:');
    console.log('📍 API URL:', API_BASE_URL);
    console.log('🔑 API Key:', API_KEY ? '✅ Loaded' : '❌ Missing');
    
    if (!API_KEY) {
      console.warn('⚠️ API requests will fail without a valid API key');
    }
  }

  // Helper method to get headers
  getHeaders(includeContentType = true) {
    const headers = {};
    
    // Only add API key if it exists
    if (API_KEY) {
      headers['X-API-Key'] = API_KEY;
    }
    
    if (includeContentType) {
      headers['Content-Type'] = 'application/json';
    }
    
    return headers;
  }

  // Helper method to handle errors
  async handleResponse(response) {
    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      
      try {
        const error = await response.json();
        errorMessage = error.detail || error.message || errorMessage;
      } catch (e) {
        // If response is not JSON, use status text
      }
      
      throw new Error(errorMessage);
    }
    
    return await response.json();
  }

  // Register participant
  async register(name, email, mobile) {
    try {
      console.log('📝 Registering participant:', { name, email, mobile });
      
      const response = await fetch(`${API_BASE_URL}/api/register`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ name, email, mobile }),
      });

      const data = await this.handleResponse(response);
      console.log('✅ Registration successful:', data);
      return data;
    } catch (error) {
      console.error('❌ Registration error:', error);
      throw error;
    }
  }

  // Submit resume
  async submitResume(participantId, file, jobDescription, jdEducation = '') {
    try {
      console.log('📤 Submitting resume for participant:', participantId);
      
      const formData = new FormData();
      formData.append('participant_id', participantId);
      formData.append('resume', file);
      formData.append('job_description', jobDescription);
      formData.append('jd_education', jdEducation);

      const headers = {};
      if (API_KEY) {
        headers['X-API-Key'] = API_KEY;
      }

      const response = await fetch(`${API_BASE_URL}/api/submit`, {
        method: 'POST',
        headers: headers,
        // Don't set Content-Type for FormData - browser will set it automatically
        body: formData,
      });

      const data = await this.handleResponse(response);
      console.log('✅ Resume submission successful:', data);
      return data;
    } catch (error) {
      console.error('❌ Submission error:', error);
      throw error;
    }
  }

  // Get participant scores
  async getParticipantScores(participantId) {
    try {
      console.log('📊 Fetching scores for participant:', participantId);
      
      const response = await fetch(
        `${API_BASE_URL}/api/participant/${participantId}/scores`,
        {
          method: 'GET',
          headers: this.getHeaders(),
        }
      );

      const data = await this.handleResponse(response);
      console.log('✅ Scores fetched:', data);
      return data;
    } catch (error) {
      console.error('❌ Get scores error:', error);
      throw error;
    }
  }

  // Get upload count
  async getUploadCount(participantId) {
    try {
      console.log('📈 Fetching upload count for:', participantId);
      
      const response = await fetch(
        `${API_BASE_URL}/api/participant/${participantId}/upload-count`,
        {
          method: 'GET',
          headers: this.getHeaders(),
        }
      );

      const data = await this.handleResponse(response);
      console.log('✅ Upload count:', data);
      return data;
    } catch (error) {
      console.error('❌ Get upload count error:', error);
      throw error;
    }
  }

  // Get leaderboard
  async getLeaderboard() {
    try {
      console.log('🏆 Fetching leaderboard...');
      
      const response = await fetch(`${API_BASE_URL}/api/leaderboard`, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      const data = await this.handleResponse(response);
      console.log('✅ Leaderboard fetched:', data);
      return data;
    } catch (error) {
      console.error('❌ Get leaderboard error:', error);
      throw error;
    }
  }

  // Get competition stats
  async getStats() {
    try {
      console.log('📊 Fetching stats...');
      
      const response = await fetch(`${API_BASE_URL}/api/stats`, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      const data = await this.handleResponse(response);
      console.log('✅ Stats fetched:', data);
      return data;
    } catch (error) {
      console.error('❌ Get stats error:', error);
      throw error;
    }
  }

  // Health check (no API key needed)
  async healthCheck() {
    try {
      console.log('🏥 Health check...');
      
      const response = await fetch(`${API_BASE_URL}/health`);
      
      if (!response.ok) {
        console.warn('⚠️ Health check failed');
        return null;
      }
      
      const data = await response.json();
      console.log('✅ Health check passed:', data);
      return data;
    } catch (error) {
      console.error('❌ Health check error:', error);
      return null;
    }
  }
}

const apiService = new APIService();
export default apiService;