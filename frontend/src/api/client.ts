import axios from 'axios';

const apiClient = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
  // Required for HttpOnly cookies to be sent cross-origin in dev
  withCredentials: true,
});

// Unwrap { success, data } envelope
apiClient.interceptors.response.use(
  (response) => {
    if (
      response.data &&
      typeof response.data === 'object' &&
      'success' in response.data &&
      'data' in response.data
    ) {
      response.data = response.data.data;
    }
    return response;
  },
  (error) => {
    // 401s are handled by the caller / AuthContext /me check
    return Promise.reject(error);
  }
);

export default apiClient;
