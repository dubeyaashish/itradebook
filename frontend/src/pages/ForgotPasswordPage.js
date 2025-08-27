import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';

const ForgotPasswordPage = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    try {
      const response = await axios.post('/api/auth/forgot-password', { email });
      setMessage(response.data.message);
      setEmail(''); // Clear form
    } catch (error) {
      setError(error.response?.data?.error || 'Failed to send reset email');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <h1>Reset Password</h1>
          <p>Enter your email to receive a reset OTP</p>
        </div>

        {error && <div className="error-message">{error}</div>}
        {message && <div className="success-message">{message}</div>}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label htmlFor="email">Email Address</label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder="Enter your email address"
            />
          </div>

          <button 
            type="submit" 
            className="auth-button"
            disabled={loading}
          >
            {loading ? 'Sending OTP...' : 'Send Reset OTP'}
          </button>
        </form>

        <div className="auth-links">
          <Link to="/reset-password" className="link">
            Already have an OTP? Reset password
          </Link>
        </div>

        <div className="auth-divider">
          <span>Remember your password?</span>
        </div>

        <Link to="/login" className="auth-button-secondary">
          Back to Sign In
        </Link>
      </div>
    </div>
  );
};

export default ForgotPasswordPage;