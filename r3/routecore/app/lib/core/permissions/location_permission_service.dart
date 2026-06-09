import 'package:geolocator/geolocator.dart';

import '../errors/app_exception.dart';

/// Wraps geolocator permission flow. GPS is never read without the user's
/// explicit consent (RGPD) — callers must check consent in the profile first.
class LocationPermissionService {
  Future<bool> ensurePermission() async {
    final serviceEnabled = await Geolocator.isLocationServiceEnabled();
    if (!serviceEnabled) {
      throw const PermissionException('Le service de localisation est désactivé.');
    }
    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    if (permission == LocationPermission.denied ||
        permission == LocationPermission.deniedForever) {
      return false;
    }
    return true;
  }
}
