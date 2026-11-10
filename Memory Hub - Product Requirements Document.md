# Memory Hub: Product Requirements Document

**Version:** 0.1 (draft) | **Date:** October 19, 2026 | **Owner:** Personal project (single user) | **Target builder:** Antigravity 2 | **Platforms:** Android, Windows

---

## 1. Overview

Memory Hub is a personal workspace app for Android and Windows that works as a single place to store, organize, and use everything related to a person's projects: tasks, notes, files, canvases, and meeting notes. It combines ideas from Notion (projects, pages, blocks), Miro (canvases), and Granola (meeting transcription and notes), and adds an AI agent that can search, summarize, and work with all the stored data, plus connections to Google Calendar and Gmail.

**Why it exists:** The tools used today (Notion, Miro, Granola, Google Calendar, Gmail) are disconnected, and moving data between them is hard. Memory Hub keeps everything in one place so the agent can work across all of it.

**Product type:** Personal tool. Single user, no collaboration, no monetization.

## 2. Goals and Non-Goals

### Goals

- One workspace that holds projects with tasks, pages, files, canvases, and meeting notes.
- Offline-first: the app works fully without internet and syncs between devices when online.
- An AI agent with a switchable model that can find, summarize, create, organize, and (with approval) edit content.
- Meeting notes from live voice recording in Hebrew and English, with speaker separation.
- Useful integration with Google Calendar and Gmail.
- An Android home-screen widget for fast task access and quick access to the agent.
- Clean, minimal design in Hebrew (RTL) and English, with dark mode.

### Non-goals (for now)

- Collaboration, sharing, or multi-user accounts.
- iOS, macOS, Linux, or web apps.
- Pricing, subscriptions, or a public release.
- End-to-end encryption (explicitly not required).
- A Windows widget.
- Capturing other apps' call audio on Android (not possible; microphone only).

## 3. User

A single user (the owner), working in Hebrew and English, who uses both an Android phone and a Windows computer. Needs fast capture, reliable offline use, and an assistant that understands their stored data.

## 4. Scope by Phase (summary)

| Phase | Name | Main content |
| --- | --- | --- |
| 0 | Foundations | Architecture, data model, sync layer, auth, design system |
| 1 | MVP: Core workspace | Projects, subfolders, tasks (full), pages with blocks and simple tables, file attachments, search, offline sync, Android task widget, Hebrew/English, dark mode |
| 2 | AI agent | Chat, model switching, search and Q&A, summaries, task and file creation, edit with diff review, PDF and image text recognition |
| 3 | Meetings | Microphone recording, Windows system audio, transcription, speaker labels, summaries, task suggestions, widget voice and chat |
| 4 | Canvases and integrations | Canvases, Google Calendar, Gmail, routines |
| 5 | Version 2 | Import (Markdown, Granola), export (Markdown, PDF), full databases |
| Later | Backlog | Local model, optional encryption, private server migration, extras |

Version 1 = Phases 0 to 4. Version 2 = Phase 5.

---

## 5. Functional Requirements

Priority key: **M** = must have, **S** = should have, **C** = could have.

### 5.1 Projects and Structure

| ID | Requirement | Priority | Phase |
| --- | --- | --- | --- |
| FR-1.1 | The user can create, rename, reorder, archive, and delete projects. | M | 1 |
| FR-1.2 | Each project can contain: a task list, subfolders, pages, uploaded files, canvases, and meeting notes. | M | 1 (canvases 4, meetings 3) |
| FR-1.3 | Subfolders can be nested to any reasonable depth and can contain any content type. | M | 1 |
| FR-1.4 | Items can be moved between projects and folders. | M | 1 |
| FR-1.5 | A home screen lists all projects and recent items. | M | 1 |
| FR-1.6 | Each project has a setting "exclude from agent" which blocks the agent from reading it. | S | 2 |
| FR-1.7 | Deleted items go to a trash and can be restored for a limited time. | S | 1 |

### 5.2 Tasks

Each project has one or more task lists.

