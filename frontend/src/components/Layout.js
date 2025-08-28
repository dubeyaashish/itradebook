import React, { useState, useEffect } from 'react';
import { useAuth } from '../App';
import { useLocation, useNavigate } from 'react-router-dom';

const Layout = ({ children }) => {
  const { user, logout } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  // Close mobile menu when route changes
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  // Close mobile menu when clicking outside
  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (isMobileMenuOpen && !event.target.closest('.mobile-nav') && !event.target.closest('.hamburger')) {
        setIsMobileMenuOpen(false);
      }
    };

    document.addEventListener('click', handleOutsideClick);
    return () => document.removeEventListener('click', handleOutsideClick);
  }, [isMobileMenuOpen]);

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  const handleNavigation = (path) => {
    navigate(path);
    setIsMobileMenuOpen(false);
  };

  const handleLogout = async () => {
    await logout();
    setIsMobileMenuOpen(false);
  };

  // Navigation items based on user type
  const getNavigationItems = () => {
    const baseItems = [
      {
        path: '/',
        label: 'Dashboard',
        icon: 'fas fa-home',
        description: 'Trading Data Report'
      }
    ];

    if (user?.user_type === 'managed') {
      return [
        ...baseItems,
        {
          path: '/customer-data',
          label: 'Exp. Data',
          icon: 'fas fa-user',
          description: 'Customer Data Management'
        },
        {
          path: '/daily-saved-data',
          label: 'Daily Saved Data',
          icon: 'fas fa-file-alt',
          description: 'Live Dashboard Cards'
        }
      ];
    }

    // Regular and admin users get full navigation
    return [
      ...baseItems,
      {
        path: '/daily-saved-data',
        label: 'Live Dashboard',
        icon: 'fas fa-chart-line',
        description: 'Real-time Trading Cards'
      },
      {
        path: '/raw-data',
        label: 'Raw Data (RNPR)',
        icon: 'fas fa-table',
        description: 'Raw Data Table View'
      },
      {
        path: '/pl-report',
        label: 'P&L Report',
        icon: 'fas fa-chart-bar',
        description: 'Profit & Loss Analysis'
      },
      {
        path: '/customer-data',
        label: 'Exp. Data',
        icon: 'fas fa-user',
        description: 'Customer Data Management'
      }
    ];
  };

  const navigationItems = getNavigationItems();
  const currentItem = navigationItems.find(item => item.path === location.pathname);

  return (
    <div className="app">
      {/* Header */}
      <header className="app-header">
        <div className="header-content">
          <div className="header-left">
            <button
              onClick={toggleMobileMenu}
              className="hamburger md:hidden"
              aria-label="Toggle navigation menu"
            >
              <div className={`hamburger-line ${isMobileMenuOpen ? 'active' : ''}`}></div>
              <div className={`hamburger-line ${isMobileMenuOpen ? 'active' : ''}`}></div>
              <div className={`hamburger-line ${isMobileMenuOpen ? 'active' : ''}`}></div>
            </button>
            <div className="brand">
              <h1>iTradeBook</h1>
              {currentItem && (
                <span className="page-subtitle">{currentItem.description}</span>
              )}
            </div>
          </div>

          {/* Desktop Navigation */}
          <nav className="desktop-nav hidden md:flex">
            {navigationItems.map((item) => (
              <button
                key={item.path}
                onClick={() => handleNavigation(item.path)}
                className={`nav-item ${location.pathname === item.path ? 'active' : ''}`}
              >
                <i className={item.icon}></i>
                <span>{item.label}</span>
              </button>
            ))}
          </nav>

          <div className="header-right">
            <div className="user-info">
              <div className="user-details">
                <span className="user-welcome">Welcome, {user?.username}</span>
                {user?.user_type === 'managed' && (
                  <span className="badge badge-managed">Managed User</span>
                )}
                {user?.user_type === 'admin' && (
                  <span className="badge badge-admin">Admin</span>
                )}
              </div>
            </div>
            <button onClick={handleLogout} className="logout-button">
              <i className="fas fa-sign-out-alt"></i>
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Navigation Overlay */}
      {isMobileMenuOpen && <div className="mobile-overlay"></div>}

      {/* Mobile Navigation Sidebar */}
      <nav className={`mobile-nav ${isMobileMenuOpen ? 'open' : ''}`}>
        <div className="mobile-nav-header">
          <div className="brand-mobile">
            <h2>iTradeBook</h2>
            <span className="user-type-badge">
              {user?.user_type === 'managed' ? 'Managed User' : 
               user?.user_type === 'admin' ? 'Admin' : 'Regular User'}
            </span>
          </div>
          <button
            onClick={toggleMobileMenu}
            className="close-mobile-nav"
            aria-label="Close navigation menu"
          >
            <i className="fas fa-times"></i>
          </button>
        </div>

        <div className="mobile-nav-body">
          <div className="mobile-user-info">
            <div className="user-avatar">
              <i className="fas fa-user"></i>
            </div>
            <div className="user-details-mobile">
              <span className="username">{user?.username}</span>
              <span className="email">{user?.email}</span>
            </div>
          </div>

          <div className="mobile-nav-items">
            {navigationItems.map((item) => (
              <button
                key={item.path}
                onClick={() => handleNavigation(item.path)}
                className={`mobile-nav-item ${location.pathname === item.path ? 'active' : ''}`}
              >
                <div className="mobile-nav-item-icon">
                  <i className={item.icon}></i>
                </div>
                <div className="mobile-nav-item-content">
                  <span className="mobile-nav-item-label">{item.label}</span>
                  <span className="mobile-nav-item-desc">{item.description}</span>
                </div>
                {location.pathname === item.path && (
                  <div className="mobile-nav-item-indicator">
                    <i className="fas fa-chevron-right"></i>
                  </div>
                )}
              </button>
            ))}
          </div>

          <div className="mobile-nav-footer">
            <button onClick={handleLogout} className="mobile-logout-button">
              <i className="fas fa-sign-out-alt"></i>
              <span>Logout</span>
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="main-content">
        {children}
      </main>

      {/* Footer */}
      <footer className="app-footer">
        <div className="footer-content">
          <p>
            Copyright © 2025 iTradeBook.com. All rights reserved. 
            No part of this website may be reproduced, distributed, or transmitted in any form without prior written permission.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Layout;