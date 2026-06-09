import 'package:supabase_flutter/supabase_flutter.dart' hide AuthException;

import '../../../core/logging/app_logger.dart';
import '../../../shared/models/models.dart';
import '../domain/analytics_repository.dart';

class SupabaseAnalyticsRepository implements AnalyticsRepository {
  SupabaseAnalyticsRepository(this._client);

  final SupabaseClient _client;
  static const _log = AppLogger('analytics');

  @override
  Future<void> logEvent(
    String eventName, {
    Map<String, dynamic> properties = const {},
    ProductContext productContext = ProductContext.common,
    String? userId,
  }) async {
    try {
      await _client.from('analytics_events').insert({
        'event_name': eventName,
        'product_context': productContext.name,
        'properties': properties,
        'user_id': userId,
      });
    } catch (e) {
      // Analytics must never break the UX — log and move on.
      _log.warn('logEvent($eventName) failed: $e');
    }
  }
}

class ConsoleAnalyticsRepository implements AnalyticsRepository {
  static const _log = AppLogger('analytics');

  @override
  Future<void> logEvent(
    String eventName, {
    Map<String, dynamic> properties = const {},
    ProductContext productContext = ProductContext.common,
    String? userId,
  }) async {
    _log.info('$eventName ctx=${productContext.name} props=$properties');
  }
}