| ID | Requirement | Priority | Phase |
| --- | --- | --- | --- |
| FR-2.1 | Create, edit, complete, and delete tasks with title and optional description. | M | 1 |
| FR-2.2 | Due date (with optional time). | M | 1 |
| FR-2.3 | Priority levels (for example none, low, medium, high). | M | 1 |
| FR-2.4 | Reminders with local notifications on both platforms, at a chosen time before or at the due time. | M | 1 |
| FR-2.5 | Recurring tasks (daily, weekly, monthly, custom interval); completing one occurrence creates the next. | M | 1 |
| FR-2.6 | Sort and filter tasks by due date, priority, project, and status. | M | 1 |
| FR-2.7 | A global "all tasks" view across projects (today, upcoming, overdue). | S | 1 |
| FR-2.8 | An in-app calendar view that shows tasks with due dates (and Google Calendar events once connected). | M | 1 (events in 4) |
| FR-2.9 | Tasks created by the agent or from meetings or emails show their source and link back to it. | S | 2 |

### 5.3 Pages (Notion-style)

| ID | Requirement | Priority | Phase |
| --- | --- | --- | --- |
| FR-3.1 | Pages are made of blocks: paragraph, headings, bulleted and numbered lists, checklist, quote, divider, code, link, image, and file block. | M | 1 |
| FR-3.2 | Simple tables: a grid of rows and columns with text cells; add, remove, and reorder rows and columns. | M | 1 |
| FR-3.3 | Blocks can be reordered, converted between types, and edited with common text formatting (bold, italic, underline, links). | M | 1 |
| FR-3.4 | Full RTL support for Hebrew, including mixed Hebrew and English text in the same block. | M | 1 |
| FR-3.5 | Full databases (typed properties, table, board, calendar, and list views, filters, sorting, relations) are **not** in v1. The simple table model should not block adding them later. | C | 5 |

### 5.4 Files

| ID | Requirement | Priority | Phase |
| --- | --- | --- | --- |
| FR-4.1 | Upload and attach any file, with preview for images and PDFs. | M | 1 |
| FR-4.2 | Files are stored in the user's Google Drive (see section 6) and cached locally for offline use. | M | 1 |
| FR-4.3 | Text is extracted from PDFs and recognized from images (OCR in Hebrew and English) so it becomes searchable and readable by the agent. | M | 2 |

### 5.5 Canvases (Miro-style)

| ID | Requirement | Priority | Phase |
| --- | --- | --- | --- |
| FR-5.1 | An infinite, pannable and zoomable canvas. | M | 4 |
| FR-5.2 | Shapes (rectangle, circle, diamond, and others) with text or labels inside. | M | 4 |
| FR-5.3 | Connectors (lines and arrows) that attach to shapes and follow them when moved. | M | 4 |
| FR-5.4 | Standalone text labels and image placement. | M | 4 |
| FR-5.5 | Design options: fill and border color, border style, text size and color, and alignment. | M | 4 |
| FR-5.6 | Select, move, resize, duplicate, delete, group, undo and redo, and layer ordering. | M | 4 |
| FR-5.7 | Freehand drawing and templates are not in the first version of canvases. | C | Later |

### 5.6 Meeting Notes (Granola-style)

| ID | Requirement | Priority | Phase |
| --- | --- | --- | --- |
| FR-6.1 | Record meetings live from the microphone on Android and Windows. | M | 3 |
| FR-6.2 | On Windows, also capture system audio (for example Zoom or Meet calls) together with the microphone. Android is microphone only. | M | 3 |
| FR-6.3 | Transcribe speech in Hebrew and English. Meetings that switch between the two languages should be handled as well as the provider allows. | M | 3 |
| FR-6.4 | Identify different speakers and label them "Speaker 1", "Speaker 2", and so on. The user can rename speakers, and the new name applies across the whole transcript. | M | 3 |
| FR-6.5 | If the device is offline, the recording is saved locally and transcribed automatically when the connection returns. | M | 3 |
| FR-6.6 | The original audio is kept by default, with a clear option to delete it (the transcript stays). Audio is stored in Google Drive. | M | 3 |
| FR-6.7 | After a meeting, the app generates a summary, key points, and decisions. | M | 3 |
| FR-6.8 | The app suggests tasks from the meeting. The user reviews each suggestion and accepts, edits, or rejects it. | M | 3 |
| FR-6.9 | The user can type their own notes during the meeting and the app combines them with the transcript. | S | 3 |
| FR-6.10 | Meeting notes are saved inside the chosen project and are searchable. | M | 3 |

