import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../config/constants.dart';
import '../providers/auth_provider.dart';
import '../providers/safety_session_provider.dart';
import '../providers/settings_provider.dart';
import '../main.dart';
import '../widgets/app_loader.dart';
import '../widgets/in_app_notification.dart';
import 'main_navigation_screen.dart';
import 'onboarding_screen.dart';
import 'sign_up_screen.dart';

class SignInScreen extends StatefulWidget {
  const SignInScreen({super.key});

  @override
  State<SignInScreen> createState() => _SignInScreenState();
}

class _SignInScreenState extends State<SignInScreen> {
  final _emailCtrl = TextEditingController(
    text: kDebugMode ? 'fame@gmail.com' : '',
  );
  final _passwordCtrl = TextEditingController(
    text: kDebugMode ? '123456' : '',
  );

  bool _obscurePassword = true;
  bool _isLoading = false;

  @override
  void dispose() {
    _emailCtrl.dispose();
    _passwordCtrl.dispose();
    super.dispose();
  }

  Future<void> _handleSignIn() async {
    final email = _emailCtrl.text.trim();
    final password = _passwordCtrl.text.trim();

    if (email.isEmpty || !email.contains('@') || !email.contains('.')) {
      AppNotification.show(
        context,
        message: 'Please enter a valid email address',
        type: NotificationType.warning,
      );
      return;
    }

    if (password.isEmpty) {
      AppNotification.show(
        context,
        message: 'Please enter your password',
        type: NotificationType.warning,
      );
      return;
    }

    setState(() => _isLoading = true);
    final authProv = context.read<AuthProvider>();

    final success = await authProv.signInUser(
      email: email,
      password: password,
    );

    if (mounted) {
      setState(() => _isLoading = false);
      if (success) {
        context.read<SafetySessionProvider>().resetSession();
        context.read<SettingsProvider>().syncFromUser(authProv.user);
        AppNotification.show(
          context,
          message: 'Signed in successfully!',
          type: NotificationType.success,
        );

        final prefs = await SharedPreferences.getInstance();
        final hasSeenOnboarding = prefs.getBool(AppConstants.keyHasSeenOnboarding) ?? false;

        if (!mounted) return;
        Navigator.pushAndRemoveUntil(
          context,
          MaterialPageRoute(
            builder: (_) => hasSeenOnboarding
                ? MainNavigationScreen(key: mainNavKey)
                : const OnboardingScreen(),
          ),
          (route) => false,
        );
      } else {
        AppNotification.show(
          context,
          message: 'Sign in failed. Please check your credentials.',
          type: NotificationType.error,
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        scrolledUnderElevation: 0,
        leading: IconButton(
          icon: const Icon(
            Icons.arrow_back_ios_new_rounded,
            color: Color(0xFF0F172A),
            size: 18,
          ),
          onPressed: () => Navigator.pop(context),
        ),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(1.0),
          child: Container(color: const Color(0xFFF1F5F9), height: 1.0),
        ),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          physics: const BouncingScrollPhysics(),
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Header Title & Subtitle
              const Text(
                'Welcome Back',
                style: TextStyle(
                  color: Color(0xFF0F172A),
                  fontSize: 24,
                  fontWeight: FontWeight.w800,
                  letterSpacing: -0.5,
                ),
              ),
              const SizedBox(height: 6),
              const Text(
                'Sign in to access your continuous telemetry and community radar.',
                style: TextStyle(
                  color: Color(0xFF64748B),
                  fontSize: 14,
                  height: 1.4,
                ),
              ),
              const SizedBox(height: 32),

              // Email Field
              _buildInputField(
                controller: _emailCtrl,
                label: 'Email address',
                hint: 'john.doe@example.com',
                keyboardType: TextInputType.emailAddress,
              ),
              const SizedBox(height: 18),

              // Password Field
              _buildInputField(
                controller: _passwordCtrl,
                label: 'Password',
                hint: '••••••••',
                obscureText: _obscurePassword,
                suffixIcon: IconButton(
                  icon: Icon(
                    _obscurePassword
                        ? Icons.visibility_off_outlined
                        : Icons.visibility_outlined,
                    color: const Color(0xFF94A3B8),
                    size: 20,
                  ),
                  onPressed: () {
                    setState(() => _obscurePassword = !_obscurePassword);
                  },
                ),
              ),
              const SizedBox(height: 36),

              // Sign In Button
              SizedBox(
                width: double.infinity,
                height: 52,
                child: ElevatedButton(
                  onPressed: _isLoading ? null : _handleSignIn,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF1B8529),
                    foregroundColor: Colors.white,
                    elevation: 0,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                    ),
                    disabledBackgroundColor: const Color(0xFF1B8529).withOpacity(0.6),
                  ),
                  child: _isLoading
                      ? const SpinKitDualRing(
                          color: Colors.white,
                          size: 20,
                          lineWidth: 2.2,
                        )
                      : const Text(
                          'Sign In',
                          style: TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.w700,
                            letterSpacing: 0.2,
                          ),
                        ),
                ),
              ),
              const SizedBox(height: 24),

              // Register Link
              Center(
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Text(
                      "Don't have an account? ",
                      style: TextStyle(
                        color: Color(0xFF64748B),
                        fontSize: 14,
                      ),
                    ),
                    GestureDetector(
                      onTap: () {
                        Navigator.pushReplacement(
                          context,
                          MaterialPageRoute(builder: (_) => const SignUpScreen()),
                        );
                      },
                      child: const Text(
                        'Get Started',
                        style: TextStyle(
                          color: Color(0xFF1B8529),
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 20),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildInputField({
    required TextEditingController controller,
    required String label,
    required String hint,
    TextInputType keyboardType = TextInputType.text,
    bool obscureText = false,
    Widget? suffixIcon,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: const TextStyle(
            color: Color(0xFF0F172A),
            fontSize: 13,
            fontWeight: FontWeight.w600,
          ),
        ),
        const SizedBox(height: 7),
        TextField(
          controller: controller,
          keyboardType: keyboardType,
          obscureText: obscureText,
          style: const TextStyle(
            color: Color(0xFF0F172A),
            fontSize: 14.5,
            fontWeight: FontWeight.w500,
          ),
          decoration: InputDecoration(
            hintText: hint,
            hintStyle: const TextStyle(
              color: Color(0xFF94A3B8),
              fontSize: 14,
            ),
            suffixIcon: suffixIcon,
            filled: true,
            fillColor: const Color(0xFFF8FAFC),
            contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(color: Color(0xFFE2E8F0)),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(color: Color(0xFFE2E8F0)),
            ),
            focusedBorder: const OutlineInputBorder(
              borderRadius: BorderRadius.all(Radius.circular(12)),
              borderSide: BorderSide(color: Color(0xFF1B8529), width: 1.5),
            ),
          ),
        ),
      ],
    );
  }
}
