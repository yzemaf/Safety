import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:safety_app/services/api_service.dart';
import '../models/incident_report.dart';
import '../models/jurisdiction.dart';
import '../models/location_point.dart';
import '../providers/auth_provider.dart';
import '../providers/incident_provider.dart';
import '../providers/safety_session_provider.dart';
import '../widgets/app_loader.dart';
import '../widgets/in_app_notification.dart';
import '../widgets/location_picker_sheet.dart';

class ReportIncidentScreen extends StatefulWidget {
  final bool isActive;
  const ReportIncidentScreen({super.key, this.isActive = true});

  @override
  State<ReportIncidentScreen> createState() => _ReportIncidentScreenState();
}

class _ReportIncidentScreenState extends State<ReportIncidentScreen> {
  IncidentCategory? _filterCategory;

  // AI Safety Summary state (ValueNotifiers for live sheet reactivity)
  final ValueNotifier<bool> _isAiLoading = ValueNotifier(false);
  final ValueNotifier<Map<String, dynamic>?> _aiReport = ValueNotifier(null);
  String? _lastAiCacheKey;

  @override
  void dispose() {
    _isAiLoading.dispose();
    _aiReport.dispose();
    super.dispose();
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        context.read<IncidentProvider>().refreshIncidents();
      }
    });
  }

  @override
  void didUpdateWidget(ReportIncidentScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.isActive && !oldWidget.isActive) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) {
          context.read<IncidentProvider>().refreshIncidents();
        }
      });
    }
  }

  String _formatDistance(double meters) {
    if (meters < 1000) {
      return '${meters.round()}m away';
    }
    return '${(meters / 1000).toStringAsFixed(1)}km away';
  }

  String _formatTimeAgo(DateTime dt) {
    final diff = DateTime.now().difference(dt);
    if (diff.inMinutes < 1) return 'Just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
    if (diff.inHours < 24) return '${diff.inHours}h ago';
    if (diff.inDays < 7) return '${diff.inDays}d ago';
    return '${dt.day}/${dt.month}/${dt.year}';
  }

  void _showAiSummary(BuildContext context) async {
    final incidentProv = context.read<IncidentProvider>();
    final sessionProv = context.read<SafetySessionProvider>();
    final comm = incidentProv.activeCommunity;

    // Guard: must have a named/selected community
    if (comm.name.isEmpty || comm.name == 'Current Location' || comm.id.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Please select a community first to generate an AI safety summary.'),
          behavior: SnackBarBehavior.floating,
        ),
      );
      return;
    }

    final cacheKey = '${comm.countryCode}|${comm.code}|${comm.id}';
    final userLoc = sessionProv.locationService.currentLocation;

    // Show the sheet immediately — it will react to the notifiers live
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _AiSafetySummarySheet(
        communityName: comm.name,
        isLoadingNotifier: _isAiLoading,
        reportNotifier: _aiReport,
        onRefresh: () {
          _lastAiCacheKey = null;
          Navigator.of(context).pop();
          _showAiSummary(context);
        },
      ),
    );

    // If cache hit, skip the API call
    if (cacheKey == _lastAiCacheKey && _aiReport.value != null) return;

    _isAiLoading.value = true;

    final apiService = ApiService();
    final result = await apiService.getCommunityAiSummary(
      communityId: comm.id,
      stateCode: comm.code,
      countryCode: comm.countryCode,
      lat: userLoc.lat != 0 ? userLoc.lat : null,
      lng: userLoc.lng != 0 ? userLoc.lng : null,
      incidents: incidentProv.incidents.map((e) => e.toJson()).toList(),
    );

    if (!mounted) return;
    _aiReport.value = result;
    _isAiLoading.value = false;
    if (result != null) _lastAiCacheKey = cacheKey;
  }

  void _openCommunityPicker(
    BuildContext context,
    SafetySessionProvider sessionProv,
    IncidentProvider incidentProv,
  ) {
    LocationPickerSheet.show(
      context,
      locationService: sessionProv.locationService,
      onLocationSelected: (loc, [communityName]) {
        final name = communityName?.trim().isNotEmpty == true ? communityName!.trim() : 'Selected Area';
        final zone = JurisdictionZone(
          id: name.toLowerCase().replaceAll(RegExp(r'[^a-z0-9]'), '_'),
          name: name,
          code: incidentProv.activeCommunity.code,
          countryCode: incidentProv.activeCommunity.countryCode,
          type: 'community',
          center: loc,
          defaultZoom: 14.0,
        );
        incidentProv.setActiveCommunity(zone);
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final incidentProv = context.watch<IncidentProvider>();
    final sessionProv = context.watch<SafetySessionProvider>();
    final activeComm = incidentProv.activeCommunity;
    final userLoc = sessionProv.locationService.currentLocation;

    // Filter by active community & selected category
    List<IncidentReport> incidents = incidentProv.activeCommunityIncidents;
    if (_filterCategory != null) {
      incidents = incidents.where((i) => i.category == _filterCategory).toList();
    }

    // Sort by closest distance to user
    final sortedIncidents = List<IncidentReport>.from(incidents);
    sortedIncidents.sort((a, b) {
      final distA = a.location.distanceTo(userLoc);
      final distB = b.location.distanceTo(userLoc);
      return distA.compareTo(distB);
    });

    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        title: const Text(
          'Report',
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
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(1.0),
          child: Container(color: const Color(0xFFF1F5F9), height: 1.0),
        ),
      ),
      body: SafeArea(
        child: Column(
          children: [
            // Active Community Jurisdiction Banner
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              decoration: const BoxDecoration(
                color: Color(0xFFF8FAFC),
                border: Border(bottom: BorderSide(color: Color(0xFFE2E8F0))),
              ),
              child: Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(6),
                    decoration: BoxDecoration(
                      color: const Color(0xFF1B8529).withOpacity(0.12),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: const Icon(Icons.location_on, size: 15, color: Color(0xFF1B8529)),
                  ),
                  const SizedBox(width: 9),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'ACTIVE COMMUNITY JURISDICTION',
                          style: TextStyle(
                            fontSize: 9.5,
                            fontWeight: FontWeight.w800,
                            color: Color(0xFF64748B),
                            letterSpacing: 0.5,
                          ),
                        ),
                        Text(
                          '${activeComm.name}, ${activeComm.code}',
                          style: const TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w700,
                            color: Color(0xFF0F172A),
                          ),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                    ),
                  ),
                  InkWell(
                    borderRadius: BorderRadius.circular(6),
                    onTap: () => _openCommunityPicker(context, sessionProv, incidentProv),
                    child: const Padding(
                      padding: EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            'Change',
                            style: TextStyle(
                              fontSize: 12.5,
                              fontWeight: FontWeight.w700,
                              color: Color(0xFF1B8529),
                            ),
                          ),
                          SizedBox(width: 2),
                          Icon(Icons.chevron_right, size: 15, color: Color(0xFF1B8529)),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),

            // Category Filter Pills
            Container(
              height: 48,
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: ListView(
                scrollDirection: Axis.horizontal,
                physics: const BouncingScrollPhysics(),
                padding: const EdgeInsets.symmetric(horizontal: 16),
                children: [
                  _buildFilterPill(
                    label: 'All',
                    isSelected: _filterCategory == null,
                    onTap: () => setState(() => _filterCategory = null),
                  ),
                  ...IncidentCategory.values.map((cat) {
                    return _buildFilterPill(
                      label: cat.label,
                      isSelected: _filterCategory == cat,
                      onTap: () => setState(() => _filterCategory = cat),
                    );
                  }),
                ],
              ),
            ),
            const Divider(height: 1, color: Color(0xFFF1F5F9)),

            // Reports Feed
            Expanded(
              child: RefreshIndicator(
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
                            child: _buildEmptyState(),
                          ),
                        ],
                      )
                    : ListView.separated(
                        physics: const AlwaysScrollableScrollPhysics(
                          parent: BouncingScrollPhysics(),
                        ),
                        padding: const EdgeInsets.fromLTRB(16, 12, 16, 88),
                        itemCount: sortedIncidents.length,
                        separatorBuilder: (_, __) => const Divider(
                          height: 1,
                          color: Color(0xFFF1F5F9),
                        ),
                        itemBuilder: (context, index) {
                          final report = sortedIncidents[index];
                          final distanceMeters = report.location.distanceTo(userLoc);
                          return _buildReportRow(report, distanceMeters);
                        },
                      ),
              ),
            ),
          ],
        ),
      ),
      floatingActionButtonLocation: FloatingActionButtonLocation.endFloat,
      floatingActionButton: Padding(
        padding: const EdgeInsets.only(bottom: 0),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            // AI Safety Summary button — left side
            Padding(
              padding: const EdgeInsets.only(left: 30),
              child: FloatingActionButton(
                heroTag: 'ai_summary_fab',
                onPressed: () => _showAiSummary(context),
                backgroundColor: const Color(0xFF0F172A),
                foregroundColor: Colors.white,
                elevation: 4,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                child: const Icon(Icons.auto_awesome_rounded, size: 20),
              ),
            ),
            // Report button — right side
            FloatingActionButton.extended(
              heroTag: 'report_fab',
              onPressed: () => _showCreateReportSheet(context),
              backgroundColor: const Color(0xFF1B8529),
              foregroundColor: Colors.white,
              elevation: 4,
              highlightElevation: 2,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(28)),
              icon: const Icon(Icons.add_rounded, size: 22),
              label: const Text(
                'Report',
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.1,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildFilterPill({
    required String label,
    required bool isSelected,
    required VoidCallback onTap,
  }) {
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: GestureDetector(
        onTap: () {
          HapticFeedback.selectionClick();
          onTap();
        },
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
          decoration: BoxDecoration(
            color: isSelected ? const Color(0xFF0F172A) : const Color(0xFFF1F5F9),
            borderRadius: BorderRadius.circular(20),
          ),
          child: Center(
            child: Text(
              label,
              style: TextStyle(
                color: isSelected ? Colors.white : const Color(0xFF475569),
                fontSize: 12.5,
                fontWeight: isSelected ? FontWeight.w600 : FontWeight.w500,
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildReportRow(IncidentReport report, double distanceMeters) {
    return InkWell(
      onTap: () => _showReportDetailSheet(context, report, distanceMeters),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Top Row: Category Pill + Proximity + Time
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: const Color(0xFFFEF2F2),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Text(
                    report.category.label,
                    style: const TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      color: Color(0xFFDC2626),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Text(
                  _formatDistance(distanceMeters),
                  style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: Color(0xFF1B8529),
                  ),
                ),
                const Spacer(),
                Text(
                  _formatTimeAgo(report.createdAt),
                  style: const TextStyle(
                    fontSize: 12,
                    color: Color(0xFF94A3B8),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),

            // Title
            Text(
              report.title,
              style: const TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.w700,
                color: Color(0xFF0F172A),
                height: 1.25,
              ),
            ),
            const SizedBox(height: 4),

            // Description Preview
            Text(
              report.description,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                fontSize: 13,
                color: Color(0xFF64748B),
                height: 1.35,
              ),
            ),
            const SizedBox(height: 8),

            // Location Address
            Row(
              children: [
                const Icon(
                  Icons.location_on_outlined,
                  size: 13,
                  color: Color(0xFF94A3B8),
                ),
                const SizedBox(width: 4),
                Expanded(
                  child: Text(
                    report.addressName ?? 'Current Community Area',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 12,
                      color: Color(0xFF94A3B8),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildEmptyState() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 64,
              height: 64,
              decoration: const BoxDecoration(
                color: Color(0xFFF1F5F9),
                shape: BoxShape.circle,
              ),
              child: const Icon(
                Icons.shield_outlined,
                size: 32,
                color: Color(0xFF94A3B8),
              ),
            ),
            const SizedBox(height: 16),
            const Text(
              'No Reports in this Area',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w700,
                color: Color(0xFF0F172A),
              ),
            ),
            const SizedBox(height: 4),
            const Text(
              'Your community is currently clear. Tap the button below to report an incident or hazard.',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 13,
                color: Color(0xFF64748B),
                height: 1.4,
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _showReportDetailSheet(BuildContext context, IncidentReport report, double distanceMeters) {
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

                // Top Badges: Category + Distance + Time
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

                // WHAT HAPPENED Section
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

                // DETAILS & DESCRIPTION Section
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

                // LOCATION Section
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
                const SizedBox(height: 16),

                // REPORTED BY Section
                const Text(
                  'REPORTED BY',
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
                      CircleAvatar(
                        radius: 13,
                        backgroundColor: const Color(0xFFE2E8F0),
                        child: Icon(
                          report.isAnonymous ? Icons.shield_outlined : Icons.person_rounded,
                          size: 14,
                          color: const Color(0xFF475569),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Text(
                        report.isAnonymous ? 'Anonymous Community Member' : report.reporterName,
                        style: const TextStyle(
                          fontSize: 13.5,
                          color: Color(0xFF0F172A),
                          fontWeight: FontWeight.w600,
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

  void _showCategoryPickerSheet(
    BuildContext context,
    IncidentCategory currentSelected,
    Function(IncidentCategory) onSelect,
  ) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (ctx) => Container(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 28),
        decoration: const BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        ),
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
            const Text(
              'Select Threat Category',
              style: TextStyle(
                color: Color(0xFF0F172A),
                fontSize: 16,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 12),
            ...IncidentCategory.values.map((cat) {
              final isSelected = currentSelected == cat;
              return ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(
                  cat.label,
                  style: TextStyle(
                    color: isSelected ? const Color(0xFF1B8529) : const Color(0xFF0F172A),
                    fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
                    fontSize: 14.5,
                  ),
                ),
                trailing: isSelected
                    ? const Icon(Icons.check_rounded, color: Color(0xFF1B8529), size: 20)
                    : null,
                onTap: () {
                  onSelect(cat);
                  Navigator.pop(ctx);
                },
              );
            }),
          ],
        ),
      ),
    );
  }

  void _showCreateReportSheet(BuildContext context) {
    HapticFeedback.selectionClick();
    final authProv = context.read<AuthProvider>();
    final sessionProv = context.read<SafetySessionProvider>();

    IncidentCategory selectedCategory = IncidentCategory.physicalThreat;
    final titleCtrl = TextEditingController();
    final descCtrl = TextEditingController();
    bool isAnonymous = true;

    // Location state for the report (null until user explicitly uses GPS or searches Google Maps)
    LocationPoint? chosenLocation;
    String? chosenAddressName;
    String? locationSource; // 'gps' | 'search' | null
    bool isGpsLoading = false;

    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (ctx) => StatefulBuilder(
        builder: (modalCtx, setModalState) {
          final user = authProv.user;
          final bottomInset = MediaQuery.of(modalCtx).viewInsets.bottom;
          final screenHeight = MediaQuery.of(modalCtx).size.height;

          return Padding(
            padding: EdgeInsets.only(bottom: bottomInset),
            child: Container(
              height: screenHeight * 0.90,
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
                      width: 40,
                      height: 4.5,
                      decoration: BoxDecoration(
                        color: const Color(0xFFE2E8F0),
                        borderRadius: BorderRadius.circular(3),
                      ),
                    ),
                  ),
                  const SizedBox(height: 14),

                  // Header Bar: Title & Cancel
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 20),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text(
                          'New Report',
                          style: TextStyle(
                            color: Color(0xFF0F172A),
                            fontSize: 18,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        TextButton(
                          onPressed: () => Navigator.pop(modalCtx),
                          child: const Text(
                            'Cancel',
                            style: TextStyle(
                              color: Color(0xFF64748B),
                              fontSize: 14,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const Divider(height: 1, color: Color(0xFFF1F5F9)),

                  // Scrollable Composer Form
                  Expanded(
                    child: SingleChildScrollView(
                      physics: const BouncingScrollPhysics(),
                      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          // Category Dropdown/Selector Button (opens modal sheet)
                          const Text(
                            'Threat Type *',
                            style: TextStyle(
                              color: Color(0xFF64748B),
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          const SizedBox(height: 6),
                          InkWell(
                            onTap: () {
                              _showCategoryPickerSheet(modalCtx, selectedCategory, (cat) {
                                setModalState(() => selectedCategory = cat);
                              });
                            },
                            borderRadius: BorderRadius.circular(12),
                            child: Container(
                              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 13),
                              decoration: BoxDecoration(
                                color: const Color(0xFFF8FAFC),
                                borderRadius: BorderRadius.circular(12),
                                border: Border.all(color: const Color(0xFFE2E8F0)),
                              ),
                              child: Row(
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                children: [
                                  Text(
                                    selectedCategory.label,
                                    style: const TextStyle(
                                      fontSize: 14.5,
                                      fontWeight: FontWeight.w600,
                                      color: Color(0xFF0F172A),
                                    ),
                                  ),
                                  const Icon(
                                    Icons.keyboard_arrow_down_rounded,
                                    color: Color(0xFF64748B),
                                    size: 20,
                                  ),
                                ],
                              ),
                            ),
                          ),
                          const SizedBox(height: 14),

                          // What Happened / Title Input
                          const Text(
                            'What Happened *',
                            style: TextStyle(
                              color: Color(0xFF64748B),
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          const SizedBox(height: 6),
                          TextField(
                            controller: titleCtrl,
                            style: const TextStyle(
                              fontSize: 14.5,
                              fontWeight: FontWeight.w600,
                              color: Color(0xFF0F172A),
                            ),
                            decoration: InputDecoration(
                              hintText: 'e.g. Suspicious activity near the gate',
                              hintStyle: const TextStyle(
                                color: Color(0xFF94A3B8),
                                fontSize: 13.5,
                                fontWeight: FontWeight.normal,
                              ),
                              filled: true,
                              fillColor: const Color(0xFFF8FAFC),
                              contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 13),
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
                          const SizedBox(height: 14),

                          // Incident Details Input
                          const Text(
                            'Incident Details & Description',
                            style: TextStyle(
                              color: Color(0xFF64748B),
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          const SizedBox(height: 6),
                          TextField(
                            controller: descCtrl,
                            minLines: 3,
                            maxLines: 5,
                            style: const TextStyle(
                              fontSize: 14,
                              color: Color(0xFF0F172A),
                              height: 1.45,
                            ),
                            decoration: InputDecoration(
                              hintText: 'Add details, suspect descriptions, vehicle plates, or hazards...',
                              hintStyle: const TextStyle(
                                color: Color(0xFF94A3B8),
                                fontSize: 13.5,
                              ),
                              filled: true,
                              fillColor: const Color(0xFFF8FAFC),
                              contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 13),
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
                          const SizedBox(height: 14),
                          const Divider(height: 1, color: Color(0xFFF1F5F9)),
                          const SizedBox(height: 12),

                          // Location Section
                          const Text(
                            'Incident Location *',
                            style: TextStyle(
                              color: Color(0xFF64748B),
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          const SizedBox(height: 8),

                          // Resolved Location Card (or prompt to pick if null)
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                            decoration: BoxDecoration(
                              color: chosenAddressName != null ? const Color(0xFFF8FAFC) : const Color(0xFFFFFBEB),
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(
                                color: chosenAddressName != null ? const Color(0xFFE2E8F0) : const Color(0xFFFDE68A),
                              ),
                            ),
                            child: Row(
                              children: [
                                Icon(
                                  chosenAddressName != null ? Icons.location_on_rounded : Icons.info_outline_rounded,
                                  size: 18,
                                  color: chosenAddressName != null ? const Color(0xFF1B8529) : const Color(0xFFD97706),
                                ),
                                const SizedBox(width: 10),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        chosenAddressName ?? 'No location selected yet',
                                        style: TextStyle(
                                          fontSize: 13,
                                          fontWeight: FontWeight.w700,
                                          color: chosenAddressName != null ? const Color(0xFF0F172A) : const Color(0xFF92400E),
                                        ),
                                        maxLines: 2,
                                        overflow: TextOverflow.ellipsis,
                                      ),
                                      const SizedBox(height: 2),
                                      Text(
                                        chosenAddressName != null
                                            ? 'Selected Community Location'
                                            : 'Please use GPS or Search Area below to set location',
                                        style: TextStyle(
                                          fontSize: 11.5,
                                          color: chosenAddressName != null ? const Color(0xFF64748B) : const Color(0xFFB45309),
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(height: 10),

                          // Location Action Options: "Use My GPS" vs "Search Google Maps"
                          Builder(
                            builder: (bCtx) {
                              final isGpsPicked = locationSource == 'gps';
                              final isSearchPicked = locationSource == 'search';

                              return Row(
                                children: [
                                  // Option 1: Use Current GPS
                                  Expanded(
                                    child: OutlinedButton.icon(
                                      onPressed: isGpsLoading
                                          ? null
                                          : () async {
                                              setModalState(() => isGpsLoading = true);
                                              final hasPerm = sessionProv.locationService.hasLocationPermission;
                                              if (!hasPerm) {
                                                await sessionProv.locationService.requestLocationPermission();
                                              }
                                              await sessionProv.locationService.refreshCurrentLocation();
                                              final liveLoc = sessionProv.locationService.currentLocation;
                                              final addr = await sessionProv.locationService.reverseGeocodeLocation(liveLoc);
                                              setModalState(() {
                                                chosenLocation = liveLoc;
                                                chosenAddressName = addr;
                                                locationSource = 'gps';
                                                isGpsLoading = false;
                                              });
                                            },
                                      icon: isGpsLoading
                                          ? const SizedBox(
                                              width: 15,
                                              height: 15,
                                              child: Center(
                                                child: SpinKitDualRing(
                                                  color: Color(0xFF1B8529),
                                                  size: 14,
                                                  lineWidth: 1.8,
                                                ),
                                              ),
                                            )
                                          : Icon(
                                              Icons.gps_fixed_rounded,
                                              size: 15,
                                              color: isGpsPicked ? const Color(0xFF1B8529) : const Color(0xFF64748B),
                                            ),
                                      label: Text(
                                        isGpsLoading ? 'Locating...' : 'Use My GPS',
                                        style: TextStyle(
                                          fontSize: 12.5,
                                          fontWeight: isGpsPicked ? FontWeight.w700 : FontWeight.w600,
                                          color: isGpsPicked ? const Color(0xFF1B8529) : const Color(0xFF0F172A),
                                        ),
                                      ),
                                      style: OutlinedButton.styleFrom(
                                        foregroundColor: isGpsPicked ? const Color(0xFF1B8529) : const Color(0xFF0F172A),
                                        backgroundColor: isGpsPicked ? const Color(0xFFF0FDF4) : Colors.transparent,
                                        side: BorderSide(
                                          color: isGpsPicked ? const Color(0xFF1B8529) : const Color(0xFFE2E8F0),
                                          width: isGpsPicked ? 1.5 : 1.0,
                                        ),
                                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                                        padding: const EdgeInsets.symmetric(vertical: 10),
                                      ),
                                    ),
                                  ),
                                  const SizedBox(width: 8),

                                  // Option 2: Search Google Maps API
                                  Expanded(
                                    child: OutlinedButton.icon(
                                      onPressed: () async {
                                        final selected = await LocationPickerSheet.show(
                                          context,
                                          locationService: sessionProv.locationService,
                                          onLocationSelected: (loc, [placeTitle]) async {
                                            final addr = await sessionProv.locationService.reverseGeocodeLocation(loc);
                                            setModalState(() {
                                              chosenLocation = loc;
                                              chosenAddressName = placeTitle != null && placeTitle.isNotEmpty ? placeTitle : addr;
                                              locationSource = 'search';
                                            });
                                          },
                                        );
                                        if (selected != null) {
                                          final addr = await sessionProv.locationService.reverseGeocodeLocation(selected);
                                          setModalState(() {
                                            chosenLocation = selected;
                                            chosenAddressName = addr;
                                            locationSource = 'search';
                                          });
                                        }
                                      },
                                      icon: Icon(
                                        Icons.search_rounded,
                                        size: 16,
                                        color: isSearchPicked ? const Color(0xFF1B8529) : const Color(0xFF64748B),
                                      ),
                                      label: Text(
                                        'Search Area',
                                        style: TextStyle(
                                          fontSize: 12.5,
                                          fontWeight: isSearchPicked ? FontWeight.w700 : FontWeight.w600,
                                          color: isSearchPicked ? const Color(0xFF1B8529) : const Color(0xFF0F172A),
                                        ),
                                      ),
                                      style: OutlinedButton.styleFrom(
                                        foregroundColor: isSearchPicked ? const Color(0xFF1B8529) : const Color(0xFF0F172A),
                                        backgroundColor: isSearchPicked ? const Color(0xFFF0FDF4) : Colors.transparent,
                                        side: BorderSide(
                                          color: isSearchPicked ? const Color(0xFF1B8529) : const Color(0xFFE2E8F0),
                                          width: isSearchPicked ? 1.5 : 1.0,
                                        ),
                                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                                        padding: const EdgeInsets.symmetric(vertical: 10),
                                      ),
                                    ),
                                  ),
                                ],
                              );
                            },
                          ),
                          const SizedBox(height: 16),
                          const Divider(height: 1, color: Color(0xFFF1F5F9)),
                          const SizedBox(height: 4),

                          // Report Anonymously Toggle Switch
                          SwitchListTile(
                            contentPadding: EdgeInsets.zero,
                            title: const Text(
                              'Report anonymously',
                              style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: Color(0xFF0F172A)),
                            ),
                            subtitle: const Text(
                              'Hide your name on the community reports feed',
                              style: TextStyle(fontSize: 12.5, color: Color(0xFF64748B)),
                            ),
                            value: isAnonymous,
                            activeColor: const Color(0xFF1B8529),
                            onChanged: (val) => setModalState(() => isAnonymous = val),
                          ),
                          const SizedBox(height: 16),
                        ],
                      ),
                    ),
                  ),

                  // Bottom Pinned Post Button (Green)
                  Container(
                    padding: EdgeInsets.fromLTRB(
                      20,
                      12,
                      20,
                      MediaQuery.of(modalCtx).padding.bottom > 0 ? 12 : 24,
                    ),
                    decoration: const BoxDecoration(
                      color: Colors.white,
                      border: Border(
                        top: BorderSide(color: Color(0xFFF1F5F9), width: 1.0),
                      ),
                    ),
                    child: SizedBox(
                      width: double.infinity,
                      height: 48,
                      child: ElevatedButton(
                        onPressed: () {
                          final title = titleCtrl.text.trim();
                          final desc = descCtrl.text.trim();
                          if (title.isEmpty) {
                            AppNotification.show(
                              context,
                              message: 'Please provide a title summary.',
                              type: NotificationType.error,
                            );
                            return;
                          }

                          // Mandatory location verification
                          if (chosenLocation == null || chosenAddressName == null) {
                            AppNotification.show(
                              context,
                              message: 'Please select a location using GPS or Google Maps search before submitting.',
                              type: NotificationType.error,
                            );
                            return;
                          }

                          final incProv = context.read<IncidentProvider>();
                          incProv.reportIncident(
                            user: user,
                            title: title,
                            description: desc.isNotEmpty ? desc : title,
                            category: selectedCategory,
                            location: chosenLocation!,
                            addressName: chosenAddressName!,
                            isAnonymous: isAnonymous,
                            urgency: IncidentUrgency.critical,
                          );

                          Navigator.pop(modalCtx);

                          AppNotification.show(
                            context,
                            message: 'Report published to the community.',
                            type: NotificationType.success,
                          );
                        },
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF1B8529), // Brand Green
                          foregroundColor: Colors.white,
                          elevation: 0,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                        ),
                        child: const Text(
                          'Submit Report',
                          style: TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}

// ─── AI Safety Summary Bottom Sheet ──────────────────────────────────────────

class _AiSafetySummarySheet extends StatefulWidget {
  final String communityName;
  final ValueNotifier<bool> isLoadingNotifier;
  final ValueNotifier<Map<String, dynamic>?> reportNotifier;
  final VoidCallback onRefresh;

  const _AiSafetySummarySheet({
    required this.communityName,
    required this.isLoadingNotifier,
    required this.reportNotifier,
    required this.onRefresh,
  });

  @override
  State<_AiSafetySummarySheet> createState() => _AiSafetySummarySheetState();
}

class _AiSafetySummarySheetState extends State<_AiSafetySummarySheet>
    with TickerProviderStateMixin {
  late final AnimationController _dotController;
  late final AnimationController _skeletonController;

  @override
  void initState() {
    super.initState();
    _dotController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1200),
    )..repeat(reverse: true);
    _skeletonController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1500),
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _dotController.dispose();
    _skeletonController.dispose();
    super.dispose();
  }

  List<String> _extractParagraphs(Map<String, dynamic>? r) {
    if (r == null) return [];

    final paragraphs = <String>[];

    // 1. Try markdownReport first (clean 2-paragraph format)
    final md = r['markdownReport'] as String?;
    if (md != null && md.trim().isNotEmpty) {
      final blocks = md
          .split('\n\n')
          .map((b) => b
              .replaceAll(RegExp(r'^#+\s*', multiLine: true), '')
              .replaceAll(RegExp(r'\*+'), '')
              .replaceAll(RegExp(r'^-\s*', multiLine: true), '')
              .trim())
          .where((b) => b.length > 30)
          .toList();
      if (blocks.isNotEmpty) return blocks.take(2).toList();
    }

    // 2. Fallback: executiveSummary
    final exec = r['executiveSummary'] as String?;
    if (exec != null && exec.trim().isNotEmpty) {
      paragraphs.add(exec.trim());
    }

    // 3. Citizen advice as second paragraph
    final advice = r['citizenAdvice'] as List?;
    if (advice != null && advice.isNotEmpty) {
      final recs = advice
          .map((a) => (a as Map?)?['recommendation'] as String?)
          .whereType<String>()
          .join(' ');
      if (recs.isNotEmpty) {
        paragraphs.add('For your safety: $recs');
      }
    }

    return paragraphs.isNotEmpty
        ? paragraphs
        : ['Safety intelligence indicates standard conditions for this area. Remain situationally aware and report any incidents through the app.'];
  }

  Widget _buildSkeletonBar(double widthFactor, double delay) {
    return AnimatedBuilder(
      animation: _skeletonController,
      builder: (_, __) {
        final opacity = 0.4 + (_skeletonController.value * 0.5);
        return Opacity(
          opacity: opacity,
          child: FractionallySizedBox(
            widthFactor: widthFactor,
            alignment: Alignment.centerLeft,
            child: Container(
              height: 8,
              decoration: BoxDecoration(
                color: const Color(0xFFF1F5F9),
                borderRadius: BorderRadius.circular(4),
              ),
            ),
          ),
        );
      },
    );
  }

  Widget _buildDot(double delay) {
    return AnimatedBuilder(
      animation: _dotController,
      builder: (_, __) {
        // Staggered opacity via offset approximation
        final t = (_dotController.value + delay) % 1.0;
        final opacity = 0.3 + (t < 0.5 ? t * 2 : (1 - t) * 2) * 0.7;
        final scale = 0.85 + (t < 0.5 ? t * 2 : (1 - t) * 2) * 0.3;
        return Transform.scale(
          scale: scale,
          child: Opacity(
            opacity: opacity,
            child: Container(
              width: 8,
              height: 8,
              decoration: const BoxDecoration(
                color: Color(0xFF10B981),
                shape: BoxShape.circle,
              ),
            ),
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<bool>(
      valueListenable: widget.isLoadingNotifier,
      builder: (context, isLoading, _) {
        return ValueListenableBuilder<Map<String, dynamic>?>(
          valueListenable: widget.reportNotifier,
          builder: (context, report, _) {
            final paragraphs = _extractParagraphs(report);
            return Container(
              margin: const EdgeInsets.fromLTRB(12, 0, 12, 16),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(12),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withOpacity(0.12),
                    blurRadius: 24,
                    offset: const Offset(0, -4),
                  ),
                ],
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  // Drag handle
                  Container(
                    margin: const EdgeInsets.only(top: 10, bottom: 4),
                    width: 36,
                    height: 4,
                    decoration: BoxDecoration(
                      color: const Color(0xFFE2E8F0),
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),

                  // Header
                  Padding(
                    padding: const EdgeInsets.fromLTRB(20, 10, 16, 12),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                widget.communityName,
                                style: const TextStyle(
                                  fontSize: 16,
                                  fontWeight: FontWeight.w700,
                                  color: Color(0xFF0F172A),
                                  letterSpacing: -0.3,
                                ),
                              ),
                              const SizedBox(height: 2),
                              const Text(
                                'Community Safety Intelligence',
                                style: TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w500,
                                  color: Color(0xFF64748B),
                                ),
                              ),
                            ],
                          ),
                        ),
                        if (!isLoading) ...[
                          // Refresh button
                          GestureDetector(
                            onTap: widget.onRefresh,
                            child: Container(
                              width: 32,
                              height: 32,
                              decoration: BoxDecoration(
                                border: Border.all(color: const Color(0xFFE2E8F0)),
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: const Icon(
                                Icons.refresh_rounded,
                                size: 16,
                                color: Color(0xFF64748B),
                              ),
                            ),
                          ),
                          const SizedBox(width: 8),
                        ],
                        GestureDetector(
                          onTap: () => Navigator.of(context).pop(),
                          child: Container(
                            width: 32,
                            height: 32,
                            decoration: BoxDecoration(
                              border: Border.all(color: const Color(0xFFE2E8F0)),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: const Icon(
                              Icons.close_rounded,
                              size: 16,
                              color: Color(0xFF64748B),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),

                  const Divider(height: 1, color: Color(0xFFE2E8F0)),

                  // Body
                  Padding(
                    padding: const EdgeInsets.all(20),
                    child: isLoading
                        ? Column(
                            crossAxisAlignment: CrossAxisAlignment.center,
                            children: [
                              const SizedBox(height: 20),
                              // Three-dot pulse
                              Row(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  _buildDot(0.0),
                                  const SizedBox(width: 8),
                                  _buildDot(0.15),
                                  const SizedBox(width: 8),
                                  _buildDot(0.3),
                                ],
                              ),
                              const SizedBox(height: 16),
                              const Text(
                                'Synthesizing community intelligence...',
                                style: TextStyle(
                                  fontSize: 13,
                                  color: Color(0xFF64748B),
                                  fontWeight: FontWeight.w500,
                                ),
                              ),
                              const SizedBox(height: 20),
                              // Skeleton bars
                              Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  _buildSkeletonBar(1.0, 0.0),
                                  const SizedBox(height: 9),
                                  _buildSkeletonBar(0.9, 0.1),
                                  const SizedBox(height: 9),
                                  _buildSkeletonBar(0.75, 0.2),
                                ],
                              ),
                              const SizedBox(height: 20),
                            ],
                          )
                        : Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: paragraphs.asMap().entries.map((entry) {
                              return Padding(
                                padding: EdgeInsets.only(
                                  bottom: entry.key < paragraphs.length - 1 ? 16 : 0,
                                ),
                                child: Text(
                                  entry.value,
                                  style: const TextStyle(
                                    fontSize: 14.5,
                                    height: 1.7,
                                    color: Color(0xFF334155),
                                    fontWeight: FontWeight.w400,
                                  ),
                                ),
                              );
                            }).toList(),
                          ),
                  ),

                  const Divider(height: 1, color: Color(0xFFE2E8F0)),

                  // Footer
                  Padding(
                    padding: EdgeInsets.fromLTRB(
                      20,
                      12,
                      20,
                      12 + MediaQuery.of(context).padding.bottom,
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Row(
                          children: [
                            Icon(
                              Icons.auto_awesome_rounded,
                              size: 13,
                              color: Color(0xFF10B981),
                            ),
                            SizedBox(width: 6),
                            Text(
                              'Powered by Gemini AI',
                              style: TextStyle(
                                fontSize: 12,
                                color: Color(0xFF64748B),
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                          ],
                        ),
                        GestureDetector(
                          onTap: () => Navigator.of(context).pop(),
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 7),
                            decoration: BoxDecoration(
                              color: const Color(0xFF0F172A),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: const Text(
                              'Okay',
                              style: TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w600,
                                color: Colors.white,
                              ),
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
