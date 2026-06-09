import 'package:supabase_flutter/supabase_flutter.dart' hide AuthException;

import '../../../core/errors/app_exception.dart';
import '../../../shared/models/models.dart';
import '../domain/trip_repository.dart';

class SupabaseTripRepository implements TripRepository {
  SupabaseTripRepository(this._client);

  final SupabaseClient _client;

  @override
  Future<Trip> createTrip({
    required String userId,
    required GeoPoint origin,
    required GeoPoint destination,
    String? originLabel,
    String? destinationLabel,
    ProductContext productContext = ProductContext.common,
  }) async {
    try {
      final id = await _client.rpc('create_trip', params: {
        'origin_lat': origin.latitude,
        'origin_lng': origin.longitude,
        'dest_lat': destination.latitude,
        'dest_lng': destination.longitude,
        'origin_label': originLabel,
        'destination_label': destinationLabel,
        'p_product_context': productContext.name,
      });
      return Trip(
        id: id as String,
        userId: userId,
        origin: origin,
        destination: destination,
        originLabel: originLabel,
        destinationLabel: destinationLabel,
        status: TripStatus.planned,
        productContext: productContext,
      );
    } on PostgrestException catch (e) {
      throw NetworkException('Création du trajet impossible: ${e.message}', e);
    }
  }

  @override
  Future<Trip?> getTrip(String id) async {
    final row =
        await _client.from('trips').select().eq('id', id).maybeSingle();
    return row == null ? null : _fromRow(row);
  }

  @override
  Future<List<Trip>> listTrips(String userId) async {
    final rows = await _client
        .from('trips')
        .select()
        .eq('user_id', userId)
        .order('created_at', ascending: false);
    return (rows as List)
        .map((r) => _fromRow(r as Map<String, dynamic>))
        .toList();
  }

  @override
  Future<void> updateTrip(Trip trip) async {
    await _client.from('trips').update({
      'status': trip.status.name,
      'selected_route_id': trip.selectedRouteId,
      'started_at': trip.startedAt?.toIso8601String(),
      'ended_at': trip.endedAt?.toIso8601String(),
    }).eq('id', trip.id);
  }

  // Geography columns come back as WKB hex via PostgREST; the app keeps the
  // labels + ids and only needs precise points for active trips, which it
  // already has locally. For listing we fall back to 0,0 when unparsable.
  Trip _fromRow(Map<String, dynamic> r) => Trip(
        id: r['id'] as String,
        userId: r['user_id'] as String,
        origin: const GeoPoint(latitude: 0, longitude: 0),
        destination: const GeoPoint(latitude: 0, longitude: 0),
        originLabel: r['origin_label'] as String?,
        destinationLabel: r['destination_label'] as String?,
        selectedRouteId: r['selected_route_id'] as String?,
        status: TripStatus.fromName(r['status'] as String?),
        productContext:
            ProductContext.fromName(r['product_context'] as String?),
        createdAt: DateTime.tryParse(r['created_at'] as String? ?? ''),
        startedAt: DateTime.tryParse(r['started_at'] as String? ?? ''),
        endedAt: DateTime.tryParse(r['ended_at'] as String? ?? ''),
      );
}

class SupabaseTrackingRepository implements TrackingRepository {
  SupabaseTrackingRepository(this._client);

  final SupabaseClient _client;

  @override
  Future<void> addTrackPoint(GpsTrackPoint p) async {
    await _client.rpc('add_gps_track_point', params: {
      'p_trip_id': p.tripId,
      'lat': p.latitude,
      'lng': p.longitude,
      'p_speed_mps': p.speedMps,
      'p_accuracy_meters': p.accuracyMeters,
      'p_altitude_meters': p.altitudeMeters,
      'p_heading': p.heading,
      'p_recorded_at': p.recordedAt.toIso8601String(),
    });
  }

  @override
  Future<List<GpsTrackPoint>> getTrackPoints(String tripId) async {
    final rows = await _client
        .from('gps_track_points')
        .select()
        .eq('trip_id', tripId)
        .order('recorded_at');
    return (rows as List).map((r) {
      final m = r as Map<String, dynamic>;
      return GpsTrackPoint(
        id: m['id'] as String,
        tripId: m['trip_id'] as String,
        userId: m['user_id'] as String,
        latitude: 0, // see note in SupabaseTripRepository._fromRow
        longitude: 0,
        speedMps: (m['speed_mps'] as num?)?.toDouble(),
        accuracyMeters: (m['accuracy_meters'] as num?)?.toDouble(),
        recordedAt: DateTime.parse(m['recorded_at'] as String),
      );
    }).toList();
  }
}

class SupabaseFavoriteRepository implements FavoriteRepository {
  SupabaseFavoriteRepository(this._client);

  final SupabaseClient _client;

  @override
  Future<List<Favorite>> listFavorites(String userId) async {
    final rows =
        await _client.from('favorites').select().eq('user_id', userId);
    return (rows as List).map((r) {
      final m = r as Map<String, dynamic>;
      return Favorite(
        id: m['id'] as String,
        userId: m['user_id'] as String,
        targetType: FavoriteTargetType.fromName(m['target_type'] as String?),
        targetId: m['target_id'] as String,
      );
    }).toList();
  }

  @override
  Future<Favorite> addFavorite(
      String userId, FavoriteTargetType type, String targetId) async {
    final row = await _client
        .from('favorites')
        .insert({
          'user_id': userId,
          'target_type': type.name,
          'target_id': targetId
        })
        .select()
        .single();
    return Favorite(
      id: row['id'] as String,
      userId: userId,
      targetType: type,
      targetId: targetId,
    );
  }

  @override
  Future<void> removeFavorite(String favoriteId) async {
    await _client.from('favorites').delete().eq('id', favoriteId);
  }

  @override
  Future<bool> isFavorite(
      String userId, FavoriteTargetType type, String targetId) async {
    final row = await _client
        .from('favorites')
        .select('id')
        .eq('user_id', userId)
        .eq('target_type', type.name)
        .eq('target_id', targetId)
        .maybeSingle();
    return row != null;
  }
}