### 5.7 AI Agent

The agent is available globally and inside each project, in a chat interface (text and voice).

| ID | Requirement | Priority | Phase |
| --- | --- | --- | --- |
| FR-7.1 | The agent runs in the cloud and uses a model chosen in settings: Claude, GPT, or Gemini, using the user's own API keys. The provider layer must make adding models simple. | M | 2 |
| FR-7.2 | The agent can search across projects, pages, tasks, meeting notes, and file contents (including text recognized from PDFs and images). | M | 2 |
| FR-7.3 | The agent can answer questions based on the stored data and show which items it used as sources. | M | 2 |
| FR-7.4 | The agent can summarize a page, project, meeting, or file. | M | 2 |
| FR-7.5 | The agent can create tasks based on stored data. | M | 2 |
| FR-7.6 | The agent can create new pages and files. | M | 2 |
| FR-7.7 | The agent can organize content, for example move items, group them into folders, and suggest structure. | M | 2 |
| FR-7.8 | The agent can help edit specific parts of a page or file (for example rewrite a paragraph or fix a table). | M | 2 |
| FR-7.9 | **Edits require approval.** Every edit to existing content is shown as a side-by-side comparison (before and after, with changes highlighted). Nothing changes until the user accepts. The user can accept all, accept part, or reject. | M | 2 |
| FR-7.10 | **The agent can never delete anything by itself.** It may suggest deletion, but only the user can perform it. | M | 2 |
| FR-7.11 | The agent can add tasks and events to Google Calendar (see FR-8.4) and read allowed emails (see FR-9). | M | 4 |
| FR-7.12 | Accepted agent edits are saved in version history so the user can undo them later. | S | 2 |
| FR-7.13 | The agent sends only the content needed for the request (relevant retrieved snippets), not the whole database, to the model provider. | M | 2 |
| FR-7.14 | Voice input to the agent (speech to text) in Hebrew and English. | S | 3 |
| FR-7.15 | The chat history can be kept per conversation and cleared by the user. | S | 2 |

### 5.8 Google Calendar

| ID | Requirement | Priority | Phase |
| --- | --- | --- | --- |
| FR-8.1 | Connect one Google account. | M | 4 |
| FR-8.2 | Read events from the user's Google Calendar and show them in the app's calendar view next to tasks with due dates. | M | 4 |
| FR-8.3 | Tasks stay inside Memory Hub by default. | M | 4 |
| FR-8.4 | Optionally, a task can be created as an event in Google Calendar (per task, or via the agent on request). Changes to that task update the event. | S | 4 |

### 5.9 Gmail

| ID | Requirement | Priority | Phase |
| --- | --- | --- | --- |
| FR-9.1 | Read-only access to Gmail. The app never sends, deletes, or modifies emails. | M | 4 |
| FR-9.2 | The user chooses which labels and senders the app and agent may read. Everything else is never accessed. | M | 4 |
| FR-9.3 | Emails are read only when the user asks the agent, or when a routine that needs them runs. There is no constant background scanning. | M | 4 |
| FR-9.4 | The agent can answer questions based on those emails, extract tasks, and extract information for projects (saved into the relevant project, with a link to the source email). | M | 4 |

### 5.10 Routines

A routine is a saved instruction for the agent, for example "every morning at 8:00, check emails from label X and add tasks to project Y".

| ID | Requirement | Priority | Phase |
| --- | --- | --- | --- |
| FR-10.1 | Create, edit, pause, and delete routines. | M | 4 |
| FR-10.2 | Triggers: a schedule (time and repeat) or an event (for example a new email from a chosen sender or label), or both together. | M | 4 |
| FR-10.3 | Routines run while the app is open, or in the background on the device where the operating system allows it. | M | 4 |
| FR-10.4 | A routine must run only once even if the user has several devices. Before running, a device "claims" the run in the synced data, and other devices skip it. | M | 4 |
| FR-10.5 | If no device is available at the scheduled time, the routine runs at the next opportunity and the log shows that it was late. | M | 4 |
| FR-10.6 | Routines follow the same rules as the agent: edits need approval, no deletion, and only allowed emails. Edits proposed by a routine wait in a review inbox. | M | 4 |
| FR-10.7 | A run log shows when each routine ran, on which device, and what it did. | S | 4 |

