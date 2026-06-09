/// Base error type surfaced to the UI. Repositories catch provider-specific
/// errors (Supabase, HTTP, GPS) and rethrow one of these.
sealed class AppException implements Exception {
  const AppException(this.message, [this.cause]);

  final String message;
  final Object? cause;

  @override
  String toString() => '$runtimeType: $message';
}

class NetworkException extends AppException {
  const NetworkException(super.message, [super.cause]);
}

class AuthException extends AppException {
  const AuthException(super.message, [super.cause]);
}

class PermissionException extends AppException {
  const PermissionException(super.message, [super.cause]);
}

class NotFoundException extends AppException {
  const NotFoundException(super.message, [super.cause]);
}

class UnknownException extends AppException {
  const UnknownException(super.message, [super.cause]);
}
