/**
 * Primitives d'interface de Buzzy.
 *
 * Barillet unique : les pages importent depuis `components/ui`, sans jamais
 * connaître le découpage interne en fichiers.
 */

export { Button, IconButton, buttonClasses } from './Button';
export type { ButtonProps, ButtonSize, ButtonVariant, IconButtonProps } from './Button';

export { Alert, Badge, CardSkeleton, EmptyState, Skeleton, Spinner } from './Feedback';
export type { AlertTone, BadgeTone } from './Feedback';

export {
  Checkbox,
  Field,
  Input,
  MultiInput,
  Select,
  Switch,
  Tag,
  Textarea,
} from './Form';
export type { FieldProps, InputProps } from './Form';

export { ConfirmDialog, Modal } from './Modal';
export type { ConfirmDialogProps, ModalProps } from './Modal';

export { Card, PageHeader, SectionTitle, SegmentedControl, Tabs } from './Layout';
export type { SegmentOption, TabOption } from './Layout';
