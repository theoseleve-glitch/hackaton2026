import '../src/polyfills';
// Deep per-weight imports: the package root index requires ALL weights'
// .ttf assets (incl. ones Metro fails to resolve under pnpm); each weight
// subdir only requires its own file.
import { Fredoka_600SemiBold } from '@expo-google-fonts/fredoka/600SemiBold';
import { Fredoka_700Bold } from '@expo-google-fonts/fredoka/700Bold';
import { DMSans_400Regular } from '@expo-google-fonts/dm-sans/400Regular';
import { DMSans_500Medium } from '@expo-google-fonts/dm-sans/500Medium';
import { DMSans_700Bold } from '@expo-google-fonts/dm-sans/700Bold';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { lightTheme } from '../src/theme/colors';
import { ThemeProvider } from '../src/theme/ThemeProvider';

export default function RootLayout() {
  const [loaded] = useFonts({
    Fredoka_600SemiBold, Fredoka_700Bold,
    DMSans_400Regular, DMSans_500Medium, DMSans_700Bold,
  });
  if (!loaded) return <View style={{ flex: 1, backgroundColor: lightTheme.bg }} />;
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: lightTheme.bg } }} />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