### 5.11 Search

| ID | Requirement | Priority | Phase |
| --- | --- | --- | --- |
| FR-11.1 | Fast full-text search across all content, working offline, in Hebrew and English. | M | 1 |
| FR-11.2 | Search includes extracted file text and meeting transcripts once those exist. | M | 2 to 3 |
| FR-11.3 | Semantic (meaning-based) search to improve agent answers. | S | 2 |

### 5.12 Android Home-Screen Widget

| ID | Requirement | Priority | Phase |
| --- | --- | --- | --- |
| FR-12.1 | Shows one or more task lists selected by the user (the user picks which lists). | M | 1 |
| FR-12.2 | Tasks can be checked off from the widget. | M | 1 |
| FR-12.3 | An "add task" option opens a fast quick-add input. | M | 1 |
| FR-12.4 | Under the task area, a space to talk to the agent by text. | M | 3 |
| FR-12.5 | A voice button similar to the ChatGPT widget: tapping it immediately opens a small voice screen over the current screen, starts listening, and sends the request to the agent. | M | 3 |
| FR-12.6 | Android widgets cannot record audio or hold a full text field by themselves, so text and voice open a lightweight quick-entry screen. This should feel instant. | M | 3 |
| FR-12.7 | The widget supports light and dark themes and updates when data changes. | S | 1 |

### 5.13 Windows-Specific Features

| ID | Requirement | Priority | Phase |
| --- | --- | --- | --- |
| FR-13.1 | System tray icon that keeps the app available (and routines running) when the main window is closed. | M | 1 |
| FR-13.2 | Global keyboard shortcuts for quick add task and open the agent. | M | 1 (agent 2) |
| FR-13.3 | Optional launch at system startup. | S | 1 |

### 5.14 Settings and Appearance

| ID | Requirement | Priority | Phase |
| --- | --- | --- | --- |
| FR-14.1 | UI languages: Hebrew (RTL) and English (LTR), switchable in settings. | M | 1 |
| FR-14.2 | Clean, minimal design in the spirit of Notion. | M | 1 |
| FR-14.3 | Light, dark, and follow-system themes. | M | 1 |
| FR-14.4 | Settings for the agent model and API keys (stored in secure device storage), Google account, allowed Gmail labels and senders, notifications, and audio retention. | M | 2 to 4 |

### 5.15 Import and Export (Version 2)

| ID | Requirement | Priority | Phase |
| --- | --- | --- | --- |
| FR-15.1 | Import Markdown files and folders as pages and projects. | M | 5 |
| FR-15.2 | Import from Granola (meeting notes and transcripts). | M | 5 |
| FR-15.3 | Export pages and projects to Markdown. | M | 5 |
| FR-15.4 | Export pages and projects to PDF. | M | 5 |

---

## 6. Data, Storage, and Sync

### 6.1 Principles

- **Offline-first:** The local database on each device is the working copy. The app is fully usable without internet.
- **Sync when online:** Changes sync between Android and Windows automatically.
- **Efficient storage:** Store structured content compactly (for example blocks as small records), avoid duplicate copies, and compress or limit large media where possible.
- **Swappable backend:** The sync layer sits behind an interface so the backend can later move from Firebase to a private server without rewriting the app.

### 6.2 Where data lives

| Data | Storage |
| --- | --- |
| Structured data (projects, tasks, pages, blocks, tables, canvases, transcripts, routines, settings) | Local database on device, synced through **Firebase Firestore** |
| Files (uploads, images, PDFs, meeting audio) | **Google Drive**, in the user's own Drive (a dedicated app folder), cached locally |
| Sign-in | Google account (one account) |
| API keys for AI providers | Secure storage on each device (Android Keystore, Windows credential store), never synced in plain text |

### 6.3 Why this split

Firestore's free plan (Spark) includes about 1 GiB of storage, 50K reads per day, and 20K writes per day, which is enough for text data for one person. Since February 3, 2026, Cloud Storage for Firebase requires the paid Blaze plan, so files go to Google Drive to keep the project free.

