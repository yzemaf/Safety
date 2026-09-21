import 'package:firebase_core/firebase_core.dart' show FirebaseOptions;
import 'package:flutter/foundation.dart'
    show defaultTargetPlatform, TargetPlatform;

/// Default [FirebaseOptions] for use with your Firebase apps.
///
/// Example:
/// ```dart
/// import 'firebase_options.dart';
/// // ...
/// await Firebase.initializeApp(
///   options: DefaultFirebaseOptions.currentPlatform,
/// );
/// ```
class DefaultFirebaseOptions {
  static FirebaseOptions get currentPlatform {
    switch (defaultTargetPlatform) {
      case TargetPlatform.android:
        return android;
      default:
        throw UnsupportedError(
          'DefaultFirebaseOptions are not configured for this platform.',
        );
    }
  }

  static const FirebaseOptions android = FirebaseOptions(
    apiKey: 'AIzaSyBQsQgMeNJwJT40tMcfT9_m523ECGlXR5o',
    appId: '1:171668239587:android:1816bbcb41dcdd9386c1d6',
    messagingSenderId: '171668239587',
    projectId: 'safety-711a9',
    storageBucket: 'safety-711a9.firebasestorage.app',
    databaseURL: 'https://safety-711a9-default-rtdb.europe-west1.firebasedatabase.app',
  );
}
