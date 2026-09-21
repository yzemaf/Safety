import 'package:flutter/material.dart';

class PulsingRadarWidget extends StatefulWidget {
  final Color pulseColor;
  final double size;
  final Widget child;
  final bool isPulsing;
  final Duration? duration;
  final int ringCount;
  final double borderWidth;
  final double maxFillOpacity;

  const PulsingRadarWidget({
    super.key,
    required this.pulseColor,
    required this.size,
    required this.child,
    this.isPulsing = true,
    this.duration,
    this.ringCount = 3,
    this.borderWidth = 1.8,
    this.maxFillOpacity = 0.18,
  });

  @override
  State<PulsingRadarWidget> createState() => _PulsingRadarWidgetState();
}

class _PulsingRadarWidgetState extends State<PulsingRadarWidget>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _curvedAnimation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: widget.duration ?? const Duration(milliseconds: 2000),
    );
    // Cubic bezier curve matching admin panel radar-pulse easing
    _curvedAnimation = CurvedAnimation(
      parent: _controller,
      curve: const Cubic(0.215, 0.61, 0.355, 1.0),
    );
    if (widget.isPulsing) {
      _controller.repeat();
    }
  }

  @override
  void didUpdateWidget(covariant PulsingRadarWidget oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.duration != oldWidget.duration && widget.duration != null) {
      _controller.duration = widget.duration;
    }
    if (widget.isPulsing && !_controller.isAnimating) {
      _controller.repeat();
    } else if (!widget.isPulsing && _controller.isAnimating) {
      _controller.stop();
      _controller.reset();
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!widget.isPulsing) {
      return SizedBox(
        width: widget.size,
        height: widget.size,
        child: Center(child: widget.child),
      );
    }

    return AnimatedBuilder(
      animation: _curvedAnimation,
      builder: (context, child) {
        final progress = _curvedAnimation.value;
        final count = widget.ringCount.clamp(1, 4);

        return SizedBox(
          width: widget.size,
          height: widget.size,
          child: Stack(
            alignment: Alignment.center,
            children: [
              for (int i = count - 1; i >= 0; i--)
                _buildPulseRing(
                  (progress + (i / count)) % 1.0,
                  1.0 - (i * 0.15),
                  widget.maxFillOpacity * (1.0 + (i * 0.3)),
                ),
              // Center Child Pin / Avatar
              widget.child,
            ],
          ),
        );
      },
    );
  }

  Widget _buildPulseRing(double progress, double maxScale, double maxOpacity) {
    // Start at 0.55 scale, expand to full maxScale while fading opacity
    final scale = 0.55 + (progress * (maxScale - 0.55));
    final currentOpacity = ((1.0 - progress) * maxOpacity).clamp(0.0, 1.0);
    final borderOpacity = ((1.0 - progress) * 0.90).clamp(0.0, 1.0);

    return Transform.scale(
      scale: scale,
      child: Container(
        width: widget.size,
        height: widget.size,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          border: Border.all(
            color: widget.pulseColor.withOpacity(borderOpacity),
            width: widget.borderWidth,
          ),
          color: widget.pulseColor.withOpacity(currentOpacity),
        ),
      ),
    );
  }
}
