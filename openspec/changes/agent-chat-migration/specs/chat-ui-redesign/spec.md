# Chat UI Redesign Specification

## ADDED Requirements

### Requirement: Empty state displays centered welcome message

The system SHALL display an elegant welcome message when no conversation is active.

#### Scenario: Initial page load
- **WHEN** user opens Agent Chat page with no active conversation
- **THEN** system displays centered title "What do you want to know today?"
- **AND** shows model selector icons at bottom
- **AND** shows Research button at bottom-left

#### Scenario: After starting new conversation
- **WHEN** user clicks "New Conversation" button
- **THEN** system clears all messages
- **AND** returns to empty state with welcome message

---

### Requirement: Model selector uses bottom-fixed icon layout

The system SHALL display model selection as horizontally aligned icons at the bottom of the input area.

#### Scenario: Model icons display
- **WHEN** user views chat interface
- **THEN** system displays 5 model icons in horizontal row
- **AND** icons are: Claude (orange), OpenAI (teal), DeepSeek (blue), Qwen (purple), Gemini (multicolor)

#### Scenario: Model selection
- **WHEN** user clicks a model icon
- **THEN** system highlights selected model
- **AND** applies provider-specific brand color
- **AND** updates selectedModelId state

#### Scenario: Model icon hover effect
- **WHEN** user hovers over unselected model icon
- **THEN** system displays model name in tooltip
- **AND** shows subtle hover animation

---

### Requirement: Interface uses dark theme with precise styling

The system SHALL apply a dark color scheme matching uchu_trade design specifications.

#### Scenario: Background colors
- **WHEN** user views chat interface
- **THEN** main background is #212121 (dark gray)
- **AND** secondary backgrounds use rgba(255,255,255,0.04)

#### Scenario: Glass morphism effects
- **WHEN** user views input area and buttons
- **THEN** elements use backdrop-filter blur(12px)
- **AND** have subtle border rgba(255,255,255,0.08)

#### Scenario: Shadow and depth
- **WHEN** user views elevated elements
- **THEN** elements have layered shadows for depth
- **AND** hover states amplify shadow effect

---

### Requirement: Messages display with optimized typography and spacing

The system SHALL render messages with enhanced readability and visual hierarchy.

#### Scenario: User message styling
- **WHEN** system displays user message
- **THEN** message has right-aligned bubble
- **AND** uses lighter background color
- **AND** includes user icon

#### Scenario: Assistant message styling
- **WHEN** system displays assistant message
- **THEN** message has left-aligned bubble
- **AND** uses darker background color
- **AND** includes robot/assistant icon

#### Scenario: Markdown rendering
- **WHEN** assistant message contains markdown
- **THEN** system renders headers, lists, and emphasis
- **AND** applies syntax highlighting to code blocks
- **AND** uses monospace font for inline code

#### Scenario: Code block styling
- **WHEN** message contains code block
- **THEN** system displays with syntax highlighting (highlight.js)
- **AND** uses GitHub dark theme
- **AND** includes copy button

---

### Requirement: Top-right controls are accessible

The system SHALL provide history and new conversation buttons in the top-right corner.

#### Scenario: History button
- **WHEN** user clicks History button (top-right)
- **THEN** system opens conversation history drawer from right
- **AND** displays all past conversations sorted by date

#### Scenario: New conversation button
- **WHEN** user clicks "New Conversation" button (top-right)
- **THEN** system clears current conversation
- **AND** resets to empty state

#### Scenario: Button hover effects
- **WHEN** user hovers over top-right buttons
- **THEN** buttons show subtle background color change
- **AND** slight transform effect (translateY(-1px))

---

### Requirement: Animations enhance user experience

The system SHALL use smooth animations for state transitions.

#### Scenario: Message appear animation
- **WHEN** new message is added to conversation
- **THEN** message slides in with fadeIn animation
- **AND** duration is 0.3s with ease-out timing

#### Scenario: Empty state transition
- **WHEN** interface transitions to/from empty state
- **THEN** title animates with slideDown/slideUp
- **AND** opacity fades smoothly

#### Scenario: Button interactions
- **WHEN** user clicks button
- **THEN** button scales down slightly (transform: scale(0.95))
- **AND** returns to normal on release

---

### Requirement: Input area is always accessible

The system SHALL keep input controls visible and functional at all times.

#### Scenario: Fixed input position
- **WHEN** conversation has many messages
- **THEN** input area remains fixed at bottom
- **AND** does not scroll with messages

#### Scenario: Send button state
- **WHEN** input is empty
- **THEN** send button is disabled (grayed out)

#### Scenario: Send button active state
- **WHEN** input has text
- **THEN** send button is enabled with brand color
- **AND** shows hover effect

---

### Requirement: Responsive layout adapts to screen size

The system SHALL provide optimal layout for different screen sizes.

#### Scenario: Desktop layout
- **WHEN** viewport width > 900px
- **THEN** messages are constrained to 900px max-width
- **AND** centered horizontally

#### Scenario: Mobile layout
- **WHEN** viewport width < 600px
- **THEN** UI adapts to full-width
- **AND** model icons may stack or reduce size

---

### Requirement: Keyboard shortcuts improve efficiency

The system SHALL support keyboard shortcuts for common actions.

#### Scenario: Enter to send
- **WHEN** user presses Enter in input field
- **THEN** system sends message (if not Shift+Enter)

#### Scenario: Shift+Enter for new line
- **WHEN** user presses Shift+Enter
- **THEN** system inserts line break without sending

---

### Requirement: Loading states provide clear feedback

The system SHALL show appropriate loading indicators during operations.

#### Scenario: Message streaming indicator
- **WHEN** assistant is generating response
- **THEN** system displays typing indicator animation
- **AND** shows streaming text in real-time

#### Scenario: Research progress indicator
- **WHEN** Deep Research is active
- **THEN** system displays ResearchStatusCard with current step
- **AND** updates progress as research proceeds

#### Scenario: Disabled state during loading
- **WHEN** request is in progress
- **THEN** input and send button are disabled
- **AND** visual indicator shows loading state
