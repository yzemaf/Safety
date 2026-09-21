import 'env.dart';

class AppConstants {
  static const String appName = 'Safety';
  static const String appTagline = 'Proactive Protection & Threat Awareness';
  static const String appVersion = '1.0.0';

  // API Endpoints & Service Keys (Fastify Backend on port 5000)
  static String get defaultApiBaseUrl {
    return Env.apiBaseUrl;
  }

  static const String agoraAppId = Env.agoraAppId;
  static const String googleMapsApiKey = Env.googleMapsApiKey;

  // Default Heartbeat Settings
  static const int defaultCheckInIntervalMinutes = 5;
  static const int defaultTimeoutDurationSeconds = 60;
  static const List<int> supportedIntervalsMinutes = [1, 3, 5, 10];
  static const List<int> supportedTimeoutDurationsSeconds = [30, 60, 120];

  // Emergency Hotlines
  static const String emergencyNumberUs = '911';
  static const String emergencyNumberUk = '999';
  static const String emergencyNumberEu = '112';
  static const String emergencyNumberNg = '112';
  static const String emergencyNumberKe = '999';

  // Storage Keys
  static const String keyUserId = 'safety_user_id';
  static const String keyUserName = 'safety_user_name';
  static const String keyUserEmail = 'safety_user_email';
  static const String keyUserPhone = 'safety_user_phone';
  static const String keyIsGuest = 'safety_is_guest';
  static const String keyGuestDeviceId = 'safety_guest_device_id';
  static const String keyCheckInInterval = 'safety_interval_min';
  static const String keyTimeoutDuration = 'safety_timeout_sec';
  static const String keyAutoAnswer = 'safety_auto_answer';
  static const String keyEmergencyContacts = 'safety_emergency_contacts';
  static const String keyHasSeenOnboarding = 'safety_has_seen_onboarding';
  static const String keyHasSeenSafetyModeTour =
      'safety_has_seen_safety_mode_tour';
  static const String keyHasSafetyPin = 'safety_has_safety_pin';

  // Google Maps Minimalist Light Silver / Pastel Theme (matches Admin /admin style)
  static const String googleMapsLightSilverStyle = '''
[
  {
    "elementType": "geometry",
    "stylers": [
      {
        "color": "#F7F8FA"
      }
    ]
  },
  {
    "elementType": "labels.icon",
    "stylers": [
      {
        "visibility": "off"
      }
    ]
  },
  {
    "elementType": "labels.text.fill",
    "stylers": [
      {
        "color": "#758A99"
      }
    ]
  },
  {
    "elementType": "labels.text.stroke",
    "stylers": [
      {
        "color": "#FFFFFF"
      }
    ]
  },
  {
    "featureType": "administrative",
    "elementType": "geometry",
    "stylers": [
      {
        "color": "#E2E8F0"
      }
    ]
  },
  {
    "featureType": "administrative.country",
    "elementType": "geometry.stroke",
    "stylers": [
      {
        "color": "#CBD5E1"
      }
    ]
  },
  {
    "featureType": "landscape.man_made",
    "elementType": "geometry",
    "stylers": [
      {
        "color": "#F2F4F7"
      }
    ]
  },
  {
    "featureType": "poi",
    "elementType": "geometry",
    "stylers": [
      {
        "color": "#ECEFF3"
      }
    ]
  },
  {
    "featureType": "road",
    "elementType": "geometry",
    "stylers": [
      {
        "color": "#FFFFFF"
      }
    ]
  },
  {
    "featureType": "road",
    "elementType": "geometry.stroke",
    "stylers": [
      {
        "color": "#E2E8F0"
      }
    ]
  },
  {
    "featureType": "water",
    "elementType": "geometry",
    "stylers": [
      {
        "color": "#E0F2FE"
      }
    ]
  }
]
''';
}
