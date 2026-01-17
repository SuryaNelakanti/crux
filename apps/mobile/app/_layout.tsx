import 'react-native-reanimated';
import { useEffect, useState, createContext, useContext } from 'react';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ThemeProvider, themes, type ThemeName } from '@crux/theme';

// ============================================================================
// Theme Context (for runtime switching)
// ============================================================================

interface ThemeContextValue {
    themeName: ThemeName;
    setThemeName: (name: ThemeName) => void;
    toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useThemeControl() {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error('useThemeControl must be used within RootLayout');
    }
    return context;
}

// ============================================================================
// Root Layout
// ============================================================================

export default function RootLayout() {
    const [themeName, setThemeName] = useState<ThemeName>('dark');

    // Load custom fonts
    const [fontsLoaded] = useFonts({
        'Inter': require('../assets/fonts/Inter-Regular.ttf'),
        'Inter-Medium': require('../assets/fonts/Inter-Medium.ttf'),
        'Inter-SemiBold': require('../assets/fonts/Inter-SemiBold.ttf'),
        'Inter-Bold': require('../assets/fonts/Inter-Bold.ttf'),
        'JetBrainsMono': require('../assets/fonts/JetBrainsMono-Regular.ttf'),
    });

    const toggleTheme = () => {
        setThemeName((prev) => (prev === 'dark' ? 'light' : 'dark'));
    };

    // Show nothing until fonts are loaded
    if (!fontsLoaded) {
        return null;
    }

    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <ThemeContext.Provider value={{ themeName, setThemeName, toggleTheme }}>
                <ThemeProvider theme={themes[themeName]}>
                    <StatusBar style={themeName === 'dark' ? 'light' : 'dark'} />
                    <Stack
                        screenOptions={{
                            headerShown: false,
                            animation: 'slide_from_right',
                            contentStyle: {
                                backgroundColor: themes[themeName].colors.bgCanvas,
                            },
                        }}
                    />
                </ThemeProvider>
            </ThemeContext.Provider>
        </GestureHandlerRootView>
    );
}
