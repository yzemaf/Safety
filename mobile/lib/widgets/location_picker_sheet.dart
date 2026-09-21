import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import '../config/constants.dart';
import '../models/location_point.dart';
import '../services/boundary_service.dart';
import '../services/location_service.dart';
import '../services/storage_service.dart';
import 'app_loader.dart';
import 'in_app_notification.dart';

class LocationSearchResult {
  final String title;
  final String subtitle;
  final double lat;
  final double lng;
  final String? placeId;

  const LocationSearchResult({
    required this.title,
    required this.subtitle,
    required this.lat,
    required this.lng,
    this.placeId,
  });

  Map<String, dynamic> toJson() => {
    'title': title,
    'subtitle': subtitle,
    'lat': lat,
    'lng': lng,
    'placeId': placeId,
  };

  factory LocationSearchResult.fromJson(Map<String, dynamic> json) => LocationSearchResult(
    title: json['title'] as String? ?? 'Location',
    subtitle: json['subtitle'] as String? ?? '',
    lat: (json['lat'] as num?)?.toDouble() ?? 0.0,
    lng: (json['lng'] as num?)?.toDouble() ?? 0.0,
    placeId: json['placeId'] as String?,
  );
}

class LocationPickerSheet extends StatefulWidget {
  final LocationService locationService;
  final Function(LocationPoint, [String?]) onLocationSelected;

  const LocationPickerSheet({
    super.key,
    required this.locationService,
    required this.onLocationSelected,
  });

  static Future<LocationPoint?> show(
    BuildContext context, {
    required LocationService locationService,
    required Function(LocationPoint, [String?]) onLocationSelected,
  }) {
    return showModalBottomSheet<LocationPoint>(
      context: context,
      isScrollControlled: true,
      enableDrag: true,
      isDismissible: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => LocationPickerSheet(
        locationService: locationService,
        onLocationSelected: onLocationSelected,
      ),
    );
  }

  @override
  State<LocationPickerSheet> createState() => _LocationPickerSheetState();
}

class _LocationPickerSheetState extends State<LocationPickerSheet> {
  final TextEditingController _searchCtrl = TextEditingController();
  Timer? _debounceTimer;
  bool _isLoading = false;
  bool _isLocatingGps = false;
  List<LocationSearchResult> _searchResults = [];
  List<LocationSearchResult> _recentLocations = [];

  @override
  void initState() {
    super.initState();
    _loadRecents();
  }

  void _loadRecents() {
    final raw = StorageService.loadRecentLocationsRaw();
    _recentLocations = raw.map((m) => LocationSearchResult.fromJson(m)).toList();
    _searchResults = List.from(_recentLocations);
  }

  Future<void> _clearRecents() async {
    setState(() {
      _recentLocations.clear();
      if (_searchCtrl.text.trim().isEmpty) {
        _searchResults.clear();
      }
    });
    await StorageService.saveRecentLocationsRaw([]);
  }

  @override
  void dispose() {
    _debounceTimer?.cancel();
    _searchCtrl.dispose();
    super.dispose();
  }

  void _onSearchChanged(String query) {
    _debounceTimer?.cancel();

    if (query.trim().isEmpty) {
      setState(() {
        _isLoading = false;
        _searchResults = List.from(_recentLocations);
      });
      return;
    }

    final lowerQuery = query.toLowerCase();
    final localMatches = _recentLocations.where((loc) {
      return loc.title.toLowerCase().contains(lowerQuery) ||
          loc.subtitle.toLowerCase().contains(lowerQuery);
    }).toList();

    setState(() {
      _searchResults = localMatches;
      if (query.trim().length >= 2) {
        _isLoading = true;
      } else {
        _isLoading = false;
      }
    });

    if (query.trim().length >= 2) {
      _debounceTimer = Timer(const Duration(milliseconds: 600), () {
        if (mounted && _searchCtrl.text.trim() == query.trim()) {
          _searchGoogleMapsPlaces(query.trim());
        }
      });
    }
  }

