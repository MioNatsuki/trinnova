import React from 'react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login } from '../../api/auth';
import { useAuth } from '../../context/AuthContext';
import { getMe } from '../../api/auth';
import './Login.css';
import TrinnovaLogo from '../../assets/TrinnovaLogo.png';

function Login() {
  const [correo, setCorreo]     = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const navigate  = useNavigate();
  const { setUser } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(correo, password);
      const me = await getMe();
      setUser(me);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.detail || 'Correo o contraseña incorrectos');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-root">
      {/* Panel izquierdo — logo */}
      <div className="login-brand">
        <div className="login-logo">
            {/* Sustitución del SVG por la imagen local */}
            <img 
              src={TrinnovaLogo} 
              alt="Trinnova Logo" 
              style={{ width: '500px', height: 'auto', objectFit: 'contain'}} 
            />     
        </div>
      </div>

      {/* Divisor vertical */}
      <div className="login-divider" />

      {/* Panel derecho — formulario */}
      <div className="login-form-panel">
        <div className="login-form-inner">
          <h2 className="login-title">Ingresa a tu cuenta</h2>

          <form onSubmit={handleSubmit} autoComplete="off">
            {/* Correo */}
            <div className="lf-field">
              <div className="lf-input-wrap">
                <span className="lf-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                    <circle cx="12" cy="7" r="4"/>
                  </svg>
                </span>
                <input
                  type="email"
                  placeholder="Correo Electrónico"
                  value={correo}
                  onChange={e => setCorreo(e.target.value)}
                  required
                  className="lf-input"
                />
              </div>
            </div>

            {/* Contraseña */}
            <div className="lf-field">
              <div className="lf-input-wrap">
                <span className="lf-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                    <rect x="3" y="11" width="18" height="11" rx="2"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                </span>
                <input
                  type={showPass ? 'text' : 'password'}
                  placeholder="Contraseña"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  className="lf-input"
                />
                <button type="button" className="lf-eye" onClick={() => setShowPass(v => !v)} tabIndex={-1}>
                  {showPass
                    ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                    : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  }
                </button>
              </div>
            </div>

            {error && <p className="lf-error">{error}</p>}

            <button type="submit" className="lf-submit" disabled={loading}>
              {loading ? 'Verificando...' : 'Entrar'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default Login;