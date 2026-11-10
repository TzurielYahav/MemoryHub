import { describe, it, expect } from 'vitest';
import { GOOGLE_SCOPES } from '../googleAuthService';
import { dataUrlToBlob, blobToDataUrl } from '../googleDriveService';
import { sanitizePayloadForFirestore } from '../firestoreSyncService';

describe('Google Authentication & Scopes', () => {
  it('includes required Drive, Calendar, and Gmail scopes according to PRD', () => {
    expect(GOOGLE_SCOPES).toContain('https://www.googleapis.com/auth/drive.file');
    expect(GOOGLE_SCOPES).toContain('https://www.googleapis.com/auth/drive');
    expect(GOOGLE_SCOPES).toContain('https://www.googleapis.com/auth/calendar.readonly');
    expect(GOOGLE_SCOPES).toContain('https://www.googleapis.com/auth/calendar.events');
    expect(GOOGLE_SCOPES).toContain('https://www.googleapis.com/auth/gmail.readonly');
    expect(GOOGLE_SCOPES).toContain('openid');
    expect(GOOGLE_SCOPES).toContain('https://www.googleapis.com/auth/userinfo.email');
  });
});

describe('Google Drive Service (Cross-Device Storage)', () => {
  it('converts base64 Data URLs to Blob with correct MIME type', () => {
    const sampleDataUrl = 'data:text/plain;base64,TWVtb3J5SHViVGVzdA==';
    const { blob, mimeType } = dataUrlToBlob(sampleDataUrl);
    expect(mimeType).toBe('text/plain');
    expect(blob.size).toBeGreaterThan(0);
  });

  it('converts Blob back to Data URL for local IndexedDB caching', async () => {
    const text = 'Hello Memory Hub';
    const blob = new Blob([text], { type: 'text/plain' });
    const dataUrl = await blobToDataUrl(blob);
    expect(dataUrl).toContain('data:text/plain;base64,');
  });
});

describe('Firebase Firestore Spark Free-Tier Discipline (PRD Section 6.4)', () => {
  it('strips heavy dataUrl from files before sending to Firestore', () => {
    const filePayload = {
      id: 'file-123',
      name: 'design.png',
      mimeType: 'image/png',
      dataUrl: 'data:image/png;base64,iVBORw0KGgo...',
      driveFileId: 'drive-999',
      driveSyncStatus: 'synced',
    };

    const sanitized = sanitizePayloadForFirestore('files', filePayload);
    expect(sanitized.id).toBe('file-123');
    expect(sanitized.dataUrl).toBeUndefined();
    expect(sanitized.driveFileId).toBe('drive-999');
  });

  it('strips heavy audioDataUrl from meeting notes before sending to Firestore', () => {
    const meetingPayload = {
      id: 'meeting-456',
      title: 'Sprint Planning',
      audioDataUrl: 'data:audio/webm;base64,GkXfo59Cho...',
      summary: 'Discussed goals',
      driveAudioFileId: 'drive-audio-777',
    };

    const sanitized = sanitizePayloadForFirestore('meetings', meetingPayload);
    expect(sanitized.id).toBe('meeting-456');
    expect(sanitized.audioDataUrl).toBeUndefined();
    expect(sanitized.summary).toBe('Discussed goals');
    expect(sanitized.driveAudioFileId).toBe('drive-audio-777');
  });
});
