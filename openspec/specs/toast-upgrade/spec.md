## ADDED Requirements

### Requirement: Toast system powered by Sonner
The application SHALL use the `sonner` library as the sole toast notification system, replacing the existing Zustand + MUI Snackbar implementation.

#### Scenario: Toaster provider mounted at app root
- **WHEN** the application starts
- **THEN** a `<Toaster />` component from sonner SHALL be rendered in the App root
- **THEN** the Toaster SHALL be configured to match the current theme (dark/light mode)
- **THEN** toast position SHALL be "bottom-right"

#### Scenario: Displaying a success toast
- **WHEN** code calls `toast('操作成功')` or `toast.success('操作成功')`
- **THEN** a toast notification SHALL appear with the message
- **THEN** it SHALL auto-dismiss after 4 seconds

#### Scenario: Displaying an error toast
- **WHEN** code calls `toast.error('操作失败')`
- **THEN** a toast notification SHALL appear with error styling
- **THEN** it SHALL auto-dismiss after 6 seconds (longer than success for readability)

#### Scenario: Promise-tracking toast
- **WHEN** code calls `toast.promise(asyncFn, { loading: '保存中...', success: '已保存', error: '保存失败' })`
- **THEN** a loading toast SHALL appear immediately
- **THEN** it SHALL update to success or error state when the promise resolves/rejects

### Requirement: Legacy toast system removed
The existing custom toast implementation SHALL be completely removed.

#### Scenario: Custom Toast component removed
- **WHEN** the migration is complete
- **THEN** `frontend/src/components/Toast.tsx` SHALL be deleted
- **THEN** all `useToast()` hook usages SHALL be replaced with direct `toast()` calls from sonner
- **THEN** the toast-related Zustand store SHALL be removed

#### Scenario: All existing toast call sites migrated
- **WHEN** auditing the codebase after migration
- **THEN** AdminPage.tsx SHALL use `toast()` from sonner instead of `useToast()`
- **THEN** ArticleDetailDialog.tsx SHALL use `toast()` from sonner instead of MUI Snackbar
- **THEN** LoginPage.tsx SHALL use `toast()` from sonner for notification

### Requirement: Toast theming matches application theme
The Sonner Toaster SHALL respect the application's dark/light mode toggle.

#### Scenario: Theme switch updates toast appearance
- **WHEN** the user toggles between dark and light mode
- **THEN** new toasts SHALL render with the updated theme colors
- **THEN** the Toaster `theme` prop SHALL be bound to the current application theme state
