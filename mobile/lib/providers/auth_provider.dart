import 'package:flutter/foundation.dart';
import '../models/user.dart';
import '../services/api_service.dart';
import '../services/fcm_service.dart';
import '../services/storage_service.dart';

class AuthProvider extends ChangeNotifier {
  final ApiService _apiService = ApiService();
  User _currentUser = StorageService.loadUser();
  bool _isLoading = false;

  AuthProvider() {
    _initGuestSession();
  }

  User get user => _currentUser;
  bool get isGuest => _currentUser.isGuest;
  bool get isLoading => _isLoading;

  /// Ensures a persistent guest session is active in the backend with the stable device ID
  Future<void> _initGuestSession() async {
    final guestId = StorageService.getOrCreateGuestDeviceId();
    try {
      final backendUser = await _apiService.createGuestSession(
        deviceId: guestId,
        name: _currentUser.name.isNotEmpty ? _currentUser.name : 'Guest',
      );
      if (backendUser != null) {
        _currentUser = _currentUser.copyWith(
          id: backendUser.id,
          guestDeviceId: guestId,
          hasSafetyPin: backendUser.hasSafetyPin,
        );
        await StorageService.saveUser(_currentUser);
        await StorageService.saveHasSafetyPin(backendUser.hasSafetyPin);

        // Register device push token immediately
        FcmService.registerDeviceToken(
          userId: _currentUser.id,
          lat: 6.6018,
          lng: 3.3515,
          communityId: 'ikeja',
        );
      }
    } catch (_) {}
  }

  Future<void> upgradeGuestAccount({
    required String name,
    required String email,
    required String phone,
    String? password,
  }) async {
    _isLoading = true;
    notifyListeners();

    _currentUser = _currentUser.copyWith(
      name: name,
      email: email,
      phone: phone,
      isGuest: false,
    );

    await StorageService.saveUser(_currentUser);

    _isLoading = false;
    notifyListeners();
  }

  Future<bool> updateProfile({
    String? name,
    String? email,
    String? phone,
  }) async {
    _isLoading = true;
    notifyListeners();

    try {
      final res = await _apiService.updateProfile(
        userId: _currentUser.id,
        name: name,
        email: email ?? _currentUser.email,
        phone: phone ?? _currentUser.phone,
      );

      if (res != null && (res['success'] == true || res['user'] != null)) {
        final userData = res['user'] ?? res;
        final returnedName = userData['name'] ?? name ?? _currentUser.name;
        final returnedEmail = userData['email'] ?? email ?? _currentUser.email;
        final returnedPhone = userData['phone'] ?? phone ?? _currentUser.phone;

        _currentUser = _currentUser.copyWith(
          name: returnedName,
          email: returnedEmail,
          phone: returnedPhone,
        );
        await StorageService.saveUser(_currentUser);
        _isLoading = false;
        notifyListeners();
        return true;
      } else {
        _isLoading = false;
        notifyListeners();
        return false;
      }
    } catch (_) {
      _isLoading = false;
      notifyListeners();
      return false;
    }
  }

  void updateUserSettings(UserSettings newSettings, [List<EmergencyContact>? contacts]) {
    _currentUser = _currentUser.copyWith(
      settings: newSettings,
      emergencyContacts: contacts ?? _currentUser.emergencyContacts,
    );
    StorageService.saveUser(_currentUser);
    StorageService.saveSettings(newSettings);
    if (contacts != null) {
      StorageService.saveContacts(contacts);
    }
    notifyListeners();
  }

  Future<Map<String, dynamic>> changePassword({
    required String currentPassword,
    required String newPassword,
  }) async {
    _isLoading = true;
    notifyListeners();

    final res = await _apiService.changePassword(
      userId: _currentUser.id,
      email: _currentUser.email,
      currentPassword: currentPassword,
      newPassword: newPassword,
    );

    _isLoading = false;
    notifyListeners();

    if (res != null && res['success'] == true) {
      return {'success': true, 'message': res['message'] ?? 'Password changed successfully'};
    } else {
      return {'success': false, 'error': res?['error'] ?? 'Could not change password'};
    }
  }

