/**
 * Google Drive REST API v3 Service for Memory Hub
 *
 * Implements PRD Section 5.4 (FR-4.2: Files stored in user's Google Drive and cached locally for offline use),
 * Section 5.6 (FR-6.6: Audio stored in Google Drive), and Section 6.2 (Where data lives: Files in Google Drive).
 */

export interface GoogleDriveFileMetadata {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  webViewLink?: string;
  thumbnailLink?: string;
  createdTime?: string;
  modifiedTime?: string;
  parents?: string[];
}

export interface DriveUploadResult {
  success: boolean;
  driveFileId?: string;
  webViewLink?: string;
  sizeBytes?: number;
  error?: string;
}

export interface DriveSyncSummary {
  uploadedCount: number;
  downloadedCount: number;
  syncedCount: number;
  errors: string[];
}

/**
 * Searches for or creates a dedicated top-level folder on the user's Google Drive (e.g. "MemoryHub")
 */
export async function getOrCreateDriveFolder(
  accessToken: string,
  folderName: string = 'MemoryHub'
): Promise<string> {
  const cleanName = folderName.replace(/^\/+/, '') || 'MemoryHub';

  // 1. Search for existing non-trashed folder
  const query = encodeURIComponent(
    `mimeType = 'application/vnd.google-apps.folder' and name = '${cleanName}' and trashed = false`
  );
  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,trashed)&pageSize=5`;

  const searchRes = await fetch(searchUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  if (!searchRes.ok) {
    const errText = await searchRes.text();
    throw new Error(`Failed to query Google Drive folder (${searchRes.status}): ${errText}`);
  }

  const searchData = await searchRes.json();
  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0].id;
  }

  // 2. Create folder if not found
  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: cleanName,
      mimeType: 'application/vnd.google-apps.folder',
      description: 'Memory Hub personal workspace documents and media storage',
    }),
  });

  if (!createRes.ok) {
    const errText = await createRes.text();
    throw new Error(`Failed to create Google Drive folder (${createRes.status}): ${errText}`);
  }

  const createData = await createRes.json();
  return createData.id;
}

/**
 * Converts a base64 Data URL to a Blob
 */
export function dataUrlToBlob(dataUrl: string): { blob: Blob; mimeType: string } {
  const parts = dataUrl.split(',');
  const mimeMatch = parts[0].match(/:(.*?);/);
  const mimeType = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
  const b64Data = parts[1] || '';
  const byteChars = atob(b64Data);
  const byteArrays: Uint8Array[] = [];

  for (let offset = 0; offset < byteChars.length; offset += 512) {
    const slice = byteChars.slice(offset, offset + 512);
    const byteNumbers = new Array(slice.length);
    for (let i = 0; i < slice.length; i++) {
      byteNumbers[i] = slice.charCodeAt(i);
    }
    byteArrays.push(new Uint8Array(byteNumbers));
  }

  return { blob: new Blob(byteArrays, { type: mimeType }), mimeType };
}

/**
 * Converts a Blob to a base64 Data URL for offline caching in IndexedDB
 */
export async function blobToDataUrl(blob: Blob): Promise<string> {
  if (typeof FileReader !== 'undefined') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }

  // Fallback for Node.js / test runtime
  const arrayBuf = await blob.arrayBuffer();
  const buffer = typeof Buffer !== 'undefined' ? Buffer.from(arrayBuf) : null;
  const base64 = buffer
    ? buffer.toString('base64')
    : btoa(String.fromCharCode(...new Uint8Array(arrayBuf)));
  const mimeType = blob.type || 'application/octet-stream';
  return `data:${mimeType};base64,${base64}`;
}

/**
 * Uploads a file (Blob, File, or base64 dataUrl) to Google Drive into the specified folder
 * using Drive REST API v3 multipart upload.
 */
export async function uploadFileToDrive(options: {
  accessToken: string;
  folderId: string;
  fileName: string;
  mimeType?: string;
  blobOrDataUrl: Blob | string;
  existingDriveFileId?: string;
}): Promise<DriveUploadResult> {
  const { accessToken, folderId, fileName, existingDriveFileId } = options;

  let fileBlob: Blob;
  let finalMimeType = options.mimeType || 'application/octet-stream';

  if (typeof options.blobOrDataUrl === 'string') {
    if (options.blobOrDataUrl.startsWith('data:')) {
      const converted = dataUrlToBlob(options.blobOrDataUrl);
      fileBlob = converted.blob;
      finalMimeType = options.mimeType || converted.mimeType;
    } else {
      fileBlob = new Blob([options.blobOrDataUrl], { type: finalMimeType });
    }
  } else {
    fileBlob = options.blobOrDataUrl;
    finalMimeType = options.mimeType || fileBlob.type || 'application/octet-stream';
  }

  const boundary = `-------MemoryHubBoundary${Date.now()}`;
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const metadata: Record<string, unknown> = {
    name: fileName,
    mimeType: finalMimeType,
  };

  // Only assign parents on initial creation
  if (!existingDriveFileId) {
    metadata.parents = [folderId];
  }

  const metadataPart =
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    `Content-Type: ${finalMimeType}\r\n\r\n`;

  const metadataBlob = new Blob([metadataPart], { type: 'text/plain' });
  const closeBlob = new Blob([closeDelimiter], { type: 'text/plain' });
  const multipartBody = new Blob([metadataBlob, fileBlob, closeBlob], {
    type: `multipart/related; boundary=${boundary}`,
  });

  const url = existingDriveFileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(
        existingDriveFileId
      )}?uploadType=multipart&fields=id,name,mimeType,size,webViewLink`
    : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,size,webViewLink`;

  try {
    const res = await fetch(url, {
      method: existingDriveFileId ? 'PATCH' : 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: multipartBody,
    });

    if (!res.ok) {
      const errText = await res.text();
      return {
        success: false,
        error: `Google Drive upload failed (${res.status}): ${errText}`,
      };
    }

    const data = await res.json();
    return {
      success: true,
      driveFileId: data.id,
      webViewLink: data.webViewLink,
      sizeBytes: data.size ? parseInt(data.size, 10) : fileBlob.size,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Network error during Google Drive upload.',
    };
  }
}

/**
 * Downloads a file's binary content from Google Drive and returns both Blob and DataURL
 * for offline-first instant playback/viewing.
 */
export async function downloadFileFromDrive(
  accessToken: string,
  driveFileId: string
): Promise<{ blob: Blob; dataUrl: string; mimeType: string }> {
  const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveFileId)}?alt=media`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to download file from Google Drive (${res.status}): ${errText}`);
  }

  const blob = await res.blob();
  const mimeType = blob.type || 'application/octet-stream';
  const dataUrl = await blobToDataUrl(blob);

  return { blob, dataUrl, mimeType };
}

/**
 * Lists all non-trashed files inside the MemoryHub Google Drive folder
 */
export async function listDriveFolderFiles(
  accessToken: string,
  folderId: string
): Promise<GoogleDriveFileMetadata[]> {
  const query = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
  const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,mimeType,size,webViewLink,thumbnailLink,createdTime,modifiedTime)&pageSize=100`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to list Google Drive files (${res.status}): ${errText}`);
  }

  const data = await res.json();
  return data.files || [];
}

/**
 * Checks if the Google Drive connection is working and returns the folder metadata
 */
export async function testGoogleDriveConnection(
  accessToken: string,
  folderName: string = 'MemoryHub'
): Promise<{ success: boolean; folderId?: string; fileCount?: number; error?: string }> {
  try {
    const folderId = await getOrCreateDriveFolder(accessToken, folderName);
    const files = await listDriveFolderFiles(accessToken, folderId);
    return {
      success: true,
      folderId,
      fileCount: files.length,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Google Drive connection test failed.',
    };
  }
}
