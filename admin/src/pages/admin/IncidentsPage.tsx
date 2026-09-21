import React, {
  useState,
  useMemo,
  useRef,
  useCallback,
  useEffect,
} from "react";
import { useNavigate } from "react-router-dom";
import {
  EyeOff,
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ShieldAlert,
  FileText,
  MapPin,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Select, Pagination, Modal, message } from "antd";
import { setOptions, importLibrary } from "@googlemaps/js-api-loader";
import { apiService } from "../../services/apiService";
import type { CommunityAiReport } from "../../types";
import { AiSummaryModal } from "../../components/AiSummaryModal";
import { useData } from "../../context/DataContext";
import { CountryFlag } from "../../components/CountryFlag";
import {
  getAllCountries,
  getCountryByCode,
  getStatesForCountry,
  getStateByCode,
  getCommunitiesForState,
  registerDynamicCommunity,
  prettifySlug,
  type CommunityData,
} from "../../services/jurisdictionData";

export const IncidentsPage: React.FC = () => {
  const {
    filteredReports,
    reports: allReports,
    globalSearch,
    jurisdictionSettings,
    updateJurisdictionSettings,
    activePerimeter,
    purgeAllData,
    config,
  } = useData();
  const navigate = useNavigate();

  // AI Intelligence & Test Purge State
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiReport, setAiReport] = useState<CommunityAiReport | null>(null);

  // Cache: avoid re-fetching when jurisdiction filters haven't changed
  const lastAiRequestKey = useRef<string | null>(null);
  const lastAiReport = useRef<CommunityAiReport | null>(null);

  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  // Jurisdiction & Google Places live search state
  const autocompleteServiceRef = useRef<any>(null);
  const geocoderRef = useRef<any>(null);
  const searchTimeoutRef = useRef<any>(null);
  const [isSearchingPlaces, setIsSearchingPlaces] = useState(false);
  const [communitySearchQuery, setCommunitySearchQuery] = useState("");
  const [dynamicCommunities, setDynamicCommunities] = useState<CommunityData[]>(
    [],
  );
  const [placeSearchResults, setPlaceSearchResults] = useState<
    Array<{ id: string; name: string; fullName: string; placeId: string }>
  >([]);

  const countries = useMemo(() => getAllCountries(), []);
  const states = useMemo(
    () =>
      jurisdictionSettings.countryCode !== "ALL"
        ? getStatesForCountry(jurisdictionSettings.countryCode)
        : [],
    [jurisdictionSettings.countryCode],
  );

  useEffect(() => {
    if (config?.googleMapsApiKey) {
      try {
        setOptions({
          key: config.googleMapsApiKey,
          v: "weekly",
        });
        Promise.all([importLibrary("places"), importLibrary("geocoding")])
          .then(() => {
            const googleObj = (window as any).google;
            if (
              !autocompleteServiceRef.current &&
              googleObj?.maps?.places?.AutocompleteService
            ) {
              autocompleteServiceRef.current =
                new googleObj.maps.places.AutocompleteService();
            }
            if (!geocoderRef.current && googleObj?.maps?.Geocoder) {
              geocoderRef.current = new googleObj.maps.Geocoder();
            }
          })
          .catch((err) => {
            console.warn(
              "Failed to load Google Maps libraries in IncidentsPage:",
              err,
            );
          });
      } catch (err) {
        console.warn("Google Maps loader config error:", err);
      }
    }
  }, [config?.googleMapsApiKey]);

  useEffect(() => {
    if (
      jurisdictionSettings.countryCode !== "ALL" &&
      jurisdictionSettings.stateCode !== "ALL"
    ) {
      const cached = getCommunitiesForState(
        jurisdictionSettings.countryCode,
        jurisdictionSettings.stateCode,
      );
      setDynamicCommunities(cached);
    } else {
      setDynamicCommunities([]);
    }
  }, [jurisdictionSettings.countryCode, jurisdictionSettings.stateCode]);

  // Derived community label for intelligence modal
  const currentCommunityLabel = useMemo(() => {
    if (
      jurisdictionSettings.communityId &&
      jurisdictionSettings.communityId !== "ALL"
    ) {
      const found = dynamicCommunities.find(
        (c) => c.id === jurisdictionSettings.communityId,
      );
      if (found) return found.name;
      if (jurisdictionSettings.communityName)
        return jurisdictionSettings.communityName;
      return prettifySlug(jurisdictionSettings.communityId);
    }
    if (
      jurisdictionSettings.stateCode &&
      jurisdictionSettings.stateCode !== "ALL"
    ) {
      const s = getStateByCode(
        jurisdictionSettings.countryCode,
        jurisdictionSettings.stateCode,
      );
      return s ? `${s.name} (All Communities)` : jurisdictionSettings.stateCode;
    }
    return jurisdictionSettings.countryCode !== "ALL"
      ? jurisdictionSettings.countryCode
      : "Worldwide";
  }, [jurisdictionSettings, dynamicCommunities]);

  const canGenerateAiSummary =
    jurisdictionSettings.countryCode !== "ALL" &&
    jurisdictionSettings.stateCode !== "ALL";

  const fetchAiSummary = useCallback(
    async (forceRefresh = false) => {
      if (
        jurisdictionSettings.countryCode === "ALL" ||
        jurisdictionSettings.stateCode === "ALL"
      ) {
        message.warning(
          "Please select at least a Country and State before requesting AI Safety Summary.",
        );
        return;
      }

      const targetCommunity =
        jurisdictionSettings.communityId &&
        jurisdictionSettings.communityId !== "ALL"
          ? jurisdictionSettings.communityId
          : "ALL";

      // Build a cache key from the current jurisdiction selection
      const cacheKey = `${jurisdictionSettings.countryCode}|${jurisdictionSettings.stateCode}|${targetCommunity}`;

      // If not forced and filters haven't changed, reuse previous response
      if (
        !forceRefresh &&
        cacheKey === lastAiRequestKey.current &&
        lastAiReport.current
      ) {
        setAiReport(lastAiReport.current);
        return;
      }

      setIsAiLoading(true);
      try {
        const data = await apiService.getCommunityAiSummary({
          communityId: targetCommunity,
          stateCode: jurisdictionSettings.stateCode,
          countryCode: jurisdictionSettings.countryCode,
          lat: activePerimeter?.center?.lat,
          lng: activePerimeter?.center?.lng,
          incidents: filteredReports,
        });

        if (data) {
          setAiReport(data);
          // Store in cache
          lastAiRequestKey.current = cacheKey;
          lastAiReport.current = data;
        } else {
          message.error("Failed to generate AI intelligence summary.");
        }
      } catch (err) {
        console.error(err);
        message.error("Error fetching AI intelligence summary.");
      } finally {
        setIsAiLoading(false);
      }
    },
    [jurisdictionSettings, activePerimeter],
  );

  const handleOpenAiSummary = () => {
    if (!canGenerateAiSummary) {
      message.warning(
        "Please select at least a Country and State to generate AI Safety Summary.",
      );
      return;
    }
    setIsAiModalOpen(true);
    fetchAiSummary(true);
  };

  const handleConfirmPurge = () => {
    Modal.confirm({
      title: "Purge All Incidents & Sessions?",
      icon: (
        <Trash2 style={{ color: "#DC2626", marginRight: "6px" }} size={22} />
      ),
      content:
        "This will permanently wipe all incident reports, citizen safety walk sessions, and radar emergency calls across MongoDB, Firebase, and background workers. This complete clear out is designed for testing.",
      okText: "Wipe Everything",
      okButtonProps: { danger: true },
      cancelText: "Cancel",
      onOk: async () => {
        try {
          const res = await purgeAllData();
          if (res.success) {
            message.success(
              "All test incidents, reports, and radar sessions have been wiped cleanly.",
            );
            setCurrentPage(1);
          } else {
            message.error(res.error || "Failed to purge test data");
          }
        } catch (err: any) {
          message.error(err.message || "Error occurred while purging data");
        }
      },
    });
  };

  const handleCommunitySearch = useCallback(
    (text: string) => {
      setCommunitySearchQuery(text);

      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }

      if (!text || text.trim().length < 2) {
        setPlaceSearchResults([]);
        setIsSearchingPlaces(false);
        return;
      }

      const cleanInput = text.trim();
      setIsSearchingPlaces(true);

      searchTimeoutRef.current = setTimeout(() => {
        const googleObj = (window as any).google;
        if (
          !autocompleteServiceRef.current &&
          googleObj?.maps?.places?.AutocompleteService
        ) {
          autocompleteServiceRef.current =
            new googleObj.maps.places.AutocompleteService();
        }
        if (!geocoderRef.current && googleObj?.maps?.Geocoder) {
          geocoderRef.current = new googleObj.maps.Geocoder();
        }

        const countryObj = getCountryByCode(jurisdictionSettings.countryCode);
        const stateObj = getStateByCode(
          jurisdictionSettings.countryCode,
          jurisdictionSettings.stateCode,
        );

        if (autocompleteServiceRef.current) {
          const req: any = { input: cleanInput };
          if (
            jurisdictionSettings.countryCode &&
            jurisdictionSettings.countryCode !== "ALL"
          ) {
            req.componentRestrictions = {
              country: jurisdictionSettings.countryCode.toLowerCase(),
            };
          }

          autocompleteServiceRef.current.getPlacePredictions(
            req,
            (predictions: any[] | null, status: any) => {
              setIsSearchingPlaces(false);
              if (status === "OK" && predictions && predictions.length > 0) {
                const seen = new Set<string>();
                const results: Array<{
                  id: string;
                  name: string;
                  fullName: string;
                  placeId: string;
                }> = [];
                for (const p of predictions) {
                  const shortName =
                    p.structured_formatting?.main_text ||
                    p.description.split(",")[0].trim();
                  const norm = shortName.toLowerCase().trim();
                  if (!seen.has(norm)) {
                    seen.add(norm);
                    results.push({
                      id: `gplace-${p.place_id}`,
                      name: shortName,
                      fullName: p.description,
                      placeId: p.place_id,
                    });
                  }
                }
                setPlaceSearchResults(results);
              } else if (geocoderRef.current) {
                const geoQuery = stateObj
                  ? `${cleanInput}, ${stateObj.name}, ${countryObj?.name || ""}`
                  : cleanInput;
                geocoderRef.current.geocode(
                  {
                    address: geoQuery,
                    componentRestrictions:
                      jurisdictionSettings.countryCode !== "ALL"
                        ? {
                            country:
                              jurisdictionSettings.countryCode.toLowerCase(),
                          }
                        : undefined,
                  },
                  (results: any[], gStatus: any) => {
                    if (gStatus === "OK" && results && results.length > 0) {
                      const seen = new Set<string>();
                      const fallbackList: Array<{
                        id: string;
                        name: string;
                        fullName: string;
                        placeId: string;
                      }> = [];
                      for (const r of results) {
                        const shortName =
                          r.address_components?.[0]?.long_name ||
                          r.formatted_address.split(",")[0].trim();
                        const norm = shortName.toLowerCase().trim();
                        if (!seen.has(norm)) {
                          seen.add(norm);
                          fallbackList.push({
                            id: `gplace-${r.place_id}`,
                            name: shortName,
                            fullName: r.formatted_address,
                            placeId: r.place_id,
                          });
                        }
                      }
                      setPlaceSearchResults(fallbackList);
                    } else {
                      setPlaceSearchResults([]);
                    }
                  },
                );
              } else {
                setPlaceSearchResults([]);
              }
            },
          );
        } else if (geocoderRef.current) {
          const geoQuery = stateObj
            ? `${cleanInput}, ${stateObj.name}, ${countryObj?.name || ""}`
            : cleanInput;
          geocoderRef.current.geocode(
            {
              address: geoQuery,
              componentRestrictions:
                jurisdictionSettings.countryCode !== "ALL"
                  ? { country: jurisdictionSettings.countryCode.toLowerCase() }
                  : undefined,
            },
            (results: any[], gStatus: any) => {
              setIsSearchingPlaces(false);
              if (gStatus === "OK" && results && results.length > 0) {
                const seen = new Set<string>();
                const fallbackList: Array<{
                  id: string;
                  name: string;
                  fullName: string;
                  placeId: string;
                }> = [];
                for (const r of results) {
                  const shortName =
                    r.address_components?.[0]?.long_name ||
                    r.formatted_address.split(",")[0].trim();
                  const norm = shortName.toLowerCase().trim();
                  if (!seen.has(norm)) {
                    seen.add(norm);
                    fallbackList.push({
                      id: `gplace-${r.place_id}`,
                      name: shortName,
                      fullName: r.formatted_address,
                      placeId: r.place_id,
                    });
                  }
                }
                setPlaceSearchResults(fallbackList);
              } else {
                setPlaceSearchResults([]);
              }
            },
          );
        } else {
          setIsSearchingPlaces(false);
          setPlaceSearchResults([]);
        }
      }, 180);
    },
    [jurisdictionSettings.countryCode, jurisdictionSettings.stateCode],
  );

  const handleCommunitySelect = useCallback(
    (val: string) => {
      const activeResults = [...placeSearchResults];
      setCommunitySearchQuery("");
      setPlaceSearchResults([]);

      if (val === "ALL") {
        updateJurisdictionSettings({
          communityId: "ALL",
          communityName: "All Communities",
        });
        return;
      }

      const stateObj = getStateByCode(
        jurisdictionSettings.countryCode,
        jurisdictionSettings.stateCode,
      );
      const countryObj = getCountryByCode(jurisdictionSettings.countryCode);
      const fallbackCenter = stateObj?.center ||
        countryObj?.center || { lat: 0, lng: 0 };

      if (val.startsWith("custom-")) {
        const cleanName =
          communitySearchQuery.trim() ||
          prettifySlug(val.replace("custom-", ""));
        const reg = registerDynamicCommunity(
          jurisdictionSettings.countryCode,
          jurisdictionSettings.stateCode,
          cleanName,
          activePerimeter?.center || fallbackCenter,
        );
        setDynamicCommunities((prev) => {
          if (prev.some((c) => c.id === reg.id)) return prev;
          return [...prev, reg].sort((a, b) => a.name.localeCompare(b.name));
        });
        updateJurisdictionSettings({
          communityId: reg.id,
          communityName: reg.name,
        });
        return;
      }

      const placeMatch = activeResults.find((p) => p.id === val);
      const googleObj = (window as any).google;
      if (!geocoderRef.current && googleObj?.maps?.Geocoder) {
        geocoderRef.current = new googleObj.maps.Geocoder();
      }

      if (placeMatch && placeMatch.placeId && geocoderRef.current) {
        geocoderRef.current.geocode(
          { placeId: placeMatch.placeId },
          (results: any[], status: any) => {
            if (status === "OK" && results && results.length > 0) {
              const loc = results[0].geometry?.location;
              if (loc) {
                const pt = { lat: loc.lat(), lng: loc.lng() };
                const reg = registerDynamicCommunity(
                  jurisdictionSettings.countryCode,
                  jurisdictionSettings.stateCode,
                  placeMatch.name,
                  pt,
                );
                setDynamicCommunities((prev) => {
                  if (prev.some((c) => c.id === reg.id)) return prev;
                  return [...prev, reg].sort((a, b) =>
                    a.name.localeCompare(b.name),
                  );
                });
                updateJurisdictionSettings({
                  communityId: reg.id,
                  communityName: reg.name,
                });
              }
            }
          },
        );
        return;
      }

      const found = dynamicCommunities.find((c) => c.id === val);
      const commName = found?.name || prettifySlug(val);
      updateJurisdictionSettings({ communityId: val, communityName: commName });
    },
    [
      placeSearchResults,
      communitySearchQuery,
      dynamicCommunities,
      jurisdictionSettings.countryCode,
      jurisdictionSettings.stateCode,
      updateJurisdictionSettings,
      activePerimeter,
    ],
  );

  const countryOptions = useMemo(
    () => [
      {
        value: "ALL",
        searchValue: "All Countries Global Worldwide",
        label: (
          <div
            style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
          >
            <CountryFlag code="ALL" size={13} />
            <span>All Countries</span>
          </div>
        ),
      },
      ...countries.map((c) => ({
        value: c.code,
        searchValue: `${c.name} ${c.code}`,
        label: (
          <div
            style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
          >
            <CountryFlag code={c.code} size={13} />
            <span>{c.name}</span>
          </div>
        ),
      })),
    ],
    [countries],
  );

  const stateOptions = useMemo(
    () => [
      {
        value: "ALL",
        searchValue: "All States Provinces",
        label: "All States / Provinces",
      },
      ...states.map((s) => ({
        value: s.code,
        searchValue: `${s.name} ${s.code}`,
        label: s.name,
      })),
    ],
    [states],
  );

  const communityOptions = useMemo(() => {
    const isTyping = communitySearchQuery.trim().length > 0;
    const query = communitySearchQuery.trim().toLowerCase();

    const opts: Array<{
      value: string;
      searchValue: string;
      label: React.ReactNode;
    }> = [];

    if (!isTyping) {
      opts.push({
        value: "ALL",
        searchValue: "All Communities Cities",
        label: "All Communities / Cities",
      });
    }

    const seenNames = new Set<string>();

    for (const cm of dynamicCommunities) {
      const norm = cm.name.toLowerCase().trim();
      if (isTyping && !norm.includes(query)) {
        continue;
      }

      if (!seenNames.has(norm)) {
        seenNames.add(norm);
        opts.push({
          value: cm.id,
          searchValue: cm.name,
          label: (
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <MapPin
                size={11}
                style={{ color: "var(--primary)", flexShrink: 0 }}
              />
              <span style={{ fontWeight: 600 }}>{cm.name}</span>
            </div>
          ),
        });
      }
    }

    for (const p of placeSearchResults) {
      const norm = p.name.toLowerCase().trim();
      if (!seenNames.has(norm)) {
        seenNames.add(norm);
        const subAddress = p.fullName.split(",").slice(1, 3).join(",").trim();
        opts.push({
          value: p.id,
          searchValue: `${p.name} ${p.fullName}`,
          label: (
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                maxWidth: "260px",
                overflow: "hidden",
              }}
            >
              <MapPin
                size={11}
                style={{ color: "var(--primary)", flexShrink: 0 }}
              />
              <span style={{ fontWeight: 600 }}>{p.name}</span>
              {subAddress && (
                <span
                  style={{
                    fontSize: "0.7rem",
                    color: "var(--text-sub)",
                    opacity: 0.7,
                    marginLeft: "4px",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  ({subAddress})
                </span>
              )}
            </div>
          ),
        });
      }
    }

    if (
      jurisdictionSettings.communityId &&
      jurisdictionSettings.communityId !== "ALL"
    ) {
      const isAlreadyInOpts = opts.some(
        (o) => o.value === jurisdictionSettings.communityId,
      );
      if (!isAlreadyInOpts) {
        const found = dynamicCommunities.find(
          (c) => c.id === jurisdictionSettings.communityId,
        );
        const displayName =
          found?.name ||
          jurisdictionSettings.communityName ||
          prettifySlug(jurisdictionSettings.communityId);
        opts.unshift({
          value: jurisdictionSettings.communityId,
          searchValue: displayName,
          label: (
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <MapPin
                size={11}
                style={{ color: "var(--primary)", flexShrink: 0 }}
              />
              <span style={{ fontWeight: 600 }}>{displayName}</span>
            </div>
          ),
        });
      }
    }

    if (isTyping && query.length >= 1) {
      const hasMatch = opts.some((o) =>
        o.searchValue.toLowerCase().includes(query),
      );
      if (!hasMatch) {
        opts.push({
          value: `custom-${query.replace(/[^a-z0-9]+/g, "-")}`,
          searchValue: query,
          label: (
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <MapPin
                size={11}
                style={{ color: "var(--primary)", flexShrink: 0 }}
              />
              <span style={{ fontWeight: 700 }}>
                Select "{communitySearchQuery.trim()}"
              </span>
            </div>
          ),
        });
      }
    }

    return opts;
  }, [
    dynamicCommunities,
    placeSearchResults,
    communitySearchQuery,
    jurisdictionSettings.communityId,
  ]);

  const categoryOptions = [
    { value: "all", label: "All Categories" },
    { value: "harassment", label: "Harassment" },
    { value: "theft", label: "Theft / Robbery" },
    { value: "physical_threat", label: "Physical Threat" },
    { value: "hazard", label: "Hazard" },
    { value: "emergency", label: "Emergency Mode" },
  ];

  // Filtered reports list (uses global header search and category)
  const displayedReports = useMemo(() => {
    return filteredReports.filter((r) => {
      if (filterCategory !== "all" && r.category !== filterCategory)
        return false;
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
  }, [filteredReports, filterCategory, globalSearch]);

  // Derived metrics for OneForma stat cards
  const stats = useMemo(() => {
    const total = filteredReports.length;
    const critical = filteredReports.filter(
      (r) => r.urgency === "critical" || r.category === "emergency",
    ).length;
    const investigating = filteredReports.filter(
      (r) => r.status === "investigating",
    ).length;
    const resolved = filteredReports.filter(
      (r) => r.status === "resolved",
    ).length;
    const resolvedRate = total > 0 ? Math.round((resolved / total) * 100) : 100;
    return { total, critical, investigating, resolved, resolvedRate };
  }, [filteredReports]);

  // Paginated slice for clean table display
  const paginatedReports = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return displayedReports.slice(start, start + pageSize);
  }, [displayedReports, currentPage, pageSize]);

  return (
    <div
      style={{
        padding: "1.5rem",
        display: "flex",
        flexDirection: "column",
        gap: "1.25rem",
        width: "100%",
        height: "100%",
        boxSizing: "border-box",
        overflowY: "auto",
        fontFamily: "var(--font-sans)",
        backgroundColor: "#F8FAFC",
      }}
    >
      {/* =========================================================
          1. TOP METRIC STAT CARDS (Minimalist & Square)
          ========================================================= */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "1rem",
        }}
      >
        {/* Stat Card 1: Total Incidents */}
        <div
          style={{
            backgroundColor: "#FFFFFF",
            borderRadius: "8px",
            border: "1px solid #E2E8F0",
            padding: "1rem 1.25rem",
            boxShadow: "0 1px 3px rgba(15, 23, 42, 0.03)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "0.65rem",
            }}
          >
            <span
              style={{
                fontSize: "0.72rem",
                fontWeight: 700,
                color: "var(--text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              Total Reports
            </span>
            <div
              style={{
                width: "28px",
                height: "28px",
                borderRadius: "6px",
                backgroundColor: "var(--accent-green-light)",
                color: "var(--accent-green-dark)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <FileText size={15} />
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: "4px" }}>
            <span
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "1.75rem",
                fontWeight: 700,
                color: "var(--text-main)",
                lineHeight: 1,
              }}
            >
              {stats.total}
            </span>
            <span
              style={{
                fontSize: "0.72rem",
                color: "var(--text-muted)",
                fontWeight: 500,
              }}
            >
              / {allReports.length} Worldwide
            </span>
          </div>
        </div>

        {/* Stat Card 2: Active Investigations */}
        <div
          style={{
            backgroundColor: "#FFFFFF",
            borderRadius: "8px",
            border: "1px solid #E2E8F0",
            padding: "1rem 1.25rem",
            boxShadow: "0 1px 3px rgba(15, 23, 42, 0.03)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "0.65rem",
            }}
          >
            <span
              style={{
                fontSize: "0.72rem",
                fontWeight: 700,
                color: "var(--text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              Investigating
            </span>
            <div
              style={{
                width: "28px",
                height: "28px",
                borderRadius: "6px",
                backgroundColor: "#FFFBEB",
                color: "#D97706",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Clock size={15} />
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: "4px" }}>
            <span
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "1.75rem",
                fontWeight: 700,
                color: "#D97706",
                lineHeight: 1,
              }}
            >
              {stats.investigating}
            </span>
            <span
              style={{
                fontSize: "0.72rem",
                color: "var(--text-muted)",
                fontWeight: 500,
              }}
            >
              Under Review
            </span>
          </div>
        </div>

        {/* Stat Card 3: Critical Threats */}
        <div
          style={{
            backgroundColor: "#FFFFFF",
            borderRadius: "8px",
            border: "1px solid #E2E8F0",
            padding: "1rem 1.25rem",
            boxShadow: "0 1px 3px rgba(15, 23, 42, 0.03)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "0.65rem",
            }}
          >
            <span
              style={{
                fontSize: "0.72rem",
                fontWeight: 700,
                color: "var(--text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              Critical Alerts
            </span>
            <div
              style={{
                width: "28px",
                height: "28px",
                borderRadius: "6px",
                backgroundColor: "#FEF2F2",
                color: "#DC2626",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <ShieldAlert size={15} />
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: "4px" }}>
            <span
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "1.75rem",
                fontWeight: 700,
                color: stats.critical > 0 ? "#DC2626" : "var(--text-main)",
                lineHeight: 1,
              }}
            >
              {stats.critical}
            </span>
            <span
              style={{
                fontSize: "0.72rem",
                color: "var(--text-muted)",
                fontWeight: 500,
              }}
            >
              Immediate Response
            </span>
          </div>
        </div>

        {/* Stat Card 4: Resolution Rate */}
        <div
          style={{
            backgroundColor: "#FFFFFF",
            borderRadius: "8px",
            border: "1px solid #E2E8F0",
            padding: "1rem 1.25rem",
            boxShadow: "0 1px 3px rgba(15, 23, 42, 0.03)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "0.65rem",
            }}
          >
            <span
              style={{
                fontSize: "0.72rem",
                fontWeight: 700,
                color: "var(--text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              Resolution Rate
            </span>
            <div
              style={{
                width: "28px",
                height: "28px",
                borderRadius: "6px",
                backgroundColor: "var(--accent-green-light)",
                color: "var(--accent-green-dark)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <CheckCircle2 size={15} />
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: "4px" }}>
            <span
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "1.75rem",
                fontWeight: 700,
                color: "var(--accent-green-dark)",
                lineHeight: 1,
              }}
            >
              {stats.resolvedRate}%
            </span>
            <span
              style={{
                fontSize: "0.72rem",
                color: "var(--text-muted)",
                fontWeight: 500,
              }}
            >
              ({stats.resolved} Closed)
            </span>
          </div>
        </div>
      </div>

      {/* =========================================================
          2. FILTER & LOCATION JURISDICTION TOOLBAR (Square & Clean)
          ========================================================= */}
      <div
        style={{
          backgroundColor: "#FFFFFF",
          borderRadius: "8px",
          border: "1px solid #E2E8F0",
          padding: "0.75rem 1.25rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "0.85rem",
          boxShadow: "0 1px 3px rgba(15, 23, 42, 0.03)",
        }}
      >
        {/* Left: Category + Location Scope Hierarchy */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.85rem",
            flexWrap: "wrap",
          }}
        >
          {/* Category Dropdown */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <span
              style={{
                fontSize: "0.72rem",
                fontWeight: 700,
                color: "var(--text-muted)",
                letterSpacing: "0.04em",
              }}
            >
              CATEGORY:
            </span>
            <Select
              showSearch
              size="small"
              optionFilterProp="label"
              value={filterCategory}
              onChange={(val) => {
                setFilterCategory(val);
                setCurrentPage(1);
              }}
              options={categoryOptions}
              style={{ width: 160, fontSize: "0.78rem", fontWeight: 600 }}
              popupMatchSelectWidth={180}
            />
          </div>

          <div
            style={{ height: "18px", width: "1px", backgroundColor: "#E2E8F0" }}
          />

          {/* 1. Country Selector */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <span
              style={{
                fontSize: "0.72rem",
                fontWeight: 700,
                color: "var(--text-muted)",
                letterSpacing: "0.04em",
              }}
            >
              COUNTRY:
            </span>
            <Select
              showSearch
              size="small"
              filterOption={(input, option) =>
                ((option as any)?.searchValue || "")
                  .toLowerCase()
                  .includes(input.toLowerCase())
              }
              value={jurisdictionSettings.countryCode}
              onChange={(val) => {
                updateJurisdictionSettings({
                  countryCode: val,
                  stateCode: "ALL",
                  communityId: "ALL",
                });
                setCurrentPage(1);
              }}
              options={countryOptions}
              style={{ width: 155, fontWeight: 600, fontSize: "0.78rem" }}
              popupMatchSelectWidth={220}
            />
          </div>

          {/* 2. State Selector */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <span
              style={{
                fontSize: "0.72rem",
                fontWeight: 700,
                color: "var(--text-muted)",
                letterSpacing: "0.04em",
              }}
            >
              STATE:
            </span>
            <Select
              showSearch
              size="small"
              filterOption={(input, option) =>
                ((option as any)?.searchValue || "")
                  .toLowerCase()
                  .includes(input.toLowerCase())
              }
              disabled={jurisdictionSettings.countryCode === "ALL"}
              value={jurisdictionSettings.stateCode}
              onChange={(val) => {
                updateJurisdictionSettings({
                  stateCode: val,
                  communityId: "ALL",
                });
                setCurrentPage(1);
              }}
              options={stateOptions}
              style={{ width: 155, fontWeight: 600, fontSize: "0.78rem" }}
              popupMatchSelectWidth={230}
              placeholder="All States"
            />
          </div>

          {/* 3. Community / Sector Selector */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <span
              style={{
                fontSize: "0.72rem",
                fontWeight: 700,
                color: "var(--text-muted)",
                letterSpacing: "0.04em",
              }}
            >
              COMMUNITY:
            </span>
            <Select
              showSearch
              size="small"
              filterOption={false}
              onSearch={handleCommunitySearch}
              onDropdownVisibleChange={(open) => {
                if (!open) {
                  setCommunitySearchQuery("");
                  setPlaceSearchResults([]);
                  setIsSearchingPlaces(false);
                }
              }}
              notFoundContent={
                isSearchingPlaces
                  ? "Searching Google Places..."
                  : communitySearchQuery.trim().length >= 1
                    ? "No matching communities found"
                    : "Type city or community name..."
              }
              disabled={jurisdictionSettings.countryCode === "ALL"}
              value={jurisdictionSettings.communityId}
              onChange={(val) => {
                handleCommunitySelect(val);
                setCurrentPage(1);
              }}
              options={communityOptions}
              style={{ width: 200, fontWeight: 600, fontSize: "0.78rem" }}
              popupMatchSelectWidth={280}
              placeholder="Search community..."
            />
          </div>
        </div>

        {/* Right: Actions & Reports Count */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.65rem" }}>
          {/* AI Community Safety Intelligence Button */}
          <button
            onClick={handleOpenAiSummary}
            disabled={!canGenerateAiSummary}
            title={
              !canGenerateAiSummary
                ? "Select a Country and State to enable AI Safety Summary"
                : "Generate AI Safety Summary for this sector"
            }
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "6px 14px",
              fontSize: "0.78rem",
              fontWeight: 600,
              borderRadius: "6px",
              backgroundColor: canGenerateAiSummary ? "#15803D" : "#F1F5F9",
              color: canGenerateAiSummary ? "#FFFFFF" : "#94A3B8",
              border: canGenerateAiSummary ? "none" : "1px solid #E2E8F0",
              cursor: canGenerateAiSummary ? "pointer" : "not-allowed",
              transition: "all 0.15s ease",
            }}
          >
            <Sparkles size={13} />
            <span>AI Safety Summary</span>
          </button>

          {/* Purge Test Data Icon Button */}
          <button
            onClick={handleConfirmPurge}
            title="Purge All Data (Incidents, Reports, Radar Sessions)"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "30px",
              height: "30px",
              borderRadius: "6px",
              backgroundColor: "#FEF2F2",
              color: "#DC2626",
              border: "1px solid #FECACA",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            <Trash2 size={14} />
          </button>

          {/* Report Count Badge */}
          {displayedReports.length > 0 && (
            <span
              style={{
                fontSize: "0.75rem",
                color: "#15803D",
                fontWeight: 600,
                backgroundColor: "#F0FDF4",
                padding: "4px 10px",
                borderRadius: "4px",
                border: "1px solid #BBF7D0",
              }}
            >
              {displayedReports.length}{" "}
              {displayedReports.length === 1 ? "Report" : "Reports"}
            </span>
          )}
        </div>
      </div>

      {/* =========================================================
          3. SQUARE FULL-SPACE INCIDENTS TABLE
          ========================================================= */}
      <div
        style={{
          backgroundColor: "#FFFFFF",
          borderRadius: "8px",
          border: "1px solid #E2E8F0",
          boxShadow: "0 1px 3px rgba(15, 23, 42, 0.03)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          flex: 1,
          minHeight: "420px",
        }}
      >
        <div
          style={{
            overflowX: "auto",
            overflowY: "auto",
            flex: 1,
            width: "100%",
          }}
        >
          <table
            className="min-table"
            style={{
              width: "100%",
              minWidth: "960px",
              borderCollapse: "collapse",
            }}
          >
            <thead
              style={{
                position: "sticky",
                top: 0,
                zIndex: 2,
                backgroundColor: "#F8FAFC",
              }}
            >
              <tr>
                <th
                  style={{
                    width: "135px",
                    padding: "0.75rem 1rem",
                    fontSize: "0.7rem",
                    fontWeight: 600,
                    color: "#64748B",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    borderBottom: "1px solid #E2E8F0",
                  }}
                >
                  Category
                </th>
                <th
                  style={{
                    minWidth: "280px",
                    width: "34%",
                    padding: "0.75rem 1rem",
                    fontSize: "0.7rem",
                    fontWeight: 600,
                    color: "#64748B",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    borderBottom: "1px solid #E2E8F0",
                  }}
                >
                  Title & Description
                </th>
                <th
                  style={{
                    minWidth: "240px",
                    padding: "0.75rem 1rem",
                    fontSize: "0.7rem",
                    fontWeight: 600,
                    color: "#64748B",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    borderBottom: "1px solid #E2E8F0",
                  }}
                >
                  Location
                </th>
                <th
                  style={{
                    width: "140px",
                    padding: "0.75rem 1rem",
                    fontSize: "0.7rem",
                    fontWeight: 600,
                    color: "#64748B",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    borderBottom: "1px solid #E2E8F0",
                  }}
                >
                  Reported By
                </th>
                <th
                  style={{
                    width: "125px",
                    padding: "0.75rem 1rem",
                    fontSize: "0.7rem",
                    fontWeight: 600,
                    color: "#64748B",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    borderBottom: "1px solid #E2E8F0",
                  }}
                >
                  Status
                </th>
                <th
                  style={{
                    width: "135px",
                    padding: "0.75rem 1rem",
                    fontSize: "0.7rem",
                    fontWeight: 600,
                    color: "#64748B",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    borderBottom: "1px solid #E2E8F0",
                  }}
                >
                  Date & Time
                </th>
                <th
                  style={{
                    width: "105px",
                    textAlign: "right",
                    padding: "0.75rem 1rem",
                    fontSize: "0.7rem",
                    fontWeight: 600,
                    color: "#64748B",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    borderBottom: "1px solid #E2E8F0",
                  }}
                >
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {displayedReports.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    style={{
                      textAlign: "center",
                      padding: "5rem 2rem",
                      color: "var(--text-muted)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: "0.5rem",
                      }}
                    >
                      <AlertTriangle size={22} color="#94A3B8" />
                      <span
                        style={{
                          fontWeight: 600,
                          fontSize: "0.85rem",
                          color: "#334155",
                        }}
                      >
                        No incident reports match your current filter.
                      </span>
                      <span style={{ fontSize: "0.75rem", color: "#94A3B8" }}>
                        Try adjusting your search criteria or selecting a
                        different location.
                      </span>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedReports.map((rep) => {
                  const isCritical =
                    rep.urgency === "critical" || rep.category === "emergency";

                  return (
                    <tr
                      key={rep.id}
                      style={{
                        cursor: "pointer",
                        transition: "background-color 0.1s ease",
                        borderBottom: "1px solid #F1F5F9",
                      }}
                      onClick={() => navigate(`/admin/incidents/${rep.id}`)}
                    >
                      <td style={{ padding: "0.75rem 1rem" }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                          }}
                        >
                          <span
                            style={{
                              fontWeight: 600,
                              fontSize: "0.8rem",
                              color: isCritical ? "#DC2626" : "#334155",
                              textTransform: "capitalize",
                            }}
                          >
                            {rep.category.replace("_", " ")}
                          </span>
                        </div>
                      </td>

                      <td style={{ padding: "0.75rem 1rem" }}>
                        <div
                          style={{
                            fontWeight: 600,
                            color: "#0F172A",
                            fontSize: "0.85rem",
                            lineHeight: 1.3,
                          }}
                        >
                          {rep.title}
                        </div>
                        <div
                          style={{
                            fontSize: "0.75rem",
                            color: "#64748B",
                            marginTop: "2px",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            maxWidth: "400px",
                          }}
                        >
                          {rep.description}
                        </div>
                      </td>

                      {/* Location Cell */}
                      <td style={{ padding: "0.75rem 1rem" }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "flex-start",
                            gap: "6px",
                          }}
                        >
                          <MapPin
                            size={14}
                            color="#15803D"
                            style={{ flexShrink: 0, marginTop: "2px" }}
                          />
                          <span
                            style={{
                              fontSize: "0.8rem",
                              fontWeight: 500,
                              color: "#334155",
                              lineHeight: 1.35,
                            }}
                          >
                            {rep.addressName || "Location Not Specified"}
                          </span>
                        </div>
                      </td>

                      <td style={{ padding: "0.75rem 1rem" }}>
                        <div
                          style={{
                            fontSize: "0.8rem",
                            fontWeight: 500,
                            color: "#334155",
                          }}
                        >
                          {rep.isAnonymous ? (
                            <span
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "0.35rem",
                                color: "#94A3B8",
                              }}
                            >
                              <EyeOff size={13} />
                              <span>Anonymous</span>
                            </span>
                          ) : (
                            rep.reporterName || "User"
                          )}
                        </div>
                      </td>

                      {/* Status Cell */}
                      <td style={{ padding: "0.75rem 1rem" }}>
                        {rep.status === "resolved" ? (
                          <span
                            style={{
                              padding: "3px 8px",
                              borderRadius: "4px",
                              fontSize: "0.72rem",
                              fontWeight: 700,
                              backgroundColor: "#F0FDF4",
                              color: "#16A34A",
                              border: "1px solid #BBF7D0",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                            }}
                          >
                            <span
                              style={{
                                width: "5px",
                                height: "5px",
                                borderRadius: "50%",
                                backgroundColor: "#16A34A",
                              }}
                            />
                            Resolved
                          </span>
                        ) : rep.status === "investigating" ? (
                          <span
                            style={{
                              padding: "3px 8px",
                              borderRadius: "4px",
                              fontSize: "0.72rem",
                              fontWeight: 700,
                              backgroundColor: "#FFFBEB",
                              color: "#D97706",
                              border: "1px solid #FDE68A",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                            }}
                          >
                            <span
                              style={{
                                width: "5px",
                                height: "5px",
                                borderRadius: "50%",
                                backgroundColor: "#D97706",
                              }}
                            />
                            Investigating
                          </span>
                        ) : (
                          <span
                            style={{
                              padding: "3px 8px",
                              borderRadius: "4px",
                              fontSize: "0.72rem",
                              fontWeight: 700,
                              backgroundColor: isCritical
                                ? "#FEF2F2"
                                : "#EFF6FF",
                              color: isCritical ? "#DC2626" : "#2563EB",
                              border: `1px solid ${isCritical ? "#FECACA" : "#BFDBFE"}`,
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                            }}
                          >
                            <span
                              style={{
                                width: "5px",
                                height: "5px",
                                borderRadius: "50%",
                                backgroundColor: isCritical
                                  ? "#DC2626"
                                  : "#2563EB",
                              }}
                            />
                            Open
                          </span>
                        )}
                      </td>

                      <td style={{ padding: "0.75rem 1rem" }}>
                        <div
                          style={{
                            fontSize: "0.78rem",
                            color: "#475569",
                            fontWeight: 500,
                          }}
                        >
                          {new Date(rep.createdAt).toLocaleDateString([], {
                            month: "short",
                            day: "numeric",
                          })}
                        </div>
                        <div
                          style={{
                            fontSize: "0.7rem",
                            color: "#94A3B8",
                            fontFamily: "var(--font-mono)",
                          }}
                        >
                          {new Date(rep.createdAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>
                      </td>

                      <td
                        style={{ padding: "0.75rem 1rem", textAlign: "right" }}
                      >
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/admin/incidents/${rep.id}`);
                          }}
                          style={{
                            padding: "4px 10px",
                            fontSize: "0.75rem",
                            fontWeight: 600,
                            borderRadius: "4px",
                            border: "1px solid #E2E8F0",
                            backgroundColor: "#FFFFFF",
                            color: "#0F172A",
                            cursor: "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                            transition: "all 0.1s ease",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = "#F8FAFC";
                            e.currentTarget.style.borderColor = "#CBD5E1";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = "#FFFFFF";
                            e.currentTarget.style.borderColor = "#E2E8F0";
                          }}
                        >
                          <span>View</span>
                          <ArrowRight size={11} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Clean Table Pagination Footer (Pinned at Bottom) */}
        {displayedReports.length > 0 && (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "0.75rem 1.25rem",
              borderTop: "1px solid #E2E8F0",
              backgroundColor: "#FFFFFF",
              flexWrap: "wrap",
              gap: "0.75rem",
            }}
          >
            <span
              style={{ fontSize: "0.78rem", color: "#64748B", fontWeight: 500 }}
            >
              Showing{" "}
              {Math.min(
                (currentPage - 1) * pageSize + 1,
                displayedReports.length,
              )}
              –{Math.min(currentPage * pageSize, displayedReports.length)} of{" "}
              {displayedReports.length} reports
            </span>

            <Pagination
              current={currentPage}
              pageSize={pageSize}
              total={displayedReports.length}
              onChange={(page, newSize) => {
                setCurrentPage(page);
                if (newSize && newSize !== pageSize) {
                  setPageSize(newSize);
                  setCurrentPage(1);
                }
              }}
              showSizeChanger
              pageSizeOptions={["10", "20", "50"]}
              size="small"
            />
          </div>
        )}
      </div>

      {/* Gemini Community Safety Intelligence Modal */}
      <AiSummaryModal
        isOpen={isAiModalOpen}
        onClose={() => setIsAiModalOpen(false)}
        report={aiReport}
        isLoading={isAiLoading}
        communityName={currentCommunityLabel}
        onRefresh={() => fetchAiSummary(true)}
      />
    </div>
  );
};
