import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { 
  Download, 
  PhoneCall, 
  ShieldCheck, 
  CheckCircle2, 
  Radio, 
  Activity, 
  ArrowRight, 
  Compass, 
  FileText, 
  Sparkles, 
  Shield,
  MapPin,
  Star,
  Quote
} from 'lucide-react';
import { CountryFlag } from '../components/CountryFlag';

export const LandingPage: React.FC = () => {
  const apkDownloadUrl = 'https://pub-8450631443cd4ea7978907598a15212e.r2.dev/app-release.apk';

  // State for the "Pillars of Protection" interactive tab switcher & autoplay
  const [activeTab, setActiveTab] = useState<number>(0);
  const [displayedTab, setDisplayedTab] = useState<number>(0);
  const [isTransitioning, setIsTransitioning] = useState<boolean>(false);
  const [isHovered, setIsHovered] = useState<boolean>(false);

  const handleTabChange = (nextIndex: number) => {
    if (nextIndex === displayedTab || isTransitioning) return;
    setActiveTab(nextIndex);
    setIsTransitioning(true);
    setTimeout(() => {
      setDisplayedTab(nextIndex);
      setIsTransitioning(false);
    }, 200);
  };

  // Auto-transition pillars every 5 seconds unless the actual pillar is hovered upon
  useEffect(() => {
    if (isHovered) return;

    const timer = setInterval(() => {
      handleTabChange((displayedTab + 1) % 5);
    }, 5000);

    return () => clearInterval(timer);
  }, [isHovered, displayedTab, isTransitioning]);

  // Five Pillars of Customer Protection
  const pillars = [
    {
      title: 'Automatic Walk Check-ins',
      headline: 'Smart check-ins that protect you without unlocking your phone.',
      desc: 'Safety periodically confirms you are safe during your walk. If you ever miss a check-in, automated emergency alerts are sent immediately to your trusted contacts.',
      chips: ['Automatic Prompts', 'Missed Check-in Alerts', 'Low Battery Detection', 'Battery Friendly'],
      icon: Activity,
      stat: '15s - 60s',
      statLabel: 'Customizable Check-in Time',
    },
    {
      title: 'Instant Emergency Alerts',
      headline: 'One-tap SOS alerts sent with your live location.',
      desc: 'Trigger an alert instantly with a single tap or button shortcut. We immediately send SMS and push notifications with your exact live location to your emergency contacts.',
      chips: ['One-Tap SOS', 'Emergency Contacts Alert', 'Live Route Tracking', 'Instant SMS & Push'],
      icon: Radio,
      stat: '< 5s',
      statLabel: 'Alert Delivery Speed',
    },
    {
      title: 'Live Route Monitoring',
      headline: 'Admins monitor your journey in real-time as you walk.',
      desc: 'While your walk is active, our safety response team monitors your live GPS location and path on the radar. If you divert off course, miss a check-in, or trigger an alert, help is ready to assist you immediately.',
      chips: ['Real-Time GPS Tracking', 'Safety Radar Oversight', 'Route Tracking', 'Instant Help Ready'],
      icon: Compass,
      stat: '24/7 Radar',
      statLabel: 'Live Journey Oversight',
    },
    {
      title: 'In-App Voice Call',
      headline: 'Speak directly with help when you need it most.',
      desc: 'Crystal-clear, in-app voice calling allows you to connect instantly with emergency support or trusted contacts with zero phone dialing delays.',
      chips: ['HD Clear Audio', 'Listen-In Safety Mode', 'Instant Connection', 'Encrypted Audio'],
      icon: PhoneCall,
      stat: 'HD 48kHz',
      statLabel: 'Audio Quality',
    },
    {
      title: 'Community Safety Reports',
      headline: 'Stay informed about hazards and safety updates around you.',
      desc: 'Report unsafe areas, hazards, or suspicious activity in seconds to keep your community safe. Browse local safety alerts with full privacy and anonymity.',
      chips: ['Anonymous Option', 'Photo Uploads', 'Local Hazard Warnings', 'Community Safe'],
      icon: FileText,
      stat: '100%',
      statLabel: 'Private & Anonymous',
    },
  ];

  // Customer Testimonials
  const testimonials = [
    {
      quote: 'Safety gives me total peace of mind walking home from late shifts. The automated check-in means I never have to worry.',
      name: 'Amina Vance',
      role: 'New York · Verified User',
      flag: 'US',
    },
    {
      quote: 'One tap connects me to my emergency contacts with my exact location. It feels like having a personal guardian with me.',
      name: 'David Mensah',
      role: 'Nairobi · Verified User',
      flag: 'KE',
    },
    {
      quote: 'As a university student walking across campus at night, having proactive protection running in the background is a game changer.',
      name: 'Sophia Jenkins',
      role: 'London · Verified User',
      flag: 'GB',
    },
  ];

  const currentPillar = pillars[displayedTab];
  const CurrentIcon = currentPillar.icon;

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#F4F7F5',
      color: 'var(--text-main)',
      fontFamily: 'var(--font-sans)',
      display: 'flex',
      flexDirection: 'column',
    }}>
      
      {/* =========================================================
          1. STICKY GLASS HEADER (Clean & Minimal)
          ========================================================= */}
      <header style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        backgroundColor: 'rgba(255, 255, 255, 0.92)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--border-hairline)',
        padding: '0.85rem 2rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        {/* Brand Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <img
            src="/safety.jpg"
            alt="Safety Logo"
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '11px',
              objectFit: 'cover',
              boxShadow: '0 4px 14px rgba(16, 185, 129, 0.28)',
              border: '1.5px solid rgba(16, 185, 129, 0.25)',
            }}
          />
          <div>
            <div style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 800,
              fontSize: '1.15rem',
              letterSpacing: '-0.02em',
              color: 'var(--text-main)',
              lineHeight: 1.1,
            }}>
              SAFETY
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--accent-green-dark)', fontWeight: 700 }}>
              PERSONAL PROTECTION
            </div>
          </div>
        </div>

        {/* Center Nav Links */}
        <nav style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
          <a href="#features" style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-sub)', textDecoration: 'none', transition: 'color 0.2s' }}>
            Pillars
          </a>
          <a href="#testimonials" style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-sub)', textDecoration: 'none', transition: 'color 0.2s' }}>
            Testimonials
          </a>
          <a href="#download" style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-sub)', textDecoration: 'none', transition: 'color 0.2s' }}>
            Download App
          </a>
        </nav>

        {/* Top Right Header Action */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Link
            to="/login"
            className="btn-oneforma-ghost"
            style={{
              padding: '8px 16px',
              fontSize: '0.78rem',
              borderRadius: 'var(--radius-pill)',
            }}
          >
            <span>Admin Login</span>
            <ArrowRight size={13} className="btn-arrow-icon" />
          </Link>

          <a
            href="#download"
            className="btn-oneforma-primary"
            style={{
              padding: '8px 18px',
              fontSize: '0.78rem',
              borderRadius: 'var(--radius-pill)',
            }}
          >
            <Download size={14} />
            <span>Download App</span>
          </a>
        </div>
      </header>

      {/* =========================================================
          2. MEGA HERO SECTION (Customer Focused)
          ========================================================= */}
      <section style={{
        padding: '5rem 2rem 3.5rem 2rem',
        maxWidth: '1240px',
        width: '100%',
        margin: '0 auto',
        display: 'grid',
        gridTemplateColumns: '1.15fr 1fr',
        gap: '3.5rem',
        alignItems: 'center',
        position: 'relative',
      }}>
        
        {/* Left: Pitch & Value Proposition */}
        <div>
          
          {/* Tag Pill */}
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.45rem',
            padding: '6px 14px',
            backgroundColor: 'var(--accent-green-light)',
            color: 'var(--accent-green-dark)',
            borderRadius: 'var(--radius-pill)',
            fontSize: '0.78rem',
            fontWeight: 700,
            marginBottom: '1.5rem',
            border: '1px solid var(--accent-green-border-subtle)',
          }}>
            <ShieldCheck size={15} />
            <span>YOUR PERSONAL SAFETY COMPANION</span>
          </div>

          {/* Big Display Headline */}
          <h1 className="display-mega" style={{ marginBottom: '1.25rem' }}>
            Never Walk Alone.<br />
            <span className="accent-italic">Smart Protection</span> for Every Journey.
          </h1>

          {/* Lede Paragraph */}
          <p className="lede" style={{ marginBottom: '2.25rem', maxWidth: '540px' }}>
            Safety watches over you while you walk. Automatic check-ins, instant emergency alerts to loved ones, and direct help whenever you need it.
          </p>

          {/* Dual CTAs */}
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <a
              href={apkDownloadUrl}
              download="Safety-v1.0.0.apk"
              className="btn-oneforma-primary"
            >
              <Download size={18} />
              <span>Download App</span>
              <ArrowRight size={16} className="btn-arrow-icon" />
            </a>

            <a
              href="#features"
              className="btn-oneforma-ghost"
            >
              <Activity size={16} color="var(--primary)" />
              <span>How It Works</span>
            </a>
          </div>

          {/* Subtext specs */}
          <div style={{ display: 'flex', gap: '1.5rem', marginTop: '2rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <CheckCircle2 size={15} color="var(--accent-green)" />
              <span>Free to Use • No Account Required</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <CheckCircle2 size={15} color="var(--accent-green)" />
              <span>Android Ready (v1.0.0)</span>
            </div>
          </div>

        </div>

        {/* Right: Modern Visual Canvas with Live Simulation */}
        <div style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '440px',
        }}>
          
          {/* Main Visual Frame (Map Simulation) */}
          <div className="animate-hero-float" style={{
            width: '100%',
            maxWidth: '460px',
            height: '420px',
            backgroundColor: '#FFFFFF',
            borderRadius: '32px',
            border: '1.5px solid #E2E8F0',
            boxShadow: '0 20px 60px rgba(15, 23, 42, 0.09)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
          }}>
            
            {/* Mock Top Map Toolbar */}
            <div style={{
              height: '52px',
              backgroundColor: '#FFFFFF',
              borderBottom: '1px solid #E2E8F0',
              padding: '0 1.25rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--accent-green)' }} />
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '0.75rem', color: 'var(--text-main)' }}>
                  LIVE WALK PROTECTION
                </span>
              </div>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '2px 8px',
                borderRadius: 'var(--radius-pill)',
                backgroundColor: 'var(--accent-green-light)',
                fontSize: '0.7rem',
                fontWeight: 700,
                color: 'var(--accent-green-dark)',
              }}>
                <MapPin size={11} />
                <span>Walking Home</span>
              </div>
            </div>

            {/* Graphic Map Canvas */}
            <div style={{
              flex: 1,
              background: 'radial-gradient(circle at center, #F0FDF4 0%, #FFFFFF 85%)',
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              
              {/* Concentric Protection Rings */}
              <div style={{ width: '280px', height: '280px', borderRadius: '50%', border: '1px solid #E2E8F0', position: 'absolute' }} />
              <div style={{ width: '180px', height: '180px', borderRadius: '50%', border: '1px solid #E2E8F0', position: 'absolute' }} />
              <div style={{ width: '80px', height: '80px', borderRadius: '50%', border: '1px dashed rgba(16, 185, 129, 0.4)', position: 'absolute' }} />

              {/* Central Pulsing Shield */}
              <div style={{
                width: '44px',
                height: '44px',
                borderRadius: '50%',
                backgroundColor: 'var(--primary)',
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 0 24px var(--primary)',
                zIndex: 5,
              }}>
                <Shield size={20} />
              </div>

              {/* Simulated Walk Status Pills */}
              <div style={{ position: 'absolute', top: '70px', left: '75px', display: 'flex', alignItems: 'center', gap: '5px', padding: '4px 10px', borderRadius: '12px', background: '#FFFFFF', boxShadow: '0 2px 10px rgba(0,0,0,0.08)', fontSize: '0.68rem', fontWeight: 700 }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--accent-green)' }} />
                <span>Amina • Walk Protected</span>
              </div>

              <div style={{ position: 'absolute', bottom: '75px', right: '65px', display: 'flex', alignItems: 'center', gap: '5px', padding: '4px 10px', borderRadius: '12px', background: '#FFFFFF', boxShadow: '0 2px 10px rgba(0,0,0,0.08)', fontSize: '0.68rem', fontWeight: 700 }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--accent-green)' }} />
                <span>Next check-in in 45s</span>
              </div>

            </div>

            {/* Bottom Status Bar */}
            <div style={{
              height: '40px',
              backgroundColor: '#FFFFFF',
              borderTop: '1px solid #E2E8F0',
              padding: '0 1rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '0.7rem',
              color: 'var(--text-muted)',
              fontWeight: 600,
            }}>
              <span>Emergency Contacts: Connected (3)</span>
              <span style={{ color: 'var(--accent-green-dark)' }}>Status: Safe</span>
            </div>

          </div>

          {/* Floating Glass Stat Card 1 */}
          <div className="glass-stat-card" style={{
            position: 'absolute',
            top: '-20px',
            left: '-20px',
          }}>
            <div className="glass-stat-val">
              24/7 <span className="glass-stat-unit">⚡</span>
            </div>
            <div className="glass-stat-label">Active Protection</div>
          </div>

          {/* Floating Glass Stat Card 2 */}
          <div className="glass-stat-card" style={{
            position: 'absolute',
            bottom: '-15px',
            right: '-15px',
          }}>
            <div className="glass-stat-val">
              &lt; 5<span className="glass-stat-unit">s</span>
            </div>
            <div className="glass-stat-label">Instant Alert Speed</div>
          </div>

          {/* Floating Glass Stat Card 3 */}
          <div className="glass-stat-card" style={{
            position: 'absolute',
            bottom: '40px',
            left: '-25px',
          }}>
            <div className="glass-stat-val">
              100<span className="glass-stat-unit">%</span>
            </div>
            <div className="glass-stat-label">Private & Free</div>
          </div>

        </div>

      </section>

      {/* =========================================================
          3. USER TESTIMONIALS (Customer Proof)
          ========================================================= */}
      <section id="testimonials" style={{
        maxWidth: '1240px',
        margin: '0 auto 5rem auto',
        padding: '0 2rem',
        width: '100%',
        scrollMarginTop: '90px',
      }}>
        {/* Section Header */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(auto, 580px) 1fr',
          gap: '3rem',
          alignItems: 'flex-end',
          marginBottom: '3rem',
        }}>
          <div>
            <div style={{
              fontSize: '0.78rem',
              fontWeight: 800,
              color: 'var(--accent-green-dark)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              marginBottom: '0.5rem',
            }}>
              COMMUNITY EXPERIENCES
            </div>
            <h2 className="display-xl">
              What Our Users Say<br />
              <span className="accent-italic">About Staying Safe.</span>
            </h2>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p className="lede" style={{ marginLeft: 'auto', maxWidth: '440px', marginBottom: '0' }}>
              Real experiences from everyday walkers, students, and commuters who rely on Safety for peace of mind.
            </p>
          </div>
        </div>

        {/* Testimonials Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '1.5rem',
        }}>
          {testimonials.map((t, idx) => (
            <div
              key={idx}
              style={{
                backgroundColor: '#FFFFFF',
                borderRadius: '24px',
                border: '1px solid #E2E8F0',
                padding: '2rem',
                boxShadow: '0 4px 20px rgba(15, 23, 42, 0.04)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: '1.5rem',
                transition: 'transform 0.2s ease, box-shadow 0.2s ease',
              }}
            >
              <div>
                {/* 5-Star Rating Row & Subtle Quote Icon */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', gap: '3px' }}>
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} size={15} fill="#10B981" color="#10B981" />
                    ))}
                  </div>
                  <Quote size={20} color="var(--accent-green-border-subtle)" style={{ opacity: 0.8 }} />
                </div>

                <p style={{ fontSize: '0.925rem', color: 'var(--text-sub)', fontStyle: 'italic', lineHeight: 1.6, margin: 0 }}>
                  "{t.quote}"
                </p>
              </div>

              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                paddingTop: '1rem',
                borderTop: '1px solid #F1F5F9',
              }}>
                <CountryFlag code={t.flag} size={18} />
                <div>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '0.875rem', color: 'var(--text-main)' }}>
                    {t.name}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    {t.role}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* =========================================================
          4. INTERACTIVE PILLARS OF PROTECTION
          ========================================================= */}
      <section 
        id="features" 
        style={{
          backgroundColor: '#FFFFFF',
          borderTop: '1px solid #E2E8F0',
          borderBottom: '1px solid #E2E8F0',
          padding: '6rem 2rem',
          scrollMarginTop: '90px',
        }}
      >
        <div style={{ maxWidth: '1240px', margin: '0 auto' }}>
          
          {/* Section Header */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(auto, 580px) 1fr',
            gap: '4rem',
            alignItems: 'flex-end',
            marginBottom: '3.5rem',
          }}>
            <div>
              <div style={{
                fontSize: '0.78rem',
                fontWeight: 800,
                color: 'var(--accent-green-dark)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                marginBottom: '0.5rem',
              }}>
                HOW SAFETY PROTECTS YOU
              </div>
              <h2 className="display-xl">
                Five Core Pillars of<br />
                <span className="accent-italic">Your Protection.</span>
              </h2>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p className="lede" style={{ marginLeft: 'auto', maxWidth: '420px', marginBottom: '1rem' }}>
                Engineered to keep you secure and connected without intruding on your daily walk.
              </p>
              <a
                href="#download"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '0.8125rem',
                  fontWeight: 700,
                  color: 'var(--text-main)',
                  textDecoration: 'none',
                  borderBottom: '1.5px solid var(--primary)',
                  paddingBottom: '2px',
                }}
              >
                <span>Get the App</span>
                <ArrowRight size={14} />
              </a>
            </div>
          </div>

          {/* Two-Column Interactive Tab Body */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '360px 1fr',
            gap: '3.5rem',
            borderTop: '1px solid #E2E8F0',
            paddingTop: '2rem',
          }}>
            
            {/* Left Column: Vertical Tabs (Hovering pauses autoplay) */}
            <div 
              onMouseEnter={() => setIsHovered(true)}
              onMouseLeave={() => setIsHovered(false)}
              style={{ display: 'flex', flexDirection: 'column', borderRight: '1px solid #E2E8F0' }}
            >
              {pillars.map((pillar, idx) => {
                const Icon = pillar.icon;
                const isActive = activeTab === idx;

                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleTabChange(idx)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '1.4rem 1.5rem 1.4rem 0.75rem',
                      background: isActive ? 'rgba(16, 185, 129, 0.06)' : 'transparent',
                      borderRadius: '16px',
                      border: 'none',
                      borderBottom: '1px solid #F1F5F9',
                      cursor: 'pointer',
                      textAlign: 'left',
                      position: 'relative',
                      transition: 'all 0.25s ease',
                      marginBottom: '0.25rem',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <div style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '12px',
                        backgroundColor: isActive ? 'var(--accent-green-light)' : '#F8FAF9',
                        color: isActive ? 'var(--accent-green-dark)' : 'var(--text-muted)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.25s ease',
                        boxShadow: isActive ? '0 2px 10px rgba(16, 185, 129, 0.25)' : 'none',
                        transform: isActive ? 'scale(1.04)' : 'scale(1)',
                      }}>
                        <Icon size={20} />
                      </div>
                      <div style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: '1.05rem',
                        fontWeight: isActive ? 800 : 500,
                        color: isActive ? 'var(--text-main)' : 'var(--text-sub)',
                        letterSpacing: '-0.02em',
                        transition: 'color 0.2s ease',
                      }}>
                        {pillar.title}
                      </div>
                    </div>

                    {/* Animated Active Indicator Progress Bar on Right Edge */}
                    {isActive && (
                      <div style={{
                        position: 'absolute',
                        right: '-2px',
                        top: '8px',
                        bottom: '8px',
                        width: '3px',
                        backgroundColor: '#E2E8F0',
                        borderRadius: '3px',
                        overflow: 'hidden',
                      }}>
                        <div 
                          key={`progress-${activeTab}`}
                          className="animate-pillar-progress"
                          style={{
                            width: '100%',
                            height: '100%',
                            backgroundColor: 'var(--primary)',
                            borderRadius: '3px',
                            animationPlayState: isHovered ? 'paused' : 'running',
                          }}
                        />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Right Column: Dynamic Preview Panel (Smooth 2-Phase Cross-Fade) */}
            <div 
              onMouseEnter={() => setIsHovered(true)}
              onMouseLeave={() => setIsHovered(false)}
              style={{
                padding: '0.5rem 0 1rem 1rem',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                opacity: isTransitioning ? 0 : 1,
                transform: isTransitioning ? 'translateY(-8px) scale(0.99)' : 'translateY(0) scale(1)',
                filter: isTransitioning ? 'blur(4px)' : 'blur(0px)',
                transition: 'opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1), transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), filter 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
            >
              
              <div>
                {/* Pillar Header with Icon */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
                  <div style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '12px',
                    backgroundColor: 'var(--accent-green-light)',
                    color: 'var(--accent-green-dark)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 2px 10px rgba(16, 185, 129, 0.15)',
                  }}>
                    <CurrentIcon size={22} />
                  </div>
                  <div style={{ fontSize: '0.8125rem', fontWeight: 800, color: 'var(--accent-green-dark)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    {currentPillar.title}
                  </div>
                </div>

                {/* Headline */}
                <h3 style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '2rem',
                  fontWeight: 800,
                  color: 'var(--text-main)',
                  letterSpacing: '-0.025em',
                  lineHeight: 1.2,
                  marginBottom: '1rem',
                }}>
                  {currentPillar.headline}
                </h3>

                {/* Description */}
                <p style={{
                  fontSize: '1rem',
                  color: 'var(--text-sub)',
                  lineHeight: 1.6,
                  maxWidth: '620px',
                  marginBottom: '2rem',
                }}>
                  {currentPillar.desc}
                </p>

                {/* Chip Feature Badges */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', marginBottom: '2.5rem' }}>
                  {currentPillar.chips.map((chip, cIdx) => (
                    <span key={cIdx} className="fw-chip">
                      {chip}
                    </span>
                  ))}
                </div>
              </div>

              {/* Bottom Stat Card & CTA */}
              <div style={{
                backgroundColor: '#F8FAF9',
                borderRadius: '20px',
                border: '1px solid #E2E8F0',
                padding: '1.5rem 2rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}>
                <div>
                  <div style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: '1.75rem',
                    fontWeight: 800,
                    color: 'var(--text-main)',
                  }}>
                    {currentPillar.stat}
                  </div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                    {currentPillar.statLabel}
                  </div>
                </div>

                <a
                  href="#download"
                  className="btn-oneforma-primary"
                  style={{ padding: '10px 20px', fontSize: '0.8125rem' }}
                >
                  <Download size={14} />
                  <span>Download App</span>
                  <ArrowRight size={15} className="btn-arrow-icon" />
                </a>
              </div>

            </div>

          </div>

        </div>
      </section>

      {/* =========================================================
          5. QR CODE INSTALLER & APP DOWNLOAD SECTION
          ========================================================= */}
      <section id="download" style={{
        backgroundColor: '#FFFFFF',
        borderTop: '1px solid #E2E8F0',
        padding: '6rem 2rem',
        scrollMarginTop: '90px',
      }}>
        <div style={{
          maxWidth: '1080px',
          margin: '0 auto',
          backgroundColor: '#F8FAF9',
          borderRadius: '36px',
          border: '1.5px solid #E2E8F0',
          padding: '4rem',
          display: 'grid',
          gridTemplateColumns: '1.2fr 1fr',
          gap: '3.5rem',
          alignItems: 'center',
          boxShadow: '0 20px 60px rgba(15, 23, 42, 0.05)',
        }}>
          
          <div>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 12px',
              borderRadius: 'var(--radius-pill)',
              backgroundColor: 'var(--accent-green-light)',
              border: '1px solid var(--accent-green-border-subtle)',
              fontSize: '0.75rem',
              fontWeight: 700,
              color: 'var(--accent-green-dark)',
              marginBottom: '1.25rem',
            }}>
              <Sparkles size={13} />
              <span>ANDROID APPLICATION</span>
            </div>

            <h2 className="display-xl" style={{ marginBottom: '1rem' }}>
              Install Safety on<br />
              <span className="accent-italic">Your Android Device.</span>
            </h2>

            <p className="lede" style={{ marginBottom: '2rem' }}>
              Protect yourself and loved ones on every walk. Equipped with background check-ins, instant SOS alerts, emergency siren, and anonymous community reports.
            </p>

            <a
              href={apkDownloadUrl}
              download="Safety-v1.0.0.apk"
              className="btn-oneforma-primary"
            >
              <Download size={18} />
              <span>Download App</span>
              <ArrowRight size={16} className="btn-arrow-icon" />
            </a>
          </div>

          {/* QR Card */}
          <div style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '24px',
            border: '1px solid #E2E8F0',
            padding: '2rem',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            boxShadow: '0 8px 30px rgba(15, 23, 42, 0.06)',
          }}>
            <QRCodeSVG
              value={apkDownloadUrl}
              size={180}
              bgColor="#FFFFFF"
              fgColor="#0F172A"
              level="Q"
              includeMargin={false}
            />
            <div style={{ marginTop: '1.25rem', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '0.95rem' }}>
              Scan to Download App
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
              Point your Android camera at the QR code
            </div>
          </div>

        </div>
      </section>

      {/* =========================================================
          6. STRUCTURED FOOTER (Clean & Focused)
          ========================================================= */}
      <footer style={{
        backgroundColor: '#FFFFFF',
        borderTop: '1px solid #E2E8F0',
        padding: '4rem 2rem 2.5rem 2rem',
        marginTop: 'auto',
      }}>
        <div style={{ maxWidth: '1240px', margin: '0 auto' }}>
          
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1.5fr 1fr 1fr 1fr',
            gap: '3rem',
            marginBottom: '3.5rem',
          }}>
            
            {/* Column 1: Brand & Status */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                <img
                  src="/safety.jpg"
                  alt="Safety Logo"
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '10px',
                    objectFit: 'cover',
                  }}
                />
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.1rem' }}>
                  SAFETY
                </div>
              </div>
              <p style={{ fontSize: '0.8125rem', color: 'var(--text-sub)', lineHeight: 1.6, marginBottom: '0', maxWidth: '300px' }}>
                Personal safety and proactive protection for every journey. Live tracking, automatic check-ins, and instant emergency alerts.
              </p>
            </div>

            {/* Column 2: Pillars */}
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '0.85rem', marginBottom: '1rem' }}>
                PILLARS
              </div>
              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.65rem', fontSize: '0.8125rem', color: 'var(--text-sub)' }}>
                <li><a href="#features" style={{ color: 'inherit', textDecoration: 'none' }}>Automatic Check-ins</a></li>
                <li><a href="#features" style={{ color: 'inherit', textDecoration: 'none' }}>Instant Emergency Alerts</a></li>
                <li><a href="#features" style={{ color: 'inherit', textDecoration: 'none' }}>Live Route Monitoring</a></li>
                <li><a href="#features" style={{ color: 'inherit', textDecoration: 'none' }}>In-App Voice Call</a></li>
                <li><a href="#features" style={{ color: 'inherit', textDecoration: 'none' }}>Community Reports</a></li>
              </ul>
            </div>

            {/* Column 3: App & Safety */}
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '0.85rem', marginBottom: '1rem' }}>
                APP & ACCESS
              </div>
              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.65rem', fontSize: '0.8125rem', color: 'var(--text-sub)' }}>
                <li><a href="#download" style={{ color: 'inherit', textDecoration: 'none' }}>Download App</a></li>
                <li><a href="#features" style={{ color: 'inherit', textDecoration: 'none' }}>How It Works</a></li>
                <li><a href="#testimonials" style={{ color: 'inherit', textDecoration: 'none' }}>Testimonials</a></li>
                <li><Link to="/login" style={{ color: 'inherit', textDecoration: 'none' }}>Admin Login</Link></li>
              </ul>
            </div>

            {/* Column 4: Security & Compliance */}
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '0.85rem', marginBottom: '1rem' }}>
                PRIVACY & SECURITY
              </div>
              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.65rem', fontSize: '0.8125rem', color: 'var(--text-sub)' }}>
                <li><span>Encrypted & Protected</span></li>
                <li><span>Anonymous Safety Reporting</span></li>
                <li><span>Private Location Data</span></li>
                <li><span>No Tracking when Inactive</span></li>
              </ul>
            </div>

          </div>

          {/* Bottom Copyright */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingTop: '2rem',
            borderTop: '1px solid #E2E8F0',
            fontSize: '0.75rem',
            color: 'var(--text-muted)',
            flexWrap: 'wrap',
            gap: '1rem',
          }}>
            <div>
              &copy; {new Date().getFullYear()} Safety Operations Network. All rights reserved.
            </div>
            <div>
              Personal Safety & Protection.
            </div>
          </div>

        </div>
      </footer>

    </div>
  );
};