  Future<bool> registerUser({
    required String firstName,
    required String lastName,
    required String email,
    required String password,
  }) async {
    _isLoading = true;
    notifyListeners();

    final fullName = '${firstName.trim()} ${lastName.trim()}'.trim();

    final response = await _apiService.register(
      name: fullName.isNotEmpty ? fullName : 'User',
      email: email.trim(),
      password: password,
      phone: _currentUser.phone,
    );

    if (response == null || response['user'] == null) {
      _isLoading = false;
      notifyListeners();
      return false;
    }

    final userData = response['user'];
    final userId = userData['id']?.toString() ?? userData['_id']?.toString() ?? 'usr_${DateTime.now().millisecondsSinceEpoch}';

    final remoteSettings = userData['settings'] != null
        ? UserSettings.fromJson(userData['settings'])
        : _currentUser.settings;
    final remoteContacts = (userData['emergencyContacts'] as List<dynamic>?)
            ?.map((e) => EmergencyContact.fromJson(e as Map<String, dynamic>))
            .toList() ??
        _currentUser.emergencyContacts;

    final hasSafetyPin = userData['hasSafetyPin'] ?? false;

    _currentUser = User(
      id: userId,
      isGuest: false,
      guestDeviceId: StorageService.getOrCreateGuestDeviceId(),
      name: userData['name'] ?? (fullName.isNotEmpty ? fullName : 'User'),
      email: userData['email'] ?? email.trim(),
      phone: userData['phone'] ?? _currentUser.phone,
      settings: remoteSettings,
      emergencyContacts: remoteContacts,
      hasSafetyPin: hasSafetyPin,
    );

    await StorageService.saveUser(_currentUser);
    await StorageService.saveSettings(remoteSettings);
    await StorageService.saveContacts(remoteContacts);
    await StorageService.saveHasSafetyPin(hasSafetyPin);

    // Register FCM device token with persistent user ID
    final activeCommunity = StorageService.loadActiveCommunity();
    FcmService.registerDeviceToken(
      userId: _currentUser.id,
      lat: activeCommunity.center.lat,
      lng: activeCommunity.center.lng,
      communityId: activeCommunity.id,
    );

    _isLoading = false;
    notifyListeners();
    return true;
  }

  Future<bool> signInUser({
    required String email,
    required String password,
  }) async {
    _isLoading = true;
    notifyListeners();

    final response = await _apiService.login(email: email, password: password);
    if (response == null || response['user'] == null) {
      _isLoading = false;
      notifyListeners();
      return false;
    }

    final userData = response['user'];
    final existingUser = StorageService.loadUser();
    final userId = userData['id']?.toString() ?? userData['_id']?.toString() ?? existingUser.id;
    final displayName = userData['name'] ?? (email.split('@').first.isNotEmpty ? email.split('@').first : 'User');
    final hasSafetyPin = userData['hasSafetyPin'] ?? false;

    final remoteSettings = userData['settings'] != null
        ? UserSettings.fromJson(userData['settings'])
        : existingUser.settings;
    final remoteContacts = (userData['emergencyContacts'] as List<dynamic>?)
            ?.map((e) => EmergencyContact.fromJson(e as Map<String, dynamic>))
            .toList() ??
        existingUser.emergencyContacts;

    _currentUser = User(
      id: userId,
      isGuest: false,
      guestDeviceId: StorageService.getOrCreateGuestDeviceId(),
      name: displayName,
      email: userData['email'] ?? email.trim(),
      phone: userData['phone'] ?? existingUser.phone,
      settings: remoteSettings,
      emergencyContacts: remoteContacts,
      hasSafetyPin: hasSafetyPin,
    );

    await StorageService.saveUser(_currentUser);
    await StorageService.saveSettings(remoteSettings);
    await StorageService.saveContacts(remoteContacts);
    await StorageService.saveHasSafetyPin(hasSafetyPin);

    // Register FCM device token with persistent user ID
    final activeCommunity = StorageService.loadActiveCommunity();
    FcmService.registerDeviceToken(
      userId: _currentUser.id,
      lat: activeCommunity.center.lat,
      lng: activeCommunity.center.lng,
      communityId: activeCommunity.id,
    );

    _isLoading = false;
    notifyListeners();
    return true;
  }

