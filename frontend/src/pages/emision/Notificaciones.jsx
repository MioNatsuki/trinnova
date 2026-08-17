// frontend/src/components/emision/Notificaciones.jsx
import { useState, useEffect, createContext, useContext } from 'react';
import './Notificaciones.css';

// Context para notificaciones
const NotificationContext = createContext(null);

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications debe usarse dentro de NotificationProvider');
  }
  return context;
};

export const NotificationProvider = ({ children }) => {
  const [notifications, setNotifications] = useState([]);
  
  const showNotification = (message, type = 'info', duration = 5000) => {
    const id = Date.now();
    setNotifications(prev => [...prev, { id, message, type, duration }]);
    
    if (duration > 0) {
      setTimeout(() => {
        removeNotification(id);
      }, duration);
    }
  };
  
  const removeNotification = (id) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };
  
  const showSuccess = (message, duration = 4000) => {
    showNotification(message, 'success', duration);
  };
  
  const showError = (message, duration = 6000) => {
    showNotification(message, 'error', duration);
  };
  
  const showWarning = (message, duration = 5000) => {
    showNotification(message, 'warning', duration);
  };
  
  const showInfo = (message, duration = 4000) => {
    showNotification(message, 'info', duration);
  };
  
  return (
    <NotificationContext.Provider value={{
      showNotification,
      showSuccess,
      showError,
      showWarning,
      showInfo,
      removeNotification
    }}>
      {children}
      <NotificationContainer 
        notifications={notifications} 
        onRemove={removeNotification} 
      />
    </NotificationContext.Provider>
  );
};

const NotificationContainer = ({ notifications, onRemove }) => {
  return (
    <div className="notification-container">
      {notifications.map(notification => (
        <NotificationItem 
          key={notification.id}
          notification={notification}
          onRemove={onRemove}
        />
      ))}
    </div>
  );
};

const NotificationItem = ({ notification, onRemove }) => {
  const { id, message, type } = notification;
  
  const icons = {
    success: '✅',
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️'
  };
  
  return (
    <div className={`notification-item notification-${type}`}>
      <span className="notification-icon">{icons[type] || 'ℹ️'}</span>
      <span className="notification-message">{message}</span>
      <button 
        className="notification-close"
        onClick={() => onRemove(id)}
      >
        ✕
      </button>
    </div>
  );
};