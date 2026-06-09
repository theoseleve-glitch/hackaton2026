import '../../../shared/models/models.dart';

abstract class AuthRepository {
  Future<UserProfile?> currentUser();
  Future<UserProfile> signInWithPassword(String email, String password);
  Future<UserProfile> signUp(String email, String password);
  Future<void> signOut();
  Stream<UserProfile?> authStateChanges();
}

abstract class UserRepository {
  Future<UserProfile?> getProfile(String userId);
  Future<void> updateProfile(UserProfile profile);
}
