import React, { useState } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { 
  Radio, 
  FileText, 
  Users, 
  LogOut, 
  Search
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { EmergencyCallModal } from '../../components/EmergencyCallModal';
import { Input } from 'antd';

export const AdminLayout: React.FC = () => {
  const { logout, adminUser } = useAuth();
  const { callingSession, setCallingSession, config, globalSearch, setGlobalSearch } = useData();
  const navigate = useNavigate();
  const location = useLocation();
  const [isSidebarHovered, setIsSidebarHovered] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/', { replace: true });
  };

  // Determine current page title and description
  const getPageInfo = () => {
    if (location.pathname.includes('/admin/radar')) {
      return {
        title: 'Live Radar',
        subtitle: 'Real-time map of active users and emergency alerts',
      };
    }
    if (location.pathname.includes('/admin/incidents')) {
      return {
        title: 'Incidents & Reports',
        subtitle: 'Review, investigate, and resolve incident reports',
      };
    }
    if (location.pathname.includes('/admin/staff')) {
      return {
        title: 'Staff & Team',
        subtitle: 'Manage team administrators and staff',
      };
    }
    return {
      title: 'Control Center',
      subtitle: 'Real-time safety and monitoring platform',
    };
  };

  const pageInfo = getPageInfo();

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden', backgroundColor: 'var(--bg-app)' }}>
      
      {/* 1. Modern Auto-Expanding Hover Navigation Rail / Sidebar */}
      <aside 
        className="app-sidebar"
        onMouseEnter={() => setIsSidebarHovered(true)}
        onMouseLeave={() => setIsSidebarHovered(false)}
      >
        
        {/* Top: Brand Logo & Navigation Links */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', width: '100%' }}>
          
          {/* Brand Header */}
          <div 
            onClick={() => navigate('/admin/radar')}
            style={{
              display: 'flex',
              alignItems: 'center',
              cursor: 'pointer',
              overflow: 'hidden',
              height: '52px',
              width: '100%',
            }}
            title="Safety Control Center"
          >
            <div className="sidebar-nav-icon">
              <img
                src="/safety.jpg"
                alt="Safety App Logo"
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '13px',
                  objectFit: 'cover',
                  boxShadow: '0 4px 16px rgba(16, 185, 129, 0.35)',
                  border: '1.5px solid rgba(16, 185, 129, 0.2)',
                }}
              />
            </div>

            <div className="sidebar-nav-text">
              <div style={{ fontWeight: 800, fontSize: '0.9rem', letterSpacing: '0.02em', color: 'var(--text-main)', lineHeight: 1.1 }}>
                SAFETY <span style={{ color: 'var(--accent-green-dark)', fontSize: '0.72rem', fontWeight: 700 }}>OPS</span>
              </div>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                Control Center
              </div>
            </div>
          </div>

          {/* Core Navigation Links */}
          <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', width: '100%' }}>
            
            {/* Live Radar */}
            <NavLink
              to="/admin/radar"
              title={!isSidebarHovered ? 'Live Radar' : undefined}
              className={({ isActive }) => `sidebar-nav-item ${isActive ? 'sidebar-nav-item-active' : ''}`}
            >
              <div className="sidebar-nav-icon">
                <Radio size={24} strokeWidth={2.2} />
              </div>
              <div className="sidebar-nav-text">
                <span>Live Radar</span>
              </div>
            </NavLink>

            {/* Incidents & Reports */}
            <NavLink
              to="/admin/incidents"
              title={!isSidebarHovered ? 'Incidents & Reports' : undefined}
              className={({ isActive }) => `sidebar-nav-item ${isActive ? 'sidebar-nav-item-active' : ''}`}
            >
              <div className="sidebar-nav-icon">
                <FileText size={24} strokeWidth={2.2} />
              </div>
              <div className="sidebar-nav-text">
                <span>Incidents & Reports</span>
              </div>
            </NavLink>

            {/* Staff & Team */}
            <NavLink
              to="/admin/staff"
              title={!isSidebarHovered ? 'Staff & Team' : undefined}
              className={({ isActive }) => `sidebar-nav-item ${isActive ? 'sidebar-nav-item-active' : ''}`}
            >
              <div className="sidebar-nav-icon">
                <Users size={24} strokeWidth={2.2} />
              </div>
              <div className="sidebar-nav-text">
                <span>Staff & Team</span>
              </div>
            </NavLink>

          </nav>
        </div>

        {/* Bottom Utility Controls */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', width: '100%' }}>
          
          {/* User Profile & Sign Out Bar */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingTop: '0.75rem',
            borderTop: '1px solid var(--border-hairline)',
            width: '100%',
            height: '52px',
            overflow: 'hidden',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', overflow: 'hidden', flex: 1 }}>
              <div className="sidebar-nav-icon">
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--bg-subtle)',
                  border: '1.5px solid var(--border-hairline)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '13px',
                  fontWeight: 800,
                  color: 'var(--text-main)',
                }}>
                  {(adminUser?.email || 'AD')[0].toUpperCase()}
                </div>
              </div>
              <div className="sidebar-nav-text">
                <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--text-main)' }}>
                  {adminUser?.email?.split('@')[0] || 'admin'}
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                  Administrator
                </div>
              </div>
            </div>

            {isSidebarHovered && (
              <button
                onClick={handleLogout}
                className="btn btn-outline"
                style={{ padding: '0.45rem 0.55rem', borderRadius: 'var(--radius-sm)', flexShrink: 0 }}
                title="Sign Out"
              >
                <LogOut size={16} />
              </button>
            )}
          </div>

        </div>

      </aside>

      {/* 2. Main Application Canvas */}
      <div style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        
        {/* Modern Top Header Bar with Centered Wide Search */}
        <header style={{
          height: '74px',
          backgroundColor: '#FFFFFF',
          borderBottom: '1px solid var(--border-hairline)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 2rem',
          flexShrink: 0,
          zIndex: 30,
        }}>
          
          {/* Left: Dynamic Title & Subtitle */}
          <div style={{ minWidth: '240px' }}>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '-0.02em', lineHeight: 1.2 }}>
              {pageInfo.title}
            </h1>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 500, marginTop: '2px' }}>
              {pageInfo.subtitle}
            </p>
          </div>

          {/* Center: Centralized & Widened Search Input */}
          <div style={{ flex: 1, display: 'flex', justifyContent: 'center', padding: '0 1.5rem' }}>
            <div style={{ width: '100%', maxWidth: '580px' }}>
              <Input
                allowClear
                prefix={<Search size={16} color="var(--text-muted)" style={{ marginRight: '0.45rem' }} />}
                placeholder="Search by name, phone, report, or location..."
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                style={{
                  borderRadius: 'var(--radius-pill)',
                  backgroundColor: 'var(--bg-subtle)',
                  borderColor: 'var(--border-hairline)',
                  fontSize: '0.875rem',
                  padding: '0.52rem 1.15rem',
                  boxShadow: '0 1px 4px rgba(0, 0, 0, 0.02)',
                }}
              />
            </div>
          </div>

          {/* Right: Symmetrical Balancer */}
          <div style={{ minWidth: '240px', display: 'flex', justifyContent: 'flex-end' }} />

        </header>

        {/* Dynamic Page Viewport */}
        <main style={{ flex: 1, height: 'calc(100% - 74px)', overflow: 'hidden', backgroundColor: 'var(--bg-app)' }}>
          <Outlet />
        </main>

      </div>

      {/* Global Agora In-App Voice Call Modal */}
      {callingSession && (
        <EmergencyCallModal
          session={callingSession}
          agoraAppId={config.agoraAppId}
          onClose={() => setCallingSession(null)}
        />
      )}

    </div>
  );
};
