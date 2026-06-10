import { Baloo2_600SemiBold, Baloo2_700Bold, Baloo2_800ExtraBold } from '@expo-google-fonts/baloo-2';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { lightTheme } from '../src/theme/colors';
import { ThemeProvider } from '../src/theme/ThemeProvider';

export default function RootLayout() {
  const [loaded] = useFonts({
    Baloo2_600SemiBold, Baloo2_700Bold, Baloo2_800ExtraBold,
    Inter_400Regular, Inter_500Medium, Inter_600SemiBold,
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
