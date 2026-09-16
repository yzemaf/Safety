import React from 'react';
import { LiveRadarMap } from '../../components/LiveRadarMap';
import { useData } from '../../context/DataContext';

export const RadarPage: React.FC = () => {
  const { sessions, reports, config, setCallingSession, resolveSession } = useData();

  return (
    <LiveRadarMap
      sessions={sessions}
      reports={reports}
      googleMapsApiKey={config.googleMapsApiKey}
      onInitiateAgoraCall={(sess) => setCallingSession(sess)}
      onResolveSession={resolveSession}
    />
  );
};