### 6.4 Free-tier discipline

Because Spark has hard daily limits, the app must:

- Batch and debounce writes (no write per keystroke; save after a pause or on leaving the page).
- Use incremental (changed-only) sync rather than re-reading collections.
- Keep large content split into blocks or chunks, since a single Firestore document is limited in size.
- Track its own usage and warn the user before limits are reached.

### 6.5 Conflicts

Because there is one user, simultaneous edits are rare. MVP rule: last write wins per field for tasks and metadata, and per block for pages. If the same block was changed on two devices, keep the newer version and store the other in version history. The exact approach is an open decision (section 10).

### 6.6 Security and privacy

- No end-to-end encryption is required. Data is protected by Google sign-in, Firestore security rules limiting access to the owner, and standard encryption in transit and at rest by Firebase and Google Drive.
- The agent sends only relevant retrieved content to the chosen AI provider. Projects marked "exclude from agent" are never sent.
- Gmail access is read-only and limited to the labels and senders the user chose.
- Meeting audio is sent to the transcription service only for transcription.
- A later option is a local model for stronger privacy.

---

## 7. Meeting Recording and Transcription Flow

1. User opens a project and starts a meeting note.
2. App records from the microphone (Android) or microphone plus system audio (Windows) and shows a recording indicator.
3. If online, transcription runs live or in near real time. If offline, audio is saved locally and queued.
4. Speakers are separated and labeled Speaker 1, Speaker 2, and so on. The user can rename them.
5. When the meeting ends, the app generates the summary, decisions, and suggested tasks.
6. The user reviews suggested tasks, renames speakers if needed, and optionally deletes the original audio.
7. Audio is uploaded to Google Drive in the background; the transcript syncs through Firestore.

**Constraint:** Android does not allow capturing other apps' call audio, so Android recordings are microphone only (best for in-person meetings).

---

## 8. Agent Behavior Rules

| Action | Allowed? |
| --- | --- |
| Read and search allowed content | Yes |
| Summarize, answer questions | Yes |
| Create tasks, pages, files | Yes (marked as created by the agent) |
| Move and organize items | Yes, shown to the user and reversible |
| Edit existing content | Only after the user approves a before/after comparison |
| Delete anything | **Never**, it can only suggest |
| Add to Google Calendar | Yes (when the user asks or a routine is set to do so) |
| Read Gmail | Only allowed labels and senders, only on request or inside a routine |
| Send email or modify Gmail | **Never** |

---

## 9. Non-Functional Requirements

- **Performance:** Opening projects and pages feels instant from the local database. Search results appear in under one second on typical data sizes.
- **Reliability:** No data loss on app crash, offline use, or interrupted sync. Recordings are never lost.
- **Battery and background:** Background work is minimal and respects Android battery limits.
- **Accessibility and localization:** Proper RTL layout, readable fonts for Hebrew, scalable text.
- **Cost:** Running cost is near zero apart from the user's own AI API usage and any transcription service.
- **Maintainability:** Clear separation between UI, local data, sync layer, agent layer (model providers), and integrations.

---

## 10. Open Decisions

These were not decided yet and should be settled with Antigravity or during Phase 0.

1. **Tech stack and framework:** Not specified. Requirements that influence it: one codebase for Android and Windows if possible, native Android widget, Windows system-audio capture, Windows tray and global shortcuts, and strong RTL support.
2. **Firestore offline support on Windows:** Offline persistence in the Firebase SDKs differs by platform. Confirm it works on the chosen stack, or build the local-first layer separately and sync through the backend interface.
3. **Transcription and speaker-separation provider:** Must handle Hebrew and English well, mixed-language speech, and speaker separation. Needs evaluation.
4. **Page-content merge strategy:** Last-write-wins per block (default) versus a more advanced merge method.
5. **Semantic search:** Which embedding method and whether it runs locally or in the cloud.
6. **Google permissions approval:** Gmail, Calendar, and Drive access require OAuth scopes. For a personal app, check Google's testing and verification rules (for example token expiry in testing mode) and pick the approach that keeps the connection stable.
7. **Background execution reliability:** How routines behave under Android battery restrictions and when the Windows app is not running.
8. **Drive structure and audio retention default:** Folder layout in Drive, and how long audio is kept by default.
9. **Extra task features not requested yet:** Subtasks, tags, task assignment to time of day, and attachments on tasks.
10. **Agent scope in the UI:** This PRD assumes one global agent plus a project-scoped mode. Confirm.
11. **App name, icon, and visual identity.**
12. **Quota fallback:** What happens if Firestore free limits are reached (throttle sync, warn the user, or move to a paid plan).

