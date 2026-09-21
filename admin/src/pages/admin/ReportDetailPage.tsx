import React, { useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  ArrowLeft,
  MapPin,
  EyeOff,
  User,
  Clock,
  Navigation,
  MessageSquare,
  Send,
  AlertTriangle,
} from "lucide-react";
import { Select, Input, notification } from "antd";
import { useData } from "../../context/DataContext";
import type { IncidentStatus } from "../../types";

export const ReportDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { reports, addComment, updateReportStatus } = useData();
  const [commentInput, setCommentInput] = useState("");
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  const report = reports.find(
    (r) => r.id === id || (r as any).customId === id || (r as any)._id === id,
  );

  if (!report) {
    return (
      <div
        style={{
          padding: "4rem 2rem",
          textAlign: "center",
          backgroundColor: "#F4F7F5",
          minHeight: "100%",
        }}
      >
        <div
          style={{
            backgroundColor: "#FFFFFF",
            borderRadius: "24px",
            border: "1.5px solid #E2E8F0",
            padding: "3rem",
            maxWidth: "540px",
            margin: "0 auto",
            boxShadow: "0 4px 20px rgba(15, 23, 42, 0.05)",
          }}
        >
          <AlertTriangle
            size={48}
            color="var(--accent-red)"
            style={{ marginBottom: "1rem" }}
          />
          <h2
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 800,
              fontSize: "1.35rem",
              marginBottom: "0.5rem",
            }}
          >
            Incident Report Not Located
          </h2>
          <p
            style={{
              color: "var(--text-muted)",
              marginBottom: "1.75rem",
              fontSize: "0.85rem",
            }}
          >
            The requested incident report #{id} could not be found in active
            memory.
          </p>
          <Link to="/admin/incidents" className="btn-oneforma-primary">
            <ArrowLeft size={15} />
            <span>Return to Incidents & Reports</span>
          </Link>
        </div>
      </div>
    );
  }

  const handleSendComment = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = commentInput.trim();
    if (!text || isSubmittingComment) return;

    setIsSubmittingComment(true);
    try {
      const success = await addComment(report.id, text);
      if (success) {
        setCommentInput("");
        notification.success({
          message: "Note Added",
          description: "Responder note posted successfully.",
          placement: "topRight",
          duration: 3,
        });
      } else {
        notification.error({
          message: "Failed to Post Note",
          description:
            "Could not persist note to server. Please verify network connection.",
          placement: "topRight",
          duration: 4.5,
        });
      }
    } catch (err: any) {
      notification.error({
        message: "Error Posting Note",
        description:
          err?.message || "An unexpected error occurred while posting note.",
        placement: "topRight",
        duration: 4.5,
      });
    } finally {
      setIsSubmittingComment(false);
    }
  };

  const handleStatusChange = async (val: string) => {
    const newStatus = val as IncidentStatus;
    const statusLabel = newStatus.charAt(0).toUpperCase() + newStatus.slice(1);
    setIsUpdatingStatus(true);
    try {
      const success = await updateReportStatus(report.id, newStatus);
      if (success) {
        notification.success({
          message: "Status Changed",
          description: `Report status updated to ${statusLabel}.`,
          placement: "topRight",
          duration: 3,
        });
      } else {
        notification.error({
          message: "Status Update Failed",
          description: `Failed to update status to ${statusLabel}. Changes have been rolled back.`,
          placement: "topRight",
          duration: 4.5,
        });
      }
    } catch (err: any) {
      notification.error({
        message: "Status Update Error",
        description:
          err?.message || "An unexpected error occurred while updating status.",
        placement: "topRight",
        duration: 4.5,
      });
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const gmapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${report.location.lat},${report.location.lng}`;

  return (
    <div
      className="report-detail-outer"
      style={{
        padding: "2rem",
        maxWidth: "1180px",
        width: "100%",
        margin: "0 auto",
        fontFamily: "var(--font-sans)",
        backgroundColor: "#F4F7F5",
        minHeight: "100%",
        overflowY: "auto",
      }}
    >
      {/* Top Header Back Bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "flex-start",
          alignItems: "center",
          marginBottom: "1.5rem",
        }}
      >
        <Link
          to="/admin/incidents"
          className="btn-oneforma-ghost"
          style={{
            padding: "6px 14px",
            fontSize: "0.78rem",
            borderRadius: "var(--radius-pill)",
          }}
        >
          <ArrowLeft size={14} />
          <span>Back to Incidents & Reports</span>
        </Link>
      </div>

      {/* Main Master Card */}
      <div
        className="report-detail-card"
        style={{
          backgroundColor: "#FFFFFF",
          border: "1.5px solid #E2E8F0",
          borderRadius: "32px",
          padding: "2.5rem",
          boxShadow: "0 8px 30px rgba(15, 23, 42, 0.05)",
          display: "flex",
          flexDirection: "column",
          gap: "2rem",
        }}
      >
        {/* Header Section */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            flexWrap: "wrap",
            gap: "1.5rem",
            borderBottom: "1px solid #E2E8F0",
            paddingBottom: "1.75rem",
          }}
        >
          <div>
            {/* Badges Row */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                marginBottom: "0.75rem",
                flexWrap: "wrap",
              }}
            >
              <span
                className={`badge ${
                  report.urgency === "critical"
                    ? "badge-emergency"
                    : report.urgency === "high"
                      ? "badge-distress"
                      : "badge-neutral"
                }`}
              >
                {report.category.replace("_", " ")}
              </span>

              {report.isAnonymous && (
                <span
                  className="badge badge-neutral"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.25rem",
                  }}
                >
                  <EyeOff size={11} />
                  <span>Anonymous Report</span>
                </span>
              )}

              <span
                style={{
                  fontSize: "0.75rem",
                  color: "var(--text-muted)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                Case ID: #{report.id.toUpperCase()}
              </span>
            </div>

            {/* Main Display Title */}
            <h1
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "1.75rem",
                fontWeight: 800,
                color: "var(--text-main)",
                letterSpacing: "-0.025em",
                lineHeight: 1.2,
                marginBottom: "0.6rem",
              }}
            >
              {report.title}
            </h1>

            {/* Metadata Bar */}
            <div
              style={{
                display: "flex",
                gap: "1.5rem",
                fontSize: "0.8125rem",
                color: "var(--text-sub)",
                flexWrap: "wrap",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.35rem",
                }}
              >
                {report.isAnonymous ? (
                  <EyeOff size={14} />
                ) : (
                  <User size={14} color="var(--primary)" />
                )}
                <span style={{ fontWeight: 600 }}>
                  {report.isAnonymous
                    ? "Anonymous"
                    : report.reporterName || "User"}
                </span>
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.35rem",
                }}
              >
                <Clock size={14} color="var(--text-muted)" />
                <span>{new Date(report.createdAt).toLocaleString()}</span>
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.35rem",
                }}
              >
                <MapPin size={14} color="var(--primary)" />
                <span style={{ fontWeight: 600 }}>{report.addressName}</span>
              </div>
            </div>
          </div>

          {/* Status Changer Box (Antd Select) */}
          <div
            style={{
              backgroundColor: "#F8FAF9",
              borderRadius: "16px",
              border: "1px solid #E2E8F0",
              padding: "0.75rem 1.25rem",
              display: "flex",
              alignItems: "center",
              gap: "0.75rem",
            }}
          >
            <span
              style={{
                fontSize: "0.75rem",
                fontWeight: 800,
                color: "var(--text-main)",
                fontFamily: "var(--font-display)",
              }}
            >
              STATUS:
            </span>
            <Select
              showSearch
              size="small"
              loading={isUpdatingStatus}
              disabled={isUpdatingStatus}
              optionFilterProp="label"
              value={report.status}
              onChange={handleStatusChange}
              options={[
                { value: "open", label: "Open" },
                { value: "investigating", label: "Investigating" },
                { value: "resolved", label: "Resolved" },
              ]}
              style={{ width: 170, fontWeight: 700, fontSize: "0.75rem" }}
            />
          </div>
        </div>

        {/* 2-Column Details Body */}
        <div
          className="report-detail-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "1.15fr 1fr",
            gap: "2.5rem",
          }}
        >
          {/* Left Column: Narrative & GPS Landmark */}
          <div
            style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}
          >
            {/* Narrative Box */}
            <div>
              <div
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 800,
                  color: "var(--text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  marginBottom: "0.5rem",
                }}
              >
                Report Details
              </div>
              <div
                style={{
                  backgroundColor: "#F8FAF9",
                  border: "1px solid #E2E8F0",
                  borderRadius: "18px",
                  padding: "1.25rem",
                  fontSize: "0.9rem",
                  lineHeight: 1.6,
                  color: "var(--text-main)",
                }}
              >
                {report.description}
              </div>
            </div>

            {/* GPS Landmark & Coordinates */}
            <div
              style={{
                backgroundColor: "#FFFFFF",
                border: "1px solid var(--accent-green-border-subtle)",
                borderRadius: "18px",
                padding: "1.25rem",
                display: "flex",
                flexDirection: "column",
                gap: "1rem",
                boxShadow: "0 2px 10px rgba(16, 185, 129, 0.06)",
              }}
            >
              <div>
                <div
                  style={{
                    fontWeight: 800,
                    fontSize: "0.8125rem",
                    color: "var(--text-main)",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.35rem",
                    marginBottom: "4px",
                  }}
                >
                  <MapPin size={15} color="var(--primary)" />
                  <span>Location Details</span>
                </div>
                <div
                  style={{
                    fontSize: "0.825rem",
                    color: "var(--text-sub)",
                    fontWeight: 500,
                    lineHeight: 1.4,
                  }}
                >
                  {report.addressName || "Location Not Specified"}
                </div>
                {report.location &&
                  (report.location.lat !== 0 || report.location.lng !== 0) && (
                    <div
                      style={{
                        fontSize: "0.72rem",
                        color: "var(--text-muted)",
                        fontFamily: "var(--font-mono)",
                        marginTop: "3px",
                      }}
                    >
                      Coordinates: {Number(report.location.lat).toFixed(5)},{" "}
                      {Number(report.location.lng).toFixed(5)}
                    </div>
                  )}
              </div>

              <div>
                <a
                  href={gmapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.45rem",
                    padding: "8px 14px",
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    borderRadius: "6px",
                    border: "1px solid #CBD5E1",
                    backgroundColor: "#F8FAFC",
                    color: "#0F172A",
                    textDecoration: "none",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "#F1F5F9";
                    e.currentTarget.style.borderColor = "#94A3B8";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "#F8FAFC";
                    e.currentTarget.style.borderColor = "#CBD5E1";
                  }}
                >
                  <Navigation size={13} color="var(--primary)" />
                  <span>Get Directions</span>
                </a>
              </div>
            </div>
          </div>

          {/* Right Column: Responder Notes & Patrol Audit Log */}
          <div
            style={{
              backgroundColor: "#F8FAF9",
              borderRadius: "24px",
              border: "1px solid #E2E8F0",
              padding: "1.5rem",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
            }}
          >
            <div>
              <div
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 800,
                  color: "var(--text-main)",
                  marginBottom: "1rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.45rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                <MessageSquare size={15} color="var(--primary)" />
                <span>Notes & Updates ({report.staffComments.length})</span>
              </div>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.75rem",
                  maxHeight: "260px",
                  overflowY: "auto",
                  paddingRight: "0.25rem",
                  marginBottom: "1.25rem",
                }}
              >
                {report.staffComments.length === 0 ? (
                  <div
                    style={{
                      padding: "2rem 1rem",
                      textAlign: "center",
                      backgroundColor: "#FFFFFF",
                      border: "1px dashed #E2E8F0",
                      borderRadius: "14px",
                      color: "var(--text-muted)",
                      fontSize: "0.78rem",
                    }}
                  >
                    No notes yet. Add a note or update below.
                  </div>
                ) : (
                  report.staffComments.map((comm) => (
                    <div
                      key={comm.id}
                      style={{
                        backgroundColor: "#FFFFFF",
                        border: "1px solid #E2E8F0",
                        borderRadius: "14px",
                        padding: "0.85rem 1rem",
                        boxShadow: "0 1px 4px rgba(0,0,0,0.02)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          marginBottom: "0.35rem",
                          fontSize: "0.75rem",
                        }}
                      >
                        <span
                          style={{
                            fontWeight: 800,
                            color: "var(--accent-green-dark)",
                          }}
                        >
                          {comm.staffName}{" "}
                          <span
                            style={{
                              color: "var(--text-muted)",
                              fontWeight: 500,
                            }}
                          >
                            ({comm.staffRole})
                          </span>
                        </span>
                        <span
                          style={{
                            color: "var(--text-muted)",
                            fontFamily: "var(--font-mono)",
                            fontSize: "0.6875rem",
                          }}
                        >
                          {new Date(comm.createdAt).toLocaleString([], {
                            dateStyle: "short",
                            timeStyle: "short",
                          })}
                        </span>
                      </div>
                      <p
                        style={{
                          fontSize: "0.8125rem",
                          color: "var(--text-sub)",
                          margin: 0,
                          lineHeight: 1.45,
                        }}
                      >
                        {comm.comment}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Add Responder Comment Form */}
            <form
              onSubmit={handleSendComment}
              style={{ display: "flex", gap: "0.5rem" }}
            >
              <Input
                value={commentInput}
                disabled={isSubmittingComment}
                onChange={(e) => setCommentInput(e.target.value)}
                placeholder="Add a note or update..."
                style={{
                  flex: 1,
                  borderRadius: "12px",
                  fontSize: "0.8125rem",
                  height: "42px",
                }}
              />
              <button
                type="submit"
                disabled={!commentInput.trim() || isSubmittingComment}
                className="btn-oneforma-primary"
                style={{
                  padding: "0 18px",
                  height: "42px",
                  borderRadius: "12px",
                  fontSize: "0.78rem",
                  opacity: isSubmittingComment ? 0.7 : 1,
                  cursor: isSubmittingComment ? "not-allowed" : "pointer",
                }}
              >
                <Send size={14} />
                <span>{isSubmittingComment ? "Posting..." : "Post"}</span>
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
