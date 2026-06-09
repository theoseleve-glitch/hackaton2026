import 'dart:async';

import 'package:supabase_flutter/supabase_flutter.dart' as sb;

import '../../../core/errors/app_exception.dart';
import '../../../shared/models/models.dart';
import '../domain/auth_repository.dart';

class SupabaseAuthRepository implements AuthRepository {
  SupabaseAuthRepository(this._client);

  final sb.SupabaseClient _client;

  UserProfile _fromUser(sb.User user) => UserProfile(
        id: user.id,
        email: user.email,
      );

  @override
  Future<UserProfile?> currentUser() async {
    final user = _client.auth.currentUser;
    return user == null ? null : _fromUser(user);
  }

  @override
  Future<UserProfile> signInWithPassword(String email, String password) async {
    try {
      final res = await _client.auth
          .signInWithPassword(email: email, password: password);
      final user = res.user;
      if (user == null) throw const AuthException('Connexion impossible.');
      return _fromUser(user);
    } on sb.AuthException catch (e) {
      throw AuthException(e.message, e);
    }
  }

  @override
  Future<UserProfile> signUp(String email, String password) async {
    try {
      final res = await _client.auth.signUp(email: email, password: password);
      final user = res.user;
      if (user == null) throw const AuthException('Inscription impossible.');
      return _fromUser(user);
    } on sb.AuthException catch (e) {
      throw AuthException(e.message, e);
    }
  }

  @override
  Future<void> signOut() => _client.auth.signOut();

  @override
  Stream<UserProfile?> authStateChanges() =>
      _client.auth.onAuthStateChange.map((event) {
        final user = event.session?.user;
        return user == null ? null : _fromUser(user);
      });
}

class SupabaseUserRepository implements UserRepository {
  SupabaseUserRepository(this._client);

  final sb.SupabaseClient _client;

  @override
  Future<UserProfile?> getProfile(String userId) async {
    final row = await _client
        .from('profiles')
        .select()
        .eq('id', userId)
        .maybeSingle();
    return row == null ? null : UserProfile.fromJson(row);
  }

  @override
  Future<void> updateProfile(UserProfile profile) async {
    await _client
        .from('profiles')
        .update(profile.toJson()..remove('id'))
        .eq('id', profile.id);
  }
}
