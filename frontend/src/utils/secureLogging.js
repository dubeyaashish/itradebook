// Safe console utilities for production security
const isDevelopment = process.env.NODE_ENV === 'development';

// Safe console methods that only log in development
export const safeConsole = {
  log: (...args) => {
    if (isDevelopment) {
      console.log(...args);
    }
  },
  
  error: (...args) => {
    if (isDevelopment) {
      console.error(...args);
    }
  },
  
  warn: (...args) => {
    if (isDevelopment) {
      console.warn(...args);
    }
  },
  
  info: (...args) => {
    if (isDevelopment) {
      console.info(...args);
    }
  },
  
  debug: (...args) => {
    if (isDevelopment) {
      console.debug(...args);
    }
  }
};

// Function to sanitize sensitive data from logs
export const sanitizeForLog = (data) => {
  if (!isDevelopment) return '[HIDDEN]';
  
  if (typeof data === 'object' && data !== null) {
    const sanitized = { ...data };
    
    // Remove sensitive keys
    const sensitiveKeys = ['token', 'password', 'secret', 'key', 'authorization', 'bearer'];
    
    Object.keys(sanitized).forEach(key => {
      if (sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive))) {
        sanitized[key] = '[HIDDEN]';
      }
    });
    
    return sanitized;
  }
  
  return data;
};

// Disable console in production completely
if (!isDevelopment) {
  // Store original console methods
  const originalConsole = { ...console };
  
  // Override console methods
  console.log = () => {};
  console.error = () => {};
  console.warn = () => {};
  console.info = () => {};
  console.debug = () => {};
  console.trace = () => {};
  console.group = () => {};
  console.groupEnd = () => {};
  console.time = () => {};
  console.timeEnd = () => {};
  console.count = () => {};
  console.countReset = () => {};
  console.table = () => {};
  console.clear = () => {};
  console.dir = () => {};
  console.dirxml = () => {};
  console.assert = () => {};
  
  // Disable React DevTools safely
  if (typeof window !== 'undefined') {
    try {
      // Check if the property already exists
      if (!window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
        // Define it as a non-writable property
        Object.defineProperty(window, '__REACT_DEVTOOLS_GLOBAL_HOOK__', {
          value: {
            isDisabled: true,
            supportsFiber: true,
            inject: () => {},
            onCommitFiberRoot: () => {},
            onCommitFiberUnmount: () => {},
          },
          writable: false,
          configurable: false
        });
      } else {
        // If it exists, try to modify its properties safely
        try {
          window.__REACT_DEVTOOLS_GLOBAL_HOOK__.isDisabled = true;
        } catch (e) {
          // Property is read-only, ignore
        }
      }
    } catch (e) {
      // If we can't define or modify the property, just ignore
      console.log('DevTools hook already defined or protected');
    }
    
    // Disable Redux DevTools
    try {
      window.__REDUX_DEVTOOLS_EXTENSION__ = undefined;
      window.__REDUX_DEVTOOLS_EXTENSION_COMPOSE__ = undefined;
    } catch (e) {
      // Ignore if these are protected
    }
    
    // Block F12 and other debug keys - TEMPORARILY DISABLED FOR DEBUGGING
    /*
    document.addEventListener('keydown', function(e) {
      // F12 key
      if (e.keyCode === 123) {
        e.preventDefault();
        return false;
      }
      
      // Ctrl+Shift+I (Developer Tools)
      if (e.ctrlKey && e.shiftKey && e.keyCode === 73) {
        e.preventDefault();
        return false;
      }
      
      // Ctrl+Shift+C (Element Inspector)
      if (e.ctrlKey && e.shiftKey && e.keyCode === 67) {
        e.preventDefault();
        return false;
      }
      
      // Ctrl+Shift+J (Console)
      if (e.ctrlKey && e.shiftKey && e.keyCode === 74) {
        e.preventDefault();
        return false;
      }
      
      // Ctrl+U (View Source)
      if (e.ctrlKey && e.keyCode === 85) {
        e.preventDefault();
        return false;
      }
    });
    */
    
    // Block right-click context menu - TEMPORARILY DISABLED FOR DEBUGGING
    /*
    document.addEventListener('contextmenu', function(e) {
      e.preventDefault();
      return false;
    });
    */
    
    // Block text selection - TEMPORARILY DISABLED FOR DEBUGGING
    /*
    document.addEventListener('selectstart', function(e) {
      e.preventDefault();
      return false;
    });
    */
    
    // Detect DevTools opening - DISABLED (too aggressive)
    /*
    let devtools = {
      open: false,
      orientation: null
    };
    
    const threshold = 160;
    
    setInterval(() => {
      if (window.outerHeight - window.innerHeight > threshold || 
          window.outerWidth - window.innerWidth > threshold) {
        if (!devtools.open) {
          devtools.open = true;
          // Redirect away from the application
          window.location.href = 'about:blank';
        }
      } else {
        devtools.open = false;
      }
    }, 500);
    */
  }
}
