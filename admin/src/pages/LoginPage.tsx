import React, { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { 
  Lock, 
  Mail, 
  ArrowLeft, 
  AlertCircle, 
  ArrowRight,
  Shield
} from 'lucide-react';
import { Input } from 'antd';
import { useAuth } from '../context/AuthContext';

export const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const from = (location.state as any)?.from?.pathname || '/admin/radar';

  const [email, setEmail] = useState('admin@safety.org');
  const [password, setPassword] = useState('admin123');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email.trim() || !password.trim()) {
      setError('Please enter both email and password.');
      return;
    }

    setIsLoading(true);
    try {
      await login(email.trim(), password.trim());
      navigate(from, { replace: true });
    } catch {
      setError('Invalid admin credentials. Please check your email and password.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#F4F7F5',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px 20px',
      fontFamily: 'var(--font-sans)',
    }}>
      
      {/* Master 2-Column Split Card (OneForma Parity) */}
      <div style={{
        width: '100%',
        maxWidth: '1120px',
        minHeight: '620px',
        backgroundColor: '#FFFFFF',
        borderRadius: '36px',
        border: '1px solid #E2E8F0',
        boxShadow: '0 24px 70px rgba(15, 23, 42, 0.07)',
        display: 'grid',
        gridTemplateColumns: 'minmax(360px, 5fr) minmax(400px, 6fr)',
        overflow: 'hidden',
      }}>
        
        {/* =========================================================
            LEFT COLUMN: Visual Brand Hero & Floating Stat Showcase
            ========================================================= */}
        <div style={{
          background: 'radial-gradient(circle at 20% 20%, #FFFFFF 0%, #F0FDF4 65%, #DCFCE7 100%)',
          borderRight: '1px solid #E6EDEA',
          padding: '44px 40px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          position: 'relative',
          overflow: 'hidden',
        }}>
          
          {/* Subtle decorative grid overlay */}
          <div style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: 'radial-gradient(#10B981 0.75px, transparent 0.75px)',
            backgroundSize: '24px 24px',
            opacity: 0.15,
            pointerEvents: 'none',
          }} />

          {/* Top Brand Header */}
          <div style={{ position: 'relative', zIndex: 5, display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <img
              src="/safety.jpg"
              alt="Safety Logo"
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                objectFit: 'cover',
                boxShadow: '0 4px 14px rgba(16, 185, 129, 0.28)',
                border: '1.5px solid rgba(16, 185, 129, 0.25)',
              }}
            />
            <div>
              <div style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 800,
                fontSize: '1.05rem',
                color: 'var(--text-main)',
                letterSpacing: '-0.02em',
                lineHeight: 1.15,
              }}>
                SAFETY
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--accent-green-dark)', fontWeight: 700 }}>
                ADMIN PORTAL
              </div>
            </div>
          </div>

          {/* Middle: Interactive Illustration Canvas with Floating Glass Cards */}
          <div style={{
            position: 'relative',
            zIndex: 5,
            margin: '2rem 0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '240px',
          }}>
            
            {/* Center Glowing Protection Orb */}
            <div className="animate-hero-float" style={{
              width: '180px',
              height: '180px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(5, 150, 105, 0.08) 100%)',
              border: '1.5px solid rgba(16, 185, 129, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              boxShadow: '0 0 50px rgba(16, 185, 129, 0.25)',
            }}>
              <div style={{
                width: '115px',
                height: '115px',
                borderRadius: '50%',
                border: '1px dashed rgba(16, 185, 129, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <div style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '50%',
                  backgroundColor: '#FFFFFF',
                  boxShadow: '0 4px 20px rgba(16, 185, 129, 0.35)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--primary)',
                }}>
                  <Shield size={24} />
                </div>
              </div>

              {/* Pulsing Ring */}
              <div style={{
                position: 'absolute',
                inset: '-10px',
                borderRadius: '50%',
                border: '1px solid rgba(16, 185, 129, 0.25)',
                animation: 'pulseRing 3s cubic-bezier(0.2, 0.8, 0.2, 1) infinite',
              }} />
            </div>

            {/* Floating Glass Stat Card 1 */}
            <div className="glass-stat-card" style={{
              position: 'absolute',
              top: '0px',
              left: '0px',
            }}>
              <div className="glass-stat-val">
                24/7 <span className="glass-stat-unit">⚡</span>
              </div>
              <div className="glass-stat-label">Active Protection</div>
            </div>

            {/* Floating Glass Stat Card 2 */}
            <div className="glass-stat-card" style={{
              position: 'absolute',
              bottom: '10px',
              right: '0px',
            }}>
              <div className="glass-stat-val">
                100<span className="glass-stat-unit">%</span>
              </div>
              <div className="glass-stat-label">Secure & Private</div>
            </div>

            {/* Floating Glass Stat Card 3 */}
            <div className="glass-stat-card" style={{
              position: 'absolute',
              bottom: '5px',
              left: '20px',
            }}>
              <div className="glass-stat-val">
                &lt; 5<span className="glass-stat-unit">s</span>
              </div>
              <div className="glass-stat-label">Alert Speed</div>
            </div>

          </div>

          {/* Bottom Value Proposition Headline */}
          <div style={{ position: 'relative', zIndex: 5 }}>
            <h2 style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1.65rem',
              fontWeight: 800,
              color: 'var(--text-main)',
              letterSpacing: '-0.025em',
              lineHeight: 1.2,
              marginBottom: '0.5rem',
            }}>
              Personal Protection.<br />
              <span className="accent-italic">Always On Watch.</span>
            </h2>
            <p style={{
              fontSize: '0.85rem',
              color: 'var(--text-sub)',
              lineHeight: 1.5,
              maxWidth: '380px',
            }}>
              Live tracking, automatic check-ins, and instant emergency alerts.
            </p>
          </div>

        </div>

        {/* =========================================================
            RIGHT COLUMN: Pure White Form Canvas
            ========================================================= */}
        <div style={{
          backgroundColor: '#FFFFFF',
          padding: '48px 48px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          position: 'relative',
        }}>

          {/* Centered Form Wrapper */}
          <div style={{ maxWidth: '420px', width: '100%', margin: '0 auto' }}>
            
            <div style={{ marginBottom: '1.75rem' }}>
              <h1 style={{
                fontFamily: 'var(--font-display)',
                fontSize: '1.85rem',
                fontWeight: 800,
                color: 'var(--text-main)',
                letterSpacing: '-0.025em',
                lineHeight: 1.15,
                marginBottom: '0.4rem',
              }}>
                Admin Sign In
              </h1>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.45 }}>
                Enter your administrator credentials to access the safety platform dashboard.
              </p>
            </div>

            {/* Error Notification Toast */}
            {error && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.75rem 1rem',
                backgroundColor: 'var(--alert-red-light)',
                border: '1px solid var(--alert-red-border)',
                borderRadius: '12px',
                color: 'var(--alert-red-dark)',
                fontSize: '0.8125rem',
                fontWeight: 500,
                marginBottom: '1.25rem',
              }}>
                <AlertCircle size={16} style={{ flexShrink: 0 }} />
                <span>{error}</span>
              </div>
            )}

            {/* Form Inputs */}
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
              
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  color: 'var(--text-main)',
                  marginBottom: '0.4rem',
                  fontFamily: 'var(--font-display)',
                }}>
                  Email Address
                </label>
                <Input
                  size="large"
                  prefix={<Mail size={16} color="var(--text-muted)" style={{ marginRight: '0.4rem' }} />}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@safety.org"
                  style={{
                    borderRadius: '12px',
                    fontSize: '0.875rem',
                    height: '46px',
                  }}
                />
              </div>

              <div>
                <label style={{
                  display: 'block',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  color: 'var(--text-main)',
                  marginBottom: '0.4rem',
                  fontFamily: 'var(--font-display)',
                }}>
                  Password
                </label>
                <Input.Password
                  size="large"
                  prefix={<Lock size={16} color="var(--text-muted)" style={{ marginRight: '0.4rem' }} />}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  style={{
                    borderRadius: '12px',
                    fontSize: '0.875rem',
                    height: '46px',
                  }}
                />
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isLoading}
                className="btn-oneforma-primary"
                style={{
                  width: '100%',
                  height: '48px',
                  fontSize: '0.9rem',
                  marginTop: '0.5rem',
                }}
              >
                <span>{isLoading ? 'Signing in...' : 'Sign In'}</span>
                <ArrowRight size={16} className="btn-arrow-icon" />
              </button>

              {/* Return to Home Underneath Button */}
              <div style={{ textAlign: 'center', marginTop: '1rem' }}>
                <Link
                  to="/"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    color: 'var(--text-muted)',
                    fontSize: '0.8125rem',
                    fontWeight: 600,
                    textDecoration: 'none',
                    transition: 'color 0.2s ease',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-main)')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
                >
                  <ArrowLeft size={14} />
                  <span>Return to Home</span>
                </Link>
              </div>

            </form>

          </div>

        </div>

      </div>

    </div>
  );
};
