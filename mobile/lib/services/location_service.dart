import 'dart:async';
import 'dart:convert';
import 'dart:math';
import 'package:battery_plus/battery_plus.dart';
import 'package:geolocator/geolocator.dart';
import 'package:http/http.dart' as http;
import '../config/constants.dart';
import '../models/location_point.dart';

class LocationService {
  // Default fallback center (Ikeja, Lagos or user zone) if GPS is pending or in emulator without fix
  LocationPoint _currentLocation = const LocationPoint(lat: 6.6018, lng: 3.3515);
  int _batteryLevel = 100;
  bool _hasLocationPermission = false;
  bool _isTrackingWalk = false;

  final Battery _battery = Battery();
  StreamSubscription<BatteryState>? _batterySubscription;
  StreamSubscription<Position>? _positionSubscription;
  StreamSubscription<ServiceStatus>? _serviceStatusSubscription;
  Timer? _batteryPollTimer;
  Timer? _simulatedMovementTimer;

  final StreamController<LocationPoint> _locationStreamController =
      StreamController<LocationPoint>.broadcast();
  final StreamController<int> _batteryStreamController =
      StreamController<int>.broadcast();
  final StreamController<bool> _locationAvailabilityController =
      StreamController<bool>.broadcast();

  Stream<LocationPoint> get onLocationChanged => _locationStreamController.stream;
  Stream<int> get onBatteryChanged => _batteryStreamController.stream;
  Stream<bool> get onLocationAvailabilityChanged => _locationAvailabilityController.stream;
  LocationPoint get currentLocation => _currentLocation;
  int get currentBatteryLevel => _batteryLevel;
  bool get hasLocationPermission => _hasLocationPermission;
  bool get isTrackingWalk => _isTrackingWalk;

  LocationService() {
    _initBattery();
    _initServiceStatusListener();
    _checkInitialLocation();
  }

  void _initServiceStatusListener() {
    try {
      _serviceStatusSubscription = Geolocator.getServiceStatusStream().listen((status) {
        final isAvailable = status == ServiceStatus.enabled;
        _hasLocationPermission = isAvailable;
        _locationAvailabilityController.add(isAvailable);
      });
    } catch (_) {}
  }

  /// Initialize real hardware battery percentage and listeners
  Future<void> _initBattery() async {
    try {
      _batteryLevel = await _battery.batteryLevel;
      _batteryStreamController.add(_batteryLevel);
    } catch (_) {
      _batteryLevel = 95; // Reasonable fallback for mock/unsupported environments
    }

    // Listen for charging/state changes to update battery percentage
    _batterySubscription = _battery.onBatteryStateChanged.listen((_) async {
      await updateBatteryLevel();
    });

    // Periodic poll every 30 seconds to keep battery % fresh
    _batteryPollTimer = Timer.periodic(const Duration(seconds: 30), (_) async {
      await updateBatteryLevel();
    });
  }

  /// Force fetch the latest real battery percentage from device
  Future<int> updateBatteryLevel() async {
    try {
      final level = await _battery.batteryLevel;
      _batteryLevel = level;
      _batteryStreamController.add(_batteryLevel);
      return _batteryLevel;
    } catch (_) {
      return _batteryLevel;
    }
  }

  /// Check existing location permission and hardware GPS status
  Future<void> _checkInitialLocation() async {
    try {
      final isGpsOn = await Geolocator.isLocationServiceEnabled();
      final permission = await Geolocator.checkPermission();
      if (isGpsOn &&
          (permission == LocationPermission.always ||
              permission == LocationPermission.whileInUse)) {
        _hasLocationPermission = true;
        _startContinuousGpsTracking();
        await refreshCurrentLocation();
      } else {
        _hasLocationPermission = false;
      }
    } catch (_) {
      _hasLocationPermission = false;
    }
  }

