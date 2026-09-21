import '../models/incident_report.dart';
import '../models/jurisdiction.dart';
import '../models/location_point.dart';

class MockDataService {
  static List<JurisdictionZone> getJurisdictions() {
    return [
      const JurisdictionZone(
        id: 'ng_lagos_ikeja',
        name: 'Ikeja Safety Zone',
        code: 'ikeja',
        countryCode: 'NG',
        type: 'community',
        center: LocationPoint(lat: 6.6018, lng: 3.3515),
        defaultZoom: 14.5,
      ),
      const JurisdictionZone(
        id: 'ng_lagos_lekki',
        name: 'Lekki Phase 1',
        code: 'lekki',
        countryCode: 'NG',
        type: 'community',
        center: LocationPoint(lat: 6.4474, lng: 3.4735),
        defaultZoom: 14.5,
      ),
      const JurisdictionZone(
        id: 'ke_nairobi_westlands',
        name: 'Westlands Safety Sector',
        code: 'westlands',
        countryCode: 'KE',
        type: 'community',
        center: LocationPoint(lat: -1.2674, lng: 36.8110),
        defaultZoom: 14.5,
      ),
      const JurisdictionZone(
        id: 'gb_london_westminster',
        name: 'Westminster City Core',
        code: 'westminster',
        countryCode: 'GB',
        type: 'community',
        center: LocationPoint(lat: 51.4975, lng: -0.1357),
        defaultZoom: 14.5,
      ),
      const JurisdictionZone(
        id: 'us_ny_manhattan',
        name: 'Manhattan Midtown & Times Sq',
        code: 'manhattan',
        countryCode: 'US',
        type: 'community',
        center: LocationPoint(lat: 40.7580, lng: -73.9855),
        defaultZoom: 14.5,
      ),
    ];
  }

  static List<IncidentReport> getInitialIncidents() {
    return const [];
  }
}
