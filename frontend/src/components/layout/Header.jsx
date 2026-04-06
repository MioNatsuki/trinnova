import React from 'react';
import { useAuth } from '../../context/AuthContext';
import './Layout.css';
import TrinnovaLogo from '../../assets/TrinnovaLogo.png';

export default function Header() {
  const { user } = useAuth();

  return (
    <header className="header">
      <div className="login-logo">
        <img 
          src={TrinnovaLogo} 
          alt="Trinnova Logo" 
          style={{ width: '220px', height: 'auto', objectFit: 'contain'}} 
        />     
      </div>

      <div className="header-spacer" />

      <div className="header-user">
        <div className="header-user-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
        </div>
        <span className="header-user-name">
          {user?.nombre} {user?.apellidos}
        </span>
      </div>
    </header>
  );
}
