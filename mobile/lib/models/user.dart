class EmergencyContact {
  final String id;
  final String name;
  final String phone;
  final String relationship;

  const EmergencyContact({
    required this.id,
    required this.name,
    required this.phone,
    required this.relationship,
  });

  factory EmergencyContact.fromJson(Map<String, dynamic> json) {
    return EmergencyContact(
      id: json['id'] ?? json['_id'] ?? '',
      name: json['name'] ?? '',
      phone: json['phone'] ?? '',
      relationship: json['relationship'] ?? '',
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'phone': phone,
      'relationship': relationship,
    };
  }
}

class UserSettings {
  final int checkInIntervalMinutes;
  final int timeoutDurationSeconds;
  final String callHandlingPreference; // 'standard_ring' | 'auto_answer_speaker'
  final String defaultLandingTab;

  const UserSettings({
    this.checkInIntervalMinutes = 5,
    this.timeoutDurationSeconds = 60,
    this.callHandlingPreference = 'standard_ring',
    this.defaultLandingTab = 'safety_mode',
  });

  factory UserSettings.fromJson(Map<String, dynamic>? json) {
    if (json == null) return const UserSettings();
    return UserSettings(
      checkInIntervalMinutes: json['checkInIntervalMinutes'] ?? 5,
      timeoutDurationSeconds: json['timeoutDurationSeconds'] ?? 60,
      callHandlingPreference: json['callHandlingPreference'] ?? 'standard_ring',
      defaultLandingTab: json['defaultLandingTab'] ?? 'safety_mode',
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'checkInIntervalMinutes': checkInIntervalMinutes,
      'timeoutDurationSeconds': timeoutDurationSeconds,
      'callHandlingPreference': callHandlingPreference,
      'defaultLandingTab': defaultLandingTab,
    };
  }

  UserSettings copyWith({
    int? checkInIntervalMinutes,
    int? timeoutDurationSeconds,
    String? callHandlingPreference,
    String? defaultLandingTab,
  }) {
    return UserSettings(
      checkInIntervalMinutes: checkInIntervalMinutes ?? this.checkInIntervalMinutes,
      timeoutDurationSeconds: timeoutDurationSeconds ?? this.timeoutDurationSeconds,
      callHandlingPreference: callHandlingPreference ?? this.callHandlingPreference,
      defaultLandingTab: defaultLandingTab ?? this.defaultLandingTab,
    );
  }
}

class User {
  final String id;
  final bool isGuest;
  final String? guestDeviceId;
  final String name;
  final String? email;
  final String? phone;
  final UserSettings settings;
  final List<EmergencyContact> emergencyContacts;
  final bool hasSafetyPin;

  const User({
    required this.id,
    this.isGuest = false,
    this.guestDeviceId,
    this.name = 'Guest',
    this.email,
    this.phone,
    this.settings = const UserSettings(),
    this.emergencyContacts = const [],
    this.hasSafetyPin = false,
  });

  factory User.fromJson(Map<String, dynamic> json) {
    return User(
      id: json['id'] ?? json['_id'] ?? '',
      isGuest: json['isGuest'] ?? false,
      guestDeviceId: json['guestDeviceId'],
      name: json['name'] ?? 'Guest',
      email: json['email'],
      phone: json['phone'],
      settings: UserSettings.fromJson(json['settings']),
      emergencyContacts: (json['emergencyContacts'] as List<dynamic>?)
              ?.map((e) => EmergencyContact.fromJson(e as Map<String, dynamic>))
              .toList() ??
          [],
      hasSafetyPin: json['hasSafetyPin'] ?? (json['safetyPinHash'] != null),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'isGuest': isGuest,
      'guestDeviceId': guestDeviceId,
      'name': name,
      'email': email,
      'phone': phone,
      'settings': settings.toJson(),
      'emergencyContacts': emergencyContacts.map((e) => e.toJson()).toList(),
      'hasSafetyPin': hasSafetyPin,
    };
  }

  User copyWith({
    String? id,
    bool? isGuest,
    String? guestDeviceId,
    String? name,
    String? email,
    String? phone,
    UserSettings? settings,
    List<EmergencyContact>? emergencyContacts,
    bool? hasSafetyPin,
  }) {
    return User(
      id: id ?? this.id,
      isGuest: isGuest ?? this.isGuest,
      guestDeviceId: guestDeviceId ?? this.guestDeviceId,
      name: name ?? this.name,
      email: email ?? this.email,
      phone: phone ?? this.phone,
      settings: settings ?? this.settings,
      emergencyContacts: emergencyContacts ?? this.emergencyContacts,
      hasSafetyPin: hasSafetyPin ?? this.hasSafetyPin,
    );
  }
}
