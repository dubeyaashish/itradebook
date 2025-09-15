import React, { useState, useEffect, createContext, useContext } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import Cookies from 'js-cookie';
import { safeConsole, sanitizeForLog } from './utils/secureLogging';

// Components
import Layout from './components/Layout';

// Pages
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import ReportPage from './pages/ReportPage';
import DailySavedDataPage from './pages/DailySavedDataPage';
import CustomerDataPage from './pages/CustomerDataPage';
import RawDataPage from './pages/RawDataPage';
import PLReportPage from './pages/PLReportPage';
import GetSymbolsPage from './pages/GetSymbolsPage';
import CustomerTradingPage from './pages/CustomerTradingPage';
import GridsPage from './pages/GridsPage';
import EodReceivePage from './pages/EodReceivePage';
import EodCustomerDataPage from './pages/EodCustomerDataPage';

import './App.css';

// Configure axios defaults
const isProduction = process.env.NODE_ENV === 'production';
const apiURL = isProduction ? 'https://web.itradebook.com' : 'http://localhost:3001';
axios.defaults.baseURL = apiURL;
axios.defaults.withCredentials = true;

// Create axios instance with interceptors
const axiosInstance = axios.create();

// Add a request interceptor to add token to all requests
axiosInstance.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Add a response interceptor to handle token expiration
axiosInstance.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem(STORAGE_KEYS.TOKEN);
      localStorage.removeItem(STORAGE_KEYS.USER);
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Export the axios instance for use in other components
export { axiosInstance };

// Create Auth Context
const AuthContext = createContext();

