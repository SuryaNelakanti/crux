import { ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '@shopify/restyle';
import { Badge, Box, Button, Card, Text } from '@crux/ui';
import type { Theme } from '@crux/theme';
import { DoodleWave, Sparkle } from '@/components/Doodle';
import { ScreenReveal } from '@/components/ScreenReveal';

export default function MaskEditorWebScreen() {
    const router = useRouter();
    const theme = useTheme<Theme>();
    const { problemId } = useLocalSearchParams<{ problemId: string }>();

    const handleBack = () => {
        if (problemId) {
            router.replace(`/problem/${problemId}`);
            return;
        }
        router.back();
    };

    return (
        <Box flex={1} backgroundColor="bgCanvas">
            <ScrollView
                contentContainerStyle={{
                    padding: theme.spacing.m,
                    paddingBottom: theme.spacing['3xl'],
                }}
            >
                <ScreenReveal>
                    <Box gap="l">
                        <Box
                            flexDirection="row"
                            justifyContent="space-between"
                            alignItems="center"
                        >
                            <Box gap="xs">
                                <Text variant="headingLarge" color="textPrimary">
                                    Mask editor
                                </Text>
                                <Text variant="bodySmall" color="textSecondary">
                                    Web preview
                                </Text>
                            </Box>
                            <Box alignItems="flex-end" gap="xs">
                                <Sparkle size={18} color="accentBrand" />
                                <DoodleWave width={84} height={20} color="accentBrand" />
                            </Box>
                        </Box>

                        <Card variant="outlined">
                            <Box gap="s">
                                <Text variant="bodyMedium" color="textSecondary">
                                    Mask editing is available on mobile.
                                </Text>
                                <Text variant="bodySmall" color="textMuted">
                                    Open the same problem in the mobile app to paint
                                    holds and save a new mask version.
                                </Text>
                                <Box flexDirection="row" gap="s" flexWrap="wrap">
                                    <Badge label="Mobile only" variant="brand" size="small" />
                                    <Badge label="Web preview" variant="info" size="small" />
                                </Box>
                            </Box>
                        </Card>

                        <Box gap="s">
                            <Button
                                label="Back to Problem"
                                variant="primary"
                                size="large"
                                onPress={handleBack}
                            />
                            <Button
                                label="Go Home"
                                variant="ghost"
                                size="small"
                                onPress={() => router.replace('/')}
                            />
                        </Box>
                    </Box>
                </ScreenReveal>
            </ScrollView>
        </Box>
    );
}
