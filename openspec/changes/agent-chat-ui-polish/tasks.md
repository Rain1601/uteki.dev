## Tasks

### 1. Fix duplicate scrollbar (root cause)
- [x] `AgentChatPage.tsx`: Change root Box from `height: 100vh` to `height: 'calc(100vh - 48px)'`, add `m: -3` negative margin to cancel Layout padding, add `overflow: 'hidden'`
- [x] Remove `overflow: 'hidden'` from the center content Box (line ~651) since root now handles it
- [x] Verify: only one scrollbar visible (messages area), no page-level scrollbar

### 2. Unify scrollbar styling
- [x] Add webkit scrollbar styles to the messages scroll container (line ~879):
  ```
  &::-webkit-scrollbar: { width: 6 }
  &::-webkit-scrollbar-track: { background: transparent }
  &::-webkit-scrollbar-thumb: { background: brand.primary + 50, borderRadius: 3 }
  ```
- [x] Verify scrollbar is thin and semi-transparent, matching NewsTimelinePage style

### 3. Optimize content width
- [x] Increase messages area `maxWidth` from `900px` to `1000px`
- [x] Update bottom input area `maxWidth` to match (`1000px`)
- [x] Verify on wide screen: content is better centered with less wasted space

### 4. Clean up unused imports
- [x] Remove unused imports: `Drawer`, `Chip`, `ThoughtProcessCard`, `SourcesList`, `AutoAwesomeIcon`, `PsychologyIcon`, `CodeIcon`, `TrendingUpIcon`
- [x] Remove unused variables: `chatModes`, `getProviderColor` (`setSelectedMode` is used, kept)
- [x] Verify: `npx tsc --noEmit` shows no new errors from this file (all errors are pre-existing)

### 5. Verify and test
- [x] Desktop: single scrollbar, smooth scroll, no layout jump
- [x] Check that empty state (no messages) still centers correctly
- [x] Check that bottom input area stays pinned correctly
- [x] Check history drawer still opens/closes properly