// Local Storage Keys
export const STORAGE_KEYS = {
  TOKEN: 'auth_token',
  USER: 'user'
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// Auth Provider Component
const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    const savedUser = localStorage.getItem(STORAGE_KEYS.USER);
    const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
    if (savedUser && token) {
      // Set default authorization header if we have a token
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      return JSON.parse(savedUser);
    }
    return null;
  });
  const [loading, setLoading] = useState(true);

  // Set up axios interceptor to include token in requests and handle token refresh
  useEffect(() => {
    const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
    
    // Request interceptor for adding token
    const requestInterceptor = axios.interceptors.request.use(
      config => {
        const currentToken = localStorage.getItem(STORAGE_KEYS.TOKEN);
        if (currentToken) {
          config.headers.Authorization = `Bearer ${currentToken}`;
        }
        return config;
      },
      error => {
        return Promise.reject(error);
      }
    );

    // Response interceptor for handling auth errors
    const responseInterceptor = axios.interceptors.response.use(
      response => response,
      async error => {
        if (error.response?.status === 401 || error.response?.status === 403) {
          // Clear auth state on authentication error
          localStorage.removeItem(STORAGE_KEYS.TOKEN);
          localStorage.removeItem(STORAGE_KEYS.USER);
          setUser(null);
        }
        return Promise.reject(error);
      }
    );

    if (token) {
      verifyToken();
    } else {
      setLoading(false);
    }

    // Cleanup interceptors on unmount
    return () => {
      axios.interceptors.request.eject(requestInterceptor);
      axios.interceptors.response.eject(responseInterceptor);
    };
  }, []);

  const verifyToken = async () => {
    try {
      const response = await axios.get('/api/auth/profile', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem(STORAGE_KEYS.TOKEN)}`
        }
      });
      const userData = response.data.user;
      
      // Update stored user data
      localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(userData));
      setUser(userData);
    } catch (error) {
      // Clear auth state on verification failure
      localStorage.removeItem(STORAGE_KEYS.TOKEN);
      localStorage.removeItem(STORAGE_KEYS.USER);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const login = async (username, password) => {
    try {
      const response = await axios.post('/api/auth/login', {
        username,
        password
      });

      const { token, user } = response.data;
      
      // Store token and user data in localStorage with consistent keys
      localStorage.setItem(STORAGE_KEYS.TOKEN, token);
      localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
      
      // Set default authorization header
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      
      setUser(user);
      return { success: true, user };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.error || 'Login failed'
      };
    }
  };

  const register = async (username, email, password) => {
    try {
      const response = await axios.post('/api/auth/register', {
        username,
        email,
        password
      });

      const { token, user } = response.data;
      
      // Store token in cookie
      Cookies.set('auth_token', token, { expires: 1 });
      
      // Set default authorization header
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      
      setUser(user);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.error || 'Registration failed'
      };
    }
  };

  const logout = async () => {
    try {
      await axios.post('/api/auth/logout');
    } catch (error) {
      // Silent error handling for logout
    } finally {
      // Clear localStorage and user data
      localStorage.removeItem(STORAGE_KEYS.TOKEN);
      localStorage.removeItem(STORAGE_KEYS.USER);
      delete axios.defaults.headers.common['Authorization'];
      setUser(null);
    }
  };

  const value = {
    user,
    login,
    register,
    logout,
    verifyToken,
    isAuthenticated: !!user
  };

  if (loading) {
    return (
      <div className="app loading-container">
        <div className="loading-spinner">
          <div className="spinner"></div>
          <p>Loading iTradeBook...</p>
        </div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

// Protected Route Component with authentication check
const ProtectedRouteContent = ({ children }) => {
  const { user, isAuthenticated } = useAuth();
  const location = useLocation();

  useEffect(() => {
    const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
    if (!token) {
      window.location.href = '/login';
      return;
    }
    
    // Verify token is valid by checking if it's expired
    try {
      const tokenData = JSON.parse(atob(token.split('.')[1]));
      if (tokenData.exp * 1000 < Date.now()) {
        localStorage.removeItem(STORAGE_KEYS.TOKEN);
        localStorage.removeItem(STORAGE_KEYS.USER);
        window.location.href = '/login';
      }
    } catch (error) {
      localStorage.removeItem(STORAGE_KEYS.TOKEN);
      localStorage.removeItem(STORAGE_KEYS.USER);
      window.location.href = '/login';
    }
  }, []);

  if (!isAuthenticated) {
    // Redirect to login while preserving the attempted URL
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Layout>{children}</Layout>;
};

// Wrapper component that handles token verification
const ProtectedRoute = ({ children }) => {
  const { user } = useAuth();
  const auth = useAuth();
  const location = useLocation();

  useEffect(() => {
    // Verify token on route change for protected routes
    const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
    if (token && !user) {
      auth.verifyToken();
    }
  }, [location.pathname, user, auth]);

  return <ProtectedRouteContent>{children}</ProtectedRouteContent>;
};

// Public Route Component (redirects to dashboard if authenticated)
const PublicRoute = ({ children }) => {
  const { isAuthenticated } = useAuth();
  return !isAuthenticated ? children : <Navigate to="/" replace />;
};

// Main App Component
const App = () => {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          {/* Public Routes */}
          <Route 
            path="/login" 
            element={
              <PublicRoute>
                <LoginPage />
              </PublicRoute>
            } 
          />
          <Route 
            path="/register" 
            element={
              <PublicRoute>
                <RegisterPage />
              </PublicRoute>
            } 
          />
          <Route 
            path="/forgot-password" 
            element={
              <PublicRoute>
                <ForgotPasswordPage />
              </PublicRoute>
            } 
          />
          <Route 
            path="/reset-password" 
            element={
              <PublicRoute>
                <ResetPasswordPage />
              </PublicRoute>
            } 
          />

          {/* Protected Routes */}
          <Route 
            path="/" 
            element={
              <ProtectedRoute>
                <ReportPage />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/daily-saved-data" 
            element={
              <ProtectedRoute>
                <DailySavedDataPage />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/customer-data" 
            element={
              <ProtectedRoute>
                <CustomerDataPage />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/raw-data" 
            element={
              <ProtectedRoute>
                <RawDataPage />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/pl-report" 
            element={
              <ProtectedRoute>
                <PLReportPage />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/getsymbols" 
            element={
              <ProtectedRoute>
                <GetSymbolsPage />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/customertrading" 
            element={
              <ProtectedRoute>
                <CustomerTradingPage />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/grids" 
            element={
              <ProtectedRoute>
                <GridsPage />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/eod-receive" 
            element={
              <ProtectedRoute>
                <EodReceivePage />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/eod-customer-data" 
            element={
              <ProtectedRoute>
                <EodCustomerDataPage />
              </ProtectedRoute>
            } 
          />

          {/* Fallback route */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
};

export default App;