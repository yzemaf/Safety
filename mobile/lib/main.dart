import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'config/theme.dart';
import 'firebase_options.dart';
import 'providers/auth_provider.dart';
import 'providers/incident_provider.dart';
import 'providers/safety_session_provider.dart';
import 'providers/settings_provider.dart';
import 'screens/active_voice_call_screen.dart';
import 'screens/main_navigation_screen.dart';
import 'screens/splash_screen.dart';
import 'services/fcm_service.dart';
import 'services/foreground_call_service.dart';
import 'services/storage_service.dart';
import 'widgets/safety_overlay_widget.dart';

/// Background System Overlay entry point for FlutterOverlayWindow
@pragma("vm:entry-point")
void overlayMain() {
  WidgetsFlutterBinding.ensureInitialized();
  debugPrint('[OverlayMain] Starting overlay entry point...');
  runApp(const MaterialApp(
    debugShowCheckedModeBanner: false,
    home: Scaffold(
      backgroundColor: Colors.transparent,
      body: SafetyOverlayWidget(),
    ),
  ));
}

/// Navigation key so FCM tap handler can navigate from outside widget tree
final GlobalKey<NavigatorState> navigatorKey = GlobalKey<NavigatorState>();

/// Main navigation screen key so FCM tap can switch to Communities tab (index 1)
final GlobalKey<MainNavigationScreenState> mainNavKey =
    GlobalKey<MainNavigationScreenState>();

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Initialize native incoming call receiver channel
  ForegroundCallService.initialize();

  // Initialize offline persistent preferences
  await StorageService.init();

  // Initialize Firebase & FCM with robust error protection
  try {
    await Firebase.initializeApp(
      options: DefaultFirebaseOptions.currentPlatform,
    );

    // Initialize FCM with Incoming Call Ringing & Emergency Alert handlers
    await FcmService.initialize(
      onNotificationTap: (RemoteMessage message) {
        // Switch to Communities / Radar tab (index 1)
        mainNavKey.currentState?.switchToTab(1);
      },
      onIncomingCall: (Map<String, dynamic> callData) {
        final bool autoAnswer = StorageService.loadUser().settings.callHandlingPreference == 'auto_answer_speaker';
        ActiveVoiceCallScreen.show(
          callerName: callData['callerName'] ?? 'Safety Command Dispatcher',
          callerRole: callData['callerRole'] ?? 'Control Room Officer',
          channelName: callData['channelName'] ?? 'safety_channel',
          token: callData['token'],
          sessionId: callData['sessionId'] ?? '',
          userId: callData['userId'] ?? '',
          autoAnswer: autoAnswer,
        );
      },

      onEmergencyAlert: (Map<String, dynamic> alertData) {
        mainNavKey.currentState?.switchToTab(1);
      },
    );
  } catch (e, stack) {
    debugPrint('Firebase/FCM initialization warning: $e\n$stack');
  }

  // Set system UI overlay style for clean white & green aesthetic
  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.dark,
      systemNavigationBarColor: Colors.white,
      systemNavigationBarIconBrightness: Brightness.dark,
    ),
  );

  runApp(const SafetyApp());
}

class SafetyApp extends StatelessWidget {
  const SafetyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => AuthProvider()),
        ChangeNotifierProvider(create: (_) => SettingsProvider()),
        ChangeNotifierProvider(create: (_) => IncidentProvider()),
        ChangeNotifierProvider(create: (_) => SafetySessionProvider()),
      ],
      child: MaterialApp(
        title: 'Safety - Personal Protection & Radar',
        debugShowCheckedModeBanner: false,
        navigatorKey: navigatorKey,
        theme: AppTheme.lightTheme,
        home: const SplashScreen(),
      ),
    );
  }
}
