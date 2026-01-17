# Design Quality Checklist

Use this checklist when reviewing UI changes to maintain CRED-level quality.

---

## Spacing and Layout

- [ ] **Spacing grid compliance** - All margin/padding uses theme spacing tokens (`xs`, `s`, `m`, `l`, etc.)
- [ ] **No magic numbers** - No hardcoded pixel values for layout
- [ ] **Consistent gaps** - List items and card content use consistent spacing

## Typography

- [ ] **Text variants only** - All text uses `variant` prop, never raw `fontSize`
- [ ] **Heading hierarchy** - Proper use of display → heading → body → label
- [ ] **Tabular numbers** - Stats/numbers use `statLarge`/`statMedium`/`statSmall` for alignment

## Colors

- [ ] **Semantic colors only** - Uses `textPrimary`, `bgSurface`, etc., never raw hex
- [ ] **Contrast requirements** - Text has sufficient contrast against background
- [ ] **Status colors correct** - Success/warning/error used appropriately

## Motion

- [ ] **Motion tokens used** - Durations from `durations`, easing from `easing`
- [ ] **Spring-based interactions** - Press animations use springs, not timed
- [ ] **Consistent choreography** - Screen transitions match `patterns.screenEnter`

## Touch and Interaction

- [ ] **Touch targets ≥ 44pt** - All interactive elements meet minimum size
- [ ] **Haptic feedback** - Buttons and toggles trigger haptics
- [ ] **Press states visible** - Buttons show scale/opacity change on press

## Accessibility

- [ ] **Reduce motion support** - Animations respect system reduce-motion setting
- [ ] **Focus indicators** - Form fields show clear focus state
- [ ] **Accessible labels** - Buttons have meaningful accessibilityLabel

## Loading States

- [ ] **Skeleton placeholders** - Async content shows skeletons while loading
- [ ] **Loading indicators** - Buttons show loading state during async ops
- [ ] **No layout shift** - Skeletons match content dimensions

## Component Usage

- [ ] **Using @crux/ui** - Screens import from `@crux/ui`, not custom components
- [ ] **No StyleSheet.create** - Screens don't define their own styles
- [ ] **Proper variant usage** - Components use variants, not style overrides

---

## Quick Reference

### Spacing Values
| Token | Value |
|-------|-------|
| `2xs` | 2px |
| `xs` | 4px |
| `s` | 8px |
| `m` | 16px |
| `l` | 24px |
| `xl` | 32px |
| `2xl` | 48px |
| `3xl` | 64px |

### Duration Values
| Token | Value |
|-------|-------|
| `instant` | 50ms |
| `fast` | 100ms |
| `normal` | 200ms |
| `moderate` | 300ms |
| `slow` | 400ms |
| `slower` | 500ms |
| `slowest` | 700ms |

### Spring Presets
| Name | Use Case |
|------|----------|
| `snappy` | Buttons, toggles |
| `default` | General UI |
| `soft` | Sheets, modals |
| `bouncy` | Celebrations |
| `stiff` | Precision inputs |
