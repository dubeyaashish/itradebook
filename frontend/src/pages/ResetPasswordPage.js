import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';

const ResetPasswordPage = () => {
  const [formData, setFormData] = useState({
    email: '',
    otp: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');

    // Client-side validation
    if (formData.newPassword !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (formData.newPassword.length < 6) {
      setError('Password must be at least 6 characters long');
      return;
    }

    if (formData.otp.length !== 6) {
      setError('OTP must be 6 digits');
      return;
    }

    setLoading(true);

    try {
      const response = await axios.post('/api/auth/reset-password', {
        email: formData.email,
        otp: formData.otp,
        newPassword: formData.newPassword
      });
      
      setMessage(response.data.message);
      
      // Redirect to login after successful reset
      setTimeout(() => {
        navigate('/login');
      }, 2000);
      
    } catch (error) {
      setError(error.response?.data?.error || 'Password reset failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <h1>Reset Password</h1>
          <p>Enter your OTP and new password</p>
        </div>

        {error && <div className="error-message">{error}</div>}
        {message && <div className="success-message">{message}</div>}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label htmlFor="email">Email Address</label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              required
              autoComplete="email"
              placeholder="Enter your email address"
            />
          </div>

          <div className="form-group">
            <label htmlFor="otp">OTP Code</label>
            <input
              type="text"
              id="otp"
              name="otp"
              value={formData.otp}
              onChange={handleChange}
              required
              maxLength="6"
              pattern="[0-9]{6}"
              placeholder="Enter 6-digit OTP"
              className="otp-input"
            />
          </div>

          <div className="form-group">
            <label htmlFor="newPassword">New Password</label>
            <input
              type="password"
              id="newPassword"
              name="newPassword"
              value={formData.newPassword}
              onChange={handleChange}
              required
              autoComplete="new-password"
              placeholder="Enter new password (min 6 characters)"
            />
          </div>

          <div className="form-group">
            <label htmlFor="confirmPassword">Confirm New Password</label>
            <input
              type="password"
              id="confirmPassword"
              name="confirmPassword"
              value={formData.confirmPassword}
              onChange={handleChange}
              required
              autoComplete="new-password"
              placeholder="Confirm new password"
            />
          </div>

          <button 
            type="submit" 
            className="auth-button"
            disabled={loading}
          >
            {loading ? 'Resetting Password...' : 'Reset Password'}
          </button>
        </form>

        <div className="auth-links">
          <Link to="/forgot-password" className="link">
            Need a new OTP?
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

export default ResetPasswordPage;