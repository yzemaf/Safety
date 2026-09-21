import { config } from '../config/env.js';
import type { IIncidentReport } from '../models/IncidentReport.js';
import type { ISafetySession } from '../models/SafetySession.js';

export interface LocationThreatPoint {
  name: string;
  incidentCount: number;
  threatType: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  details: string;
}

export interface CitizenSafetyTip {
  title: string;
  recommendation: string;
  urgency: 'low' | 'medium' | 'high' | 'critical';
}

export interface CommunityAiReport {
  community: string;
  jurisdiction: string;
  riskLevel: 'Low' | 'Moderate' | 'Elevated' | 'Severe';
  riskScore: number; // 0 - 100
  executiveSummary: string;
  locationsCovered: LocationThreatPoint[];
  citizenAdvice: CitizenSafetyTip[];
  commandCenterRecommendations: string[];
  markdownReport: string;
  metadata: {
    totalIncidentsAnalyzed: number;
    totalSafetySessionsAnalyzed: number;
    emergencyBeaconsCount: number;
    unrespondedOrEscalatedCount: number;
    generatedAt: string;
    modelUsed: string;
  };
}

const CANDIDATE_MODELS = [
  config.gemini.model || 'gemini-3.5-flash-lite',
  'gemini-3.6-flash',
  'gemini-3.5-flash-lite',
];

