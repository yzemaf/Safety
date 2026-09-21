import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import '../providers/auth_provider.dart';
import 'app_loader.dart';
import 'in_app_notification.dart';

enum SafetyPinMode {
  verify, // Verify PIN to deactivate emergency
  setup,  // Setup new 4-digit PIN
  change, // Change existing 4-digit PIN
}

class SafetyPinSheet extends StatefulWidget {
  final SafetyPinMode mode;
  final String? customTitle;
  final String? customSubtitle;

  const SafetyPinSheet({
    super.key,
    this.mode = SafetyPinMode.verify,
    this.customTitle,
    this.customSubtitle,
  });

  /// Helper to prompt user to verify PIN (e.g. turning off emergency mode). Returns true if verified.
  static Future<bool> showVerify(
    BuildContext context, {
    String? title,
    String? subtitle,
  }) async {
    final result = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      enableDrag: true,
      builder: (ctx) => SafetyPinSheet(
        mode: SafetyPinMode.verify,
        customTitle: title,
        customSubtitle: subtitle,
      ),
    );
    return result == true;
  }

  /// Helper to prompt user to set up their initial PIN. Returns true if created.
  static Future<bool> showSetup(
    BuildContext context, {
    String? title,
    String? subtitle,
  }) async {
    final result = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      enableDrag: true,
      builder: (ctx) => SafetyPinSheet(
        mode: SafetyPinMode.setup,
        customTitle: title,
        customSubtitle: subtitle,
      ),
    );
    return result == true;
  }

  /// Helper to change PIN from settings. Returns true if changed.
  static Future<bool> showChange(BuildContext context) async {
    final result = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      enableDrag: true,
      builder: (ctx) => const SafetyPinSheet(
        mode: SafetyPinMode.change,
      ),
    );
    return result == true;
  }

  @override
  State<SafetyPinSheet> createState() => _SafetyPinSheetState();
}

