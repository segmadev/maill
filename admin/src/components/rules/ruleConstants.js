// Outlook Rule Conditions
export const CONDITIONS = {
  fromAddresses: {
    label: 'From',
    type: 'email-list',
    description: 'Emails from specific sender(s)',
  },
  toAddresses: {
    label: 'To',
    type: 'email-list',
    description: 'Emails to specific recipient(s)',
  },
  subjectContains: {
    label: 'Subject contains',
    type: 'string-list',
    description: 'Keywords in the subject line',
  },
  bodyContains: {
    label: 'Body contains',
    type: 'string-list',
    description: 'Keywords in the message body',
  },
  hasAttachments: {
    label: 'Has attachments',
    type: 'boolean',
    description: 'Message must have attachments',
  },
  importance: {
    label: 'Importance level',
    type: 'select',
    description: 'Message importance: low, normal, high',
    options: [
      { label: 'Low', value: 'low' },
      { label: 'Normal', value: 'normal' },
      { label: 'High', value: 'high' },
    ],
  },
}

// Outlook Rule Actions
export const ACTIONS = {
  moveToFolder: {
    label: 'Move to folder',
    type: 'folder-select',
    description: 'Move message to specific folder',
  },
  assignCategories: {
    label: 'Assign categories',
    type: 'string-list',
    description: 'Add one or more categories',
  },
  markAsRead: {
    label: 'Mark as read',
    type: 'boolean',
    description: 'Automatically mark message as read',
  },
  markAsImportant: {
    label: 'Mark as important',
    type: 'boolean',
    description: 'Flag message as important',
  },
  permanentlyDelete: {
    label: 'Permanently delete',
    type: 'boolean',
    description: 'Automatically delete the message',
  },
  forward: {
    label: 'Forward to',
    type: 'email-list',
    description: 'Forward message to email address',
  },
  redirectTo: {
    label: 'Redirect to',
    type: 'email-list',
    description: 'Redirect (bounce) to email address',
  },
}

// Input types mapping
export const INPUT_TYPES = {
  'email-list': 'Email addresses (comma-separated)',
  'string-list': 'Text (one per line)',
  'folder-select': 'Select a folder',
  'select': 'Choose from options',
  'boolean': 'On/Off',
}
