# Nakconel Examinations — Phase 1

Phase 1 scope: student registration, student login (email or Student ID),
admin login (API only — no admin screens yet), server-side sessions, and the
Student ID generator (`NAK-2026-001`, etc.). Later phases build on this
without breaking it.

Everything below can be done from a phone browser — no computer or command
line required.

## 1. Create the database (Neon)

1. Go to neon.tech and create a free project.
2. In your project's dashboard, open **Connection Details**.
3. You need two connection strings:
   - **Pooled connection** (usually the default one shown) → this is `DATABASE_URL`
   - **Direct connection** (toggle "Pooled connection" off, or look for
     "Direct connection") → this is `DIRECT_URL`
4. Keep this tab open — you'll paste both into Vercel shortly.

## 2. Get the code into GitHub

Tell me your GitHub username (and, when I ask, a **personal access token**
with `repo` access — GitHub → Settings → Developer settings → Personal
access tokens → generate one, works fine from a phone browser). I'll push
this project directly into a new repo for you so you don't have to upload
anything by hand.

(If you'd rather do it yourself: download the project as a zip, create a
new empty repo on github.com, and use its "upload files" page to add the
contents.)

## 3. Import into Vercel

1. Go to vercel.com, sign in, and choose **Add New → Project**.
2. Connect your GitHub account if you haven't, then select the repo.
3. Before deploying, open **Environment Variables** and add:

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | the pooled Neon connection string |
   | `DIRECT_URL` | the direct Neon connection string |
   | `AUTH_SECRET` | any long random string (48+ characters) |
   | `SETUP_SECRET` | any random string you make up |
   | `SEED_ADMIN_EMAIL` | the email for your first admin login (optional but recommended) |
   | `SEED_ADMIN_PASSWORD` | a strong password for that admin (optional but recommended) |

4. Deploy. The build automatically creates all the database tables — you
   don't need to run any migration command yourself.

## 4. Create the courses (one-time)

Once the deploy finishes, visit this URL once in any browser (swap in your
real domain and the `SETUP_SECRET` you chose):

```
https://YOUR-APP.vercel.app/api/setup?key=YOUR_SETUP_SECRET
```

This creates the 6 courses and your first admin account. It's safe to
revisit this URL later — it won't create duplicates.

## 5. Try it

- `https://YOUR-APP.vercel.app/register` — register a test student
- `https://YOUR-APP.vercel.app/login` — log in with either the email or the
  Student ID you were given, plus the password

## What's included so far

**Phase 1 — Authentication & registration**
- Student registration (name, email, phone, age, gender, address, social
  media, password, course) with server-side validation
- Automatic, race-safe Student ID generation (`NAK-2026-001`, `NAK-2026-002`, …)
- Student login by email **or** Student ID
- Admin login (backend only — admin screens are Phase 3)
- Passwords hashed with bcrypt, sessions as signed HTTP-only cookies (JWT),
  never trusting client-supplied course IDs or roles
- Basic rate limiting on register/login endpoints
- An audit log table recording registrations and logins

**Phase 2 — Student dashboard & course display**
- Real exam data model (`Exam`) with schedule, publish state, question
  count, duration, and randomization settings — ready for the admin screens
  and exam engine to build on
- Dashboard shows the student's enrolled course and its Test 1 / Test 2 /
  Final Test rows, each with a status computed **only** from the schedule
  and publish flag — never shown as "Ongoing" just because a row exists
- `/api/setup` now also creates default (unpublished) Test 1 / Test 2 /
  Final Test rows for every course — safe to re-run, won't duplicate

**Phase 3 — Admin dashboard & student management**
- Admin login screen at `/admin/login` (also linked from the homepage footer)
- Admin overview at `/admin` — total students, active courses, exams by
  status (upcoming/ongoing/closed), recent registrations
- Student management at `/admin/students` — search by name/email/Student
  ID/phone, filter by course and status, view full registration detail per
  student, activate/disable accounts (a disabled student is blocked at login)
- Export to Excel (`.xlsx`) with all registration fields, one click from the
  students list
- Every admin action re-verifies the session AND the admin's live status in
  the database — a disabled admin loses access immediately, not just when
  their token expires. All destructive actions are logged to the audit trail.
- Sidebar shows the remaining sections (Courses, Exams, Question Bank,
  Results, Live Monitoring, Suspicious Activity, Settings) as visibly
  disabled placeholders for the phases ahead

**Phase 4 — Course & exam management**
- `/admin/courses` — add courses, rename them, activate/deactivate (a
  deactivated course is hidden from new registrations but existing students
  stay enrolled)
- `/admin/exams` — every exam across every course, filterable by course, each
  showing its live status
- Create/edit exams with the full config from the spec: question count,
  duration, passing score, start/end date & time, instructions, shuffle
  questions, shuffle answer options, display order
