import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import '../config/constants.dart';
import '../models/user.dart';
import '../providers/auth_provider.dart';
import '../providers/safety_session_provider.dart';
import '../providers/settings_provider.dart';
import '../services/storage_service.dart';
import '../widgets/in_app_notification.dart';
import '../widgets/safety_pin_sheet.dart';
import 'landing_screen.dart';
import 'onboarding_screen.dart';

class SettingsScreen extends StatelessWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final authProv = context.watch<AuthProvider>();
    final settingsProv = context.watch<SettingsProvider>();

    final user = authProv.user;
    final settings = settingsProv.settings;
    final singleContact = settingsProv.emergencyContacts.isNotEmpty
        ? settingsProv.emergencyContacts.first
        : null;

    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        title: const Text(
          'Settings',
          style: TextStyle(
            color: Color(0xFF0F172A),
            fontSize: 18,
            fontWeight: FontWeight.w700,
          ),
        ),
        automaticallyImplyLeading: false,
        backgroundColor: Colors.white,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(1.0),
          child: Container(color: const Color(0xFFF1F5F9), height: 1.0),
        ),
      ),
      body: SafeArea(
        child: ListView(
          physics: const BouncingScrollPhysics(),
          children: [
            // Centralized Big Avatar Section
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 28),
              child: Column(
                children: [
                  if (!user.isGuest)
                    GestureDetector(
                      onTap: () => _showEditNameSheet(context, user, authProv),
                      child: const Stack(
                        children: [
                          CircleAvatar(
                            radius: 56,
                            backgroundColor: Color(0xFFF1F5F9),
                            child: Icon(
                              Icons.person_2,
                              size: 88,
                              color: Color(0xFF64748B),
                            ),
                          ),
                        ],
                      ),
                    )
                  else
                    const CircleAvatar(
                      radius: 56,
                      backgroundColor: Color(0xFFF1F5F9),
                      child: Icon(
                        Icons.person_2,
                        size: 88,
                        color: Color(0xFF64748B),
                      ),
                    ),
                  const SizedBox(height: 14),
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        user.name,
                        style: const TextStyle(
                          fontSize: 19,
                          fontWeight: FontWeight.w700,
                          color: Color(0xFF0F172A),
                        ),
                      ),
                      if (!user.isGuest) ...[
                        const SizedBox(width: 8),
                        GestureDetector(
                          onTap: () =>
                              _showEditNameSheet(context, user, authProv),
                          child: Container(
                            padding: const EdgeInsets.all(5),
                            decoration: const BoxDecoration(
                              color: Color(0xFFF1F5F9),
                              shape: BoxShape.circle,
                            ),
                            child: const Icon(
                              Icons.edit_outlined,
                              size: 15,
                              color: Color(0xFF1B8529),
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(
                    user.isGuest
                        ? 'Guest account'
                        : (user.email ?? 'Verified account'),
                    style: const TextStyle(
                      fontSize: 13.5,
                      color: Color(0xFF64748B),
                    ),
                  ),
                ],
              ),
            ),
            const Divider(height: 1, color: Color(0xFFF1F5F9)),

            // Account & Security Rows (Only visible to verified accounts)
            if (!user.isGuest) ...[
              _buildSettingRow(
                title: 'Full name',
                value: user.name,
                onTap: () => _showEditNameSheet(context, user, authProv),
              ),
              const Divider(height: 1, color: Color(0xFFF1F5F9)),
              _buildSettingRow(
                title: 'Change password',
                value: '••••••••',
                onTap: () => _showChangePasswordSheet(context, user, authProv),
              ),
              const Divider(height: 1, color: Color(0xFFF1F5F9)),
            ],

            // Settings Rows
            _buildSettingRow(
              title: 'Check-in timer',
              value: '${settings.checkInIntervalMinutes} min',
              onTap: () => _showIntervalSheet(
                  context, settingsProv, settings.checkInIntervalMinutes),
            ),
            const Divider(height: 1, color: Color(0xFFF1F5F9)),

            _buildSettingRow(
              title: 'Grace period',
              value: '${settings.timeoutDurationSeconds}s',
              onTap: () => _showTimeoutSheet(
                  context, settingsProv, settings.timeoutDurationSeconds),
            ),
            const Divider(height: 1, color: Color(0xFFF1F5F9)),

            _buildSettingRow(
              title: 'Call mode',
              value: settings.callHandlingPreference == 'auto_answer_speaker'
                  ? 'Auto-answer'
                  : 'Standard ring',
              onTap: () => _showCallHandlingSheet(
                  context, settingsProv, settings.callHandlingPreference),
            ),
            const Divider(height: 1, color: Color(0xFFF1F5F9)),

            _buildSettingRow(
              title: 'Emergency contact',
              value: singleContact != null ? singleContact.name : 'Not set',
              onTap: () =>
                  _showSingleContactSheet(context, settingsProv, singleContact),
            ),
            const Divider(height: 1, color: Color(0xFFF1F5F9)),

            _buildSettingRow(
              title: 'Safety PIN',
              value: (user.hasSafetyPin || StorageService.hasSafetyPin())
                  ? 'Configured'
                  : 'Not set',
              onTap: () => _showSafetyPinSheet(context, authProv),
            ),
            const Divider(height: 1, color: Color(0xFFF1F5F9)),

            _buildSettingRow(
              title: 'App tour',
              value: 'Walkthrough',
              onTap: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => const OnboardingScreen()),
                );
              },
            ),
            const Divider(height: 1, color: Color(0xFFF1F5F9)),

            // Sign out
            const SizedBox(height: 36),
            Center(
              child: TextButton(
                onPressed: () => _showSignOutSheet(context, authProv),
                child: const Text(
                  'Sign out',
                  style: TextStyle(
                    color: Color(0xFFEF4444),
                    fontSize: 14.5,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ),
            const SizedBox(height: 8),
            const Center(
              child: Text(
                '${AppConstants.appName} v${AppConstants.appVersion}',
                style: TextStyle(
                  color: Color(0xFF94A3B8),
                  fontSize: 12,
                ),
              ),
            ),
            const SizedBox(height: 28),
          ],
        ),
      ),
    );
  }

  Widget _buildSettingRow({
    required String title,
    required String value,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 15),
        child: Row(
          children: [
            Expanded(
              child: Text(
                title,
                style: const TextStyle(
                  fontSize: 14.5,
                  fontWeight: FontWeight.w500,
                  color: Color(0xFF0F172A),
                ),
              ),
            ),
            Text(
              value,
              style: const TextStyle(
                fontSize: 13.5,
                color: Color(0xFF64748B),
                fontWeight: FontWeight.w500,
              ),
            ),
            const SizedBox(width: 6),
            const Icon(
              Icons.chevron_right_rounded,
              size: 16,
              color: Color(0xFFCBD5E1),
            ),
          ],
        ),
      ),
    );
  }

  void _showSafetyPinSheet(BuildContext context, AuthProvider authProv) async {
    final hasPin = authProv.user.hasSafetyPin || StorageService.hasSafetyPin();
    if (!hasPin) {
      await SafetyPinSheet.showSetup(
        context,
        title: 'Set Safety PIN',
        subtitle: 'Create a 4-digit PIN to secure your safety sessions and emergency deactivations.',
      );
    } else {
      showModalBottomSheet(
        context: context,
        backgroundColor: Colors.transparent,
        builder: (ctx) => Container(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 28),
          decoration: const BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(
                  width: 40,
                  height: 4.5,
                  decoration: BoxDecoration(
                    color: const Color(0xFFE2E8F0),
                    borderRadius: BorderRadius.circular(3),
                  ),
                ),
              ),
              const SizedBox(height: 18),
              const Text(
                'Safety PIN',
                style: TextStyle(
                  color: Color(0xFF0F172A),
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 4),
              const Text(
                'Your 4-digit Safety PIN is active and required to deactivate emergency alerts.',
                style: TextStyle(
                  color: Color(0xFF64748B),
                  fontSize: 13,
                ),
              ),
              const SizedBox(height: 20),
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: Container(
                  width: 38,
                  height: 38,
                  decoration: BoxDecoration(
                    color: const Color(0xFFF8FAFC),
                    border: Border.all(color: const Color(0xFFE2E8F0)),
                  ),
                  child: const Icon(Icons.lock_reset_rounded, size: 20, color: Color(0xFF0F172A)),
                ),
                title: const Text(
                  'Change Safety PIN',
                  style: TextStyle(
                    color: Color(0xFF0F172A),
                    fontWeight: FontWeight.w600,
                    fontSize: 14.5,
                  ),
                ),
                subtitle: const Text(
                  'Update your 4-digit security code',
                  style: TextStyle(color: Color(0xFF64748B), fontSize: 12),
                ),
                trailing: const Icon(Icons.chevron_right_rounded, color: Color(0xFFCBD5E1), size: 18),
                onTap: () {
                  Navigator.pop(ctx);
                  SafetyPinSheet.showChange(context);
                },
              ),
            ],
          ),
        ),
      );
    }
  }

  void _showIntervalSheet(
      BuildContext context, SettingsProvider prov, int currentMins) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (ctx) => Container(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 28),
        decoration: const BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4.5,
                decoration: BoxDecoration(
                  color: const Color(0xFFE2E8F0),
                  borderRadius: BorderRadius.circular(3),
                ),
              ),
            ),
            const SizedBox(height: 18),
            const Text(
              'Check-in timer',
              style: TextStyle(
                color: Color(0xFF0F172A),
                fontSize: 16,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 12),
            ...AppConstants.supportedIntervalsMinutes.map((mins) {
              final isSelected = currentMins == mins;
              return ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(
                  '$mins minutes',
                  style: TextStyle(
                    color: isSelected
                        ? const Color(0xFF1B8529)
                        : const Color(0xFF0F172A),
                    fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
                    fontSize: 14.5,
                  ),
                ),
                trailing: isSelected
                    ? const Icon(Icons.check_rounded,
                        color: Color(0xFF1B8529), size: 20)
                    : null,
                onTap: () {
                  prov.setCheckInInterval(mins);
                  Navigator.pop(ctx);
                },
              );
            }),
          ],
        ),
      ),
    );
  }

  void _showTimeoutSheet(
      BuildContext context, SettingsProvider prov, int currentSecs) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (ctx) => Container(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 28),
        decoration: const BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4.5,
                decoration: BoxDecoration(
                  color: const Color(0xFFE2E8F0),
                  borderRadius: BorderRadius.circular(3),
                ),
              ),
            ),
            const SizedBox(height: 18),
            const Text(
              'Grace period',
              style: TextStyle(
                color: Color(0xFF0F172A),
                fontSize: 16,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 12),
            ...AppConstants.supportedTimeoutDurationsSeconds.map((secs) {
              final isSelected = currentSecs == secs;
              return ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(
                  '$secs seconds',
                  style: TextStyle(
                    color: isSelected
                        ? const Color(0xFF1B8529)
                        : const Color(0xFF0F172A),
                    fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
                    fontSize: 14.5,
                  ),
                ),
                trailing: isSelected
                    ? const Icon(Icons.check_rounded,
                        color: Color(0xFF1B8529), size: 20)
                    : null,
                onTap: () {
                  prov.setTimeoutDuration(secs);
                  Navigator.pop(ctx);
                },
              );
            }),
          ],
        ),
      ),
    );
  }

  void _showCallHandlingSheet(
      BuildContext context, SettingsProvider prov, String currentPref) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (ctx) => Container(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 28),
        decoration: const BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4.5,
                decoration: BoxDecoration(
                  color: const Color(0xFFE2E8F0),
                  borderRadius: BorderRadius.circular(3),
                ),
              ),
            ),
            const SizedBox(height: 18),
            const Text(
              'Call mode',
              style: TextStyle(
                color: Color(0xFF0F172A),
                fontSize: 16,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 12),
            ListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text(
                'Auto-answer',
                style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w500),
              ),
              subtitle: const Text(
                'Emergency audio connects automatically on speaker.',
                style: TextStyle(fontSize: 12.5, color: Color(0xFF64748B)),
              ),
              trailing: currentPref == 'auto_answer_speaker'
                  ? const Icon(Icons.check_rounded,
                      color: Color(0xFF1B8529), size: 20)
                  : null,
              onTap: () {
                prov.setCallHandlingPreference('auto_answer_speaker');
                Navigator.pop(ctx);
              },
            ),
            const Divider(height: 1, color: Color(0xFFF1F5F9)),
            ListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text(
                'Standard ring',
                style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w500),
              ),
              subtitle: const Text(
                'Phone rings normally and requires tapping answer.',
                style: TextStyle(fontSize: 12.5, color: Color(0xFF64748B)),
              ),
              trailing: currentPref == 'standard_ring'
                  ? const Icon(Icons.check_rounded,
                      color: Color(0xFF1B8529), size: 20)
                  : null,
              onTap: () {
                prov.setCallHandlingPreference('standard_ring');
                Navigator.pop(ctx);
              },
            ),
          ],
        ),
      ),
    );
  }

  void _showSingleContactSheet(BuildContext context, SettingsProvider prov,
      EmergencyContact? currentContact) {
    final nameCtrl = TextEditingController(text: currentContact?.name ?? '');
    final phoneCtrl = TextEditingController(text: currentContact?.phone ?? '');
    final relCtrl =
        TextEditingController(text: currentContact?.relationship ?? '');

    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (ctx) {
        final bottomInset = MediaQuery.of(ctx).viewInsets.bottom;
        final safeBottom = MediaQuery.of(ctx).padding.bottom;
        return Padding(
          padding: EdgeInsets.only(bottom: bottomInset),
          child: Container(
            decoration: const BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
            ),
            child: SafeArea(
              top: false,
              bottom: true,
              child: SingleChildScrollView(
                physics: const BouncingScrollPhysics(),
                padding:
                    EdgeInsets.fromLTRB(20, 12, 20, safeBottom > 0 ? 12 : 28),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Center(
                      child: Container(
                        width: 40,
                        height: 4.5,
                        decoration: BoxDecoration(
                          color: const Color(0xFFE2E8F0),
                          borderRadius: BorderRadius.circular(3),
                        ),
                      ),
                    ),
                    const SizedBox(height: 18),
                    Text(
                      currentContact == null
                          ? 'Add Emergency Contact'
                          : 'Emergency Contact',
                      style: const TextStyle(
                        color: Color(0xFF0F172A),
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 4),
                    const Text(
                      'This contact will receive emergency alerts when safety triggers.',
                      style: TextStyle(
                        color: Color(0xFF64748B),
                        fontSize: 12.5,
                      ),
                    ),
                    const SizedBox(height: 16),
                    TextField(
                      controller: nameCtrl,
                      decoration: InputDecoration(
                        labelText: 'Name',
                        hintText: 'e.g. Mom, Alex...',
                        filled: true,
                        fillColor: const Color(0xFFF8FAFC),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide:
                              const BorderSide(color: Color(0xFFE2E8F0)),
                        ),
                        enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide:
                              const BorderSide(color: Color(0xFFE2E8F0)),
                        ),
                        focusedBorder: const OutlineInputBorder(
                          borderRadius: BorderRadius.all(Radius.circular(12)),
                          borderSide:
                              BorderSide(color: Color(0xFF1B8529), width: 1.5),
                        ),
                      ),
                    ),
                    const SizedBox(height: 10),
                    TextField(
                      controller: phoneCtrl,
                      keyboardType: TextInputType.phone,
                      decoration: InputDecoration(
                        labelText: 'Phone number',
                        hintText: 'e.g. +1 555-0199',
                        filled: true,
                        fillColor: const Color(0xFFF8FAFC),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide:
                              const BorderSide(color: Color(0xFFE2E8F0)),
                        ),
                        enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide:
                              const BorderSide(color: Color(0xFFE2E8F0)),
                        ),
                        focusedBorder: const OutlineInputBorder(
                          borderRadius: BorderRadius.all(Radius.circular(12)),
                          borderSide:
                              BorderSide(color: Color(0xFF1B8529), width: 1.5),
                        ),
                      ),
                    ),
                    const SizedBox(height: 10),
                    TextField(
                      controller: relCtrl,
                      decoration: InputDecoration(
                        labelText: 'Relationship (optional)',
                        hintText: 'e.g. Sister, Friend, Spouse...',
                        filled: true,
                        fillColor: const Color(0xFFF8FAFC),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide:
                              const BorderSide(color: Color(0xFFE2E8F0)),
                        ),
                        enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide:
                              const BorderSide(color: Color(0xFFE2E8F0)),
                        ),
                        focusedBorder: const OutlineInputBorder(
                          borderRadius: BorderRadius.all(Radius.circular(12)),
                          borderSide:
                              BorderSide(color: Color(0xFF1B8529), width: 1.5),
                        ),
                      ),
                    ),
                    const SizedBox(height: 20),
                    SizedBox(
                      width: double.infinity,
                      height: 48,
                      child: ElevatedButton(
                        onPressed: () {
                          final name = nameCtrl.text.trim();
                          final phone = phoneCtrl.text.trim();
                          if (name.isNotEmpty && phone.isNotEmpty) {
                            prov.setSingleEmergencyContact(
                              name: name,
                              phone: phone,
                              relationship: relCtrl.text.trim().isEmpty
                                  ? 'Contact'
                                  : relCtrl.text.trim(),
                            );
                            Navigator.pop(ctx);
                            AppNotification.show(
                              context,
                              message: 'Emergency contact saved.',
                              type: NotificationType.success,
                            );
                          } else {
                            AppNotification.show(
                              context,
                              message:
                                  'Please enter both name and phone number.',
                              type: NotificationType.error,
                            );
                          }
                        },
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF1B8529),
                          foregroundColor: Colors.white,
                          elevation: 0,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                        ),
                        child: const Text('Save Contact',
                            style: TextStyle(
                                fontWeight: FontWeight.w600, fontSize: 15)),
                      ),
                    ),
                    if (currentContact != null) ...[
                      const SizedBox(height: 8),
                      SizedBox(
                        width: double.infinity,
                        height: 44,
                        child: TextButton(
                          onPressed: () {
                            prov.clearEmergencyContacts();
                            Navigator.pop(ctx);
                            AppNotification.show(
                              context,
                              message: 'Emergency contact removed.',
                              type: NotificationType.info,
                            );
                          },
                          child: const Text(
                            'Remove Contact',
                            style: TextStyle(
                              color: Color(0xFFEF4444),
                              fontSize: 14,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ),
        );
      },
    );
  }

  void _showEditNameSheet(
      BuildContext context, User user, AuthProvider authProv) {
    HapticFeedback.selectionClick();
    final nameCtrl =
        TextEditingController(text: user.name == 'Guest' ? '' : user.name);
    bool isSaving = false;

    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (sheetContext, setSheetState) {
            final bottomInset = MediaQuery.of(sheetContext).viewInsets.bottom;
            final safeBottom = MediaQuery.of(sheetContext).padding.bottom;

            return Padding(
              padding: EdgeInsets.only(bottom: bottomInset),
              child: Container(
                decoration: const BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
                ),
                child: SafeArea(
                  top: false,
                  bottom: true,
                  child: SingleChildScrollView(
                    physics: const BouncingScrollPhysics(),
                    padding: EdgeInsets.fromLTRB(
                        24, 14, 24, safeBottom > 0 ? 14 : 28),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Center(
                          child: Container(
                            width: 40,
                            height: 4.5,
                            decoration: BoxDecoration(
                              color: const Color(0xFFE2E8F0),
                              borderRadius: BorderRadius.circular(3),
                            ),
                          ),
                        ),
                        const SizedBox(height: 20),
                        Row(
                          children: [
                            Container(
                              padding: const EdgeInsets.all(8),
                              decoration: BoxDecoration(
                                color: const Color(0xFFE8F5E9),
                                borderRadius: BorderRadius.circular(10),
                              ),
                              child: const Icon(
                                Icons.edit_note_rounded,
                                color: Color(0xFF1B8529),
                                size: 22,
                              ),
                            ),
                            const SizedBox(width: 12),
                            const Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  'Edit Full Name',
                                  style: TextStyle(
                                    color: Color(0xFF0F172A),
                                    fontSize: 17,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                                SizedBox(height: 2),
                                Text(
                                  'Visible on emergency telemetry and radar',
                                  style: TextStyle(
                                    color: Color(0xFF64748B),
                                    fontSize: 12.5,
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                        const SizedBox(height: 22),
                        const Text(
                          'Full Name',
                          style: TextStyle(
                            color: Color(0xFF0F172A),
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        const SizedBox(height: 7),
                        TextField(
                          controller: nameCtrl,
                          textCapitalization: TextCapitalization.words,
                          autofocus: true,
                          style: const TextStyle(
                            color: Color(0xFF0F172A),
                            fontSize: 15,
                            fontWeight: FontWeight.w500,
                          ),
                          decoration: InputDecoration(
                            hintText: 'e.g. John Doe',
                            hintStyle: const TextStyle(
                              color: Color(0xFF94A3B8),
                              fontSize: 14,
                            ),
                            filled: true,
                            fillColor: const Color(0xFFF8FAFC),
                            contentPadding: const EdgeInsets.symmetric(
                                horizontal: 16, vertical: 14),
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(12),
                              borderSide:
                                  const BorderSide(color: Color(0xFFE2E8F0)),
                            ),
                            enabledBorder: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(12),
                              borderSide:
                                  const BorderSide(color: Color(0xFFE2E8F0)),
                            ),
                            focusedBorder: const OutlineInputBorder(
                              borderRadius:
                                  BorderRadius.all(Radius.circular(12)),
                              borderSide: BorderSide(
                                  color: Color(0xFF1B8529), width: 1.5),
                            ),
                          ),
                        ),
                        const SizedBox(height: 24),
                        SizedBox(
                          width: double.infinity,
                          height: 50,
                          child: ElevatedButton(
                            onPressed: isSaving
                                ? null
                                : () async {
                                    final trimmed = nameCtrl.text.trim();
                                    if (trimmed.isEmpty) {
                                      AppNotification.show(
                                        context,
                                        message: 'Please enter a valid name.',
                                        type: NotificationType.warning,
                                      );
                                      return;
                                    }

                                    setSheetState(() => isSaving = true);
                                    final success = await authProv
                                        .updateProfile(name: trimmed);
                                    if (context.mounted) {
                                      Navigator.pop(ctx);
                                      if (success) {
                                        AppNotification.show(
                                          context,
                                          message: 'Name updated successfully.',
                                          type: NotificationType.success,
                                        );
                                      } else {
                                        AppNotification.show(
                                          context,
                                          message:
                                              'Could not update name. Please try again.',
                                          type: NotificationType.error,
                                        );
                                      }
                                    }
                                  },
                            style: ElevatedButton.styleFrom(
                              backgroundColor: const Color(0xFF1B8529),
                              foregroundColor: Colors.white,
                              elevation: 0,
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(12),
                              ),
                              disabledBackgroundColor:
                                  const Color(0xFF1B8529).withOpacity(0.6),
                            ),
                            child: isSaving
                                ? const SizedBox(
                                    width: 20,
                                    height: 20,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2.2,
                                      color: Colors.white,
                                    ),
                                  )
                                : const Text(
                                    'Update Name',
                                    style: TextStyle(
                                        fontWeight: FontWeight.w700,
                                        fontSize: 15),
                                  ),
                          ),
                        ),
                        const SizedBox(height: 8),
                      ],
                    ),
                  ),
                ),
              ),
            );
          },
        );
      },
    );
  }

  void _showChangePasswordSheet(
      BuildContext context, User user, AuthProvider authProv) {
    HapticFeedback.selectionClick();
    final currentPasswordCtrl = TextEditingController();
    final newPasswordCtrl = TextEditingController();
    final confirmPasswordCtrl = TextEditingController();

    bool obscureCurrent = true;
    bool obscureNew = true;
    bool obscureConfirm = true;
    bool isSubmitting = false;

    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (sheetContext, setSheetState) {
            final bottomInset = MediaQuery.of(sheetContext).viewInsets.bottom;
            final safeBottom = MediaQuery.of(sheetContext).padding.bottom;

            return Padding(
              padding: EdgeInsets.only(bottom: bottomInset),
              child: Container(
                decoration: const BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
                ),
                child: SafeArea(
                  top: false,
                  bottom: true,
                  child: SingleChildScrollView(
                    physics: const BouncingScrollPhysics(),
                    padding: EdgeInsets.fromLTRB(
                        24, 14, 24, safeBottom > 0 ? 14 : 28),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Center(
                          child: Container(
                            width: 40,
                            height: 4.5,
                            decoration: BoxDecoration(
                              color: const Color(0xFFE2E8F0),
                              borderRadius: BorderRadius.circular(3),
                            ),
                          ),
                        ),
                        const SizedBox(height: 20),
                        Row(
                          children: [
                            Container(
                              padding: const EdgeInsets.all(8),
                              decoration: BoxDecoration(
                                color: const Color(0xFFE8F5E9),
                                borderRadius: BorderRadius.circular(10),
                              ),
                              child: const Icon(
                                Icons.lock_reset_rounded,
                                color: Color(0xFF1B8529),
                                size: 22,
                              ),
                            ),
                            const SizedBox(width: 12),
                            Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  user.isGuest
                                      ? 'Set Password'
                                      : 'Change Password',
                                  style: const TextStyle(
                                    color: Color(0xFF0F172A),
                                    fontSize: 17,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                                const SizedBox(height: 2),
                                const Text(
                                  'Secure your account with a strong password',
                                  style: TextStyle(
                                    color: Color(0xFF64748B),
                                    fontSize: 12.5,
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                        const SizedBox(height: 22),

                        // Current password (if not guest)
                        if (!user.isGuest) ...[
                          const Text(
                            'Current Password',
                            style: TextStyle(
                              color: Color(0xFF0F172A),
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          const SizedBox(height: 7),
                          TextField(
                            controller: currentPasswordCtrl,
                            obscureText: obscureCurrent,
                            decoration: InputDecoration(
                              hintText: '••••••••',
                              filled: true,
                              fillColor: const Color(0xFFF8FAFC),
                              suffixIcon: IconButton(
                                icon: Icon(
                                  obscureCurrent
                                      ? Icons.visibility_off_outlined
                                      : Icons.visibility_outlined,
                                  color: const Color(0xFF94A3B8),
                                  size: 20,
                                ),
                                onPressed: () {
                                  setSheetState(
                                      () => obscureCurrent = !obscureCurrent);
                                },
                              ),
                              contentPadding: const EdgeInsets.symmetric(
                                  horizontal: 16, vertical: 14),
                              border: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(12),
                                borderSide:
                                    const BorderSide(color: Color(0xFFE2E8F0)),
                              ),
                              enabledBorder: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(12),
                                borderSide:
                                    const BorderSide(color: Color(0xFFE2E8F0)),
                              ),
                              focusedBorder: const OutlineInputBorder(
                                borderRadius:
                                    BorderRadius.all(Radius.circular(12)),
                                borderSide: BorderSide(
                                    color: Color(0xFF1B8529), width: 1.5),
                              ),
                            ),
                          ),
                          const SizedBox(height: 16),
                        ],

                        // New password
                        const Text(
                          'New Password',
                          style: TextStyle(
                            color: Color(0xFF0F172A),
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        const SizedBox(height: 7),
                        TextField(
                          controller: newPasswordCtrl,
                          obscureText: obscureNew,
                          decoration: InputDecoration(
                            hintText: 'At least 6 characters',
                            filled: true,
                            fillColor: const Color(0xFFF8FAFC),
                            suffixIcon: IconButton(
                              icon: Icon(
                                obscureNew
                                    ? Icons.visibility_off_outlined
                                    : Icons.visibility_outlined,
                                color: const Color(0xFF94A3B8),
                                size: 20,
                              ),
                              onPressed: () {
                                setSheetState(() => obscureNew = !obscureNew);
                              },
                            ),
                            contentPadding: const EdgeInsets.symmetric(
                                horizontal: 16, vertical: 14),
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(12),
                              borderSide:
                                  const BorderSide(color: Color(0xFFE2E8F0)),
                            ),
                            enabledBorder: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(12),
                              borderSide:
                                  const BorderSide(color: Color(0xFFE2E8F0)),
                            ),
                            focusedBorder: const OutlineInputBorder(
                              borderRadius:
                                  BorderRadius.all(Radius.circular(12)),
                              borderSide: BorderSide(
                                  color: Color(0xFF1B8529), width: 1.5),
                            ),
                          ),
                        ),
                        const SizedBox(height: 16),

                        // Confirm password
                        const Text(
                          'Confirm New Password',
                          style: TextStyle(
                            color: Color(0xFF0F172A),
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        const SizedBox(height: 7),
                        TextField(
                          controller: confirmPasswordCtrl,
                          obscureText: obscureConfirm,
                          decoration: InputDecoration(
                            hintText: 'Repeat new password',
                            filled: true,
                            fillColor: const Color(0xFFF8FAFC),
                            suffixIcon: IconButton(
                              icon: Icon(
                                obscureConfirm
                                    ? Icons.visibility_off_outlined
                                    : Icons.visibility_outlined,
                                color: const Color(0xFF94A3B8),
                                size: 20,
                              ),
                              onPressed: () {
                                setSheetState(
                                    () => obscureConfirm = !obscureConfirm);
                              },
                            ),
                            contentPadding: const EdgeInsets.symmetric(
                                horizontal: 16, vertical: 14),
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(12),
                              borderSide:
                                  const BorderSide(color: Color(0xFFE2E8F0)),
                            ),
                            enabledBorder: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(12),
                              borderSide:
                                  const BorderSide(color: Color(0xFFE2E8F0)),
                            ),
                            focusedBorder: const OutlineInputBorder(
                              borderRadius:
                                  BorderRadius.all(Radius.circular(12)),
                              borderSide: BorderSide(
                                  color: Color(0xFF1B8529), width: 1.5),
                            ),
                          ),
                        ),
                        const SizedBox(height: 24),

                        // Submit Button
                        SizedBox(
                          width: double.infinity,
                          height: 50,
                          child: ElevatedButton(
                            onPressed: isSubmitting
                                ? null
                                : () async {
                                    final curPass =
                                        currentPasswordCtrl.text.trim();
                                    final newPass = newPasswordCtrl.text.trim();
                                    final confPass =
                                        confirmPasswordCtrl.text.trim();

                                    if (!user.isGuest && curPass.isEmpty) {
                                      AppNotification.show(
                                        context,
                                        message:
                                            'Please enter your current password.',
                                        type: NotificationType.warning,
                                      );
                                      return;
                                    }

                                    if (newPass.length < 6) {
                                      AppNotification.show(
                                        context,
                                        message:
                                            'New password must be at least 6 characters.',
                                        type: NotificationType.warning,
                                      );
                                      return;
                                    }

                                    if (newPass != confPass) {
                                      AppNotification.show(
                                        context,
                                        message: 'New passwords do not match.',
                                        type: NotificationType.warning,
                                      );
                                      return;
                                    }

                                    setSheetState(() => isSubmitting = true);
                                    final result =
                                        await authProv.changePassword(
                                      currentPassword: curPass,
                                      newPassword: newPass,
                                    );

                                    if (context.mounted) {
                                      if (result['success'] == true) {
                                        Navigator.pop(ctx);
                                        AppNotification.show(
                                          context,
                                          message:
                                              'Password updated successfully.',
                                          type: NotificationType.success,
                                        );
                                      } else {
                                        setSheetState(
                                            () => isSubmitting = false);
                                        AppNotification.show(
                                          context,
                                          message: result['error'] ??
                                              'Failed to update password.',
                                          type: NotificationType.error,
                                        );
                                      }
                                    }
                                  },
                            style: ElevatedButton.styleFrom(
                              backgroundColor: const Color(0xFF1B8529),
                              foregroundColor: Colors.white,
                              elevation: 0,
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(12),
                              ),
                              disabledBackgroundColor:
                                  const Color(0xFF1B8529).withOpacity(0.6),
                            ),
                            child: isSubmitting
                                ? const SizedBox(
                                    width: 20,
                                    height: 20,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2.2,
                                      color: Colors.white,
                                    ),
                                  )
                                : const Text(
                                    'Update Password',
                                    style: TextStyle(
                                        fontWeight: FontWeight.w700,
                                        fontSize: 15),
                                  ),
                          ),
                        ),
                        const SizedBox(height: 8),
                      ],
                    ),
                  ),
                ),
              ),
            );
          },
        );
      },
    );
  }

  void _showSignOutSheet(BuildContext context, AuthProvider authProv) {
    HapticFeedback.mediumImpact();
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (ctx) => Container(
        padding: const EdgeInsets.fromLTRB(24, 12, 24, 32),
        decoration: const BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4.5,
                decoration: BoxDecoration(
                  color: const Color(0xFFE2E8F0),
                  borderRadius: BorderRadius.circular(3),
                ),
              ),
            ),
            const SizedBox(height: 20),
            const Text(
              'Sign out?',
              style: TextStyle(
                color: Color(0xFF0F172A),
                fontSize: 18,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 6),
            const Text(
              'This will sign you out and return to the welcome screen.',
              style: TextStyle(
                color: Color(0xFF475569),
                fontSize: 13.5,
                height: 1.4,
              ),
            ),
            const SizedBox(height: 24),
            SizedBox(
              width: double.infinity,
              height: 48,
              child: ElevatedButton(
                onPressed: () async {
                  Navigator.pop(ctx);
                  context.read<SafetySessionProvider>().resetSession();
                  await authProv.signOut();

                  if (context.mounted) {
                    Navigator.pushAndRemoveUntil(
                      context,
                      PageRouteBuilder(
                        pageBuilder: (_, __, ___) => const LandingScreen(),
                        transitionsBuilder: (_, animation, __, child) {
                          return FadeTransition(
                              opacity: animation, child: child);
                        },
                        transitionDuration: const Duration(milliseconds: 350),
                      ),
                      (route) => false,
                    );
                  }
                },
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFFEF4444),
                  foregroundColor: Colors.white,
                  elevation: 0,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
                child: const Text('Sign out',
                    style:
                        TextStyle(fontWeight: FontWeight.w600, fontSize: 15)),
              ),
            ),
            const SizedBox(height: 8),
            SizedBox(
              width: double.infinity,
              height: 44,
              child: TextButton(
                onPressed: () => Navigator.pop(ctx),
                child: const Text(
                  'Cancel',
                  style: TextStyle(
                    color: Color(0xFF64748B),
                    fontSize: 14,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