## 11. Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Firestore free-tier limits reached | Sync stops until the next day | Batched writes, usage tracking, early warnings, backend abstraction |
| Hebrew transcription or speaker separation quality is poor | Meeting feature feels unreliable | Evaluate providers early, allow manual transcript editing and speaker correction |
| Android background limits block routines | Routines run late | Run on app open, claim mechanism, clear late-run logs |
| Google OAuth restrictions for Gmail | Gmail connection expires or is blocked | Investigate early in Phase 0 |
| Scope is large for one builder | Delays | Phased delivery, MVP first |
| Sensitive data sent to AI providers | Privacy concern | Send minimal snippets, exclude-from-agent switch, local model later |

## 12. Success Criteria

- The owner can run daily project and task management entirely in Memory Hub on both devices, online and offline, with no sync errors or data loss.
- Adding a task from the Android widget takes under 5 seconds.
- A meeting recorded in Hebrew or English produces a usable transcript, a correct-enough summary, and task suggestions in minutes.
- The agent can answer questions using data from several projects and files, and every edit it proposes can be reviewed before it is applied.
- Gmail and Calendar information appears in the app only from the sources the user allowed.

## 13. Phase Details

### Phase 0: Foundations

Choose stack, set up Firebase and Google sign-in, design the data model and sync interface, set up local database, design system (RTL, dark mode), basic navigation. Investigate the open decisions that affect architecture (items 1, 2, 6).

### Phase 1: MVP, Core Workspace

Projects, subfolders, task lists with due dates, priorities, reminders, notifications, recurring tasks, global task views and in-app calendar of tasks, pages with blocks and simple tables, file attachments through Google Drive, full-text search, offline-first sync between Android and Windows, Android task widget (view, check off, quick add), Windows tray and shortcuts, Hebrew and English, light and dark themes, trash and restore. **Exit criteria:** The app is usable daily for tasks, notes, and files on both devices.

### Phase 2: AI Agent

Agent chat, model provider layer (Claude, GPT, Gemini with own keys), retrieval over all content, PDF text extraction and image OCR, search and Q&A with sources, summaries, task and file creation, organizing, edit with before/after approval, version history, exclude-from-agent setting, semantic search. **Exit criteria:** The agent answers questions from stored data and every edit goes through review. No deletion by the agent is possible.

### Phase 3: Meetings

Microphone recording, Windows system audio, transcription, speaker labels and renaming, offline recording with delayed transcription, original audio storage with delete option, summaries, decisions, task suggestions, voice input to the agent, widget agent area (text and voice button). **Exit criteria:** A real meeting in Hebrew or English can be recorded, transcribed, summarized, and turned into tasks.

### Phase 4: Canvases and Integrations

Canvases (shapes, connectors, images, text, design options), Google Calendar (read events, show with tasks, optional event creation), Gmail (read-only, allowed labels and senders, extraction), routines (schedule and event triggers, run-once claim across devices, review inbox, run log). **Exit criteria:** Version 1 is complete.

### Phase 5: Version 2

Import from Markdown and Granola, export to Markdown and PDF, full databases (typed properties, table, board, calendar, and list views, filters, relations).

### Later Backlog

Local AI model option, optional end-to-end encryption, migration from Firebase to a private server, freehand drawing and canvas templates, more integrations.

## 14. Glossary

- **Block:** A single unit of content in a page (paragraph, heading, checklist, and so on).
- **Simple table:** A grid of rows and columns inside a page, used like a spreadsheet.
- **Database (later phase):** A collection of items with typed properties that can be shown as a table, board, calendar, or list.
- **Routine:** A saved agent instruction that runs on a schedule or when an event happens.
- **Claim:** A marker saved in synced data that tells other devices a routine run is already being handled.
- **Diff review:** A side-by-side comparison of an agent's proposed edit before it is applied.
