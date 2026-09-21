import React from 'react';
import { Sparkles, X, RefreshCw } from 'lucide-react';
import type { CommunityAiReport } from '../types';

interface AiSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  report: CommunityAiReport | null;
  isLoading: boolean;
  communityName: string;
  onRefresh: () => void;
}

/**
 * Extracts clean, narrative paragraphs from the AI report.
 * Eliminates all risk scoring meters, complex directive tabs, and visual clutter.
 */
function getSummaryParagraphs(report: CommunityAiReport | null): string[] {
  if (!report) return [];

  // If Gemini provided a clean 2-paragraph markdown report, prioritize that directly
  if (report.markdownReport) {
    const blocks = report.markdownReport
      .split('\n\n')
      .map((b) => b.replace(/^#+\s*/gm, '').replace(/\*+/g, '').replace(/^-\s*/gm, '').trim())
      .filter((b) => b.length > 30 && !b.toLowerCase().startsWith('risk level'));

    if (blocks.length >= 2) {
      return blocks;
    }
  }

  const paragraphs: string[] = [];

  // 1. Executive Summary Paragraph
  if (report.executiveSummary && report.executiveSummary.trim()) {
    paragraphs.push(report.executiveSummary.trim());
  }

  // 2. Locations & Landmarks Narrative
  if (report.locationsCovered && report.locationsCovered.length > 0) {
    const locNames = Array.from(new Set(report.locationsCovered.map((l) => l.name).filter(Boolean)));
    const highlights = report.locationsCovered
      .slice(0, 3)
      .map((l) => l.details || `${l.threatType || 'Activity'} near ${l.name}`)
      .join(' ');

    if (locNames.length > 0) {
      const isResearchMode =
        (report.metadata?.totalIncidentsAnalyzed || 0) === 0 &&
        (report.metadata?.totalSafetySessionsAnalyzed || 0) === 0;

      const prefix = isResearchMode
        ? `Busy spots and main roads around here include ${locNames.slice(0, 4).join(', ')}.`
        : `Recent safety reports were mostly around ${locNames.slice(0, 4).join(', ')}.`;

      paragraphs.push(`${prefix} ${highlights}`.trim());
    }
  }

  // 3. Citizen Safety Guidance
  if (report.citizenAdvice && report.citizenAdvice.length > 0) {
    const guidance = report.citizenAdvice
      .map((a) => a.recommendation)
      .filter(Boolean)
      .join(' ');
    if (guidance) {
      paragraphs.push(`Safety tips: ${guidance}`);
    }
  }

  return paragraphs.length > 0
    ? paragraphs
    : ['This area is currently calm with no major incidents reported. Stay aware of your surroundings as usual.'];
}

export const AiSummaryModal: React.FC<AiSummaryModalProps> = ({
  isOpen,
  onClose,
  report,
  isLoading,
  communityName,
  onRefresh,
}) => {
  if (!isOpen) return null;

  const paragraphs = getSummaryParagraphs(report);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        backgroundColor: 'rgba(15, 23, 42, 0.45)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.25rem',
        animation: 'modalFadeIn 0.18s ease-out',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <style>{`
        @keyframes modalFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes modalPopIn {
          from { opacity: 0; transform: scale(0.97) translateY(4px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes pulseDot {
          0%, 100% { opacity: 0.3; transform: scale(0.85); }
          50% { opacity: 1; transform: scale(1.15); }
        }
        @keyframes skeletonPulse {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 0.9; }
        }
      `}</style>

      {/* Square Minimalist Modal Container */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '8px',
          width: '100%',
          maxWidth: '620px',
          minHeight: '380px',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 45px rgba(15, 23, 42, 0.15), 0 2px 8px rgba(15, 23, 42, 0.06)',
          border: '1px solid #E2E8F0',
          overflow: 'hidden',
          fontFamily: 'var(--font-sans, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif)',
          animation: 'modalPopIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '1.2rem 1.5rem',
            borderBottom: '1px solid #E2E8F0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: '#FAFAFA',
          }}
        >
          <div>
            <h3
              style={{
                margin: 0,
                fontSize: '1rem',
                fontWeight: 700,
                color: '#0F172A',
                letterSpacing: '-0.01em',
              }}
            >
              {communityName}
            </h3>
            <span style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 500 }}>
              Community Safety Intelligence
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {!isLoading && (
              <button
                onClick={onRefresh}
                title="Regenerate Summary"
                style={{
                  background: 'none',
                  border: '1px solid #E2E8F0',
                  borderRadius: '6px',
                  width: '30px',
                  height: '30px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#64748B',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#F1F5F9';
                  e.currentTarget.style.color = '#0F172A';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                  e.currentTarget.style.color = '#64748B';
                }}
              >
                <RefreshCw size={13} />
              </button>
            )}

            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: '1px solid #E2E8F0',
                borderRadius: '6px',
                width: '30px',
                height: '30px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#64748B',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#F1F5F9';
                e.currentTarget.style.color = '#0F172A';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = '#64748B';
              }}
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div
          style={{
            padding: '1.75rem',
            overflowY: 'auto',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {isLoading ? (
            /* Minimalist Basic Loading State */
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: '260px',
                gap: '1.25rem',
              }}
            >
              {/* Minimal Three-Dot Pulse Animation */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    backgroundColor: '#10B981',
                    animation: 'pulseDot 1.2s infinite ease-in-out',
                    animationDelay: '0s',
                  }}
                />
                <span
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    backgroundColor: '#10B981',
                    animation: 'pulseDot 1.2s infinite ease-in-out',
                    animationDelay: '0.2s',
                  }}
                />
                <span
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    backgroundColor: '#10B981',
                    animation: 'pulseDot 1.2s infinite ease-in-out',
                    animationDelay: '0.4s',
                  }}
                />
              </div>

              <span style={{ fontSize: '0.8125rem', color: '#64748B', fontWeight: 500 }}>
                Synthesizing community intelligence...
              </span>

              {/* Minimalist Shimmer Skeleton Bars */}
              <div style={{ width: '100%', maxWidth: '420px', display: 'flex', flexDirection: 'column', gap: '9px', marginTop: '0.5rem' }}>
                <div style={{ height: '8px', width: '100%', backgroundColor: '#F1F5F9', borderRadius: '4px', animation: 'skeletonPulse 1.5s infinite ease-in-out' }} />
                <div style={{ height: '8px', width: '90%', backgroundColor: '#F1F5F9', borderRadius: '4px', animation: 'skeletonPulse 1.5s infinite ease-in-out 0.2s' }} />
                <div style={{ height: '8px', width: '75%', backgroundColor: '#F1F5F9', borderRadius: '4px', animation: 'skeletonPulse 1.5s infinite ease-in-out 0.4s' }} />
              </div>
            </div>
          ) : (
            /* Clean Paragraphs View - Zero Noise */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
              {paragraphs.map((para, idx) => (
                <p
                  key={idx}
                  style={{
                    margin: 0,
                    fontSize: '0.925rem',
                    lineHeight: '1.75',
                    color: '#334155',
                    fontWeight: 400,
                  }}
                >
                  {para}
                </p>
              ))}
            </div>
          )}
        </div>

        {/* Minimal Footer: Just "Powered by Gemini AI" and Close */}
        <div
          style={{
            padding: '0.9rem 1.5rem',
            borderTop: '1px solid #E2E8F0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: '#FAFAFA',
          }}
        >
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#64748B', fontSize: '0.75rem', fontWeight: 500 }}>
            <Sparkles size={12} style={{ color: '#10B981' }} />
            <span>Powered by Gemini AI</span>
          </div>

          <button
            onClick={onClose}
            style={{
              padding: '6px 16px',
              fontSize: '0.78rem',
              fontWeight: 600,
              backgroundColor: '#0F172A',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              transition: 'background-color 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#1E293B';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#0F172A';
            }}
          >
            Okay
          </button>
        </div>
      </div>
    </div>
  );
};
