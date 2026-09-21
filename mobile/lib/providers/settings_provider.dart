import 'package:flutter/foundation.dart';
import 'package:uuid/uuid.dart';
import '../models/jurisdiction.dart';
import '../models/user.dart';
import '../services/api_service.dart';
import '../services/mock_data_service.dart';
import '../services/storage_service.dart';

class SettingsProvider extends ChangeNotifier {
  final ApiService _apiService = ApiService();
  UserSettings _settings;
  final List<EmergencyContact> _emergencyContacts;
  final List<JurisdictionZone> _jurisdictions = MockDataService.getJurisdictions();
  JurisdictionZone _selectedJurisdiction;

  SettingsProvider()
      : _settings = StorageService.loadUser().settings,
        _emergencyContacts = List.from(StorageService.loadUser().emergencyContacts),
        _selectedJurisdiction = MockDataService.getJurisdictions().first;

  UserSettings get settings => _settings;
  List<EmergencyContact> get emergencyContacts => _emergencyContacts;
  List<JurisdictionZone> get jurisdictions => _jurisdictions;
  JurisdictionZone get selectedJurisdiction => _selectedJurisdiction;

  void syncFromUser(User user) {
    _settings = user.settings;
    _emergencyContacts.clear();
    _emergencyContacts.addAll(user.emergencyContacts);
    StorageService.saveSettings(_settings);
    StorageService.saveContacts(_emergencyContacts);
    notifyListeners();
  }

  void syncFromStorage() {
    final user = StorageService.loadUser();
    _settings = user.settings;
    _emergencyContacts.clear();
    _emergencyContacts.addAll(user.emergencyContacts);
    notifyListeners();
  }

  Future<void> _saveAndPropagate() async {
    await StorageService.saveSettings(_settings);
    await StorageService.saveContacts(_emergencyContacts);
    final user = StorageService.loadUser();
    final updatedUser = user.copyWith(
      settings: _settings,
      emergencyContacts: _emergencyContacts,
    );
    await StorageService.saveUser(updatedUser);
  }

  Future<void> _syncToBackend() async {
    final user = StorageService.loadUser();
    if (user.id.isNotEmpty) {
      try {
        await _apiService.updateSettings(
          userId: user.id,
          email: user.email,
          settings: _settings,
          emergencyContacts: _emergencyContacts,
        );
      } catch (e) {
        debugPrint('[SettingsProvider] backend sync failed: $e');
      }
    }
  }

  Future<void> setCheckInInterval(int minutes) async {
    _settings = _settings.copyWith(checkInIntervalMinutes: minutes);
    await _saveAndPropagate();
    notifyListeners();
    _syncToBackend();
  }

  Future<void> setTimeoutDuration(int seconds) async {
    _settings = _settings.copyWith(timeoutDurationSeconds: seconds);
    await _saveAndPropagate();
    notifyListeners();
    _syncToBackend();
  }

  Future<void> setCallHandlingPreference(String preference) async {
    _settings = _settings.copyWith(callHandlingPreference: preference);
    await _saveAndPropagate();
    notifyListeners();
    _syncToBackend();
  }

  Future<void> addEmergencyContact({
    required String name,
    required String phone,
    required String relationship,
  }) async {
    final newContact = EmergencyContact(
      id: 'ec_${const Uuid().v4().substring(0, 8)}',
      name: name,
      phone: phone,
      relationship: relationship,
    );
    _emergencyContacts.add(newContact);
    await _saveAndPropagate();
    notifyListeners();
    _syncToBackend();
  }

  Future<void> setSingleEmergencyContact({
    required String name,
    required String phone,
    required String relationship,
  }) async {
    _emergencyContacts.clear();
    final newContact = EmergencyContact(
      id: 'ec_${const Uuid().v4().substring(0, 8)}',
      name: name,
      phone: phone,
      relationship: relationship,
    );
    _emergencyContacts.add(newContact);
    await _saveAndPropagate();
    notifyListeners();
    _syncToBackend();
  }

  Future<void> clearEmergencyContacts() async {
    _emergencyContacts.clear();
    await _saveAndPropagate();
    notifyListeners();
    _syncToBackend();
  }

  Future<void> removeEmergencyContact(String id) async {
    _emergencyContacts.removeWhere((c) => c.id == id);
    await _saveAndPropagate();
    notifyListeners();
    _syncToBackend();
  }

  void selectJurisdiction(JurisdictionZone zone) {
    _selectedJurisdiction = zone;
    notifyListeners();
  }
}
