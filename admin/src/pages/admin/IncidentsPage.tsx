import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  EyeOff, 
  ArrowRight, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  ShieldAlert,
  FileText,
  MapPin
} from 'lucide-react';
import { Select } from 'antd';
import { useData } from '../../context/DataContext';

export const IncidentsPage: React.FC = () => {
  const { filteredReports, reports: allReports, globalSearch } = useData();
  const navigate = useNavigate();

  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const categoryOptions = [
    { value: 'all', label: 'All Categories' },
    { value: 'harassment', label: 'Harassment' },
    { value: 'theft', label: 'Theft / Robbery' },
    { value: 'physical_threat', label: 'Physical Threat' },
    { value: 'hazard', label: 'Hazard' },
    { value: 'emergency', label: 'Emergency Mode' },
  ];

  const statusOptions = [
    { value: 'all', label: 'All Statuses' },
    { value: 'open', label: 'Open' },
    { value: 'investigating', label: 'Investigating' },
    { value: 'resolved', label: 'Resolved' },
  ];

  // Filtered reports list (uses global header search)
  const displayedReports = useMemo(() => {
    return filteredReports.filter((r) => {
      if (filterCategory !== 'all' && r.category !== filterCategory) return false;
      if (filterStatus !== 'all' && r.status !== filterStatus) return false;
      if (globalSearch && globalSearch.trim()) {
        const q = globalSearch.toLowerCase();
        return (
          r.title.toLowerCase().includes(q) ||
          r.description.toLowerCase().includes(q) ||
          (r.addressName && r.addressName.toLowerCase().includes(q)) ||
          (r.reporterName && r.reporterName.toLowerCase().includes(q)) ||
          r.id.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [filteredReports, filterCategory, filterStatus, globalSearch]);

  // Derived metrics for OneForma stat cards
  const stats = useMemo(() => {
    const total = filteredReports.length;
    const critical = filteredReports.filter((r) => r.urgency === 'critical' || r.category === 'emergency').length;
    const investigating = filteredReports.filter((r) => r.status === 'investigating').length;
    const resolved = filteredReports.filter((r) => r.status === 'resolved').length;
    const resolvedRate = total > 0 ? Math.round((resolved / total) * 100) : 100;
    return { total, critical, investigating, resolved, resolvedRate };
  }, [filteredReports]);

  return (
    <div style={{
      padding: '2rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '1.75rem',
      width: '100%',
      height: '100%',
      overflowY: 'auto',
      fontFamily: 'var(--font-sans)',
      backgroundColor: '#F4F7F5',
    }}>
      
      {/* =========================================================
          1. TOP METRIC STAT CARDS (OneForma Stat Grid Parity)
          ========================================================= */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '1.25rem',
      }}>
        
        {/* Stat Card 1: Total Incidents */}
        <div style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '20px',
          border: '1.5px solid #E2E8F0',
          padding: '1.25rem 1.5rem',
          boxShadow: '0 4px 18px rgba(15, 23, 42, 0.04)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Total Reports
            </span>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '10px',
              backgroundColor: 'var(--accent-green-light)',
              color: 'var(--accent-green-dark)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <FileText size={16} />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 800, color: 'var(--text-main)', lineHeight: 1 }}>
              {stats.total}
            </span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>
              / {allReports.length} Worldwide
            </span>
          </div>
        </div>

        {/* Stat Card 2: Active Investigations */}
        <div style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '20px',
          border: '1.5px solid #E2E8F0',
          padding: '1.25rem 1.5rem',
          boxShadow: '0 4px 18px rgba(15, 23, 42, 0.04)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Investigating
            </span>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '10px',
              backgroundColor: '#FFFBEB',
              color: '#D97706',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Clock size={16} />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 800, color: '#D97706', lineHeight: 1 }}>
              {stats.investigating}
            </span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>
              Under Review
            </span>
          </div>
        </div>

        {/* Stat Card 3: Critical Threats */}
        <div style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '20px',
          border: '1.5px solid #E2E8F0',
          padding: '1.25rem 1.5rem',
          boxShadow: '0 4px 18px rgba(15, 23, 42, 0.04)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Critical Alerts
            </span>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '10px',
              backgroundColor: '#FEF2F2',
              color: '#DC2626',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <ShieldAlert size={16} />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 800, color: stats.critical > 0 ? '#DC2626' : 'var(--text-main)', lineHeight: 1 }}>
              {stats.critical}
            </span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>
              Immediate Response
            </span>
          </div>
        </div>

        {/* Stat Card 4: Resolution Rate */}
        <div style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '20px',
          border: '1.5px solid #E2E8F0',
          padding: '1.25rem 1.5rem',
          boxShadow: '0 4px 18px rgba(15, 23, 42, 0.04)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Resolution Rate
            </span>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '10px',
              backgroundColor: 'var(--accent-green-light)',
              color: 'var(--accent-green-dark)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <CheckCircle2 size={16} />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 800, color: 'var(--accent-green-dark)', lineHeight: 1 }}>
              {stats.resolvedRate}%
            </span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>
              ({stats.resolved} Closed)
            </span>
          </div>
        </div>

      </div>

      {/* =========================================================
          2. FILTER TOOLBAR
          ========================================================= */}
      <div style={{
        backgroundColor: '#FFFFFF',
        borderRadius: '20px',
        border: '1.5px solid #E2E8F0',
        padding: '1rem 1.5rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '1rem',
        boxShadow: '0 2px 10px rgba(15, 23, 42, 0.03)',
      }}>
        
        {/* Left: Category + Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          
          {/* Category Dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>
              CATEGORY:
            </span>
            <Select
              showSearch
              size="small"
              optionFilterProp="label"
              value={filterCategory}
              onChange={(val) => setFilterCategory(val)}
              options={categoryOptions}
              style={{ width: 170, fontSize: '0.78rem' }}
              popupMatchSelectWidth={190}
            />
          </div>

          <div style={{ height: '22px', width: '1px', backgroundColor: '#E2E8F0' }} />

          {/* Status Dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>
              STATUS:
            </span>
            <Select
              showSearch
              size="small"
              optionFilterProp="label"
              value={filterStatus}
              onChange={(val) => setFilterStatus(val)}
              options={statusOptions}
              style={{ width: 150, fontSize: '0.78rem' }}
              popupMatchSelectWidth={170}
            />
          </div>

        </div>

        {/* Right: Reports Count */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ 
            fontSize: '0.78rem', 
            color: 'var(--accent-green-dark)', 
            fontWeight: 700,
            backgroundColor: 'var(--accent-green-light)',
            padding: '4px 12px',
            borderRadius: 'var(--radius-pill)',
            border: '1px solid var(--accent-green-border-subtle)',
          }}>
            {displayedReports.length} {displayedReports.length === 1 ? 'Report' : 'Reports'}
          </span>
        </div>

      </div>

      {/* =========================================================
          3. MODERN CARD TABLE VIEW (OneForma Parity)
          ========================================================= */}
      <div style={{
        backgroundColor: '#FFFFFF',
        borderRadius: '24px',
        border: '1.5px solid #E2E8F0',
        boxShadow: '0 4px 20px rgba(15, 23, 42, 0.04)',
        overflow: 'hidden',
      }}>
        <table className="min-table">
          <thead>
            <tr>
              <th style={{ width: '130px' }}>Status</th>
              <th style={{ width: '150px' }}>Category</th>
              <th>Title & Description</th>
              <th style={{ width: '220px' }}>Location</th>
              <th style={{ width: '160px' }}>Reported By</th>
              <th style={{ width: '130px' }}>Date & Time</th>
              <th style={{ width: '130px', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {displayedReports.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                    <AlertTriangle size={24} color="var(--text-muted)" />
                    <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>No incident reports match your current filter.</span>
                    <span style={{ fontSize: '0.75rem' }}>Try clearing the search or category criteria above.</span>
                  </div>
                </td>
              </tr>
            ) : (
              displayedReports.map((rep) => {
                const isCritical = rep.urgency === 'critical' || rep.category === 'emergency';

                return (
                  <tr
                    key={rep.id}
                    style={{ cursor: 'pointer', transition: 'background-color 0.15s ease' }}
                    onClick={() => navigate(`/admin/incidents/${rep.id}`)}
                  >
                    <td>
                      <span className={`badge ${
                        rep.status === 'resolved' ? 'badge-green' : rep.status === 'investigating' ? 'badge-distress' : 'badge-neutral'
                      }`}>
                        {rep.status}
                      </span>
                    </td>

                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {isCritical && <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#EF4444' }} />}
                        <span style={{
                          fontWeight: 700,
                          fontSize: '0.8125rem',
                          color: isCritical ? '#DC2626' : 'var(--text-main)',
                          textTransform: 'capitalize',
                        }}>
                          {rep.category.replace('_', ' ')}
                        </span>
                      </div>
                    </td>

                    <td>
                      <div style={{
                        fontFamily: 'var(--font-display)',
                        fontWeight: 800,
                        color: 'var(--text-main)',
                        fontSize: '0.875rem',
                        lineHeight: 1.25,
                      }}>
                        {rep.title}
                      </div>
                      <div style={{
                        fontSize: '0.75rem',
                        color: 'var(--text-muted)',
                        marginTop: '3px',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        maxWidth: '440px',
                      }}>
                        {rep.description}
                      </div>
                    </td>

                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8125rem', fontWeight: 700, color: 'var(--text-main)' }}>
                        <MapPin size={12} color="var(--primary)" />
                        <span>{rep.addressName || 'Location Not Specified'}</span>
                      </div>
                      <div style={{ fontSize: '0.7rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', paddingLeft: '1rem' }}>
                        {rep.location.lat.toFixed(4)}, {rep.location.lng.toFixed(4)}
                      </div>
                    </td>

                    <td>
                      <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--text-main)' }}>
                        {rep.isAnonymous ? (
                          <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--text-muted)' }}>
                            <EyeOff size={13} />
                            <span>Anonymous</span>
                          </span>
                        ) : (
                          rep.reporterName || 'User'
                        )}
                      </div>
                    </td>

                    <td>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                        {new Date(rep.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-sub)', fontFamily: 'var(--font-mono)' }}>
                        {new Date(rep.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </td>

                    <td style={{ textAlign: 'right' }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/admin/incidents/${rep.id}`);
                        }}
                        className="btn-oneforma-ghost"
                        style={{
                          padding: '6px 14px',
                          fontSize: '0.75rem',
                          borderRadius: 'var(--radius-pill)',
                        }}
                      >
                        <span>View Details</span>
                        <ArrowRight size={12} />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

    </div>
  );
};
