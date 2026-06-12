import 'dart:async';

import '../../../shared/models/models.dart';
import '../domain/auth_repository.dart';

/// Used when SUPABASE_URL is not configured: lets the app run end-to-end
/// in pure local/demo mode. L'Échappée est sans compte : un profil local
/// anonyme existe toujours, rien n'est demandé à l'utilisateur.
class MockAuthRepository implements AuthRepository {
  UserProfile? _user;
  final _controller = StreamController<UserProfile?>.broadcast();

  @override
  Future<UserProfile?> currentUser() async =>
      _user ??= const UserProfile(id: 'local-user', displayName: 'Voyageur');

  @override
  Future<UserProfile> signInWithPassword(String email, String password) async {
    await Future<void>.delayed(const Duration(milliseconds: 300));
    _user = UserProfile(id: 'mock-user', email: email, displayName: 'Démo');
    _controller.add(_user);
    return _user!;
  }

  @override
  Future<UserProfile> signUp(String email, String password) =>
      signInWithPassword(email, password);

  @override
  Future<void> signOut() async {
    _user = null;
    _controller.add(null);
  }

  @override
  Stream<UserProfile?> authStateChanges() => _controller.stream;
}

class MockUserRepository implements UserRepository {
  final _profiles = <String, UserProfile>{};

  @override
  Future<UserProfile?> getProfile(String userId) async =>
      _profiles[userId] ?? UserProfile(id: userId, displayName: 'Démo');

  @override
  Future<void> updateProfile(UserProfile profile) async {
    _profiles[profile.id] = profile;
  }
}
