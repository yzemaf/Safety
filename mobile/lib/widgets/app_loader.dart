import 'dart:math' as math;
import 'package:flutter/material.dart';

/// Lightweight, native Dual Ring Spinner matching Flutter SpinKit Dual Ring.
/// Compatible with all Flutter versions without breaking SDK changes.
class SpinKitDualRing extends StatefulWidget {
  final Color color;
  final double size;
  final double lineWidth;
  final Duration duration;

  const SpinKitDualRing({
    super.key,
    required this.color,
    this.size = 20.0,
    this.lineWidth = 2.0,
    this.duration = const Duration(milliseconds: 1000),
  });

  @override
  State<SpinKitDualRing> createState() => _SpinKitDualRingState();
}

class _SpinKitDualRingState extends State<SpinKitDualRing>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _animation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(vsync: this, duration: widget.duration)
      ..repeat();
    _animation = Tween(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(parent: _controller, curve: Curves.linear),
    );
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Center(
      child: SizedBox.fromSize(
        size: Size.square(widget.size),
        child: AnimatedBuilder(
          animation: _animation,
          builder: (context, child) {
            return Transform.rotate(
              angle: _animation.value * 2 * math.pi,
              child: CustomPaint(
                painter: _DualRingPainter(
                  color: widget.color,
                  lineWidth: widget.lineWidth,
                ),
              ),
            );
          },
        ),
      ),
    );
  }
}

class _DualRingPainter extends CustomPainter {
  final Color color;
  final double lineWidth;

  _DualRingPainter({required this.color, required this.lineWidth});

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..strokeWidth = lineWidth
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round;

    final rect = Rect.fromLTWH(
      lineWidth / 2,
      lineWidth / 2,
      size.width - lineWidth,
      size.height - lineWidth,
    );

    // Two opposing 90-degree curved arcs
    canvas.drawArc(rect, 0.0, math.pi / 2, false, paint);
    canvas.drawArc(rect, math.pi, math.pi / 2, false, paint);
  }

  @override
  bool shouldRepaint(covariant _DualRingPainter oldDelegate) =>
      oldDelegate.color != color || oldDelegate.lineWidth != lineWidth;
}

/// Convenience wrapper for AppDualRingLoader
class AppDualRingLoader extends StatelessWidget {
  final Color color;
  final double size;
  final double lineWidth;

  const AppDualRingLoader({
    super.key,
    this.color = const Color(0xFF1B8529),
    this.size = 18.0,
    this.lineWidth = 2.0,
  });

  @override
  Widget build(BuildContext context) {
    return SpinKitDualRing(
      color: color,
      size: size,
      lineWidth: lineWidth,
    );
  }
}