  /// Start continuous background/foreground real GPS and emulator GPX tracking
  void _startContinuousGpsTracking() {
    _positionSubscription?.cancel();
    try {
      const locationSettings = LocationSettings(
        accuracy: LocationAccuracy.high,
        distanceFilter: 1, // Trigger on 1 meter movement
      );
      _positionSubscription = Geolocator.getPositionStream(
        locationSettings: locationSettings,
      ).listen(
        (Position pos) {
          _currentLocation = LocationPoint(lat: pos.latitude, lng: pos.longitude);
          _hasLocationPermission = true;
          _locationStreamController.add(_currentLocation);
        },
        onError: (_) {},
      );
    } catch (_) {}
  }

  /// Check if hardware GPS / location services are switched ON at device level
  Future<bool> isGpsHardwareEnabled() async {
    try {
      return await Geolocator.isLocationServiceEnabled();
    } catch (_) {
      return false;
    }
  }

  /// Check current app location permission status
  Future<LocationPermission> checkPermissionStatus() async {
    try {
      return await Geolocator.checkPermission();
    } catch (_) {
      return LocationPermission.denied;
    }
  }

  /// Open device system location settings
  Future<bool> openDeviceLocationSettings() async {
    try {
      return await Geolocator.openLocationSettings();
    } catch (_) {
      return false;
    }
  }

  /// Open app-specific settings in system
  Future<bool> openAppPermissionSettings() async {
    try {
      return await Geolocator.openAppSettings();
    } catch (_) {
      return false;
    }
  }

