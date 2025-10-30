/**
 * Email Attachment Validation Service
 * Validates file types, extensions, and MIME types for email attachments
 */

// Blocked file extensions (dangerous/executable files)
const BLOCKED_EXTENSIONS = [
  // Executables
  '.exe', '.bat', '.cmd', '.com', '.scr', '.msi', '.dmg', '.app',
  // Scripts
  '.sh', '.bash', '.ps1', '.vbs', '.js', '.jar', '.war', '.deb', '.rpm',
  // Archives that could contain executables
  '.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz',
  // Other potentially dangerous
  '.pif', '.vbe', '.wsf', '.swf', '.shs', '.lnk', '.reg'
];

// Allowed file extensions (whitelist)
const ALLOWED_EXTENSIONS = [
  // Documents
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.rtf', '.odt', '.ods', '.odp',
  // Images
  '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg', '.webp', '.ico', '.tiff', '.tif',
  // Media
  '.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm', '.mp3', '.wav', '.ogg', '.flac', '.aac',
  // Other safe formats
  '.csv', '.xml', '.json', '.html', '.css', '.zip' // zip allowed but should be scanned
];

// Allowed MIME types
const ALLOWED_MIME_TYPES = [
  // Documents
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/rtf',
  'application/rtf',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.spreadsheet',
  'application/vnd.oasis.opendocument.presentation',
  // Images
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/bmp',
  'image/svg+xml',
  'image/webp',
  'image/x-icon',
  'image/tiff',
  // Media
  'video/mp4',
  'video/avi',
  'video/quicktime',
  'video/x-msvideo',
  'video/x-flv',
  'video/webm',
  'audio/mpeg',
  'audio/wav',
  'audio/ogg',
  'audio/flac',
  'audio/aac',
  // Other
  'text/csv',
  'application/xml',
  'text/xml',
  'application/json',
  'text/html',
  'text/css',
  'application/zip',
  'application/x-zip-compressed'
];

// Blocked MIME types
const BLOCKED_MIME_TYPES = [
  'application/x-executable',
  'application/x-msdownload',
  'application/x-msdos-program',
  'application/x-dosexec',
  'application/x-sh',
  'application/x-shellscript',
  'application/x-macbinary',
  'application/java-archive',
  'application/x-java-applet',
  'application/x-java-jnlp-file',
  'application/vnd.microsoft.portable-executable',
  'application/x-msi',
  'application/x-apple-diskimage'
];

/**
 * Get file extension from filename
 */
function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  if (lastDot === -1 || lastDot === filename.length - 1) {
    return '';
  }
  return filename.substring(lastDot).toLowerCase();
}

/**
 * Validate file extension
 */
function validateExtension(extension: string): { isValid: boolean; error?: string } {
  if (!extension) {
    return { isValid: false, error: 'File must have an extension' };
  }

  // Check if extension is blocked
  if (BLOCKED_EXTENSIONS.includes(extension)) {
    return {
      isValid: false,
      error: `File type ${extension} is not allowed for security reasons. Executable files, scripts, and certain archive formats are blocked.`
    };
  }

  // Check if extension is in allowed list
  if (!ALLOWED_EXTENSIONS.includes(extension)) {
    return {
      isValid: false,
      error: `File type ${extension} is not allowed. Allowed types: documents (pdf, doc, docx, xls, xlsx, ppt, pptx), images (jpg, png, gif, svg), media (mp4, mp3), and other safe formats.`
    };
  }

  return { isValid: true };
}

/**
 * Validate MIME type
 */
function validateMimeType(mimeType: string): { isValid: boolean; error?: string } {
  if (!mimeType) {
    return { isValid: false, error: 'MIME type is required' };
  }

  const normalizedMimeType = mimeType.toLowerCase().trim();

  // Check if MIME type is blocked
  if (BLOCKED_MIME_TYPES.includes(normalizedMimeType)) {
    return {
      isValid: false,
      error: `MIME type ${mimeType} is not allowed for security reasons. Executable and script MIME types are blocked.`
    };
  }

  // Check if MIME type is in allowed list
  if (!ALLOWED_MIME_TYPES.includes(normalizedMimeType)) {
    return {
      isValid: false,
      error: `MIME type ${mimeType} is not allowed. Please use a supported MIME type.`
    };
  }

  return { isValid: true };
}

/**
 * Validate that MIME type matches file extension
 */
