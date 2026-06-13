import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:routecore/product_modules/ecodrive/data/driving_sensors.dart';
import 'package:sensors_plus/sensors_plus.dart';

void main() {
  // sensors_plus event constructors are positional: (x, y, z, timestamp).
  UserAccelerometerEvent accel(double x, double y, double z) =>
      UserAccelerometerEvent(x, y, z, DateTime(2024));
  GyroscopeEvent gyro(double x, double y, double z) =>
      GyroscopeEvent(x, y, z, DateTime(2024));
  MagnetometerEvent magneto(double x, double y, double z) =>
      MagnetometerEvent(x, y, z, DateTime(2024));

  group('DrivingSensors compass', () {
    // Screen-plane heading: (atan2(-y, x) * 180/pi + 360) % 360.
    //   x>0, y=0  → North (0)      x=0, y<0 → East (90)
    //   x<0, y=0  → South (180)    x=0, y>0 → West (270)
    test('cardinal magnetometer inputs map to expected headings', () async {
      for (final (mx, my, expected) in const [
        (1.0, 0.0, 0.0), // North
        (0.0, -1.0, 90.0), // East
        (-1.0, 0.0, 180.0), // South
        (0.0, 1.0, 270.0), // West
      ]) {
        // compassAlpha = 1 disables smoothing so a single sample passes through.
        final sensors = DrivingSensors(
          magnetometer: Stream.value(magneto(mx, my, 0)),
          compassAlpha: 1,
        );
        final heading = await sensors.compassHeadings.first;
        expect(heading, closeTo(expected, 1e-6),
            reason: 'x=$mx, y=$my should read $expected');
        await sensors.dispose();
      }
    });

    test('y=+ (with x=0) reads West (270), confirming the sign convention',
        () async {
      final sensors = DrivingSensors(
        magnetometer: Stream.value(magneto(0, 1, 0)),
        compassAlpha: 1,
      );
      expect(await sensors.compassHeadings.first, closeTo(270, 1e-6));
      await sensors.dispose();
    });

    test('smoothing eases toward and converges on a steady input', () async {
      final controller = StreamController<MagnetometerEvent>();
      final sensors = DrivingSensors(
        magnetometer: controller.stream,
        compassAlpha: 0.2,
      );
      final headings = <double>[];
      final sub = sensors.compassHeadings.listen(headings.add);
      // First sample (North = 0) passes through; subsequent East readings (90)
      // make the EMA climb monotonically from ~0 toward ~90.
      controller.add(magneto(1, 0, 0)); // North
      for (var i = 0; i < 40; i++) {
        controller.add(magneto(0, -1, 0)); // East
      }
      // Drain the event loop until every queued sample has been smoothed.
      for (var i = 0; i < 50 && headings.length < 41; i++) {
        await Future<void>.delayed(Duration.zero);
      }
      await sub.cancel();
      await controller.close();

      expect(headings, hasLength(41));
      expect(headings.first, closeTo(0, 1e-6), reason: 'first sample lags none');
      expect(headings[1], greaterThan(0));
      expect(headings[1], lessThan(90), reason: 'second sample eases, not jumps');
      expect(headings.last, closeTo(90, 1), reason: 'EMA converges on East');
      expect(sensors.compassHeading, closeTo(90, 1));
      await sensors.dispose();
    });

    test('magnetometer error → compassAvailable false and stream silent',
        () async {
      final sensors = DrivingSensors(
        magnetometer: Stream<MagnetometerEvent>.error(StateError('no sensor')),
        compassAlpha: 1,
      );
      final received = <double>[];
      var closed = false;
      sensors.compassHeadings.listen(received.add, onDone: () => closed = true);
      await Future<void>.delayed(Duration.zero);
      expect(received, isEmpty, reason: 'errors never reach listeners');
      expect(closed, isTrue, reason: 'the stream closes on sensor error');
      expect(sensors.compassAvailable, isFalse);
      expect(sensors.compassHeading, isNull);
      await sensors.dispose();
    });
  });

  group('DrivingSensors samples (harsh-event detection)', () {
    test('harsh brake flagged when signed accel <= threshold and gyro calm',
        () async {
      final accelCtrl = StreamController<UserAccelerometerEvent>();
      final gyroCtrl = StreamController<GyroscopeEvent>();
      final sensors = DrivingSensors(
        accelerometer: accelCtrl.stream,
        gyroscope: gyroCtrl.stream,
        harshBrakeMps2: 3.0,
        handlingGyroRadS: 1.5,
        lowPassAlpha: 1, // no low-pass lag: magnitude passes straight through.
      );
      final samples = <DrivingSample>[];
      final sub = sensors.samples.listen(samples.add);

      // Speed is dropping → GPS trend signs the magnitude negative (braking).
      sensors.updateSpeed(20, at: DateTime(2024, 1, 1, 0, 0, 0));
      sensors.updateSpeed(10, at: DateTime(2024, 1, 1, 0, 0, 1));

      gyroCtrl.add(gyro(0, 0, 0.1)); // calm phone (|gyro| < handling limit)
      await Future<void>.delayed(Duration.zero);
      accelCtrl.add(accel(4, 0, 0)); // magnitude 4 m/s² ≥ brake threshold
      await Future<void>.delayed(Duration.zero);

      expect(samples, isNotEmpty);
      final s = samples.last;
      expect(s.valid, isTrue);
      expect(s.longitudinalAccel, lessThan(0), reason: 'signed by GPS decel');
      expect(s.harshBrake, isTrue);
      expect(s.harshAccel, isFalse);

      await sub.cancel();
      await accelCtrl.close();
      await gyroCtrl.close();
      await sensors.dispose();
    });

    test('gyro over handling limit invalidates the sample and suppresses flags',
        () async {
      final accelCtrl = StreamController<UserAccelerometerEvent>();
      final gyroCtrl = StreamController<GyroscopeEvent>();
      final sensors = DrivingSensors(
        accelerometer: accelCtrl.stream,
        gyroscope: gyroCtrl.stream,
        harshBrakeMps2: 3.0,
        handlingGyroRadS: 1.5,
        lowPassAlpha: 1,
      );
      final samples = <DrivingSample>[];
      final sub = sensors.samples.listen(samples.add);

      sensors.updateSpeed(20, at: DateTime(2024, 1, 1, 0, 0, 0));
      sensors.updateSpeed(10, at: DateTime(2024, 1, 1, 0, 0, 1));

      gyroCtrl.add(gyro(0, 0, 3.0)); // phone manipulated: |gyro| > 1.5 limit
      await Future<void>.delayed(Duration.zero);
      accelCtrl.add(accel(4, 0, 0)); // would be a harsh brake if valid
      await Future<void>.delayed(Duration.zero);

      expect(samples, isNotEmpty);
      final s = samples.last;
      expect(s.valid, isFalse);
      expect(s.harshBrake, isFalse, reason: 'invalid window suppresses flags');
      expect(s.harshAccel, isFalse);

      await sub.cancel();
      await accelCtrl.close();
      await gyroCtrl.close();
      await sensors.dispose();
    });

    test('accelerometer error → available false and stream closed', () async {
      final sensors = DrivingSensors(
        accelerometer:
            Stream<UserAccelerometerEvent>.error(StateError('no sensor')),
        gyroscope: const Stream<GyroscopeEvent>.empty(),
      );
      final received = <DrivingSample>[];
      var closed = false;
      sensors.samples.listen(received.add, onDone: () => closed = true);
      await Future<void>.delayed(Duration.zero);
      expect(received, isEmpty);
      expect(closed, isTrue);
      expect(sensors.available, isFalse);
      await sensors.dispose();
    });
  });
}