export async function generateCommunityIncidentSummary(params: {
  communityId: string;
  stateCode?: string;
  countryCode?: string;
  incidents: IIncidentReport[];
  safetySessions: ISafetySession[];
}): Promise<CommunityAiReport> {
  const { communityId, stateCode = '', countryCode = '', incidents, safetySessions } = params;

  // Extract critical counts & details
  const totalIncidents = incidents.length;
  const totalSessions = safetySessions.length;
  const emergencySessions = safetySessions.filter(
    (s) => s.status === 'emergency' || s.status === 'distress_pending' || Boolean(s.emergencyTriggeredAt)
  );
  const emergencyReports = incidents.filter((i) => i.category === 'emergency' || i.urgency === 'critical');
  const emergencyBeaconsCount = emergencySessions.length + emergencyReports.length;

  const isAllCommunities = !communityId || communityId === 'ALL' || communityId === 'all';
  const targetLabel = isAllCommunities
    ? `${stateCode} State/Province (${countryCode})`
    : `${communityId} (${stateCode}, ${countryCode})`;

  const hasLocalData = totalIncidents > 0 || totalSessions > 0;

  // Build anonymized data payload for Gemini
  const incidentPayload = incidents.map((inc) => {
    const commentsList = (inc.staffComments || []).map(
      (c: any) => `[${c.staffRole || 'Officer'} ${c.staffName || ''}]: "${c.comment}"`
    );
    const statusLabel = inc.status === 'resolved'
      ? 'RESOLVED (Threat Handled/Closed)'
      : (inc.status === 'investigating' ? 'UNDER INVESTIGATION (Responders Engaged)' : 'OPEN (Active Unresolved)');

    return {
      id: inc._id?.toString() || (inc as any).id,
      title: inc.title,
      category: inc.category,
      urgency: inc.urgency,
      status: statusLabel,
      rawStatus: inc.status,
      source: inc.source,
      address: inc.addressName || 'Near Current Location',
      distanceKm: (inc as any).distanceKm !== undefined && (inc as any).distanceKm !== null ? `${(inc as any).distanceKm} km from sector focal point` : 'Within sector',
      coordinates: inc.location?.coordinates || [],
      description: inc.description,
      reportedAt: inc.createdAt,
      commentsCount: inc.staffComments?.length || 0,
      adminDispatchNotes: commentsList.length > 0 ? commentsList.join(' | ') : 'No staff notes logged yet',
    };
  });

  const sessionPayload = safetySessions.map((sess) => ({
    id: sess._id?.toString() || (sess as any).id,
    userName: sess.userName || 'Citizen',
    status: sess.status,
    address: sess.addressName || 'Live Route',
    distanceKm: (sess as any).distanceKm !== undefined && (sess as any).distanceKm !== null ? `${(sess as any).distanceKm} km from sector focal point` : 'Within sector',
    coordinates: sess.currentLocation?.coordinates || [],
    emergencyTriggeredAt: sess.emergencyTriggeredAt || null,
    batteryLevel: sess.batteryLevel,
    breadcrumbPings: sess.breadcrumbs?.length || 0,
    isMissedCheckInOrSos: sess.status === 'emergency' || sess.status === 'distress_pending',
  }));

  let systemInstruction = '';
  let userPrompt = '';

  if (!hasLocalData) {
    // Online & Regional Safety Intelligence Research Mode
    systemInstruction = `
You are a helpful neighborhood safety guide.
Your task is to give a simple, clear safety update for: ${targetLabel}.

CONTEXT:
No recent incidents or emergency alerts have been reported in the app yet for ${targetLabel}.
Share what you know about the everyday safety and common concerns in this area.

TONE & WRITING STYLE (STRICT):
- Use simple, everyday layman English that anyone can easily understand.
- DO NOT use big words, academic grammar, or formal jargon (avoid phrases like "heightened vigilance", "situational awareness", "thoroughfare", "security posture", "urban corridor").
- Keep sentences short, direct, and conversational.
- Focus on practical, real-world advice: what to watch out for, places to be careful, and simple tips for staying safe.

CRITICAL OUTPUT RULES:
- The "markdownReport" field must contain EXACTLY 2 short paragraphs:
  - Paragraph 1: What are the main safety risks or common issues in this area? (e.g. pickpocketing, dark streets, traffic hazards, or calm conditions).
  - Paragraph 2: Easy, practical advice for someone walking or driving through this area today.
- No markdown headers, bullets, or complex formatting inside markdownReport paragraphs.

Assign a realistic riskLevel ('Low' | 'Moderate' | 'Elevated' | 'Severe') and riskScore (0-100).

Respond with ONLY a valid JSON object matching this schema (raw JSON only):
{
  "riskLevel": "Low" | "Moderate" | "Elevated" | "Severe",
  "riskScore": number,
  "executiveSummary": "A quick, simple one-sentence summary of safety in this area.",
  "locationsCovered": [
    {
      "name": "Street or Popular Place Name",
      "incidentCount": 0,
      "threatType": "Short simple risk name",
      "severity": "low" | "medium" | "high" | "critical",
      "details": "Simple plain-English note about this spot"
    }
  ],
  "citizenAdvice": [
    {
      "title": "Short simple tip title",
      "recommendation": "Plain English advice for everyday people",
      "urgency": "low" | "medium" | "high" | "critical"
    }
  ],
  "commandCenterRecommendations": ["Simple advice for patrol or safety officers"],
  "markdownReport": "Paragraph 1 in simple English.\n\nParagraph 2 with simple tips."
}
`;

    userPrompt = `
SAFETY UPDATE REQUEST:
- Area: ${targetLabel}
- Scope: ${isAllCommunities ? 'Statewide overview for ' + stateCode + ', ' + countryCode : 'Community: ' + communityId}
- Local Reports: 0

Give a clear, simple safety summary in plain everyday English.
`;
  } else {
    // Incident & Distress Signal Deep Analysis Mode
    systemInstruction = `
You are a helpful neighborhood safety guide.
Your duty is to explain recent safety reports and emergency alerts in simple, everyday layman English.

TONE & WRITING STYLE (STRICT):
- Use simple, plain English that is easy to read.
- DO NOT use complex words, stiff police jargon, or formal grammar (avoid "heightened vigilance", "situational awareness", "thoroughfares", "security posture", "vicinity").
- Clearly mention the real incidents and emergency alerts reported in the data, including street names, what happened, and how close they are.
- FACTOR IN RESOLUTION STATUS & ADMIN DISPATCH NOTES: If an incident is marked RESOLVED or if control room dispatcher notes indicate responders were deployed and the situation is contained, clearly note that the threat was resolved and danger has lowered. If an incident is OPEN with no notes, treat it as an active concern.
- Keep sentences short, direct, and easy to understand.

CRITICAL OUTPUT RULES:
- The "markdownReport" field must contain EXACTLY 2 short paragraphs:
  - Paragraph 1: What recent incidents or emergency alerts happened here? Clearly name the streets and what took place in plain words.
  - Paragraph 2: Simple, practical safety tips for residents and visitors right now.
- Keep it concise. No markdown headers or bullet lists inside markdownReport paragraphs.

Evaluate overall risk level ('Low' | 'Moderate' | 'Elevated' | 'Severe') and risk score (0-100).

Respond with ONLY a valid JSON object matching this schema (raw JSON only):
{
  "riskLevel": "Low" | "Moderate" | "Elevated" | "Severe",
  "riskScore": number,
  "executiveSummary": "A simple one-sentence verdict on what is happening in this area.",
  "locationsCovered": [
    {
      "name": "Street / Spot Name",
      "incidentCount": number,
      "threatType": "Simple risk name",
      "severity": "low" | "medium" | "high" | "critical",
      "details": "Plain English summary of what happened here"
    }
  ],
  "citizenAdvice": [
    {
      "title": "Short simple tip title",
      "recommendation": "Everyday advice mentioning specific streets and precautions",
      "urgency": "low" | "medium" | "high" | "critical"
    }
  ],
  "commandCenterRecommendations": ["Simple action item for patrol or local safety teams"],
  "markdownReport": "Paragraph 1 about recent incidents in plain English.\n\nParagraph 2 with simple tips."
}
`;

    userPrompt = `
COMMUNITY SAFETY ASSESSMENT REQUEST:
- Area: ${targetLabel}
- Scope: ${isAllCommunities ? 'All Communities across ' + stateCode : 'Community: ' + communityId.toUpperCase()}
- Total Incidents Reported: ${totalIncidents}
- Total Safety Walks & Emergency Beacons: ${totalSessions}
- High-Urgency Emergency Alerts: ${emergencyBeaconsCount}

RECENT LOCAL INCIDENTS:
${JSON.stringify(incidentPayload, null, 2)}

SAFETY SESSIONS & EMERGENCY DISTRESS DATA:
${JSON.stringify(sessionPayload, null, 2)}

Analyze this data and write a clear, simple safety summary in plain everyday English.
`;
  }

  const apiKey = config.gemini.apiKey;
  if (!apiKey) {
    console.warn('[Gemini Service] GEMINI_API_KEY is not configured in environment.');
    return generateFallbackReport(params, 'GEMINI_API_KEY not configured');
  }

  // Attempt generation with candidate models in priority order
  for (const model of CANDIDATE_MODELS) {
    try {
      console.log(`[Gemini Service] Requesting intelligence report using model: ${model}...`);
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts: [{ text: `${systemInstruction}\n\n${userPrompt}` }],
              },
            ],
            generationConfig: {
              temperature: 0.2,
              responseMimeType: 'application/json',
            },
          }),
        }
      );

      const data = (await response.json()) as any;

      if (!response.ok || data.error) {
        console.warn(`[Gemini Service] Model ${model} returned error:`, data.error?.message || data.error);
        continue; // Try next model in sequence
      }

      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) {
        console.warn(`[Gemini Service] Model ${model} returned empty response`);
        continue;
      }

      // Parse JSON from text (handling any backticks if returned)
      const cleanJson = rawText.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
      const parsed = JSON.parse(cleanJson);

      return {
        community: isAllCommunities ? `${stateCode} (All Communities)` : communityId,
        jurisdiction: isAllCommunities ? `${stateCode}, ${countryCode}` : `${communityId}, ${stateCode}, ${countryCode}`,
        riskLevel: parsed.riskLevel || 'Moderate',
        riskScore: typeof parsed.riskScore === 'number' ? parsed.riskScore : 50,
        executiveSummary: parsed.executiveSummary || 'Safety assessment completed.',
        locationsCovered: Array.isArray(parsed.locationsCovered) ? parsed.locationsCovered : [],
        citizenAdvice: Array.isArray(parsed.citizenAdvice) ? parsed.citizenAdvice : [],
        commandCenterRecommendations: Array.isArray(parsed.commandCenterRecommendations)
          ? parsed.commandCenterRecommendations
          : [],
        markdownReport: parsed.markdownReport || parsed.executiveSummary || '',
        metadata: {
          totalIncidentsAnalyzed: totalIncidents,
          totalSafetySessionsAnalyzed: totalSessions,
          emergencyBeaconsCount,
          unrespondedOrEscalatedCount: emergencySessions.filter((s) => s.status === 'emergency').length,
          generatedAt: new Date().toISOString(),
          modelUsed: model,
        },
      };
    } catch (err: any) {
      console.warn(`[Gemini Service] Exception with model ${model}:`, err.message);
    }
  }

  // If all Gemini models encountered errors, use fallback heuristic
  return generateFallbackReport(params, 'All AI models temporarily busy or unavailable');
}

