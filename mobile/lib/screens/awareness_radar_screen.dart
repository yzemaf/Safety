import 'dart:async';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart' as gmaps;
import 'package:flutter_map/flutter_map.dart' as fmap;
import 'package:latlong2/latlong.dart' as latlong;
import 'package:provider/provider.dart';
import '../config/constants.dart';
import '../models/incident_report.dart';
import '../models/jurisdiction.dart';
import '../models/location_point.dart';
import '../providers/incident_provider.dart';
import '../providers/safety_session_provider.dart';
import '../services/boundary_service.dart';
import '../widgets/location_picker_sheet.dart';

enum MapEngine {
  googleMaps,
  openStreetMap,
  list,
}

class AwarenessRadarScreen extends StatefulWidget {
  final bool isActive;
  const AwarenessRadarScreen({super.key, this.isActive = true});

  @override
  State<AwarenessRadarScreen> createState() => _AwarenessRadarScreenState();
}

class _AwarenessRadarScreenState extends State<AwarenessRadarScreen> {
  gmaps.GoogleMapController? _googleMapController;
  final fmap.MapController _fmapController = fmap.MapController();
  MapEngine _activeEngine = MapEngine.openStreetMap;
  bool _isFollowingGps = true;
  bool _isProgrammaticMove = false;
  Timer? _programmaticMoveTimer;

  // Manual searched location state (overrides GPS tracking until user taps Use My Location)
  LocationPoint? _searchedLocation;
  String? _searchedLocationTitle;

  StreamSubscription<LocationPoint>? _locStreamSub;
  LocationPoint? _lastResolvedLocation;
  ResolvedCommunityBoundary? _currentCommunity;
  List<LocationPoint> _boundaryPoints = [];

  // Monotonically incrementing counter: stale async resolves are dropped when generation mismatches
  int _resolveGeneration = 0;

  String? _lastLoadedCommunityId;

  // Google Maps custom marker icon caches
  gmaps.BitmapDescriptor? _userMarkerIcon;
  gmaps.BitmapDescriptor? _searchedMarkerIcon;
  final Map<String, gmaps.BitmapDescriptor> _incidentMarkerIconCache = {};