class _SafetyPinSheetState extends State<SafetyPinSheet>
    with SingleTickerProviderStateMixin {
  String _enteredPin = '';
  String _firstEnteredPin = '';
  String _currentOldPin = '';
  int _step = 0; // for setup (0: enter, 1: confirm) or change (0: old, 1: new, 2: confirm)
  bool _isLoading = false;
  String? _errorMessage;

  late AnimationController _shakeController;
  late Animation<double> _shakeAnimation;

  @override
  void initState() {
    super.initState();
    _shakeController = AnimationController(
      duration: const Duration(milliseconds: 400),
      vsync: this,
    );
    _shakeAnimation = TweenSequence<double>([
      TweenSequenceItem(tween: Tween(begin: 0.0, end: -10.0), weight: 1),
      TweenSequenceItem(tween: Tween(begin: -10.0, end: 10.0), weight: 2),
      TweenSequenceItem(tween: Tween(begin: 10.0, end: -10.0), weight: 2),
      TweenSequenceItem(tween: Tween(begin: -10.0, end: 10.0), weight: 2),
      TweenSequenceItem(tween: Tween(begin: 10.0, end: 0.0), weight: 1),
    ]).animate(CurvedAnimation(
      parent: _shakeController,
      curve: Curves.easeInOut,
    ));
  }

  @override
  void dispose() {
    _shakeController.dispose();
    super.dispose();
  }

  void _triggerError(String message) {
    HapticFeedback.heavyImpact();
    setState(() {
      _errorMessage = message;
      _enteredPin = '';
    });
    _shakeController.forward(from: 0.0);
  }

  void _onKeyPress(String key) {
    if (_isLoading) return;
    if (_enteredPin.length < 4) {
      HapticFeedback.lightImpact();
      setState(() {
        _errorMessage = null;
        _enteredPin += key;
      });

      if (_enteredPin.length == 4) {
        _handleCompletePin(_enteredPin);
      }
    }
  }

  void _onDelete() {
    if (_isLoading || _enteredPin.isEmpty) return;
    HapticFeedback.selectionClick();
    setState(() {
      _errorMessage = null;
      _enteredPin = _enteredPin.substring(0, _enteredPin.length - 1);
    });
  }

  void _onClear() {
    if (_isLoading || _enteredPin.isEmpty) return;
    HapticFeedback.selectionClick();
    setState(() {
      _errorMessage = null;
      _enteredPin = '';
    });
  }

  Future<void> _handleCompletePin(String pin) async {
    final authProv = Provider.of<AuthProvider>(context, listen: false);

    if (widget.mode == SafetyPinMode.verify) {
      setState(() => _isLoading = true);
      final isValid = await authProv.verifySafetyPin(pin);
      if (!mounted) return;
      setState(() => _isLoading = false);

      if (isValid) {
        HapticFeedback.mediumImpact();
        Navigator.pop(context, true);
      } else {
        _triggerError('Incorrect Safety PIN. Please try again.');
      }
    } else if (widget.mode == SafetyPinMode.setup) {
      if (_step == 0) {
        // Step 0: Save first entry and prompt confirmation
        setState(() {
          _firstEnteredPin = pin;
          _enteredPin = '';
          _step = 1;
        });
      } else {
        // Step 1: Check match
        if (pin == _firstEnteredPin) {
          setState(() => _isLoading = true);
          final res = await authProv.setSafetyPin(pin);
          if (!mounted) return;
          setState(() => _isLoading = false);

          if (res['success'] == true) {
            HapticFeedback.mediumImpact();
            AppNotification.show(
              context,
              message: 'Safety PIN created successfully.',
              type: NotificationType.success,
            );
            Navigator.pop(context, true);
          } else {
            _triggerError(res['error'] ?? 'Failed to save PIN.');
          }
        } else {
          _triggerError('PINs did not match. Enter 4-digit PIN again.');
          setState(() {
            _step = 0;
            _firstEnteredPin = '';
          });
        }
      }
    } else if (widget.mode == SafetyPinMode.change) {
      if (_step == 0) {
        // Step 0: Verify current PIN
        setState(() => _isLoading = true);
        final isValid = await authProv.verifySafetyPin(pin);
        if (!mounted) return;
        setState(() => _isLoading = false);

        if (isValid) {
          setState(() {
            _currentOldPin = pin;
            _enteredPin = '';
            _step = 1;
          });
        } else {
          _triggerError('Current PIN is incorrect.');
        }
      } else if (_step == 1) {
        // Step 1: Save new PIN and prompt confirmation
        setState(() {
          _firstEnteredPin = pin;
          _enteredPin = '';
          _step = 2;
        });
      } else {
        // Step 2: Confirm new PIN
        if (pin == _firstEnteredPin) {
          setState(() => _isLoading = true);
          final res = await authProv.changeSafetyPin(
            currentPin: _currentOldPin,
            newPin: pin,
          );
          if (!mounted) return;
          setState(() => _isLoading = false);

          if (res['success'] == true) {
            HapticFeedback.mediumImpact();
            AppNotification.show(
              context,
              message: 'Safety PIN changed successfully.',
              type: NotificationType.success,
            );
            Navigator.pop(context, true);
          } else {
            _triggerError(res['error'] ?? 'Failed to update PIN.');
          }
        } else {
          _triggerError('New PINs did not match. Enter new PIN again.');
          setState(() {
            _step = 1;
            _firstEnteredPin = '';
          });
        }
      }
    }
  }

  String _getTitle() {
    if (widget.customTitle != null && widget.mode == SafetyPinMode.verify) {
      return widget.customTitle!;
    }
    switch (widget.mode) {
      case SafetyPinMode.verify:
        return 'Turn Off Emergency';
      case SafetyPinMode.setup:
        return _step == 0 ? 'Create Safety PIN' : 'Confirm Safety PIN';
      case SafetyPinMode.change:
        if (_step == 0) return 'Current Safety PIN';
        if (_step == 1) return 'New Safety PIN';
        return 'Confirm New PIN';
    }
  }

  String _getSubtitle() {
    if (widget.customSubtitle != null && widget.mode == SafetyPinMode.verify) {
      return widget.customSubtitle!;
    }
    switch (widget.mode) {
      case SafetyPinMode.verify:
        return 'Enter your 4-digit Safety PIN to deactivate emergency mode.';
      case SafetyPinMode.setup:
        return _step == 0
            ? 'Set a 4-digit PIN to securely manage emergency mode.'
            : 'Re-enter your 4-digit PIN to confirm.';
      case SafetyPinMode.change:
        if (_step == 0) return 'Enter your current 4-digit PIN to continue.';
        if (_step == 1) return 'Choose a new 4-digit PIN.';
        return 'Re-enter your new 4-digit PIN to confirm.';
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;
    final safeBottom = MediaQuery.of(context).padding.bottom;

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
            padding: EdgeInsets.fromLTRB(24, 12, 24, safeBottom > 0 ? 12 : 24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                // Platform Drag Handle
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

                // Top Icon (Minimal Squared Border)
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: widget.mode == SafetyPinMode.verify
                        ? const Color(0xFFFEF2F2)
                        : const Color(0xFFF0FDF4),
                    border: Border.all(
                      color: widget.mode == SafetyPinMode.verify
                          ? const Color(0xFFFCA5A5)
                          : const Color(0xFFBBF7D0),
                      width: 1,
                    ),
                  ),
                  child: Icon(
                    widget.mode == SafetyPinMode.verify
                        ? Icons.lock_outline_rounded
                        : Icons.shield_outlined,
                    size: 22,
                    color: widget.mode == SafetyPinMode.verify
                        ? const Color(0xFFDC2626)
                        : const Color(0xFF1B8529),
                  ),
                ),
                const SizedBox(height: 14),

                // Header Title
                Text(
                  _getTitle(),
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    color: Color(0xFF0F172A),
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                    letterSpacing: -0.2,
                  ),
                ),
                const SizedBox(height: 6),

                // Header Subtitle
                Text(
                  _getSubtitle(),
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    color: Color(0xFF64748B),
                    fontSize: 13,
                    height: 1.4,
                  ),
                ),
                const SizedBox(height: 24),

                // 4-Digit Minimal Squared Boxes with Shake Animation
                AnimatedBuilder(
                  animation: _shakeAnimation,
                  builder: (context, child) {
                    return Transform.translate(
                      offset: Offset(_shakeAnimation.value, 0),
                      child: child,
                    );
                  },
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: List.generate(4, (index) {
                      final hasDigit = index < _enteredPin.length;
                      final isCurrent = index == _enteredPin.length;
                      final hasError = _errorMessage != null;

                      Color borderColor;
                      Color bgColor;

                      if (hasError) {
                        borderColor = const Color(0xFFDC2626);
                        bgColor = const Color(0xFFFEF2F2);
                      } else if (hasDigit) {
                        borderColor = const Color(0xFF1B8529);
                        bgColor = const Color(0xFFF0FDF4);
                      } else if (isCurrent) {
                        borderColor = const Color(0xFF0F172A);
                        bgColor = Colors.white;
                      } else {
                        borderColor = const Color(0xFFE2E8F0);
                        bgColor = const Color(0xFFF8FAFC);
                      }

                      return Container(
                        width: 52,
                        height: 56,
                        margin: const EdgeInsets.symmetric(horizontal: 6),
                        decoration: BoxDecoration(
                          color: bgColor,
                          border: Border.all(color: borderColor, width: 1.5),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        alignment: Alignment.center,
                        child: hasDigit
                            ? Container(
                                width: 12,
                                height: 12,
                                decoration: const BoxDecoration(
                                  color: Color(0xFF0F172A),
                                  shape: BoxShape.circle,
                                ),
                              )
                            : (isCurrent
                                ? Container(
                                    width: 2,
                                    height: 18,
                                    color: const Color(0xFF0F172A),
                                  )
                                : null),
                      );
                    }),
                  ),
                ),

                // Error Message or Loading Indicator
                const SizedBox(height: 12),
                SizedBox(
                  height: 24,
                  child: _isLoading
                      ? const Center(
                          child: SizedBox.square(
                            dimension: 20,
                            child: AppDualRingLoader(
                              size: 20,
                              lineWidth: 2.2,
                              color: Color(0xFF1B8529),
                            ),
                          ),
                        )
                      : (_errorMessage != null
                          ? Text(
                              _errorMessage!,
                              textAlign: TextAlign.center,
                              style: const TextStyle(
                                color: Color(0xFFDC2626),
                                fontSize: 12.5,
                                fontWeight: FontWeight.w600,
                              ),
                            )
                          : null),
                ),
                const SizedBox(height: 16),

                // Minimalistic Squared Keypad (3 x 4)
                _buildKeypad(),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildKeypad() {
    return Container(
      constraints: const BoxConstraints(maxWidth: 340),
      child: Column(
        children: [
          Row(
            children: [
              _buildKey('1'),
              const SizedBox(width: 8),
              _buildKey('2'),
              const SizedBox(width: 8),
              _buildKey('3'),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              _buildKey('4'),
              const SizedBox(width: 8),
              _buildKey('5'),
              const SizedBox(width: 8),
              _buildKey('6'),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              _buildKey('7'),
              const SizedBox(width: 8),
              _buildKey('8'),
              const SizedBox(width: 8),
              _buildKey('9'),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              _buildActionKey(
                label: 'Clear',
                onTap: _onClear,
              ),
              const SizedBox(width: 8),
              _buildKey('0'),
              const SizedBox(width: 8),
              _buildActionKey(
                icon: Icons.backspace_outlined,
                onTap: _onDelete,
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildKey(String digit) {
    return Expanded(
      child: InkWell(
        onTap: () => _onKeyPress(digit),
        splashColor: const Color(0xFFE2E8F0),
        highlightColor: const Color(0xFFF1F5F9),
        child: Container(
          height: 54,
          decoration: BoxDecoration(
            color: Colors.white,
            border: Border.all(color: const Color(0xFFE2E8F0), width: 1),
          ),
          alignment: Alignment.center,
          child: Text(
            digit,
            style: const TextStyle(
              fontSize: 22,
              fontWeight: FontWeight.w700,
              color: Color(0xFF0F172A),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildActionKey({
    String? label,
    IconData? icon,
    required VoidCallback onTap,
  }) {
    return Expanded(
      child: InkWell(
        onTap: onTap,
        splashColor: const Color(0xFFE2E8F0),
        highlightColor: const Color(0xFFF1F5F9),
        child: Container(
          height: 54,
          decoration: BoxDecoration(
            color: const Color(0xFFF8FAFC),
            border: Border.all(color: const Color(0xFFE2E8F0), width: 1),
          ),
          alignment: Alignment.center,
          child: icon != null
              ? Icon(
                  icon,
                  size: 20,
                  color: const Color(0xFF475569),
                )
              : Text(
                  label ?? '',
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: Color(0xFF64748B),
                  ),
                ),
        ),
      ),
    );
  }
}