  Future<void> _searchGoogleMapsPlaces(String query) async {
    setState(() => _isLoading = true);
    const apiKey = AppConstants.googleMapsApiKey;
    final userLoc = widget.locationService.currentLocation;

    try {
      final autocompleteUri = Uri.parse(
        'https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${Uri.encodeComponent(query)}&location=${userLoc.lat},${userLoc.lng}&radius=50000&key=$apiKey',
      );

      final response = await http.get(autocompleteUri).timeout(const Duration(seconds: 4));
      if (response.statusCode == 200) {
        final Map<String, dynamic> data = jsonDecode(response.body);
        final status = data['status'];

        if (status == 'OK' && data['predictions'] != null) {
          final List predictions = data['predictions'];
          final List<LocationSearchResult> googleResults = [];

          for (final item in predictions.take(8)) {
            final mainText = item['structured_formatting']?['main_text'] ?? item['description'] ?? 'Location';
            final secondaryText = item['structured_formatting']?['secondary_text'] ?? item['description'] ?? '';
            final placeId = item['place_id'] as String?;

            googleResults.add(
              LocationSearchResult(
                title: mainText,
                subtitle: secondaryText,
                lat: 0.0,
                lng: 0.0,
                placeId: placeId,
              ),
            );
          }

          if (mounted && _searchCtrl.text.trim() == query) {
            setState(() {
              _searchResults = [
                ...googleResults,
                ..._recentLocations.where((d) => !googleResults.any((g) => g.title == d.title)),
              ];
            });
          }
          return;
        }
      }

      await _searchGoogleGeocoding(query, apiKey);
    } catch (_) {
      await _searchGoogleGeocoding(query, apiKey);
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _searchGoogleGeocoding(String query, String apiKey) async {
    try {
      final geocodeUri = Uri.parse(
        'https://maps.googleapis.com/maps/api/geocode/json?address=${Uri.encodeComponent(query)}&key=$apiKey',
      );
      final response = await http.get(geocodeUri).timeout(const Duration(seconds: 4));
      if (response.statusCode == 200) {
        final Map<String, dynamic> data = jsonDecode(response.body);
        if (data['status'] == 'OK' && data['results'] != null) {
          final List results = data['results'];
          final List<LocationSearchResult> geocodeResults = [];

          for (final res in results.take(6)) {
            final formattedAddress = res['formatted_address'] as String? ?? 'Location';
            final parts = formattedAddress.split(',');
            final mainTitle = parts.first.trim();
            final secondary = parts.skip(1).join(',').trim();
            final lat = (res['geometry']?['location']?['lat'] as num?)?.toDouble() ?? 0.0;
            final lng = (res['geometry']?['location']?['lng'] as num?)?.toDouble() ?? 0.0;

            if (lat != 0.0 && lng != 0.0) {
              geocodeResults.add(
                LocationSearchResult(
                  title: mainTitle,
                  subtitle: secondary.isNotEmpty ? secondary : formattedAddress,
                  lat: lat,
                  lng: lng,
                ),
              );
            }
          }

          if (mounted && _searchCtrl.text.trim() == query && geocodeResults.isNotEmpty) {
            setState(() {
              _searchResults = [
                ...geocodeResults,
                ..._recentLocations.where((d) => !geocodeResults.any((g) => g.title == d.title)),
              ];
            });
          }
        }
      }
    } catch (_) {}
  }

  Future<LocationPoint?> _resolvePlaceCoordinates(LocationSearchResult item) async {
    if (item.lat != 0.0 && item.lng != 0.0) {
      return LocationPoint(lat: item.lat, lng: item.lng);
    }

    if (item.placeId != null) {
      try {
        const apiKey = AppConstants.googleMapsApiKey;
        final detailsUri = Uri.parse(
          'https://maps.googleapis.com/maps/api/place/details/json?place_id=${item.placeId}&fields=geometry,name,formatted_address&key=$apiKey',
        );
        final res = await http.get(detailsUri).timeout(const Duration(seconds: 4));
        if (res.statusCode == 200) {
          final Map<String, dynamic> data = jsonDecode(res.body);
          final loc = data['result']?['geometry']?['location'];
          if (loc != null) {
            final lat = (loc['lat'] as num).toDouble();
            final lng = (loc['lng'] as num).toDouble();
            return LocationPoint(lat: lat, lng: lng);
          }
        }
      } catch (_) {}
    }

    try {
      const apiKey = AppConstants.googleMapsApiKey;
      final geocodeUri = Uri.parse(
        'https://maps.googleapis.com/maps/api/geocode/json?address=${Uri.encodeComponent('${item.title}, ${item.subtitle}')}&key=$apiKey',
      );
      final res = await http.get(geocodeUri).timeout(const Duration(seconds: 4));
      if (res.statusCode == 200) {
        final Map<String, dynamic> data = jsonDecode(res.body);
        final loc = data['results']?[0]?['geometry']?['location'];
        if (loc != null) {
          final lat = (loc['lat'] as num).toDouble();
          final lng = (loc['lng'] as num).toDouble();
          return LocationPoint(lat: lat, lng: lng);
        }
      }
    } catch (_) {}

    return null;
  }

  Future<void> _selectLocation(LocationSearchResult item) async {
    setState(() => _isLoading = true);
    final resolvedPoint = await _resolvePlaceCoordinates(item);
    setState(() => _isLoading = false);

    if (resolvedPoint != null) {
      final savedItem = LocationSearchResult(
        title: item.title,
        subtitle: item.subtitle,
        lat: resolvedPoint.lat,
        lng: resolvedPoint.lng,
        placeId: item.placeId,
      );

      _recentLocations.removeWhere(
        (x) => x.title == item.title || (x.lat == resolvedPoint.lat && x.lng == resolvedPoint.lng),
      );
      _recentLocations.insert(0, savedItem);
      if (_recentLocations.length > 8) {
        _recentLocations.removeRange(8, _recentLocations.length);
      }
      await StorageService.saveRecentLocationsRaw(_recentLocations.map((e) => e.toJson()).toList());

      widget.locationService.setLocation(resolvedPoint);
      widget.onLocationSelected(resolvedPoint, item.title);
      if (mounted) Navigator.pop(context, resolvedPoint);
    } else {
      if (mounted) {
        AppNotification.show(
          context,
          message: 'Could not resolve coordinates for "${item.title}". Please try another search.',
          type: NotificationType.warning,
        );
      }
    }
  }

  Future<void> _useCurrentLocation() async {
    setState(() => _isLocatingGps = true);
    final hasPerm = widget.locationService.hasLocationPermission;
    if (!hasPerm) {
      await widget.locationService.requestLocationPermission();
    }
    await widget.locationService.refreshCurrentLocation();
    final loc = widget.locationService.currentLocation;
    BoundaryService.clearCache();
    widget.locationService.setLocation(loc);
    // passing null as placeTitle indicates "Use My Location" (GPS)
    widget.onLocationSelected(loc, null);
    if (mounted) {
      setState(() => _isLocatingGps = false);
      Navigator.pop(context, loc);
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;
    final isSearching = _searchCtrl.text.trim().isNotEmpty;

    return Padding(
      padding: EdgeInsets.only(bottom: bottomInset),
      child: Container(
        height: MediaQuery.of(context).size.height * 0.85,
        decoration: const BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        ),
        child: Column(
          children: [
            // Top Drag Handle
            const SizedBox(height: 12),
            Center(
              child: Container(
                width: 38,
                height: 4.5,
                decoration: BoxDecoration(
                  color: const Color(0xFFE2E8F0),
                  borderRadius: BorderRadius.circular(3),
                ),
              ),
            ),
            const SizedBox(height: 12),

            // Minimalist Header Bar
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text(
                    'Search Location',
                    style: TextStyle(
                      color: Color(0xFF0F172A),
                      fontSize: 18,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  TextButton(
                    onPressed: () => Navigator.pop(context),
                    child: const Text(
                      'Done',
                      style: TextStyle(
                        color: Color(0xFF1B8529),
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const Divider(height: 1, color: Color(0xFFF1F5F9)),
            const SizedBox(height: 12),

            // Search Bar Input
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: TextField(
                controller: _searchCtrl,
                onChanged: _onSearchChanged,
                autofocus: false,
                style: const TextStyle(
                  color: Color(0xFF0F172A),
                  fontSize: 14.5,
                  fontWeight: FontWeight.w500,
                ),
                decoration: InputDecoration(
                  hintText: 'Search address, neighborhood, city...',
                  hintStyle: const TextStyle(
                    color: Color(0xFF94A3B8),
                    fontSize: 14,
                  ),
                  prefixIcon: _isLoading
                      ? const Padding(
                          padding: EdgeInsets.all(12.0),
                          child: SizedBox(
                            width: 16,
                            height: 16,
                            child: Center(
                              child: SpinKitDualRing(
                                color: Color(0xFF1B8529),
                                size: 15,
                                lineWidth: 1.8,
                              ),
                            ),
                          ),
                        )
                      : const Icon(
                          Icons.search_rounded,
                          color: Color(0xFF94A3B8),
                          size: 20,
                        ),
                  suffixIcon: _searchCtrl.text.isNotEmpty
                      ? IconButton(
                          icon: const Icon(Icons.clear_rounded, color: Color(0xFF94A3B8), size: 18),
                          onPressed: () {
                            _searchCtrl.clear();
                            _onSearchChanged('');
                          },
                        )
                      : null,
                  filled: true,
                  fillColor: const Color(0xFFF8FAFC),
                  contentPadding: const EdgeInsets.symmetric(vertical: 12, horizontal: 16),
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
            ),
            const SizedBox(height: 10),

            // Use Current Location Option
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: InkWell(
                onTap: _isLocatingGps ? null : _useCurrentLocation,
                borderRadius: BorderRadius.circular(12),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF0FDF4),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: const Color(0xFFBBF7D0)),
                  ),
                  child: Row(
                    children: [
                      _isLocatingGps
                          ? const SizedBox(
                              width: 18,
                              height: 18,
                              child: Center(
                                child: SpinKitDualRing(
                                  lineWidth: 2.0,
                                  size: 16,
                                  color: Color(0xFF1B8529),
                                ),
                              ),
                            )
                          : const Icon(
                              Icons.near_me_rounded,
                              color: Color(0xFF1B8529),
                              size: 18,
                            ),
                      const SizedBox(width: 10),
                      const Text(
                        'Use my location',
                        style: TextStyle(
                          fontSize: 13.5,
                          fontWeight: FontWeight.w600,
                          color: Color(0xFF1B8529),
                        ),
                      ),
                      const Spacer(),
                      const Icon(
                        Icons.arrow_forward_ios_rounded,
                        color: Color(0xFF86EFAC),
                        size: 13,
                      ),
                    ],
                  ),
                ),
              ),
            ),
            const SizedBox(height: 12),

            // Section title (Recent Searches or Results)
            if (!isSearching && _recentLocations.isNotEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 4),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text(
                      'RECENTLY SEARCHED',
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        color: Color(0xFF94A3B8),
                        letterSpacing: 0.8,
                      ),
                    ),
                    InkWell(
                      onTap: _clearRecents,
                      child: const Text(
                        'Clear',
                        style: TextStyle(
                          fontSize: 11.5,
                          fontWeight: FontWeight.w600,
                          color: Color(0xFFEF4444),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            const Divider(height: 1, color: Color(0xFFF1F5F9)),

            // Clean Results List
            Expanded(
              child: _isLoading && _searchResults.isEmpty
                  ? const _LocationSkeletonList()
                  : _searchResults.isEmpty
                      ? Center(
                          child: Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 32),
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(
                                  isSearching ? Icons.location_off_outlined : Icons.search_rounded,
                                  size: 40,
                                  color: const Color(0xFF94A3B8).withOpacity(0.5),
                                ),
                                const SizedBox(height: 8),
                                Text(
                                  isSearching ? 'No locations found' : 'Search any area or neighborhood',
                                  style: const TextStyle(
                                    color: Color(0xFF64748B),
                                    fontSize: 14,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  isSearching
                                      ? 'Try searching a different street or city name.'
                                      : 'Type above to explore live community boundaries and safety radar.',
                                  textAlign: TextAlign.center,
                                  style: const TextStyle(
                                    color: Color(0xFF94A3B8),
                                    fontSize: 12,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        )
                      : ListView.separated(
                          physics: const BouncingScrollPhysics(),
                          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 6),
                          itemCount: _searchResults.length,
                          separatorBuilder: (_, __) => const Divider(height: 1, color: Color(0xFFF1F5F9)),
                          itemBuilder: (context, idx) {
                            final item = _searchResults[idx];
                            final isRecent = !isSearching && _recentLocations.contains(item);

                            return InkWell(
                              onTap: () => _selectLocation(item),
                              borderRadius: BorderRadius.circular(10),
                              child: Padding(
                                padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 4),
                                child: Row(
                                  children: [
                                    Icon(
                                      isRecent ? Icons.history_rounded : Icons.place_outlined,
                                      color: isRecent ? const Color(0xFF94A3B8) : const Color(0xFF1B8529),
                                      size: 18,
                                    ),
                                    const SizedBox(width: 12),
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment: CrossAxisAlignment.start,
                                        children: [
                                          Text(
                                            item.title,
                                            style: const TextStyle(
                                              color: Color(0xFF0F172A),
                                              fontSize: 14,
                                              fontWeight: FontWeight.w600,
                                            ),
                                            maxLines: 1,
                                            overflow: TextOverflow.ellipsis,
                                          ),
                                          if (item.subtitle.isNotEmpty) ...[
                                            const SizedBox(height: 2),
                                            Text(
                                              item.subtitle,
                                              style: const TextStyle(
                                                color: Color(0xFF64748B),
                                                fontSize: 12,
                                              ),
                                              maxLines: 1,
                                              overflow: TextOverflow.ellipsis,
                                            ),
                                          ],
                                        ],
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            );
                          },
                        ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Shimmering skeleton loader for location search results
class _LocationSkeletonList extends StatefulWidget {
  const _LocationSkeletonList();

  @override
  State<_LocationSkeletonList> createState() => _LocationSkeletonListState();
}

class _LocationSkeletonListState extends State<_LocationSkeletonList>
    with SingleTickerProviderStateMixin {
  late AnimationController _animCtrl;

  @override
  void initState() {
    super.initState();
    _animCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 900),
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _animCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _animCtrl,
      builder: (context, _) {
        final shimmerColor = Color.lerp(
          const Color(0xFFF1F5F9),
          const Color(0xFFE2E8F0),
          _animCtrl.value,
        )!;

        return ListView.separated(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
          itemCount: 6,
          physics: const NeverScrollableScrollPhysics(),
          separatorBuilder: (_, __) => const Divider(height: 1, color: Color(0xFFF8FAFC)),
          itemBuilder: (_, index) {
            final titleWidthFactor = (0.40 + (index % 3) * 0.16);
            final subtitleWidthFactor = (0.65 + (index % 2) * 0.18);

            return Padding(
              padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 4),
              child: Row(
                children: [
                  Container(
                    width: 20,
                    height: 20,
                    decoration: BoxDecoration(
                      color: shimmerColor,
                      shape: BoxShape.circle,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        FractionallySizedBox(
                          widthFactor: titleWidthFactor,
                          alignment: Alignment.centerLeft,
                          child: Container(
                            height: 13,
                            decoration: BoxDecoration(
                              color: shimmerColor,
                              borderRadius: BorderRadius.circular(4),
                            ),
                          ),
                        ),
                        const SizedBox(height: 6),
                        FractionallySizedBox(
                          widthFactor: subtitleWidthFactor,
                          alignment: Alignment.centerLeft,
                          child: Container(
                            height: 10,
                            decoration: BoxDecoration(
                              color: shimmerColor.withOpacity(0.7),
                              borderRadius: BorderRadius.circular(4),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            );
          },
        );
      },
    );
  }
}
