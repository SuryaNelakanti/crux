/**
 * Motion duration tokens
 * 
 * Duration buckets in milliseconds.
 * Based on Material Design motion guidelines + CRED-style polish.
 * 
 * Rule: No hardcoded durations in screens!
 */
export const durations = {
    /** Haptic feedback, immediate state changes */
    instant: 50,
    /** Micro-interactions, button press feedback */
    fast: 100,
    /** Standard transitions, list item animations */
    normal: 200,
    /** Screen transitions, modal enter */
    moderate: 300,
    /** Complex choreography, emphasis animations */
    slow: 400,
    /** Hero transitions, dramatic reveals */
    slower: 500,
    /** Celebration animations, onboarding */
    slowest: 700,
} as const;

export type Duration = keyof typeof durations;

/**
 * Get duration value in seconds (for use with Reanimated)
 */
export const getDurationSeconds = (key: Duration): number => {
    return durations[key] / 1000;
};
