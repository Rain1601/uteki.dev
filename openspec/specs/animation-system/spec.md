## ADDED Requirements

### Requirement: Page transition animations
All route-level page transitions SHALL be animated using framer-motion AnimatePresence.

#### Scenario: Navigating between pages
- **WHEN** a user navigates from one page to another
- **THEN** the outgoing page SHALL fade out (opacity 1 → 0) over 150ms
- **THEN** the incoming page SHALL fade in (opacity 0 → 1) with a slight upward slide (y: 8px → 0) over 200ms
- **THEN** the total perceived transition time SHALL NOT exceed 400ms

#### Scenario: User prefers reduced motion
- **WHEN** the user's OS has `prefers-reduced-motion: reduce` enabled
- **THEN** all page transitions SHALL be instant (no animation)

### Requirement: AnimatedPage wrapper component
The system SHALL provide an `AnimatedPage` component that wraps page content with entry/exit animations.

#### Scenario: Wrapping a page component
- **WHEN** a page component is wrapped with `<AnimatedPage>`
- **THEN** it SHALL animate in on mount and out on unmount
- **THEN** it SHALL accept an optional `variant` prop to select animation style (default: "fade-slide")

### Requirement: Card hover micro-interactions
Interactive cards SHALL provide visual feedback on hover via framer-motion.

#### Scenario: Hovering over an interactive card
- **WHEN** a user hovers over a card with the `AnimatedCard` component
- **THEN** the card SHALL scale to 1.02x over 200ms with an ease-out curve
- **THEN** the card's box-shadow SHALL subtly increase
- **WHEN** the user moves the cursor away
- **THEN** the card SHALL return to scale 1.0 over 200ms

### Requirement: List stagger animations
List items SHALL animate in sequentially when the list first renders.

#### Scenario: List items appearing on mount
- **WHEN** an `AnimatedList` component mounts with child items
- **THEN** each item SHALL fade in (opacity 0 → 1) and slide up (y: 12px → 0)
- **THEN** each subsequent item SHALL be delayed by 50ms (stagger effect)
- **THEN** the total stagger animation SHALL NOT exceed 500ms regardless of list length

### Requirement: Animation utilities follow project conventions
All animation components SHALL be placed in `frontend/src/components/animation/` and follow existing component patterns.

#### Scenario: Animation component file structure
- **WHEN** the animation system is implemented
- **THEN** `AnimatedPage.tsx`, `AnimatedCard.tsx`, and `AnimatedList.tsx` SHALL exist in `frontend/src/components/animation/`
- **THEN** each component SHALL be a standard React functional component with TypeScript props interface
