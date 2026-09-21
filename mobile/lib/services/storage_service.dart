import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:uuid/uuid.dart';
import '../config/constants.dart';
import '../models/jurisdiction.dart';
import '../models/location_point.dart';
import '../models/user.dart';

class StorageService {
  static SharedPreferences? _prefs;

  static Future<void> init() async {
    _prefs ??= await SharedPreferences.getInstance();
  }

  static String getOrCreateGuestDeviceId() {
    String? deviceId = _prefs?.getString(AppConstants.keyGuestDeviceId);
    if (deviceId == null || deviceId.isEmpty) {
      deviceId = const Uuid().v4();
      _prefs?.setString(AppConstants.keyGuestDeviceId, deviceId);
    }
    return deviceId;
  }

  static Future<void> saveUser(User user) async {
    await _prefs?.setString(AppConstants.keyUserId, user.id);
    await _prefs?.setString(AppConstants.keyUserName, user.name);
    if (user.email != null) {
      await _prefs?.setString(AppConstants.keyUserEmail, user.email!);
    }
    if (user.phone != null) {
      await _prefs?.setString(AppConstants.keyUserPhone, user.phone!);
    }
    await _prefs?.setBool(AppConstants.keyIsGuest, user.isGuest);
    await _prefs?.setInt(AppConstants.keyCheckInInterval, user.settings.checkInIntervalMinutes);
    await _prefs?.setInt(AppConstants.keyTimeoutDuration, user.settings.timeoutDurationSeconds);
    await _prefs?.setString(AppConstants.keyAutoAnswer, user.settings.callHandlingPreference);
    await _prefs?.setBool(AppConstants.keyHasSafetyPin, user.hasSafetyPin);

    final contactsJson = jsonEncode(user.emergencyContacts.map((c) => c.toJson()).toList());
    await _prefs?.setString(AppConstants.keyEmergencyContacts, contactsJson);
  }

  static Future<void> saveHasSafetyPin(bool hasPin) async {
    await _prefs?.setBool(AppConstants.keyHasSafetyPin, hasPin);
  }

  static bool hasSafetyPin() {
    return _prefs?.getBool(AppConstants.keyHasSafetyPin) ?? false;
  }

  static User loadUser() {
    final isGuest = _prefs?.getBool(AppConstants.keyIsGuest) ?? true;
    final guestId = getOrCreateGuestDeviceId();
    final userId = _prefs?.getString(AppConstants.keyUserId) ?? 'guest_$guestId';
    final userName = _prefs?.getString(AppConstants.keyUserName) ?? (isGuest ? 'Guest' : 'Citizen');
    final email = _prefs?.getString(AppConstants.keyUserEmail);
    final phone = _prefs?.getString(AppConstants.keyUserPhone);
    final interval = _prefs?.getInt(AppConstants.keyCheckInInterval) ?? AppConstants.defaultCheckInIntervalMinutes;
    final timeout = _prefs?.getInt(AppConstants.keyTimeoutDuration) ?? AppConstants.defaultTimeoutDurationSeconds;
    final callPref = _prefs?.getString(AppConstants.keyAutoAnswer) ?? 'standard_ring';
    final hasPin = _prefs?.getBool(AppConstants.keyHasSafetyPin) ?? false;

    List<EmergencyContact> contacts = [];
    final contactsStr = _prefs?.getString(AppConstants.keyEmergencyContacts);
    if (contactsStr != null && contactsStr.isNotEmpty) {
      try {
        final list = jsonDecode(contactsStr) as List;
        contacts = list.map((e) => EmergencyContact.fromJson(e)).toList();
      } catch (_) {}
    }

    return User(
      id: userId,
      isGuest: isGuest,
      guestDeviceId: guestId,
      name: userName,
      email: email,
      phone: phone,
      settings: UserSettings(
        checkInIntervalMinutes: interval,
        timeoutDurationSeconds: timeout,
        callHandlingPreference: callPref,
      ),
      emergencyContacts: contacts,
      hasSafetyPin: hasPin,
    );
  }

  static Future<void> saveSettings(UserSettings settings) async {
    await _prefs?.setInt(AppConstants.keyCheckInInterval, settings.checkInIntervalMinutes);
    await _prefs?.setInt(AppConstants.keyTimeoutDuration, settings.timeoutDurationSeconds);
    await _prefs?.setString(AppConstants.keyAutoAnswer, settings.callHandlingPreference);
  }

  static Future<void> saveContacts(List<EmergencyContact> contacts) async {
    final contactsJson = jsonEncode(contacts.map((c) => c.toJson()).toList());
    await _prefs?.setString(AppConstants.keyEmergencyContacts, contactsJson);
  }

  static const String keyRecentLocations = 'safety_recent_locations';
  static const String keyActiveCommunity = 'safety_active_community';

  static JurisdictionZone loadActiveCommunity() {
    final str = _prefs?.getString(keyActiveCommunity);
    if (str != null && str.isNotEmpty) {
      try {
        final json = jsonDecode(str) as Map<String, dynamic>;
        return JurisdictionZone.fromJson(json);
      } catch (_) {}
    }
    // Default fallback community: Ikeja, Lagos
    return const JurisdictionZone(
      id: 'ikeja',
      name: 'Ikeja',
      code: 'Lagos',
      countryCode: 'NG',
      type: 'community',
      center: LocationPoint(lat: 6.5954, lng: 3.3431),
      defaultZoom: 14.0,
    );
  }

  static Future<void> saveActiveCommunity(JurisdictionZone zone) async {
    await _prefs?.setString(keyActiveCommunity, jsonEncode(zone.toJson()));
  }

  static List<Map<String, dynamic>> loadRecentLocationsRaw() {
    final str = _prefs?.getString(keyRecentLocations);
    if (str != null && str.isNotEmpty) {
      try {
        final list = jsonDecode(str) as List;
        return list.map((e) => Map<String, dynamic>.from(e as Map)).toList();
      } catch (_) {}
    }
    return [];
  }

  static Future<void> saveRecentLocationsRaw(List<Map<String, dynamic>> list) async {
    await _prefs?.setString(keyRecentLocations, jsonEncode(list));
  }

  static const String keyActiveSession = 'safety_active_session_data';

  static Future<void> saveActiveSession(Map<String, dynamic>? sessionMap) async {
    if (sessionMap == null) {
      await _prefs?.remove(keyActiveSession);
    } else {
      await _prefs?.setString(keyActiveSession, jsonEncode(sessionMap));
    }
  }

  static Map<String, dynamic>? loadActiveSession() {
    final str = _prefs?.getString(keyActiveSession);
    if (str != null && str.isNotEmpty) {
      try {
        return jsonDecode(str) as Map<String, dynamic>;
      } catch (_) {}
    }
    return null;
  }

  static Future<void> signOut() async {
    // Switch to guest mode but preserve userId, guestDeviceId, emergency contacts, and settings
    await _prefs?.setBool(AppConstants.keyIsGuest, true);
    await _prefs?.remove(AppConstants.keyUserEmail);
  }

  static Future<void> clearAll() async {
    await _prefs?.clear();
  }
}
