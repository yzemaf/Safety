import React from 'react';
import { LiveRadarMap } from '../../components/LiveRadarMap';
import { useData } from '../../context/DataContext';

export const RadarPage: React.FC = () => {
  const { filteredSessions, filteredReports, config, setCallingSession, resolveSession } = useData();

  return (
    <LiveRadarMap
      sessions={filteredSessions}
      reports={filteredReports}
      googleMapsApiKey={config.googleMapsApiKey}
      onInitiateAgoraCall={(sess) => setCallingSession(sess)}
      onResolveSession={resolveSession}
    />
  );
};
