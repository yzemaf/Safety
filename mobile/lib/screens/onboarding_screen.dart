import 'package:flutter/material.dart';
import 'package:liquid_swipe/liquid_swipe.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../config/constants.dart';
import '../main.dart';
import '../providers/safety_session_provider.dart';
import 'main_navigation_screen.dart';

class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({super.key});

  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> {
  int _page = 0;
  late LiquidController _liquidController;

  @override
  void initState() {
    super.initState();
    _liquidController = LiquidController();
  }

  void _onPageChangeCallback(int activePageIndex) {
    setState(() {
      _page = activePageIndex;
    });
  }

  Future<void> _finishOnboarding() async {
    final sessionProv = context.read<SafetySessionProvider>();
    // Directly request location permission when user taps Get Started
    await sessionProv.locationService.requestLocationPermission(openSettingsIfDenied: false);

    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(AppConstants.keyHasSeenOnboarding, true);

    if (!mounted) return;
    Navigator.pushAndRemoveUntil(
      context,
      PageRouteBuilder(
        pageBuilder: (_, __, ___) => MainNavigationScreen(key: mainNavKey),
        transitionsBuilder: (_, animation, __, child) {
          return FadeTransition(opacity: animation, child: child);
        },
        transitionDuration: const Duration(milliseconds: 300),
      ),
      (route) => false,
    );
  }

  @override
  Widget build(BuildContext context) {
    final pages = [
      _buildStandardPage(
        bgColor: Colors.white,
        accentColor: const Color(0xFF1B8529),
        tag: 'HEARTBEAT PROTECTION',
        title: 'Active Safety Walk',
        description:
            'Activate Safety Mode before you walk. Location access is a must so our security can monitor your path and confirm you are safe.',
        icon: Icons.power_settings_new_rounded,
        imageAsset: 'assets/images/safety.jpg',
      ),
      _buildStandardPage(
        bgColor: const Color(0xFFECFDF5),
        accentColor: const Color(0xFF0284C7),
        tag: 'COMMUNITY RADAR',
        title: 'Live Threat Mapping',
        description:
            'Interactive map showing local incidents, hazards, and real time neighborhood threats or risks near you. You can also check for safety mappings around other communities.',
        icon: Icons.radar_rounded,
      ),
      _buildReportThreatsPage(),
      _buildStandardPage(
        bgColor: const Color(0xFFFEF2F2),
        accentColor: const Color(0xFFEF4444),
        tag: 'EMERGENCY ESCALATION',
        title: 'Instant Voice & Dispatch',
        description:
            'If a security check-in is missed, dispatchers get alerted and may attempt to contact you immediately to ensure your safety.',
        icon: Icons.emergency_rounded,
      ),
      _buildConfigurationsPage(),
    ];

    return Scaffold(
      body: Stack(
        children: [
          LiquidSwipe(
            pages: pages,
            liquidController: _liquidController,
            onPageChangeCallback: _onPageChangeCallback,
            waveType: WaveType.liquidReveal,
            fullTransitionValue: 400,
            enableLoop: false,
            ignoreUserGestureWhileAnimating: true,
          ),

          // Top Skip Button
          Positioned(
            top: 50,
            right: 20,
            child: TextButton(
              onPressed: _finishOnboarding,
              child: const Text(
                'Skip',
                style: TextStyle(
                  color: Color(0xFF64748B),
                  fontSize: 15,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ),

          // Bottom Navigation Indicator & Actions
          Positioned(
            bottom: 40,
            left: 24,
            right: 24,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                // Page Indicator Dots
                Row(
                  children: List.generate(pages.length, (index) {
                    final isSelected = _page == index;
                    return AnimatedContainer(
                      duration: const Duration(milliseconds: 200),
                      margin: const EdgeInsets.only(right: 6),
                      width: isSelected ? 24 : 8,
                      height: 8,
                      decoration: BoxDecoration(
                        color: isSelected
                            ? const Color(0xFF1B8529)
                            : const Color(0xFFCBD5E1),
                        borderRadius: BorderRadius.circular(4),
                      ),
                    );
                  }),
                ),

                // Next / Get Started Action
                if (_page == pages.length - 1)
                  ElevatedButton.icon(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF1B8529),
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 14),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(16),
                      ),
                      elevation: 2,
                    ),
                    icon: const Text(
                      'Get Started',
                      style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800),
                    ),
                    label: const Icon(Icons.arrow_forward_rounded, size: 18),
                    onPressed: _finishOnboarding,
                  )
                else
                  IconButton.filled(
                    style: IconButton.styleFrom(
                      backgroundColor: const Color(0xFF1B8529),
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.all(14),
                    ),
                    icon: const Icon(Icons.arrow_forward_ios_rounded, size: 18),
                    onPressed: () {
                      _liquidController.animateToPage(
                        page: _page + 1,
                        duration: 300,
                      );
                    },
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildStandardPage({
    required Color bgColor,
    required Color accentColor,
    required String tag,
    required String title,
    required String description,
    required IconData icon,
    String? imageAsset,
  }) {
    return Container(
      color: bgColor,
      padding: const EdgeInsets.symmetric(horizontal: 32),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Graphic Hero
          Center(
            child: Container(
              width: 130,
              height: 130,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: Colors.white,
                border: Border.all(color: accentColor.withOpacity(0.4), width: 3),
                boxShadow: [
                  BoxShadow(
                    color: accentColor.withOpacity(0.18),
                    blurRadius: 30,
                    offset: const Offset(0, 10),
                  ),
                ],
              ),
              child: Center(
                child: imageAsset != null
                    ? ClipOval(
                        child: Image.asset(
                          imageAsset,
                          width: 124,
                          height: 124,
                          fit: BoxFit.cover,
                        ),
                      )
                    : Icon(icon, size: 60, color: accentColor),
              ),
            ),
          ),
          const SizedBox(height: 40),

          // Tag Pill
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            decoration: BoxDecoration(
              color: accentColor.withOpacity(0.12),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: accentColor.withOpacity(0.3)),
            ),
            child: Text(
              tag,
              style: TextStyle(
                color: accentColor,
                fontSize: 11,
                fontWeight: FontWeight.w800,
                letterSpacing: 0.6,
              ),
            ),
          ),
          const SizedBox(height: 14),

          // Title
          Text(
            title,
            style: const TextStyle(
              color: Color(0xFF0F172A),
              fontSize: 32,
              fontWeight: FontWeight.w900,
              letterSpacing: -0.8,
              height: 1.15,
            ),
          ),
          const SizedBox(height: 12),

          // Description
          Text(
            description,
            style: const TextStyle(
              color: Color(0xFF64748B),
              fontSize: 15,
              height: 1.5,
              fontWeight: FontWeight.w500,
            ),
          ),
          const SizedBox(height: 60),
        ],
      ),
    );
  }

  Widget _buildReportThreatsPage() {
    const accentColor = Color(0xFFD97706);

    return Container(
      color: Colors.white,
      padding: const EdgeInsets.symmetric(horizontal: 32),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Graphic Hero
          Center(
            child: Container(
              width: 130,
              height: 130,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: Colors.white,
                border: Border.all(color: accentColor.withOpacity(0.4), width: 3),
                boxShadow: [
                  BoxShadow(
                    color: accentColor.withOpacity(0.18),
                    blurRadius: 30,
                    offset: const Offset(0, 10),
                  ),
                ],
              ),
              child: const Center(
                child: Icon(Icons.campaign_rounded, size: 60, color: accentColor),
              ),
            ),
          ),
          const SizedBox(height: 40),

          // Tag Pill
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            decoration: BoxDecoration(
              color: accentColor.withOpacity(0.12),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: accentColor.withOpacity(0.3)),
            ),
            child: const Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.auto_awesome_rounded, size: 12, color: Color(0xFF8B5CF6)),
                SizedBox(width: 5),
                Text(
                  'REPORT & AI BRIEFS',
                  style: TextStyle(
                    color: accentColor,
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 0.6,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),

          // Title
          const Text(
            'Report Threats',
            style: TextStyle(
              color: Color(0xFF0F172A),
              fontSize: 32,
              fontWeight: FontWeight.w900,
              letterSpacing: -0.8,
              height: 1.15,
            ),
          ),
          const SizedBox(height: 16),

          // Paragraph 1: Reporting & Area Reports
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: const EdgeInsets.only(top: 2),
                child: Icon(
                  Icons.campaign_rounded,
                  size: 20,
                  color: accentColor,
                ),
              ),
              const SizedBox(width: 12),
              const Expanded(
                child: Text(
                  'Report any danger easily to protect people around you, and view all incident reports from any neighborhood or community.',
                  style: TextStyle(
                    color: Color(0xFF64748B),
                    fontSize: 14.5,
                    height: 1.45,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ),
            ],
          ),

          const SizedBox(height: 14),

          // Paragraph 2: AI Summaries & Briefs
          const Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: EdgeInsets.only(top: 2),
                child: Icon(
                  Icons.auto_awesome_rounded,
                  size: 20,
                  color: Color(0xFF8B5CF6),
                ),
              ),
              SizedBox(width: 12),
              Expanded(
                child: Text(
                  'Our built-in AI assists you with quick, clear safety summaries and briefs of what is happening across any area.',
                  style: TextStyle(
                    color: Color(0xFF64748B),
                    fontSize: 14.5,
                    height: 1.45,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ),
            ],
          ),

          const SizedBox(height: 60),
        ],
      ),
    );
  }

  Widget _buildConfigurationsPage() {
    const accentColor = Color(0xFF1B8529);

    final configs = [
      (
        icon: Icons.timer_outlined,
        title: 'Check-In Timer',
        desc: 'Set periodic intervals (5–30 min) to verify you are safe during active walks.',
      ),
      (
        icon: Icons.hourglass_top_rounded,
        title: 'Grace Period',
        desc: 'Customize the response window (15–60s) before emergency escalation triggers.',
      ),
      (
        icon: Icons.phone_in_talk_rounded,
        title: 'Call Mode',
        desc: 'Choose hands-free auto-answer on speaker or standard ring for security voice links.',
      ),
      (
        icon: Icons.contact_emergency_rounded,
        title: 'Emergency Contact',
        desc: 'Assign trusted contacts who receive immediate alerts and live location if safety triggers.',
      ),
    ];

    return Container(
      color: Colors.white,
      padding: const EdgeInsets.fromLTRB(28, 48, 28, 100),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Tag Pill
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            decoration: BoxDecoration(
              color: accentColor.withOpacity(0.12),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: accentColor.withOpacity(0.3)),
            ),
            child: const Text(
              'CUSTOM PROTECTION',
              style: TextStyle(
                color: Color(0xFF1B8529),
                fontSize: 11,
                fontWeight: FontWeight.w800,
                letterSpacing: 0.6,
              ),
            ),
          ),
          const SizedBox(height: 12),

          // Title
          const Text(
            'Personalized Settings',
            style: TextStyle(
              color: Color(0xFF0F172A),
              fontSize: 28,
              fontWeight: FontWeight.w900,
              letterSpacing: -0.6,
              height: 1.15,
            ),
          ),
          const SizedBox(height: 6),

          // Subtitle
          const Text(
            'Configure your security settings to fit your exact routine:',
            style: TextStyle(
              color: Color(0xFF64748B),
              fontSize: 13.5,
              height: 1.35,
              fontWeight: FontWeight.w500,
            ),
          ),
          const SizedBox(height: 20),

          // 4 Config Rows / Cards
          ...configs.map(
            (c) => Container(
              margin: const EdgeInsets.only(bottom: 10),
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
              decoration: BoxDecoration(
                color: const Color(0xFFF8FAFC),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: const Color(0xFFE2E8F0)),
              ),
              child: Row(
                children: [
                  Container(
                    width: 36,
                    height: 36,
                    decoration: BoxDecoration(
                      color: accentColor.withOpacity(0.1),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Icon(c.icon, size: 19, color: accentColor),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          c.title,
                          style: const TextStyle(
                            color: Color(0xFF0F172A),
                            fontSize: 13.5,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          c.desc,
                          style: const TextStyle(
                            color: Color(0xFF64748B),
                            fontSize: 12,
                            height: 1.3,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