  // ─── SAFETY PIN METHODS ──────────────────────────────────────────────────
  Future<Map<String, dynamic>> setSafetyPin(String pin) async {
    _isLoading = true;
    notifyListeners();

    try {
      final res = await _apiService.setSafetyPin(
        pin: pin,
        userId: _currentUser.id,
      );

      _isLoading = false;
      if (res != null && res['success'] == true) {
        _currentUser = _currentUser.copyWith(hasSafetyPin: true);
        await StorageService.saveUser(_currentUser);
        await StorageService.saveHasSafetyPin(true);
        notifyListeners();
        return {'success': true, 'message': res['message'] ?? 'Safety PIN set successfully.'};
      } else {
        notifyListeners();
        return {'success': false, 'error': res?['error'] ?? 'Could not set safety PIN.'};
      }
    } catch (e) {
      _isLoading = false;
      notifyListeners();
      return {'success': false, 'error': 'Network error: $e'};
    }
  }

  Future<bool> verifySafetyPin(String pin) async {
    try {
      final res = await _apiService.verifySafetyPin(
        pin: pin,
        userId: _currentUser.id,
      );
      if (res != null && res['valid'] == true) {
        return true;
      }
      return false;
    } catch (_) {
      return false;
    }
  }

  Future<Map<String, dynamic>> changeSafetyPin({
    required String currentPin,
    required String newPin,
  }) async {
    _isLoading = true;
    notifyListeners();

    try {
      final res = await _apiService.changeSafetyPin(
        currentPin: currentPin,
        newPin: newPin,
        userId: _currentUser.id,
      );

      _isLoading = false;
      if (res != null && res['success'] == true) {
        _currentUser = _currentUser.copyWith(hasSafetyPin: true);
        await StorageService.saveUser(_currentUser);
        await StorageService.saveHasSafetyPin(true);
        notifyListeners();
        return {'success': true, 'message': res['message'] ?? 'Safety PIN changed successfully.'};
      } else {
        notifyListeners();
        return {'success': false, 'error': res?['error'] ?? 'Could not update safety PIN.'};
      }
    } catch (e) {
      _isLoading = false;
      notifyListeners();
      return {'success': false, 'error': 'Network error: $e'};
    }
  }

  Future<void> signInAsGuest() async {
    await resetToGuest();
  }

  /// Preserves user device ID, existing emergency contacts, and settings on sign out / guest resume
  Future<void> resetToGuest() async {
    final guestId = StorageService.getOrCreateGuestDeviceId();
    final existingUser = StorageService.loadUser();

    // Preserve existing settings & contacts so no user customization is lost
    _currentUser = User(
      id: existingUser.id.isNotEmpty ? existingUser.id : 'guest_$guestId',
      isGuest: true,
      guestDeviceId: guestId,
      name: 'Guest',
      phone: existingUser.phone,
      settings: existingUser.settings,
      emergencyContacts: existingUser.emergencyContacts,
    );

    await StorageService.saveUser(_currentUser);

    // Re-sync with backend to ensure the persistent guest record is intact
    await _initGuestSession();

    // Ensure FCM token registration is refreshed with the persistent guest ID
    final activeCommunity = StorageService.loadActiveCommunity();
    FcmService.registerDeviceToken(
      userId: _currentUser.id,
      lat: activeCommunity.center.lat,
      lng: activeCommunity.center.lng,
      communityId: activeCommunity.id,
    );

    notifyListeners();
  }

  Future<void> signOut() async {
    await resetToGuest();
  }
}