/**
 * Heuristic fallback generation in the event of upstream network or quota issues
 */
function generateFallbackReport(
  params: {
    communityId: string;
    stateCode?: string;
    countryCode?: string;
    incidents: IIncidentReport[];
    safetySessions: ISafetySession[];
  },
  reason: string
): CommunityAiReport {
  const { communityId, stateCode = '', countryCode = '', incidents, safetySessions } = params;
  const total = incidents.length + safetySessions.length;
  const critical = incidents.filter((i) => i.urgency === 'critical').length + safetySessions.filter((s) => s.status === 'emergency').length;

  const riskLevel = critical > 2 ? 'Elevated' : total > 5 ? 'Moderate' : 'Low';
  const riskScore = Math.min(95, Math.max(15, total * 8 + critical * 20));

  // Extract unique locations
  const locationMap = new Map<string, number>();
  incidents.forEach((i) => {
    const loc = i.addressName || 'Local Sector';
    locationMap.set(loc, (locationMap.get(loc) || 0) + 1);
  });
  safetySessions.forEach((s) => {
    const loc = s.addressName || 'Active Patrol Sector';
    locationMap.set(loc, (locationMap.get(loc) || 0) + 1);
  });

  const locationsCovered: LocationThreatPoint[] = Array.from(locationMap.entries()).map(([name, count]) => ({
    name,
    incidentCount: count,
    threatType: 'Safety Activity & Incident Hotspot',
    severity: count >= 3 ? 'high' : 'medium',
    details: `${count} event(s) recorded within this vicinity.`,
  }));

  const isAll = !communityId || communityId === 'ALL' || communityId === 'all';
  const label = isAll ? `${stateCode}` : communityId.toUpperCase();

  const citizenAdvice: CitizenSafetyTip[] = [
    {
      title: `Tips for ${label}`,
      recommendation: `When walking around ${label}, keep your phone handy, stick to well-lit roads, and let family know where you are.`,
      urgency: critical > 0 ? 'high' : 'medium',
    },
  ];

  if (locationsCovered.length > 0) {
    citizenAdvice.push({
      title: `Careful around ${locationsCovered[0].name}`,
      recommendation: `Be extra careful when passing through ${locationsCovered[0].name} where recent incidents were reported.`,
      urgency: 'high',
    });
  } else {
    citizenAdvice.push({
      title: 'Walking & Travel Tips',
      recommendation: 'Keep your bags and phone secure while walking, and avoid isolated shortcuts after dark.',
      urgency: 'low',
    });
  }

  const executiveSummary = total > 0
    ? `Recent activity in ${label} includes ${incidents.length} incident reports and ${safetySessions.length} safety sessions.`
    : `Everything is currently calm in ${label}. No emergency alerts or recent incidents have been reported here.`;

  return {
    community: isAll ? `${stateCode} (All Communities)` : communityId,
    jurisdiction: isAll ? `${stateCode}, ${countryCode}` : `${communityId}, ${stateCode}, ${countryCode}`,
    riskLevel,
    riskScore,
    executiveSummary,
    locationsCovered,
    citizenAdvice,
    commandCenterRecommendations: [
      `Maintain routine patrol visibility across ${label}.`,
      'Encourage citizen safety check-ins and community reporting.',
    ],
    markdownReport: `### Community Safety Report: ${label}\n\n**Risk Level**: ${riskLevel} (${riskScore}/100)\n\n${executiveSummary}`,
    metadata: {
      totalIncidentsAnalyzed: incidents.length,
      totalSafetySessionsAnalyzed: safetySessions.length,
      emergencyBeaconsCount: critical,
      unrespondedOrEscalatedCount: safetySessions.filter((s) => s.status === 'emergency').length,
      generatedAt: new Date().toISOString(),
      modelUsed: 'heuristic-analyst-fallback',
    },
  };
}
