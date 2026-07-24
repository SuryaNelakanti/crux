# Crux MVP UX Direction

## Status

Selected direction for the MVP redesign.

- Primary direction: **Session Film**
- Interaction and mask treatment: **Quiet Instrument**
- Product context: [`PRODUCT.md`](../PRODUCT.md)

## North Star

Crux should feel like a visual climbing diary that gets out of the way between attempts. The active session is a sparse filmstrip of route photos. Capture stays within one thumb reach. After capture, the route photo and generated mask take over the screen, and tapping an outcome saves immediately.

The target happy path is three deliberate actions:

1. **Log a climb** creates or reuses the active session and opens the camera.
2. The shutter captures the route and starts automatic mask generation.
3. Tapping **Flash**, **Sent**, or **Tried** commits the log and returns control.

There is no default outcome and no separate save button on the happy path.

## Carry Into the Product

From Session Film:

- A photo-led active session rather than a metrics-led dashboard.
- Large route images that form a visual memory of the session.
- A persistent, thumb-reachable capture action.
- Compact session context and a quiet Finish session action.
- Warm athletic character without social-feed or streak mechanics.

From Quiet Instrument:

- Full-bleed post-capture route photo.
- A simple, high-contrast route outline or hold highlight.
- Three large outcome actions in the lower thumb zone.
- Tapping an outcome is the save action.
- A concise send confirmation followed by **Log another**.
- **Fix route** appears only when confidence is low or the user requests it.

## Do Not Literalize

The generated probes are direction tests, not screenshots to trace.

- Do not reproduce generated people, wall photos, device frames, or presentation-board copy.
- Do not use a blocking full-screen success screen. The send reward should be brief and interruptible.
- Do not add a desktop sidebar, tab bar, social feed, achievement system, or visible manual sync button.
- Do not use the mockups' mistaken outcome label **Saved**. The product outcomes remain Flash, Sent, Tried, and Project where editing an existing log requires it.
- Do not let the accent color compete with route photography.

## Progressive Disclosure

Required now:

- Photo
- Generated route preview
- Deliberate outcome

Available on request:

- Attempts
- Grade or grade range
- Note
- Mask correction
- Sharing
- Session controls

System state:

- Local save and sync status remain visible but quiet.
- Mask confidence is shown only when it changes the next useful action.
- Errors are inline and recoverable without discarding the photo or log.

## Emotional Moment

Recording a send or flash earns a short confirmation using:

- one success haptic on mobile,
- a concise check or route-trace motion,
- the word **Sent** or **Flash**,
- immediate access to **Log another**.

The reward should reinforce completion without delaying the climber.

## Visual Guardrails

- Dark theme driven by use in a dim gym.
- Warm graphite and chalk-tinted neutrals, never pure black or white.
- One restrained accent for capture, selected outcomes, and success.
- Opaque surfaces, restrained shadows, thin image keylines.
- Product sans typography with balanced headings and tabular numbers.
- No terminal styling, technical labels, gradients, glassmorphism, neon, emojis, decorative badges, or analytics-first layouts.

## Direction Probes

- [Session Film](design/mvp-session-film.png)
- [Quiet Instrument](design/mvp-quiet-instrument.png)