  /// Actively verify BOTH device hardware GPS toggle is ON and app location permissions are granted.
  /// If GPS is off or permission is missing, prompts user or opens settings as required.
  Future<bool> verifyLocationReady({
    bool promptUser = true,
    bool openSettingsIfDenied = true,
  }) async {
    try {
      // 1. Check if hardware location services / GPS switch is ON on device
      final bool isGpsOn = await Geolocator.isLocationServiceEnabled();
      if (!isGpsOn) {
        _hasLocationPermission = false;
        if (openSettingsIfDenied) {
          await Geolocator.openLocationSettings();
        }
        return false;
      }

      // 2. Check app permission status
      LocationPermission permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        if (promptUser) {
          permission = await Geolocator.requestPermission();
        }
      }

      if (permission == LocationPermission.deniedForever) {
        _hasLocationPermission = false;
        if (openSettingsIfDenied) {
          await Geolocator.openAppSettings();
        }
        return false;
      }

      if (permission == LocationPermission.denied) {
        _hasLocationPermission = false;
        return false;
      }

      _hasLocationPermission = (permission == LocationPermission.always ||
          permission == LocationPermission.whileInUse);

      if (_hasLocationPermission) {
        _startContinuousGpsTracking();
        await refreshCurrentLocation();
      }

      return _hasLocationPermission;
    } catch (_) {
      _hasLocationPermission = false;
      return false;
    }
  }

  /// Request runtime location permission & GPS activation from user.
  /// If [openSettingsIfDenied] is true, launches settings when permission is permanently denied or GPS is disabled.
  Future<bool> requestLocationPermission({bool openSettingsIfDenied = false}) async {
    return verifyLocationReady(
      promptUser: true,
      openSettingsIfDenied: openSettingsIfDenied,
    );
  }

  /// Fetch the latest GPS position from the device hardware
  Future<LocationPoint?> refreshCurrentLocation() async {
    try {
      final pos = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.high,
        timeLimit: const Duration(seconds: 8),
      );

      _currentLocation = LocationPoint(
        lat: pos.latitude,
        lng: pos.longitude,
      );
      _hasLocationPermission = true;
      _startContinuousGpsTracking();
      _locationStreamController.add(_currentLocation);
      return _currentLocation;
    } catch (_) {
      // Return last known position if current GPS timeout occurs
      try {
        final lastPos = await Geolocator.getLastKnownPosition();
        if (lastPos != null) {
          _currentLocation = LocationPoint(
            lat: lastPos.latitude,
            lng: lastPos.longitude,
          );
          _hasLocationPermission = true;
          _startContinuousGpsTracking();
          _locationStreamController.add(_currentLocation);
          return _currentLocation;
        }
      } catch (_) {}
      return _currentLocation;
    }
  }

  void setLocation(LocationPoint location) {
    _currentLocation = location;
    _locationStreamController.add(_currentLocation);
  }

  /// Start active walk tracking: listens to real-world GPS position stream with simulated fallback
  void startSimulatedWalk() {
    _isTrackingWalk = true;
    _positionSubscription?.cancel();
    _simulatedMovementTimer?.cancel();

    if (_hasLocationPermission) {
      try {
        _positionSubscription = Geolocator.getPositionStream(
          locationSettings: const LocationSettings(
            accuracy: LocationAccuracy.high,
            distanceFilter: 3, // Update every 3 meters
          ),
        ).listen(
          (pos) {
            _currentLocation = LocationPoint(lat: pos.latitude, lng: pos.longitude);
            _locationStreamController.add(_currentLocation);
          },
          onError: (_) {
            _startSimulatedDrift();
          },
        );
      } catch (_) {
        _startSimulatedDrift();
      }
    } else {
      _startSimulatedDrift();
    }
  }

  void _startSimulatedDrift() {
    final random = Random();
    _simulatedMovementTimer = Timer.periodic(const Duration(seconds: 4), (timer) {
      if (!_isTrackingWalk) return;

      final latDelta = (random.nextDouble() - 0.45) * 0.00015;
      final lngDelta = (random.nextDouble() - 0.45) * 0.00015;

      _currentLocation = LocationPoint(
        lat: _currentLocation.lat + latDelta,
        lng: _currentLocation.lng + lngDelta,
      );

      _locationStreamController.add(_currentLocation);
    });
  }

  void stopSimulatedWalk() {
    _isTrackingWalk = false;
    _positionSubscription?.cancel();
    _simulatedMovementTimer?.cancel();
  }

  final Map<String, String> _addressCache = {};

  /// Fetch human-readable street/area address from Google Maps Geocoding API
  Future<String> reverseGeocodeLocation(LocationPoint point) async {
    final key = '${point.lat.toStringAsFixed(4)},${point.lng.toStringAsFixed(4)}';
    if (_addressCache.containsKey(key)) {
      return _addressCache[key]!;
    }

    try {
      const apiKey = AppConstants.googleMapsApiKey;
      final url = 'https://maps.googleapis.com/maps/api/geocode/json?latlng=${point.lat},${point.lng}&key=$apiKey';
      final response = await http.get(Uri.parse(url)).timeout(const Duration(seconds: 4));
      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        if (data['status'] == 'OK' && (data['results'] as List).isNotEmpty) {
          final formatted = data['results'][0]['formatted_address'] as String;
          _addressCache[key] = formatted;
          return formatted;
        }
      }
    } catch (_) {}

    final fallback = '${point.lat.toStringAsFixed(4)}, ${point.lng.toStringAsFixed(4)}';
    _addressCache[key] = fallback;
    return fallback;
  }

  String getAddressForLocation(LocationPoint point) {
    final key = '${point.lat.toStringAsFixed(4)},${point.lng.toStringAsFixed(4)}';
    if (_addressCache.containsKey(key)) {
      return _addressCache[key]!;
    }
    // Background kick-off reverse geocoding
    reverseGeocodeLocation(point);
    return 'Current Area (${point.lat.toStringAsFixed(3)}, ${point.lng.toStringAsFixed(3)})';
  }

  /// Quick non-intrusive check to see if hardware GPS & app permissions are currently active
  Future<bool> isLocationReadyWithoutPrompt() async {
    try {
      final isGpsOn = await Geolocator.isLocationServiceEnabled();
      if (!isGpsOn) {
        _hasLocationPermission = false;
        return false;
      }
      final permission = await Geolocator.checkPermission();
      final hasPerm = (permission == LocationPermission.always ||
          permission == LocationPermission.whileInUse);
      _hasLocationPermission = hasPerm;
      return hasPerm;
    } catch (_) {
      return false;
    }
  }

  void dispose() {
    _batterySubscription?.cancel();
    _positionSubscription?.cancel();
    _serviceStatusSubscription?.cancel();
    _batteryPollTimer?.cancel();
    _simulatedMovementTimer?.cancel();
    _locationStreamController.close();
    _batteryStreamController.close();
    _locationAvailabilityController.close();
  }
}
