import * as Haptics from 'expo-haptics';

/**
 * Haptic feedback tokens
 *
 * Standardized haptic patterns for interactive elements.
 * CRED-level polish requires haptics on every meaningful interaction.
 */
export const haptics = {
  /** Light impact - button press, toggles */
  light: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),

  /** Medium impact - card selection, drag start */
  medium: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium),

  /** Heavy impact - destructive actions, significant state changes */
  heavy: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy),

  /** Success notification - completed actions, achievements */
  success: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),

  /** Warning notification - caution, reversible actions */
  warning: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning),

  /** Error notification - failed actions, validation errors */
  error: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),

  /** Selection - tab switches, picker changes */
  selection: () => Haptics.selectionAsync(),
} as const;

export type HapticType = keyof typeof haptics;

/**
 * Trigger haptic feedback
 * Safely handles cases where haptics are unavailable
 */
export const triggerHaptic = async (type: HapticType): Promise<void> => {
  try {
    await haptics[type]();
  } catch {
    // Haptics unavailable (web, simulator, etc.)
  }
};