function validateMimeTypeMatch(filename: string, mimeType: string): { isValid: boolean; error?: string } {
  const extension = getFileExtension(filename);
  const normalizedMimeType = mimeType.toLowerCase().trim();

  // Common extension to MIME type mappings
  const extensionMimeMap: Record<string, string[]> = {
    '.pdf': ['application/pdf'],
    '.doc': ['application/msword'],
    '.docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    '.xls': ['application/vnd.ms-excel'],
    '.xlsx': ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    '.ppt': ['application/vnd.ms-powerpoint'],
    '.pptx': ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
    '.txt': ['text/plain'],
    '.jpg': ['image/jpeg'],
    '.jpeg': ['image/jpeg'],
    '.png': ['image/png'],
    '.gif': ['image/gif'],
    '.mp4': ['video/mp4'],
    '.mp3': ['audio/mpeg'],
    '.zip': ['application/zip', 'application/x-zip-compressed'],
    '.csv': ['text/csv'],
    '.json': ['application/json'],
    '.xml': ['application/xml', 'text/xml'],
    '.html': ['text/html'],
    '.css': ['text/css']
  };

  // If we have a mapping for this extension, check if MIME type matches
  if (extensionMimeMap[extension]) {
    if (!extensionMimeMap[extension].includes(normalizedMimeType)) {
      return {
        isValid: false,
        error: `MIME type ${mimeType} does not match file extension ${extension}. Expected: ${extensionMimeMap[extension].join(' or ')}`
      };
    }
  }

  // If no mapping exists, allow it (extensions were already validated)
  return { isValid: true };
}

/**
 * Validate a single attachment
 */
export interface AttachmentValidationResult {
  isValid: boolean;
  error?: string;
  warnings?: string[];
}

export function validateAttachment(attachment: {
  name: string;
  type?: string;
  data?: string;
}): AttachmentValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate filename
  if (!attachment.name || attachment.name.trim().length === 0) {
    errors.push('Attachment must have a filename');
  }

  // Get file extension
  const extension = getFileExtension(attachment.name || '');

  // Validate extension
  const extensionValidation = validateExtension(extension);
  if (!extensionValidation.isValid) {
    errors.push(extensionValidation.error || 'Invalid file extension');
  }

  // Validate MIME type
  if (attachment.type) {
    const mimeValidation = validateMimeType(attachment.type);
    if (!mimeValidation.isValid) {
      errors.push(mimeValidation.error || 'Invalid MIME type');
    } else {
      // Validate MIME type matches extension
      const matchValidation = validateMimeTypeMatch(attachment.name || '', attachment.type);
      if (!matchValidation.isValid) {
        warnings.push(matchValidation.error || 'MIME type mismatch');
      }
    }
  } else {
    warnings.push('No MIME type provided. Validation based on extension only.');
  }

  // Check if attachment data exists
  if (!attachment.data || attachment.data.length === 0) {
    errors.push('Attachment must have data');
  }

  return {
    isValid: errors.length === 0,
    error: errors.length > 0 ? errors.join('; ') : undefined,
    warnings: warnings.length > 0 ? warnings : undefined
  };
}

/**
 * Validate multiple attachments
 */
export interface BulkAttachmentValidationResult {
  isValid: boolean;
  errors: Array<{ filename: string; error: string }>;
  warnings: Array<{ filename: string; warning: string }>;
}

export function validateAttachments(attachments: Array<{
  name: string;
  type?: string;
  data?: string;
}>): BulkAttachmentValidationResult {
  const errors: Array<{ filename: string; error: string }> = [];
  const warnings: Array<{ filename: string; warning: string }> = [];

  attachments.forEach((attachment) => {
    const validation = validateAttachment(attachment);
    
    if (!validation.isValid && validation.error) {
      errors.push({
        filename: attachment.name || 'unknown',
        error: validation.error
      });
    }

    if (validation.warnings && validation.warnings.length > 0) {
      validation.warnings.forEach((warning) => {
        warnings.push({
          filename: attachment.name || 'unknown',
          warning
        });
      });
    }
  });

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Get list of allowed file extensions (for frontend display)
 */
export function getAllowedExtensions(): string[] {
  return [...ALLOWED_EXTENSIONS];
}

/**
 * Get list of blocked file extensions (for frontend display)
 */
export function getBlockedExtensions(): string[] {
  return [...BLOCKED_EXTENSIONS];
}