- A real **Exam Validation** checklist on each exam's page, matching the
  spec's publishing workflow — publish is blocked (422) until every check
  passes, including a "valid questions available in the Question Bank"
  check. That check is always 0-of-N right now, on purpose: the question
  bank doesn't exist yet (Phase 5), so no exam can be truly ready to publish
  until then — this deliberately refuses to fake that check rather than
  let something un-publishable-in-spirit go live
- Editing a published exam automatically unpublishes it, so a schedule or
  question-count change always gets re-validated before going live again

**Phase 5 — Question Bank**
- `/admin/questions` — add, edit, activate/deactivate, and delete questions
  per course (question text, 2+ answer options, one marked correct)
- Filter by course and search by question text; each course shows how many
  active questions it has
- The exam-publishing checklist now checks a real, live count of active
  questions for the exam's course instead of always showing 0 — an exam
  becomes publishable once that count matches its configured question total
- Deactivating a question (instead of deleting it) removes it from that
  count without losing the question, e.g. while it's being reviewed

**Phase 6 — Exam-taking engine**
- `/exam/[id]` — the actual student exam interface: timer, one question at a
  time, answer selection with autosave, previous/next navigation, submit
- Server-side timer (`expiresAt` on the attempt) — the browser clock is
  never trusted; time remaining is always computed from the server
- Auto-submit when time runs out; manual submit locks the attempt
- One attempt per student per exam enforced at the database level
  (`@@unique([examId, studentId])`) — a 409 on re-starting a completed exam
  is the system working as designed, not a bug

**Phase 7 — Scoring, bulk import, results**
- Automatic scoring on submission — correct answers are compared
  server-side, student browsers never receive answer keys
- Word document (`.docx`) bulk question import, in addition to the CSV
  bulk-upload from Phase 5
- `/admin/results` — every submitted attempt, with an admin **Reset
  attempt** action for legitimate retakes (technical issues, mistaken
  early submission, etc.) — always logged to the audit trail

**Phase 8 — Live monitoring & suspicious activity**
- Live camera/microphone streaming from student to admin during an exam via
  LiveKit, with explicit consent required before it starts
- `/admin/monitoring` — see students currently testing, in real time
- `/admin/suspicious` — flagged events (failed logins, exam timeouts, and
  more from Phase 11 below) for human review — nothing here auto-fails a
  student

**Phase 11 — Identity verification & presence checks**
- On-device face detection (self-hosted model files, nothing sent to a
  third party) runs entirely in the student's browser
- First exam attempt ever: captures a small reference photo + a
  non-reversible face-recognition embedding (128 numbers, not an image) as
  that student's enrolled baseline
- Every attempt after that: compares the live camera face against the
  baseline and logs a match/mismatch — a mismatch is a **review flag**,
  never an automatic fail or block
- Periodic checks during the exam watch only for "no face" or "more than
  one face" in frame — logged as review-flag events, not proof of anything
- Consent screen explains what's monitored, why, and that it's deletable —
  admins can permanently delete a student's stored verification photo and
  descriptor from their profile page at any time, which also re-enrolls
  them fresh on their next attempt
- Deliberately **not recording video** anywhere — the live feed is
  peer-to-peer through LiveKit, not saved to disk, which keeps the
  retention story simple: there's nothing to retain but one small photo

## What's intentionally NOT here yet

Full-screen enforcement and tab/focus-switch monitoring during exams
(spec's Phase 10), and Settings. Phases 9 (results/reporting depth) and 12
(richer real-time monitoring UI) are also still open — what exists today
covers their core mechanics (results exist via Phase 7, live monitoring via
Phase 8) but not every refinement the spec describes.

## Local development (optional, if you ever use a computer)

```
npm install
cp .env.example .env.local   # fill in real values
npm run dev
```

## Nak Learning Center roadmap

The CBT system and the Learning Center share the same registered student accounts, Student IDs, and course enrolments. The Learning Center must never create a second registration system or break existing CBT functionality.

### Learning Center Phase 1 — Course & Student Foundation

Connect existing students to their registered course and provide **My Course**, including course modules, lessons, and classes. The database relationship is: `Student → Course → LearningModule → Lesson / LearningClass`. Students may only see the course attached to their existing account.

### Planned phases

1. Course and student foundation
2. Student learning dashboard
3. Admin course and class management
4. Class scheduling
5. Class materials and notes
6. Presentation-first live classroom
7. Real-time video and audio
8. 4K capture with adaptive quality
9. Participants and student-video permissions
10. Raise hand and speaking permissions
11. Chat and Q&A
12. Presentation and screen sharing
13. Attendance
14. Class recordings
15. Assignments
16. Learning-progress tracking
17. Notifications and reminders
18. Admin live-class monitoring
19. Admin analytics
20. Security hardening and authorization
21. CBT integration
22. Responsive classroom design
23. End-to-end testing
24. Final UI/UX polish

Brand colors for the Learning Center remain `#330808` (primary) and `#98661B` (accent). Development proceeds one tested phase at a time; smooth audio, reliability, authorization, and protection of student data take priority over unnecessary visual effects.
