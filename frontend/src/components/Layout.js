import React, { useState, useEffect } from 'react';
import { useAuth } from '../App';
import { useLocation, useNavigate } from 'react-router-dom';
import './Layout.css';

const Layout = ({ children }) => {
  const { user, logout } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
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
          label: 'Trading Cards',
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
        description: 'Customer Data Management'
      }
    ];
  };

  const navigationItems = getNavigationItems();
  const currentItem = navigationItems.find(item => item.path === location.pathname);

  return (
    <div className="app">
      {/* Sidebar */}
      <aside className={`sidebar ${isSidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <h1>iTradeBook</h1>
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
              Copyright © 2025 iTradeBook.com. All rights reserved. 
              No part of this website may be reproduced, distributed, or transmitted in any form without prior written permission.
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default Layout;