  @override
  void initState() {
    super.initState();
    BoundaryService.clearCache();
    _initCustomMarkerIcons();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final sessionProv = context.read<SafetySessionProvider>();
      final incidentProv = context.read<IncidentProvider>();
      _initLocationSubscription(sessionProv, incidentProv);
      if (widget.isActive) {
        _syncWithGpsLocation(sessionProv, incidentProv, forceCamera: true);
      }
    });
  }

  @override
  void didUpdateWidget(AwarenessRadarScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.isActive && !oldWidget.isActive) {
      // Screen became visible upon tab switch: auto-recenter to GPS if not viewing manual search
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        final sessionProv = context.read<SafetySessionProvider>();
        final incidentProv = context.read<IncidentProvider>();
        if (_searchedLocation == null) {
          setState(() {
            _isFollowingGps = true;
          });
          _syncWithGpsLocation(sessionProv, incidentProv, forceCamera: true);
        } else {
          _animateCameraToLocation(_searchedLocation!, resetZoom: true);
        }
      });
    }
  }

  void _initLocationSubscription(
    SafetySessionProvider sessionProv,
    IncidentProvider incidentProv,
  ) {
    _locStreamSub?.cancel();
    _locStreamSub = sessionProv.locationService.onLocationChanged.listen((newLoc) {
      if (!mounted) return;
      if (_isFollowingGps && _searchedLocation == null) {
        if (_lastResolvedLocation == null || newLoc.distanceTo(_lastResolvedLocation!) > 35.0) {
          _updateCommunityBoundary(newLoc);
          _animateCameraToLocation(newLoc, resetZoom: false);
          final gen = ++_resolveGeneration;
          BoundaryService.resolveCommunityForLocation(newLoc).then((resolved) {
            if (mounted && gen == _resolveGeneration && _isFollowingGps && _searchedLocation == null) {
              final zone = JurisdictionZone(
                id: resolved.communityName.toLowerCase().replaceAll(RegExp(r'[^a-z0-9]'), '_'),
                name: resolved.communityName,
                code: resolved.stateName ?? incidentProv.activeCommunity.code,
                countryCode: resolved.countryCode ?? incidentProv.activeCommunity.countryCode,
                type: 'community',
                center: newLoc,
                defaultZoom: 14.0,
              );
              _lastLoadedCommunityId = zone.id;
              incidentProv.setActiveCommunity(zone);
            }
          });
        }
      }
    });
  }

  @override
  void dispose() {
    _locStreamSub?.cancel();
    _programmaticMoveTimer?.cancel();
    super.dispose();
  }

  Future<void> _syncWithGpsLocation(
    SafetySessionProvider sessionProv,
    IncidentProvider incidentProv, {
    bool forceCamera = false,
  }) async {
    if (!_isFollowingGps || _searchedLocation != null) return;
    final gen = ++_resolveGeneration;

    LocationPoint loc = sessionProv.locationService.currentLocation;
    if (sessionProv.locationService.hasLocationPermission) {
      final fresh = await sessionProv.locationService.refreshCurrentLocation();
      if (fresh != null) loc = fresh;
    } else {
      final granted = await sessionProv.locationService.requestLocationPermission();
      if (granted) {
        final fresh = await sessionProv.locationService.refreshCurrentLocation();
        if (fresh != null) loc = fresh;
      }
    }

    if (!mounted || gen != _resolveGeneration) return;

    if (forceCamera) {
      _animateCameraToLocation(loc, resetZoom: true);
    }
    _updateCommunityBoundary(loc, forceRefresh: true);

    final resolved = await BoundaryService.resolveCommunityForLocation(loc, forceRefresh: true);
    if (!mounted || gen != _resolveGeneration) return;
    if (_isFollowingGps && _searchedLocation == null) {
      final zone = JurisdictionZone(
        id: resolved.communityName.toLowerCase().replaceAll(RegExp(r'[^a-z0-9]'), '_'),
        name: resolved.communityName,
        code: resolved.stateName ?? incidentProv.activeCommunity.code,
        countryCode: resolved.countryCode ?? incidentProv.activeCommunity.countryCode,
        type: 'community',
        center: loc,
        defaultZoom: 14.0,
      );
      _lastLoadedCommunityId = zone.id;
      incidentProv.setActiveCommunity(zone);
    }
  }

  void _updateCommunityBoundary(LocationPoint loc, {String? communityHint, bool forceRefresh = false}) {
    if (!forceRefresh && communityHint == null && _lastResolvedLocation != null) {
      final dist = loc.distanceTo(_lastResolvedLocation!);
      if (dist < 50.0 && _boundaryPoints.isNotEmpty) {
        return; // Already resolved close by
      }
    }
    _lastResolvedLocation = loc;

    if (forceRefresh) {
      BoundaryService.clearCache();
    }

    // 1. Instant organic harmonic polygon perimeter for zero-latency UI
    final immediate = BoundaryService.getImmediatePerimeter(loc, forceRefresh: forceRefresh);
    final gen = ++_resolveGeneration;
    setState(() {
      if (communityHint != null && communityHint.trim().isNotEmpty) {
        _currentCommunity = ResolvedCommunityBoundary(
          communityName: communityHint.trim(),
          boundary: immediate.boundary,
        );
      } else {
        _currentCommunity = immediate;
      }
      _boundaryPoints = immediate.boundary;
    });

    // 2. Asynchronously resolve global community name via reverse geocoding and OSM administrative polygon
    BoundaryService.resolveCommunityForLocation(
      loc,
      communityHint: communityHint,
      forceRefresh: forceRefresh || communityHint != null,
    ).then((resolved) {
      // Drop stale results — a newer resolve already owns the display
      if (mounted && gen == _resolveGeneration) {
        setState(() {
          _currentCommunity = resolved;
          if (resolved.boundary.isNotEmpty) {
            _boundaryPoints = resolved.boundary;
          }
        });
      }
    });
  }

  void _openLocationPickerSheet(SafetySessionProvider sessionProv) {
    final incidentProv = context.read<IncidentProvider>();
    LocationPickerSheet.show(
      context,
      locationService: sessionProv.locationService,
      onLocationSelected: (loc, [placeTitle]) {
        final isGps = (placeTitle == null);
        if (isGps) {
          _recenterToGps(sessionProv);
          return;
        }
        final commName = placeTitle.trim().isNotEmpty ? placeTitle.trim() : 'Selected Area';
        final zone = JurisdictionZone(
          id: commName.toLowerCase().replaceAll(RegExp(r'[^a-z0-9]'), '_'),
          name: commName,
          code: incidentProv.activeCommunity.code,
          countryCode: incidentProv.activeCommunity.countryCode,
          type: 'community',
          center: loc,
          defaultZoom: 14.0,
        );
        _lastLoadedCommunityId = zone.id;
        incidentProv.setActiveCommunity(zone);

        setState(() {
          _isFollowingGps = false;
          _searchedLocation = loc;
          _searchedLocationTitle = placeTitle;
        });
        _animateCameraToLocation(loc, resetZoom: true);
        _updateCommunityBoundary(loc, communityHint: placeTitle, forceRefresh: true);
      },
    );
  }

  Future<void> _recenterToGps(SafetySessionProvider sessionProv) async {
    final incidentProv = context.read<IncidentProvider>();
    BoundaryService.clearCache();
    _lastResolvedLocation = null;
    setState(() {
      _isFollowingGps = true;
      _searchedLocation = null;
      _searchedLocationTitle = null;
    });

    await _syncWithGpsLocation(sessionProv, incidentProv, forceCamera: true);
  }

  static const double _defaultGoogleMapZoom = 15.2;
  static const double _defaultOpenStreetMapZoom = 14.8;

  void _animateCameraToLocation(LocationPoint loc, {bool resetZoom = true, double? customZoom}) {
    final gZoom = customZoom ?? _defaultGoogleMapZoom;
    final osmZoom = customZoom ?? _defaultOpenStreetMapZoom;

    _isProgrammaticMove = true;
    _programmaticMoveTimer?.cancel();
    _programmaticMoveTimer = Timer(const Duration(milliseconds: 1200), () {
      _isProgrammaticMove = false;
    });

    if (_activeEngine == MapEngine.googleMaps) {
      if (resetZoom) {
        _googleMapController?.animateCamera(
          gmaps.CameraUpdate.newLatLngZoom(gmaps.LatLng(loc.lat, loc.lng), gZoom),
        );
      } else {
        _googleMapController?.animateCamera(
          gmaps.CameraUpdate.newLatLng(gmaps.LatLng(loc.lat, loc.lng)),
        );
      }
    } else if (_activeEngine == MapEngine.openStreetMap) {
      _fmapController.move(
        latlong.LatLng(loc.lat, loc.lng),
        resetZoom ? osmZoom : _fmapController.camera.zoom,
      );
    }
  }

  void _zoomIn() {
    if (_activeEngine == MapEngine.googleMaps) {
      _googleMapController?.animateCamera(gmaps.CameraUpdate.zoomIn());
    } else if (_activeEngine == MapEngine.openStreetMap) {
      final curZoom = _fmapController.camera.zoom;
      _fmapController.move(_fmapController.camera.center, curZoom + 1.0);
    }
  }

  void _zoomOut() {
    if (_activeEngine == MapEngine.googleMaps) {
      _googleMapController?.animateCamera(gmaps.CameraUpdate.zoomOut());
    } else if (_activeEngine == MapEngine.openStreetMap) {
      final curZoom = _fmapController.camera.zoom;
      _fmapController.move(_fmapController.camera.center, curZoom - 1.0);
    }
  }

  @override
  Widget build(BuildContext context) {
    final incidentProv = context.watch<IncidentProvider>();
    final sessionProv = context.watch<SafetySessionProvider>();
    final activeComm = incidentProv.activeCommunity;

    // Automatically re-center and draw boundary whenever active community is explicitly switched
    if (_lastLoadedCommunityId != activeComm.id) {
      _lastLoadedCommunityId = activeComm.id;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) {
          _animateCameraToLocation(activeComm.center, resetZoom: true);
          _updateCommunityBoundary(activeComm.center, communityHint: activeComm.name, forceRefresh: true);
        }
      });
    }

    final userLoc = sessionProv.locationService.currentLocation;
    final incidents = incidentProv.incidents;

    // Trigger auto-border update only when actively in GPS mode and NOT viewing a searched location
    if (_isFollowingGps && _searchedLocation == null) {
      if (_lastResolvedLocation == null || userLoc.distanceTo(_lastResolvedLocation!) > 50.0) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) _updateCommunityBoundary(userLoc);
        });
      }
    }

    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        title: const Text(
          'Community',
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
        actions: [
          IconButton(
            icon: const Icon(Icons.search_rounded, color: Color(0xFF0F172A), size: 22),
            tooltip: 'Search Area',
            onPressed: () => _openLocationPickerSheet(sessionProv),
          ),
          Badge(
            isLabelVisible: incidents.isNotEmpty,
            label: Text(
              '${incidents.length}',
              style: const TextStyle(
                color: Colors.white,
                fontSize: 10.5,
                fontWeight: FontWeight.w700,
              ),
            ),
            backgroundColor: const Color(0xFFEF4444),
            offset: const Offset(-4, 4),
            child: IconButton(
              icon: Icon(
                _activeEngine == MapEngine.list
                    ? Icons.format_list_bulleted_rounded
                    : Icons.map_outlined,
                color: const Color(0xFF0F172A),
                size: 22,
              ),
              tooltip: _activeEngine == MapEngine.list ? 'Reports List View' : 'Map View',
              onPressed: () {
                setState(() {
                  _activeEngine = (_activeEngine == MapEngine.list)
                      ? MapEngine.openStreetMap
                      : MapEngine.list;
                });
              },
            ),
          ),
          const SizedBox(width: 8),
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(1.0),
          child: Container(color: const Color(0xFFF1F5F9), height: 1.0),
        ),
      ),
      body: Column(
        children: [
          // Filter Chips, Location Pill & Clean Auto-Bordered Community Chip
          _buildFilterAndLocationBar(incidentProv, sessionProv),

          // Map or List View
          Expanded(
            child: Stack(
              children: [
                // 1. Map View (Kept persistent to avoid Android PlatformView destroy/recreate crashes)
                Positioned.fill(
                  child: _activeEngine == MapEngine.openStreetMap
                      ? _buildOpenStreetMapView(context, userLoc, incidents, sessionProv)
                      : _buildGoogleMapView(context, userLoc, incidents, sessionProv),
                ),

                // 2. Reports List View overlay
                if (_activeEngine == MapEngine.list)
                  Positioned.fill(
                    child: Container(
                      color: const Color(0xFFF8FAFC),
                      child: _buildListView(context, userLoc, incidents, incidentProv),
                    ),
                  ),

                // Floating Map Controls (Zoom In, Zoom Out, Recenter GPS)
                if (_activeEngine != MapEngine.list)
                  Positioned(
                    bottom: 24,
                    right: 16,
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        // Zoom In Button
                        _buildMapControlButton(
                          icon: Icons.add_rounded,
                          tooltip: 'Zoom In',
                          onPressed: _zoomIn,
                        ),
                        const SizedBox(height: 6),
                        // Zoom Out Button
                        _buildMapControlButton(
                          icon: Icons.remove_rounded,
                          tooltip: 'Zoom Out',
                          onPressed: _zoomOut,
                        ),
                        const SizedBox(height: 10),
                        // Recenter GPS Button
                        _buildMapControlButton(
                          icon: Icons.my_location_rounded,
                          tooltip: 'Recenter GPS',
                          iconColor: const Color(0xFF1B8529),
                          onPressed: () => _recenterToGps(sessionProv),
                        ),
                      ],
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildMapControlButton({
    required IconData icon,
    required String tooltip,
    required VoidCallback onPressed,
    Color iconColor = const Color(0xFF0F172A),
  }) {
    return Tooltip(
      message: tooltip,
      child: Container(
        width: 38,
        height: 38,
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: const Color(0xFFE2E8F0)),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.06),
              blurRadius: 8,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            onTap: onPressed,
            borderRadius: BorderRadius.circular(10),
            child: Center(
              child: Icon(icon, color: iconColor, size: 20),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildFilterAndLocationBar(
    IncidentProvider incidentProv,
    SafetySessionProvider sessionProv,
  ) {
    final selectedCat = incidentProv.selectedCategory;

    return Container(
      color: Colors.white,
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Category Filters (Twitter style horizontal scroll)
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            physics: const BouncingScrollPhysics(),
            child: Row(
              children: [
                _buildFilterPill(
                  label: 'All',
                  isSelected: selectedCat == null,
                  onTap: () => incidentProv.filterByCategory(null),
                ),
                ...IncidentCategory.values.map((cat) {
                  return _buildFilterPill(
                    label: cat.label,
                    isSelected: selectedCat == cat,
                    onTap: () => incidentProv.filterByCategory(cat),
                  );
                }),
              ],
            ),
          ),
          const SizedBox(height: 8),

          // Location Bar: "Use My Location" on the left, Selected Community on the right
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              physics: const BouncingScrollPhysics(),
              child: Row(
                children: [
                  // "Use My Location" Pill (Left)
                  InkWell(
                    onTap: () => _openLocationPickerSheet(sessionProv),
                    borderRadius: BorderRadius.circular(8),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                      decoration: BoxDecoration(
                        color: _searchedLocation == null
                            ? const Color(0xFFF0FDF4)
                            : const Color(0xFFF8FAFC),
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(
                          color: _searchedLocation == null
                              ? const Color(0xFFBBF7D0)
                              : const Color(0xFFE2E8F0),
                        ),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(
                            Icons.near_me_rounded,
                            size: 13,
                            color: _searchedLocation == null
                                ? const Color(0xFF1B8529)
                                : const Color(0xFF64748B),
                          ),
                          const SizedBox(width: 6),
                          Text(
                            'Use My Location',
                            style: TextStyle(
                              color: _searchedLocation == null
                                  ? const Color(0xFF1B8529)
                                  : const Color(0xFF64748B),
                              fontSize: 11.5,
                              fontWeight: _searchedLocation == null
                                  ? FontWeight.w600
                                  : FontWeight.w500,
                            ),
                          ),
                          const SizedBox(width: 4),
                          Icon(
                            Icons.keyboard_arrow_down_rounded,
                            size: 14,
                            color: _searchedLocation == null
                                ? const Color(0xFF1B8529)
                                : const Color(0xFF94A3B8),
                          ),
                        ],
                      ),
                    ),
                  ),

                  const SizedBox(width: 8),

                  // Selected Community / Location Pill (Right)
                  InkWell(
                    onTap: () => _openLocationPickerSheet(sessionProv),
                    borderRadius: BorderRadius.circular(8),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                      decoration: BoxDecoration(
                        color: const Color(0xFFF0FDF4),
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(
                          color: const Color(0xFFBBF7D0),
                        ),
                      ),
                      child: Text(
                        incidentProv.activeCommunity.name,
                        style: const TextStyle(
                          color: Color(0xFF1B8529),
                          fontSize: 11.5,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
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

  Widget _buildFilterPill({
    required String label,
    required bool isSelected,
    required VoidCallback onTap,
  }) {
    return Padding(
      padding: const EdgeInsets.only(right: 6),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(20),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
          decoration: BoxDecoration(
            color: isSelected ? const Color(0xFF0F172A) : const Color(0xFFF8FAFC),
            borderRadius: BorderRadius.circular(20),
            border: Border.all(
              color: isSelected ? const Color(0xFF0F172A) : const Color(0xFFE2E8F0),
            ),
          ),
          child: Text(
            label,
            style: TextStyle(
              color: isSelected ? Colors.white : const Color(0xFF64748B),
              fontSize: 12.5,
              fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _initCustomMarkerIcons() async {
    try {
      final userIcon = await _createCustomPinBitmap(
        color: const Color(0xFF10B981),
        iconData: Icons.person_rounded,
        size: 110,
      );
      final searchIcon = await _createCustomPinBitmap(
        color: const Color(0xFF2563EB),
        iconData: Icons.location_on_rounded,
        size: 110,
      );
      if (mounted) {
        setState(() {
          _userMarkerIcon = userIcon;
          _searchedMarkerIcon = searchIcon;
        });
      }
    } catch (e) {
      debugPrint('Error creating marker icons: $e');
    }
  }

  gmaps.BitmapDescriptor _getIncidentMarkerIcon(IncidentReport inc) {
    final isEmergency = inc.category == IncidentCategory.emergency || inc.urgency == IncidentUrgency.critical;
    final isHigh = inc.urgency == IncidentUrgency.high || inc.category == IncidentCategory.physicalThreat;
    final cacheKey = '${inc.category.value}_${inc.urgency.value}';

    if (_incidentMarkerIconCache.containsKey(cacheKey)) {
      return _incidentMarkerIconCache[cacheKey]!;
    }

    final color = isEmergency
        ? const Color(0xFFEF4444)
        : (isHigh ? const Color(0xFFF97316) : const Color(0xFFF59E0B));
    final iconData = isEmergency
        ? Icons.emergency_rounded
        : (isHigh ? Icons.warning_amber_rounded : inc.category.icon);

    _createCustomPinBitmap(
      color: color,
      iconData: iconData,
      size: 100,
    ).then((bitmap) {
      if (mounted) {
        setState(() {
          _incidentMarkerIconCache[cacheKey] = bitmap;
        });
      }
    }).catchError((_) {});

    return gmaps.BitmapDescriptor.defaultMarkerWithHue(
      isEmergency ? gmaps.BitmapDescriptor.hueRed : gmaps.BitmapDescriptor.hueOrange,
    );
  }

  static Future<gmaps.BitmapDescriptor> _createCustomPinBitmap({
    required Color color,
    required IconData iconData,
    required double size,
  }) async {
    final pictureRecorder = ui.PictureRecorder();
    final canvas = Canvas(pictureRecorder);
    final center = Offset(size / 2, size / 2);
    final double radius = size * 0.28;

    // 1. Outer translucent radar ring
    final ringPaint = Paint()
      ..color = color.withOpacity(0.18)
      ..style = PaintingStyle.fill;
    canvas.drawCircle(center, size * 0.46, ringPaint);

    final ringBorderPaint = Paint()
      ..color = color.withOpacity(0.85)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.0;
    canvas.drawCircle(center, size * 0.46, ringBorderPaint);

    // 2. Drop shadow
    final shadowPaint = Paint()
      ..color = Colors.black.withOpacity(0.25)
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 4.0);
    canvas.drawCircle(center + const Offset(0, 2), radius, shadowPaint);

    // 3. Core colored circle
    final corePaint = Paint()
      ..color = color
      ..style = PaintingStyle.fill;
    canvas.drawCircle(center, radius, corePaint);

    // 4. White crisp border
    final borderPaint = Paint()
      ..color = Colors.white
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.8;
    canvas.drawCircle(center, radius, borderPaint);

    // 5. Centered Icon
    final textPainter = TextPainter(textDirection: TextDirection.ltr);
    textPainter.text = TextSpan(
      text: String.fromCharCode(iconData.codePoint),
      style: TextStyle(
        fontSize: radius * 1.1,
        fontFamily: iconData.fontFamily,
        package: iconData.fontPackage,
        color: Colors.white,
      ),
    );
    textPainter.layout();
    textPainter.paint(
      canvas,
      Offset(center.dx - textPainter.width / 2, center.dy - textPainter.height / 2),
    );

    final picture = pictureRecorder.endRecording();
    final img = await picture.toImage(size.toInt(), size.toInt());
    final byteData = await img.toByteData(format: ui.ImageByteFormat.png);
    final uint8List = byteData!.buffer.asUint8List();

    // ignore: deprecated_member_use
    return gmaps.BitmapDescriptor.fromBytes(uint8List);
  }

  Widget _buildGoogleMapView(
    BuildContext context,
    LocationPoint userLoc,
    List<IncidentReport> incidents,
    SafetySessionProvider sessionProv,
  ) {
    final userPos = gmaps.LatLng(userLoc.lat, userLoc.lng);

    // Filter to ONLY live open emergency distress beacons / active emergency mode
    final liveEmergencyIncidents = incidents.where((inc) =>
        (inc.source == 'safety_mode_emergency' ||
         inc.category == IncidentCategory.emergency ||
         inc.urgency == IncidentUrgency.critical) &&
        inc.status == IncidentStatus.open
    ).toList();

    final Set<gmaps.Marker> markers = {
      gmaps.Marker(
        markerId: const gmaps.MarkerId('user_loc'),
        position: userPos,
        icon: _userMarkerIcon ??
            gmaps.BitmapDescriptor.defaultMarkerWithHue(gmaps.BitmapDescriptor.hueGreen),
        infoWindow: const gmaps.InfoWindow(title: 'Your Location (GPS)'),
      ),
      if (_searchedLocation != null)
        gmaps.Marker(
          markerId: const gmaps.MarkerId('searched_loc_pin'),
          position: gmaps.LatLng(_searchedLocation!.lat, _searchedLocation!.lng),
          icon: _searchedMarkerIcon ??
              gmaps.BitmapDescriptor.defaultMarkerWithHue(gmaps.BitmapDescriptor.hueAzure),
          infoWindow: gmaps.InfoWindow(
            title: _searchedLocationTitle ?? 'Searched Location',
            snippet: _currentCommunity?.communityName,
          ),
          zIndex: 10,
        ),
      ...liveEmergencyIncidents.map((inc) {
        final icon = _getIncidentMarkerIcon(inc);
        return gmaps.Marker(
          markerId: gmaps.MarkerId(inc.id),
          position: gmaps.LatLng(inc.location.lat, inc.location.lng),
          icon: icon,
          infoWindow: gmaps.InfoWindow(
            title: inc.title,
            snippet: inc.category.label,
            onTap: () => _showIncidentDetails(context, inc, userLoc),
          ),
          onTap: () => _showIncidentDetails(context, inc, userLoc),
        );
      }),
    };

    // Clean, stable radar zones around user and live danger points
    final Set<gmaps.Circle> circles = {
      // 1. User Safe Scope Zone
      gmaps.Circle(
        circleId: const gmaps.CircleId('user_safe_zone'),
        center: userPos,
        radius: 120.0,
        fillColor: const Color(0xFF10B981).withOpacity(0.12),
        strokeColor: const Color(0xFF10B981).withOpacity(0.70),
        strokeWidth: 2,
        zIndex: 3,
      ),
      // 2. Danger Point Hazard Zones (Live Emergency only)
      ...liveEmergencyIncidents.map((inc) {
        const color = Color(0xFFEF4444);
        final incPos = gmaps.LatLng(inc.location.lat, inc.location.lng);

        return gmaps.Circle(
          circleId: gmaps.CircleId('danger_${inc.id}'),
          center: incPos,
          radius: 160.0,
          fillColor: color.withOpacity(0.14),
          strokeColor: color.withOpacity(0.85),
          strokeWidth: 2,
          zIndex: 4,
        );
      }),
    };

    // Build Community Auto-Border Layers (matching web admin exact styling)
    final Set<gmaps.Polygon> polygons = {};
    final Set<gmaps.Polyline> polylines = {};

    if (_boundaryPoints.length >= 3) {
      final boundaryLatLngs = _boundaryPoints.map((p) => gmaps.LatLng(p.lat, p.lng)).toList();

      // 1. Semi-transparent emerald tint polygon
      polygons.add(
        gmaps.Polygon(
          polygonId: const gmaps.PolygonId('community_boundary_fill'),
          points: boundaryLatLngs,
          fillColor: const Color(0xFF10B981).withOpacity(0.12),
          strokeColor: const Color(0xFF10B981).withOpacity(0.65),
          strokeWidth: 2,
          geodesic: true,
          zIndex: 1,
        ),
      );

      // 2. Dotted/dashed SVG polyline along the geographical perimeter contour
      final closedLoop = [...boundaryLatLngs, boundaryLatLngs.first];
      polylines.add(
        gmaps.Polyline(
          polylineId: const gmaps.PolylineId('community_boundary_dotted'),
          points: closedLoop,
          color: const Color(0xFF059669),
          width: 3,
          patterns: [
            gmaps.PatternItem.dot,
            gmaps.PatternItem.gap(10.0),
          ],
          geodesic: true,
          zIndex: 2,
        ),
      );
    }

    return gmaps.GoogleMap(
      initialCameraPosition: gmaps.CameraPosition(
        target: _searchedLocation != null
            ? gmaps.LatLng(_searchedLocation!.lat, _searchedLocation!.lng)
            : userPos,
        zoom: 15.2,
      ),
      style: AppConstants.googleMapsLightSilverStyle,
      onMapCreated: (ctrl) {
        _googleMapController = ctrl;
        if (_isFollowingGps && _searchedLocation == null) {
          final cur = sessionProv.locationService.currentLocation;
          _animateCameraToLocation(cur, resetZoom: true);
        }
      },
      onCameraMoveStarted: () {
        if (!_isProgrammaticMove && _isFollowingGps) {
          setState(() {
            _isFollowingGps = false;
          });
        }
      },
      markers: markers,
      circles: circles,
      polygons: polygons,
      polylines: polylines,
      myLocationEnabled: sessionProv.locationService.hasLocationPermission,
      myLocationButtonEnabled: false,
      zoomControlsEnabled: false,
      mapToolbarEnabled: false,
    );
  }

  Widget _buildOpenStreetMapView(
    BuildContext context,
    LocationPoint userLoc,
    List<IncidentReport> incidents,
    SafetySessionProvider sessionProv,
  ) {
    // Filter to live open emergency distress beacons for aura circles
    final liveEmergencyIncidents = incidents.where((inc) =>
        (inc.source == 'safety_mode_emergency' ||
         inc.category == IncidentCategory.emergency ||
         inc.urgency == IncidentUrgency.critical) &&
        inc.status == IncidentStatus.open
    ).toList();

    return fmap.FlutterMap(
      mapController: _fmapController,
      options: fmap.MapOptions(
        initialCenter: _searchedLocation != null
            ? latlong.LatLng(_searchedLocation!.lat, _searchedLocation!.lng)
            : latlong.LatLng(userLoc.lat, userLoc.lng),
        initialZoom: 14.8,
        onPositionChanged: (pos, hasGesture) {
          if (hasGesture && !_isProgrammaticMove && _isFollowingGps) {
            setState(() {
              _isFollowingGps = false;
            });
          }
        },
      ),
      children: [
        fmap.TileLayer(
          urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
          userAgentPackageName: 'com.yzemaf.safety.safety_app',
          maxZoom: 19,
          tileBuilder: (context, tileWidget, tile) {
            return ColorFiltered(
              colorFilter: const ColorFilter.matrix(<double>[
                // Desaturates colors to grayscale and brightens to a clean light silver theme
                0.28, 0.55, 0.12, 0, 35,
                0.28, 0.55, 0.12, 0, 35,
                0.28, 0.55, 0.12, 0, 38,
                0,    0,    0,    1, 0,
              ]),
              child: tileWidget,
            );
          },
        ),
        // Community Administrative Boundary Fill & Dotted Outline
        if (_boundaryPoints.length >= 3) ...[
          fmap.PolygonLayer(
            polygons: [
              fmap.Polygon(
                points: _boundaryPoints.map((p) => latlong.LatLng(p.lat, p.lng)).toList(),
                color: const Color(0xFF10B981).withOpacity(0.12),
                borderColor: const Color(0xFF10B981).withOpacity(0.65),
                borderStrokeWidth: 2.0,
              ),
            ],
          ),
          fmap.PolylineLayer(
            polylines: [
              fmap.Polyline(
                points: [
                  ..._boundaryPoints.map((p) => latlong.LatLng(p.lat, p.lng)),
                  latlong.LatLng(_boundaryPoints.first.lat, _boundaryPoints.first.lng),
                ],
                color: const Color(0xFF059669),
                strokeWidth: 3.0,
                pattern: const fmap.StrokePattern.dotted(),
              ),
            ],
          ),
        ],
        // Geographic Aura Radar Zones
        fmap.CircleLayer(
          circles: [
            // User Safe Aura Zone (120m)
            fmap.CircleMarker(
              point: latlong.LatLng(userLoc.lat, userLoc.lng),
              radius: 120.0,
              useRadiusInMeter: true,
              color: const Color(0xFF10B981).withOpacity(0.12),
              borderColor: const Color(0xFF10B981).withOpacity(0.70),
              borderStrokeWidth: 2.0,
            ),
            // Danger Point Hazard Zones (Live Emergency Beacons)
            ...liveEmergencyIncidents.map((inc) {
              const color = Color(0xFFEF4444);
              final pt = latlong.LatLng(inc.location.lat, inc.location.lng);

              return fmap.CircleMarker(
                point: pt,
                radius: 160.0,
                useRadiusInMeter: true,
                color: color.withOpacity(0.14),
                borderColor: color.withOpacity(0.85),
                borderStrokeWidth: 2.5,
              );
            }),
          ],
        ),
        // Markers for User, Searched Location, and All Community Incidents
        fmap.MarkerLayer(
          markers: [
            // 1. User Location Pin (Emerald Pulse Radar Style)
            fmap.Marker(
              point: latlong.LatLng(userLoc.lat, userLoc.lng),
              width: 44,
              height: 44,
              alignment: Alignment.center,
              child: Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: const Color(0xFF10B981),
                  shape: BoxShape.circle,
                  border: Border.all(color: Colors.white, width: 3.0),
                  boxShadow: [
                    BoxShadow(
                      color: const Color(0xFF10B981).withOpacity(0.40),
                      blurRadius: 10,
                      spreadRadius: 2,
                    ),
                  ],
                ),
                child: const Center(
                  child: Icon(Icons.person_rounded, color: Colors.white, size: 20),
                ),
              ),
            ),
            // 2. Searched Location Pin (if active)
            if (_searchedLocation != null)
              fmap.Marker(
                point: latlong.LatLng(_searchedLocation!.lat, _searchedLocation!.lng),
                width: 44,
                height: 44,
                alignment: Alignment.center,
                child: Container(
                  width: 38,
                  height: 38,
                  decoration: BoxDecoration(
                    color: const Color(0xFF2563EB),
                    shape: BoxShape.circle,
                    border: Border.all(color: Colors.white, width: 3.0),
                    boxShadow: [
                      BoxShadow(
                        color: const Color(0xFF2563EB).withOpacity(0.40),
                        blurRadius: 8,
                        spreadRadius: 1,
                      ),
                    ],
                  ),
                  child: const Center(
                    child: Icon(Icons.location_on_rounded, color: Colors.white, size: 20),
                  ),
                ),
              ),
            // 3. Incident Markers (Live Emergencies and Community Reports)
            ...incidents.map((inc) {
              final isCritical = inc.urgency == IncidentUrgency.critical ||
                  inc.category == IncidentCategory.emergency ||
                  inc.source == 'safety_mode_emergency';
              
              final Color markerColor = isCritical
                  ? const Color(0xFFEF4444)
                  : const Color(0xFFF59E0B);

              final IconData markerIcon = isCritical
                  ? Icons.emergency_rounded
                  : Icons.warning_amber_rounded;

              return fmap.Marker(
                point: latlong.LatLng(inc.location.lat, inc.location.lng),
                width: 40,
                height: 40,
                alignment: Alignment.center,
                child: GestureDetector(
                  onTap: () => _showIncidentDetails(context, inc, userLoc),
                  child: Container(
                    width: 34,
                    height: 34,
                    decoration: BoxDecoration(
                      color: markerColor,
                      shape: BoxShape.circle,
                      border: Border.all(color: Colors.white, width: 2.5),
                      boxShadow: [
                        BoxShadow(
                          color: markerColor.withOpacity(0.35),
                          blurRadius: 8,
                          offset: const Offset(0, 2),
                        ),
                      ],
                    ),
                    child: Center(
                      child: Icon(markerIcon, color: Colors.white, size: 18),
                    ),
                  ),
                ),
              );
            }),
          ],
        ),
      ],
    );
  }

  Widget _buildListView(
    BuildContext context,
    LocationPoint userLoc,
    List<IncidentReport> incidents,
    IncidentProvider incidentProv,
  ) {
    final sortedIncidents = List<IncidentReport>.from(incidents)
      ..sort((a, b) => a.location.distanceTo(userLoc).compareTo(b.location.distanceTo(userLoc)));

    return RefreshIndicator(
      color: const Color(0xFF1B8529),
      onRefresh: () => incidentProv.refreshIncidents(),
      child: sortedIncidents.isEmpty
          ? CustomScrollView(
              physics: const AlwaysScrollableScrollPhysics(
                parent: BouncingScrollPhysics(),
              ),
              slivers: [
                SliverFillRemaining(
                  hasScrollBody: false,
                  child: Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.shield_outlined, size: 48, color: const Color(0xFF94A3B8).withOpacity(0.5)),
                        const SizedBox(height: 10),
                        const Text(
                          'No reports in this category',
                          style: TextStyle(color: Color(0xFF64748B), fontSize: 14, fontWeight: FontWeight.w600),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            )
          : ListView.separated(
              physics: const AlwaysScrollableScrollPhysics(
                parent: BouncingScrollPhysics(),
              ),
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              itemCount: sortedIncidents.length,
              separatorBuilder: (_, __) => const SizedBox(height: 8),
              itemBuilder: (context, idx) {
                final inc = sortedIncidents[idx];
                final distMeters = userLoc.distanceTo(inc.location);

          return InkWell(
            onTap: () => _showIncidentDetails(context, inc, userLoc),
            borderRadius: BorderRadius.circular(12),
            child: Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: const Color(0xFFE2E8F0)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(
                          color: const Color(0xFFFEF2F2),
                          borderRadius: BorderRadius.circular(6),
                          border: Border.all(color: const Color(0xFFFECACA)),
                        ),
                        child: Text(
                          inc.category.label,
                          style: const TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                            color: Color(0xFFDC2626),
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Text(
                        _formatDistance(distMeters),
                        style: const TextStyle(
                          fontSize: 11.5,
                          fontWeight: FontWeight.w600,
                          color: Color(0xFF1B8529),
                        ),
                      ),
                      const Spacer(),
                      Text(
                        _formatTimeAgo(inc.createdAt),
                        style: const TextStyle(
                          fontSize: 11.5,
                          color: Color(0xFF94A3B8),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Text(
                    inc.title,
                    style: const TextStyle(
                      fontSize: 14.5,
                      fontWeight: FontWeight.w700,
                      color: Color(0xFF0F172A),
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    inc.description,
                    style: const TextStyle(
                      fontSize: 13,
                      color: Color(0xFF64748B),
                      height: 1.4,
                    ),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  void _showIncidentDetails(BuildContext context, IncidentReport report, LocationPoint userLoc) {
    final distanceMeters = userLoc.distanceTo(report.location);

    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (ctx) => Container(
        constraints: BoxConstraints(
          maxHeight: MediaQuery.of(ctx).size.height * 0.85,
        ),
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
        decoration: const BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        ),
        child: SafeArea(
          top: false,
          child: SingleChildScrollView(
            physics: const BouncingScrollPhysics(),
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

                // Top Badges
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                      decoration: BoxDecoration(
                        color: const Color(0xFFFEF2F2),
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: const Color(0xFFFECACA)),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(Icons.warning_amber_rounded, size: 14, color: Color(0xFFDC2626)),
                          const SizedBox(width: 4),
                          Text(
                            report.category.label,
                            style: const TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                              color: Color(0xFFDC2626),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                      decoration: BoxDecoration(
                        color: const Color(0xFFE8F5E9),
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: const Color(0xFFA5D6A7)),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(Icons.near_me_rounded, size: 13, color: Color(0xFF1B8529)),
                          const SizedBox(width: 4),
                          Text(
                            _formatDistance(distanceMeters),
                            style: const TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                              color: Color(0xFF1B8529),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const Spacer(),
                    Text(
                      _formatTimeAgo(report.createdAt),
                      style: const TextStyle(
                        fontSize: 12.5,
                        color: Color(0xFF94A3B8),
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 18),

                // WHAT HAPPENED
                const Text(
                  'WHAT HAPPENED',
                  style: TextStyle(
                    fontSize: 11.5,
                    fontWeight: FontWeight.w700,
                    color: Color(0xFF64748B),
                    letterSpacing: 0.6,
                  ),
                ),
                const SizedBox(height: 8),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF8FAFC),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: const Color(0xFFE2E8F0)),
                  ),
                  child: Text(
                    report.title,
                    style: const TextStyle(
                      fontSize: 15.5,
                      fontWeight: FontWeight.w700,
                      color: Color(0xFF0F172A),
                      height: 1.35,
                    ),
                  ),
                ),
                const SizedBox(height: 16),

                // DETAILS
                const Text(
                  'DETAILS & DESCRIPTION',
                  style: TextStyle(
                    fontSize: 11.5,
                    fontWeight: FontWeight.w700,
                    color: Color(0xFF64748B),
                    letterSpacing: 0.6,
                  ),
                ),
                const SizedBox(height: 8),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF8FAFC),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: const Color(0xFFE2E8F0)),
                  ),
                  child: Text(
                    report.description,
                    style: const TextStyle(
                      fontSize: 14,
                      color: Color(0xFF334155),
                      height: 1.5,
                    ),
                  ),
                ),
                const SizedBox(height: 16),

                // LOCATION
                const Text(
                  'LOCATION',
                  style: TextStyle(
                    fontSize: 11.5,
                    fontWeight: FontWeight.w700,
                    color: Color(0xFF64748B),
                    letterSpacing: 0.6,
                  ),
                ),
                const SizedBox(height: 8),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF8FAFC),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: const Color(0xFFE2E8F0)),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.location_on_rounded, size: 18, color: Color(0xFF1B8529)),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          report.addressName ?? 'Current Community Area',
                          style: const TextStyle(
                            fontSize: 13.5,
                            fontWeight: FontWeight.w600,
                            color: Color(0xFF0F172A),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 22),

                // Close Button
                SizedBox(
                  width: double.infinity,
                  height: 48,
                  child: TextButton(
                    onPressed: () => Navigator.pop(ctx),
                    style: TextButton.styleFrom(
                      backgroundColor: const Color(0xFFF1F5F9),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                    child: const Text(
                      'Close',
                      style: TextStyle(
                        color: Color(0xFF0F172A),
                        fontSize: 14.5,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  String _formatDistance(double meters) {
    if (meters < 1000) {
      return '${meters.round()}m away';
    } else {
      return '${(meters / 1000).toStringAsFixed(1)}km away';
    }
  }

  String _formatTimeAgo(DateTime dt) {
    final diff = DateTime.now().difference(dt);
    if (diff.inMinutes < 1) return 'Just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
    if (diff.inHours < 24) return '${diff.inHours}h ago';
    return '${diff.inDays}d ago';
  }
}
