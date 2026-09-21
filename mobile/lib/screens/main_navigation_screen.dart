import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import '../providers/incident_provider.dart';
import '../providers/safety_session_provider.dart';
import 'awareness_radar_screen.dart';
import 'report_incident_screen.dart';
import 'safety_mode_screen.dart';
import 'settings_screen.dart';

class MainNavigationScreen extends StatefulWidget {
  const MainNavigationScreen({super.key});

  @override
  State<MainNavigationScreen> createState() => MainNavigationScreenState();
}

class MainNavigationScreenState extends State<MainNavigationScreen> {
  int _currentIndex = 0;

  /// Switches the bottom nav to [tabIndex]. Safe to call from outside the tree.
  void switchToTab(int tabIndex) {
    if (mounted) {
      setState(() => _currentIndex = tabIndex);
    }
  }

  @override
  Widget build(BuildContext context) {
    final sessionProv = context.watch<SafetySessionProvider>();
    final isActive = sessionProv.isActive;
    final isGrace = sessionProv.isGracePeriodActive;
    final isEmergency = sessionProv.isEmergency;

    const Color emergencyDarkRed = Color(0xFF450A0A);
    const Color emergencyNavRed = Color(0xFF380606);
    const Color emergencyBorderRed = Color(0xFF5B0E0E);

    final screens = [
      const SafetyModeScreen(),
      AwarenessRadarScreen(isActive: _currentIndex == 1),
      ReportIncidentScreen(isActive: _currentIndex == 2),
      const SettingsScreen(),
    ];

    return Scaffold(
      backgroundColor: isEmergency ? emergencyDarkRed : const Color(0xFFF8FAFC),
      body: _AnimatedIndexedStack(
        index: _currentIndex,
        children: screens,
      ),
      bottomNavigationBar: AnimatedContainer(
        duration: const Duration(milliseconds: 400),
        curve: Curves.easeInOutCubic,
        decoration: BoxDecoration(
          color: isEmergency ? emergencyNavRed : Colors.white,
          border: Border(
            top: BorderSide(
              color: isEmergency ? emergencyBorderRed : const Color(0xFFF1F5F9),
              width: 1.0,
            ),
          ),
        ),
        child: SafeArea(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceAround,
              children: [
                _buildNavItem(
                  index: 0,
                  icon: Icons.home_outlined,
                  selectedIcon: Icons.home_rounded,
                  label: 'Home',
                  activeColor: isEmergency ? Colors.white : const Color(0xFF1B8529),
                  isEmergency: isEmergency,
                  hasBadge: isActive || isEmergency,
                  badgeColor: isEmergency
                      ? Colors.white
                      : (isGrace ? const Color(0xFFC2410C) : const Color(0xFF1B8529)),
                ),
                _buildNavItem(
                  index: 1,
                  icon: Icons.radar_outlined,
                  selectedIcon: Icons.radar_rounded,
                  label: 'Community',
                  activeColor: isEmergency ? Colors.white : const Color(0xFF1B8529),
                  isEmergency: isEmergency,
                ),
                _buildNavItem(
                  index: 2,
                  icon: Icons.add_location_alt_outlined,
                  selectedIcon: Icons.add_location_alt_rounded,
                  label: 'Report',
                  activeColor: isEmergency ? Colors.white : const Color(0xFF1B8529),
                  isEmergency: isEmergency,
                ),
                _buildNavItem(
                  index: 3,
                  icon: Icons.settings_outlined,
                  selectedIcon: Icons.settings_rounded,
                  label: 'Settings',
                  activeColor: isEmergency ? Colors.white : const Color(0xFF1B8529),
                  isEmergency: isEmergency,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildNavItem({
    required int index,
    required IconData icon,
    required IconData selectedIcon,
    required String label,
    Color activeColor = const Color(0xFF1B8529),
    bool isEmergency = false,
    bool hasBadge = false,
    Color badgeColor = const Color(0xFF1B8529),
  }) {
    final isSelected = _currentIndex == index;
    final unselectedColor = isEmergency
        ? Colors.white.withOpacity(0.55)
        : const Color(0xFF64748B);

    return InkWell(
      onTap: () {
        if (_currentIndex != index) {
          HapticFeedback.selectionClick();
          setState(() => _currentIndex = index);
          if (index == 1 || index == 2) {
            context.read<IncidentProvider>().refreshIncidents();
          }
        }
      },
      borderRadius: BorderRadius.circular(16),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Badge(
              isLabelVisible: hasBadge,
              backgroundColor: badgeColor,
              smallSize: 8,
              child: AnimatedScale(
                scale: isSelected ? 1.05 : 1.0,
                duration: const Duration(milliseconds: 200),
                curve: Curves.easeOutBack,
                child: Icon(
                  isSelected ? selectedIcon : icon,
                  size: 24,
                  color: isSelected ? activeColor : unselectedColor,
                ),
              ),
            ),
            const SizedBox(height: 4),
            Text(
              label,
              style: TextStyle(
                color: isSelected ? activeColor : unselectedColor,
                fontSize: 11,
                fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
                letterSpacing: -0.2,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Smooth cross-fading indexed stack that preserves screen states while animating tab transitions gracefully
class _AnimatedIndexedStack extends StatelessWidget {
  final int index;
  final List<Widget> children;

  const _AnimatedIndexedStack({
    required this.index,
    required this.children,
  });

  @override
  Widget build(BuildContext context) {
    return Stack(
      fit: StackFit.expand,
      children: List.generate(children.length, (i) {
        final isCurrent = i == index;
        return IgnorePointer(
          ignoring: !isCurrent,
          child: AnimatedOpacity(
            duration: const Duration(milliseconds: 250),
            curve: Curves.easeInOutCubic,
            opacity: isCurrent ? 1.0 : 0.0,
            child: children[i],
          ),
        );
      }),
    );
  }
}
