import React, { useState, useMemo } from 'react';
import { 
  Users, 
  UserPlus, 
  Globe, 
  Trash2, 
  Mail, 
  Phone, 
  Clock, 
  AlertCircle,
  Shield,
  CheckCircle2,
  Lock
} from 'lucide-react';
import { Select, Input, Modal, message } from 'antd';
import { useData } from '../../context/DataContext';
import { CountryFlag } from '../../components/CountryFlag';
import { getAllCountries, getCountryByCode } from '../../services/jurisdictionData';

export const StaffPage: React.FC = () => {
  const { staffMembers, addStaffMember, deleteStaffMember, globalSearch } = useData();

  const [countryFilter, setCountryFilter] = useState<string>('all');

  // Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newPassword, setNewPassword] = useState('safety2026');
  const [newCountryCode, setNewCountryCode] = useState('NG');

  // Get full worldwide countries list
  const worldwideCountries = useMemo(() => getAllCountries(), []);

  // Country select dropdown options with SVG flags
  const countryOptions = useMemo(() => [
    {
      value: 'ALL',
      searchValue: 'Global All Countries Worldwide',
      label: (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
          <CountryFlag code="ALL" size={14} />
          <span>Global / All Countries</span>
        </div>
      ),
    },
    ...worldwideCountries.map((c) => ({
      value: c.code,
      searchValue: `${c.name} ${c.code}`,
      label: (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
          <CountryFlag code={c.code} size={14} />
          <span>{c.name}</span>
        </div>
      ),
    })),
  ], [worldwideCountries]);

  // Country filter options for top toolbar
  const countryFilterOptions = useMemo(() => [
    {
      value: 'all',
      searchValue: 'All Regions Global Worldwide',
      label: (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          <CountryFlag code="ALL" size={13} />
          <span>All Regions</span>
        </div>
      ),
    },
    ...worldwideCountries.map((c) => ({
      value: c.code,
      searchValue: `${c.name} ${c.code}`,
      label: (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          <CountryFlag code={c.code} size={13} />
          <span>{c.name}</span>
        </div>
      ),
    })),
  ], [worldwideCountries]);

  // Filtered staff list (uses global header search)
  const filteredStaff = useMemo(() => {
    return staffMembers.filter((staff) => {
      if (countryFilter !== 'all' && (staff.countryCode || 'ALL') !== countryFilter) return false;
      if (globalSearch && globalSearch.trim()) {
        const q = globalSearch.toLowerCase();
        const countryObj = getCountryByCode(staff.countryCode || '');
        const countryName = countryObj ? countryObj.name.toLowerCase() : 'global';
        return (
          staff.name.toLowerCase().includes(q) ||
          staff.email.toLowerCase().includes(q) ||
          staff.phone.toLowerCase().includes(q) ||
          countryName.includes(q)
        );
      }
      return true;
    });
  }, [staffMembers, countryFilter, globalSearch]);

  // Statistics for top cards
  const stats = useMemo(() => {
    const total = staffMembers.length;
    const uniqueCountries = new Set(staffMembers.map((s) => s.countryCode || 'ALL')).size;
    return { total, uniqueCountries };
  }, [staffMembers]);

  // Handle Add Staff submission
  const handleCreateStaff = () => {
    if (!newName.trim() || !newEmail.trim()) {
      message.error('Please enter a valid name and email address.');
      return;
    }

    const countryObj = getCountryByCode(newCountryCode);
    const countryLabel = newCountryCode === 'ALL' ? 'Global' : (countryObj ? countryObj.name : newCountryCode);

    addStaffMember({
      name: newName.trim(),
      email: newEmail.trim(),
      phone: newPhone.trim() || '+234 800 000 0000',
      password: newPassword.trim() || 'safety2026',
      role: 'super_admin',
      status: 'active',
      countryCode: newCountryCode,
      assignedJurisdiction: countryLabel,
    });

    message.success(`Staff member "${newName}" successfully registered.`);
    setIsAddModalOpen(false);
    // Reset fields
    setNewName('');
    setNewEmail('');
    setNewPhone('');
    setNewPassword('safety2026');
    setNewCountryCode('NG');
  };

  // Helper to format country name
  const getCountryName = (code?: string) => {
    if (!code || code === 'ALL') return 'Global';
    const c = getCountryByCode(code);
    return c ? c.name : code;
  };

  return (
    <div style={{
      padding: '2.25rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '2rem',
      width: '100%',
      height: '100%',
      overflowY: 'auto',
      fontFamily: 'var(--font-sans)',
      backgroundColor: '#F4F7F5',
    }}>
      
      {/* =========================================================
          1. TOP 4 METRIC STAT CARDS (OneForma Stat Grid)
          ========================================================= */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '1.25rem',
      }}>
        
        {/* Card 1: Total Staff */}
        <div style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '20px',
          border: '1.5px solid #E2E8F0',
          padding: '1.35rem 1.65rem',
          boxShadow: '0 4px 18px rgba(15, 23, 42, 0.04)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Total Staff
            </span>
            <div style={{
              width: '34px',
              height: '34px',
              borderRadius: '10px',
              backgroundColor: 'var(--accent-green-light)',
              color: 'var(--accent-green-dark)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Users size={17} />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: '2.1rem', fontWeight: 800, color: 'var(--text-main)', lineHeight: 1 }}>
              {stats.total}
            </span>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>
              Registered Personnel
            </span>
          </div>
        </div>

        {/* Card 2: Administrators */}
        <div style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '20px',
          border: '1.5px solid #E2E8F0',
          padding: '1.35rem 1.65rem',
          boxShadow: '0 4px 18px rgba(15, 23, 42, 0.04)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Administrators
            </span>
            <div style={{
              width: '34px',
              height: '34px',
              borderRadius: '10px',
              backgroundColor: '#ECFDF5',
              color: '#059669',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Shield size={17} />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: '2.1rem', fontWeight: 800, color: '#059669', lineHeight: 1 }}>
              {stats.total}
            </span>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>
              Active Platform Admins
            </span>
          </div>
        </div>

        {/* Card 3: Active Regions */}
        <div style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '20px',
          border: '1.5px solid #E2E8F0',
          padding: '1.35rem 1.65rem',
          boxShadow: '0 4px 18px rgba(15, 23, 42, 0.04)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Active Regions
            </span>
            <div style={{
              width: '34px',
              height: '34px',
              borderRadius: '10px',
              backgroundColor: 'var(--accent-green-light)',
              color: 'var(--accent-green-dark)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Globe size={17} />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: '2.1rem', fontWeight: 800, color: 'var(--accent-green-dark)', lineHeight: 1 }}>
              {stats.uniqueCountries}
            </span>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>
              Covered Countries
            </span>
          </div>
        </div>

        {/* Card 4: Global Network */}
        <div style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '20px',
          border: '1.5px solid #E2E8F0',
          padding: '1.35rem 1.65rem',
          boxShadow: '0 4px 18px rgba(15, 23, 42, 0.04)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Network Status
            </span>
            <div style={{
              width: '34px',
              height: '34px',
              borderRadius: '10px',
              backgroundColor: '#ECFDF5',
              color: 'var(--accent-green-dark)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <CheckCircle2 size={17} />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: '2.1rem', fontWeight: 800, color: 'var(--accent-green-dark)', lineHeight: 1 }}>
              100%
            </span>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>
              Online Operations
            </span>
          </div>
        </div>

      </div>

      {/* =========================================================
          2. FILTER & ACTION TOOLBAR
          ========================================================= */}
      <div style={{
        backgroundColor: '#FFFFFF',
        borderRadius: '20px',
        border: '1.5px solid #E2E8F0',
        padding: '1.1rem 1.75rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '1.25rem',
        boxShadow: '0 2px 10px rgba(15, 23, 42, 0.03)',
      }}>
        
        {/* Left: Region / Country Dropdown Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>
            REGION:
          </span>
          <Select
            showSearch
            size="small"
            optionFilterProp="searchValue"
            value={countryFilter}
            onChange={(val) => setCountryFilter(val)}
            options={countryFilterOptions}
            style={{ width: 220, fontSize: '0.78rem' }}
            popupMatchSelectWidth={250}
          />
        </div>

        {/* Right: Add Staff Member Button */}
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="btn btn-primary btn-pill"
          style={{
            padding: '0.6rem 1.35rem',
            fontSize: '0.8125rem',
            boxShadow: '0 4px 14px rgba(16, 185, 129, 0.25)',
          }}
        >
          <UserPlus size={15} />
          <span>Add Staff Member</span>
        </button>

      </div>

      {/* =========================================================
          3. MODERN STAFF DATA TABLE (Spacious & Balanced)
          ========================================================= */}
      <div style={{
        backgroundColor: '#FFFFFF',
        borderRadius: '24px',
        border: '1.5px solid #E2E8F0',
        boxShadow: '0 4px 20px rgba(15, 23, 42, 0.04)',
        overflow: 'hidden',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ backgroundColor: '#F8FAF9', borderBottom: '1.5px solid #E2E8F0' }}>
              <th style={{ width: '38%', padding: '1.15rem 2rem', fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Staff Member
              </th>
              <th style={{ width: '26%', padding: '1.15rem 2rem', fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Phone Number
              </th>
              <th style={{ width: '24%', padding: '1.15rem 2rem', fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Region
              </th>
              <th style={{ width: '12%', padding: '1.15rem 2rem', textAlign: 'right', fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredStaff.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ textAlign: 'center', padding: '5rem 2rem', color: 'var(--text-muted)' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.65rem' }}>
                    <AlertCircle size={28} color="var(--text-muted)" />
                    <span style={{ fontWeight: 700, fontSize: '0.925rem', color: 'var(--text-main)' }}>No staff members match your filter.</span>
                    <span style={{ fontSize: '0.78rem' }}>Try clearing the search or changing the region filter above.</span>
                  </div>
                </td>
              </tr>
            ) : (
              filteredStaff.map((staff, idx) => {
                const countryName = getCountryName(staff.countryCode);
                const isLast = idx === filteredStaff.length - 1;

                return (
                  <tr 
                    key={staff.id} 
                    style={{ 
                      borderBottom: isLast ? 'none' : '1px solid #EDF2F7',
                      transition: 'background-color 0.15s ease',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#F9FBFA')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    
                    {/* Staff Name & Email */}
                    <td style={{ padding: '1.25rem 2rem', verticalAlign: 'middle' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <div style={{
                          width: '44px',
                          height: '44px',
                          borderRadius: '14px',
                          backgroundColor: 'var(--accent-green-light)',
                          color: 'var(--accent-green-dark)',
                          border: '1.5px solid var(--accent-green-border-subtle)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 800,
                          fontSize: '0.95rem',
                          flexShrink: 0,
                          boxShadow: '0 2px 8px rgba(16, 185, 129, 0.12)',
                        }}>
                          {staff.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div style={{
                            fontFamily: 'var(--font-display)',
                            fontWeight: 800,
                            color: 'var(--text-main)',
                            fontSize: '0.9375rem',
                            lineHeight: 1.3,
                          }}>
                            {staff.name}
                          </div>
                          <div style={{
                            fontSize: '0.78rem',
                            color: 'var(--text-muted)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '5px',
                            marginTop: '3px',
                          }}>
                            <Mail size={12} color="var(--text-muted)" />
                            <span>{staff.email}</span>
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Phone & Activity */}
                    <td style={{ padding: '1.25rem 2rem', verticalAlign: 'middle' }}>
                      <div style={{ fontSize: '0.875rem', color: 'var(--text-main)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Phone size={13} color="var(--primary)" />
                        <span>{staff.phone}</span>
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '3px' }}>
                        <Clock size={11} />
                        <span>Active recently</span>
                      </div>
                    </td>

                    {/* Region (Country Only with SVG Flag) */}
                    <td style={{ padding: '1.25rem 2rem', verticalAlign: 'middle' }}>
                      <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '6px 16px',
                        borderRadius: 'var(--radius-pill)',
                        backgroundColor: '#F8FAF9',
                        border: '1.5px solid #E2E8F0',
                        boxShadow: '0 1px 4px rgba(0,0,0,0.02)',
                      }}>
                        <CountryFlag code={staff.countryCode || 'ALL'} size={16} />
                        <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-main)' }}>
                          {countryName}
                        </span>
                      </div>
                    </td>

                    {/* Delete Action */}
                    <td style={{ padding: '1.25rem 2rem', textAlign: 'right', verticalAlign: 'middle' }}>
                      <button
                        onClick={() => {
                          Modal.confirm({
                            title: 'Remove Staff Member',
                            content: `Are you sure you want to remove ${staff.name}? They will lose access to the safety dispatch dashboard.`,
                            okText: 'Remove',
                            okType: 'danger',
                            cancelText: 'Cancel',
                            onOk: () => {
                              deleteStaffMember(staff.id);
                              message.info(`${staff.name} has been removed.`);
                            },
                          });
                        }}
                        style={{
                          background: '#FEF2F2',
                          border: '1px solid #FECACA',
                          color: '#EF4444',
                          cursor: 'pointer',
                          padding: '7px 11px',
                          borderRadius: '10px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 0.15s ease',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = '#EF4444';
                          e.currentTarget.style.color = '#FFFFFF';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = '#FEF2F2';
                          e.currentTarget.style.color = '#EF4444';
                        }}
                        title="Remove Staff Member"
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>

                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* =========================================================
          4. ADD STAFF MEMBER MODAL
          ========================================================= */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', paddingBottom: '0.75rem', borderBottom: '1px solid #E2E8F0' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '12px',
              backgroundColor: 'var(--accent-green-light)',
              color: 'var(--accent-green-dark)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <UserPlus size={18} />
            </div>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.1rem', color: 'var(--text-main)' }}>
                Add New Staff Member
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 400, marginTop: '1px' }}>
                Set login credentials and assign country
              </div>
            </div>
          </div>
        }
        open={isAddModalOpen}
        onOk={handleCreateStaff}
        onCancel={() => setIsAddModalOpen(false)}
        okText="Add Staff Member"
        cancelText="Cancel"
        centered
        width={500}
        okButtonProps={{
          style: {
            backgroundColor: 'var(--accent-green)',
            borderColor: 'var(--accent-green)',
            borderRadius: 'var(--radius-pill)',
            fontWeight: 700,
            padding: '0 1.4rem',
            height: '36px',
          }
        }}
        cancelButtonProps={{
          style: {
            borderRadius: 'var(--radius-pill)',
            height: '36px',
            padding: '0 1.2rem',
          }
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem', paddingTop: '1.25rem' }}>
          
          {/* Full Name */}
          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '5px' }}>
              Full Name *
            </label>
            <Input
              placeholder="e.g. Babatunde Adeleke"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              style={{ borderRadius: '10px', padding: '0.5rem 0.85rem' }}
            />
          </div>

          {/* Email Address */}
          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '5px' }}>
              Email Address *
            </label>
            <Input
              type="email"
              placeholder="e.g. b.adeleke@safety.org"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              style={{ borderRadius: '10px', padding: '0.5rem 0.85rem' }}
            />
          </div>

          {/* Phone Number */}
          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '5px' }}>
              Phone Number
            </label>
            <Input
              placeholder="e.g. +234 812 345 6789"
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              style={{ borderRadius: '10px', padding: '0.5rem 0.85rem' }}
            />
          </div>

          {/* Password */}
          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '5px' }}>
              Password *
            </label>
            <Input.Password
              prefix={<Lock size={14} color="var(--text-muted)" style={{ marginRight: '0.35rem' }} />}
              placeholder="Enter password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              style={{ borderRadius: '10px', padding: '0.5rem 0.85rem' }}
            />
          </div>

          {/* Region / Country Selection with SVG Flags */}
          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '5px' }}>
              Region (Country) *
            </label>
            <Select
              showSearch
              optionFilterProp="searchValue"
              value={newCountryCode}
              onChange={(val) => setNewCountryCode(val)}
              style={{ width: '100%' }}
              options={countryOptions}
              popupMatchSelectWidth={true}
            />
          </div>

        </div>
      </Modal>

    </div>
  );
};

export default StaffPage;
