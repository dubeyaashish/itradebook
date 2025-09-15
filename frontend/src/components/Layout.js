import React, { useState, useEffect } from 'react';
import { useAuth } from '../App';
import { useLocation, useNavigate } from 'react-router-dom';
import './Layout.css';

const Layout = ({ children }) => {
  const { user, logout } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [apisOpen, setApisOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  // Close sidebar when route changes on mobile
  useEffect(() => {
    setIsSidebarOpen(false);
  }, [location.pathname]);

  // Close sidebar when clicking outside on mobile
  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (window.innerWidth <= 768 && 
          isSidebarOpen && 
          !event.target.closest('.sidebar') && 
          !event.target.closest('.hamburger-button')) {
        setIsSidebarOpen(false);
      }
    };

    document.addEventListener('click', handleOutsideClick);
    return () => document.removeEventListener('click', handleOutsideClick);
  }, [isSidebarOpen]);

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  const handleNavigation = (path) => {
    navigate(path);
    if (window.innerWidth <= 768) {
      setIsSidebarOpen(false);
    }
  };

  const handleLogout = async () => {
    await logout();
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

    // APIS dropdown group
    const apisGroup = {
      label: 'APIS',
      icon: 'fas fa-plug',
      children: [
        {
          path: '/getsymbols',
          label: 'GetSymbols',
          icon: 'fas fa-chart-line',
          description: 'Symbol Trading Data API'
        },
        {
          path: '/customertrading',
          label: 'Customer Trading',
          icon: 'fas fa-users',
          description: 'Customer Trading Data API'
        },
        {
          path: '/grids',
          label: 'Grids',
          icon: 'fas fa-th',
          description: 'Grid Order Data API'
        },
         {
      path: '/eod-receive',
      label: 'EOD-Receive',
      icon: 'fas fa-calendar-check',
      description: 'End-of-Day Receive Data API'
    },
    {
      path: '/eod-customer-data',
      label: 'EOD-CustomerData',
      icon: 'fas fa-user-clock',
      description: 'End-of-Day Customer Data API'
    }
      ]
    };

    if (user?.user_type === 'managed') {
      return [
        ...baseItems,
        {
          path: '/customer-data',
          label: 'Exp. Data',
          icon: 'fas fa-user',
          description: 'Exp Data Management'
        },
        {
          path: '/daily-saved-data',
          label: 'Trading Cards',
          icon: 'fas fa-file-alt',
          description: 'Live Cards'
        }
      ];
    }

    // Regular and admin users get full navigation
    return [
      ...baseItems,
      {
        path: '/daily-saved-data',
        label: 'Trading Cards',
        icon: 'fas fa-chart-line',
        description: 'Real-time Trading Cards'
      },
      {
        path: '/raw-data',
        label: 'Trading Data',
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
        description: 'Exp Data Management'
      },
      apisGroup
    ];
  };

  const navigationItems = getNavigationItems();
  const currentItem = navigationItems.find(item => item.path === location.pathname || (item.children && item.children.some(child => child.path === location.pathname)));

  return (
    <div className="app">
      {/* Sidebar */}
      <aside className={`sidebar ${isSidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div className="logo-container">
            <img src="/logo.png" alt="itradebook" className="logo" />
          </div>
          <span className="page-subtitle">{currentItem?.description}</span>
        </div>

        <div className="sidebar-user-info">
          <div className="user-details">
            <span className="user-welcome">Welcome, {user?.username}</span>
            <span className="user-type">
              {user?.user_type === 'managed' ? 'Managed User' : 
               user?.user_type === 'admin' ? 'Admin' : 'Regular User'}
            </span>
          </div>
        </div>

        <nav className="nav-items">
          {navigationItems.map((item) => (
            item.children ? (
              <div key={item.label} className="nav-group">
                <button className="nav-item nav-group-label" onClick={() => setApisOpen(v => !v)}>
                  <i className={item.icon}></i>
                  <span>{item.label}</span>
                  <i className={`fas fa-caret-${apisOpen ? 'up' : 'down'}`} style={{ marginLeft: 8 }}></i>
                </button>
                {apisOpen && (
                  <div className="nav-group-dropdown">
                    {item.children.map((child) => (
                      <button
                        key={child.path}
                        onClick={() => handleNavigation(child.path)}
                        className={`nav-item ${location.pathname === child.path ? 'active' : ''}`}
                      >
                        <i className={child.icon}></i>
                        <span>{child.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <button
                key={item.path}
                onClick={() => handleNavigation(item.path)}
                className={`nav-item ${location.pathname === item.path ? 'active' : ''}`}
              >
                <i className={item.icon}></i>
                <span>{item.label}</span>
              </button>
            )
          ))}
        </nav>

        <div className="sidebar-footer">
          <button onClick={handleLogout} className="logout-button">
            <i className="fas fa-sign-out-alt"></i>
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Mobile Overlay */}
      <div className={`overlay ${isSidebarOpen ? 'show' : ''}`} onClick={toggleSidebar}></div>

      {/* Mobile Menu Button */}
      <button className="hamburger-button" onClick={toggleSidebar} aria-label="Toggle menu">
        <i className="fas fa-bars"></i>
      </button>

      {/* Main Content Wrapper */}
      <div className="main-wrapper">
        <main className="main-content">
          {children}
        </main>

        <footer className="app-footer">
          <div className="footer-content">
            <p>
              Copyright © 2025 itradebook.com. All rights reserved. 
              No part of this website may be reproduced, distributed, or transmitted in any form without prior written permission.
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default Layout;