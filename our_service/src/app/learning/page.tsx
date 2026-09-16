import Link from "next/link";
import { redirect } from "next/navigation";
import { getStudentSession, getLcSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import LogoutButton from "@/components/LogoutButton";
import LcLogoutButton from "@/components/LcLogoutButton";
import RefreshButton from "@/components/RefreshButton";
import StudentLearningDashboard from "@/components/StudentLearningDashboard";
import { getExamStatus } from "@/lib/examStatus";
import { syncLearningClassStatuses } from "@/lib/learningSchedule";

export const dynamic = "force-dynamic";

export default async function MyCoursePage() {
  // Support both CBT students (old flow) and external LC students (new OTP flow)
  const cbtSession = await getStudentSession();
  const lcSession  = await getLcSession();

  if (!cbtSession && !lcSession) redirect("/learning/login");
  await syncLearningClassStatuses();

  // ── EXTERNAL LC STUDENT (new OTP flow) ────────────────────────────────
  // These students authenticated via main Nakconel DB. They don't have a
  // record in the Learning Center's students table yet.
  if (lcSession && !cbtSession) {
    // Fetch their LearningProfile (created on first OTP login)
    const profile = await prisma.learningProfile.findUnique({
      where: { id: lcSession.profileId },
    });
    if (!profile) redirect("/learning/login");

    // Fetch general meetings they can attend
    const generalMeetings = await prisma.learningClass.findMany({
      where: { isGeneral: true, status: { in: ["LIVE", "SCHEDULED"] } },
      orderBy: { startsAt: "asc" },
      select: { id: true, title: true, instructor: true, status: true, startsAt: true, endsAt: true },
    });

    return (
      <main style={shell}>
        <header style={header}>
          <Link href="/learning" style={{ ...brand, display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <img src="/logo.png" alt="NAKCONEL" style={{ width: 34, height: 34, objectFit: "contain" }} />
            NAKCONEL Learning Center
          </Link>
          <div style={actions}>
            <RefreshButton />
            <LcLogoutButton />
          </div>
        </header>
        <section style={content}>
          <p style={eyebrow}>Learning Center</p>
          <h1 style={title}>Welcome, {profile.fullName.split(" ")[0]} 🎉</h1>
          <p style={intro}>
            You are now connected to the NAKCONEL Learning Center. Your registered programme information is shown below.
          </p>

          {/* Student info card */}
          <div style={{ background:"var(--cream-100,#fff8f8)", border:"1.5px solid var(--gold-200,#d4a843)", borderRadius:14, padding:"1.5rem", marginBottom:"2rem", display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))", gap:"1rem" }}>
            {[
              ["Full Name",            profile.fullName],
              ["Email",                profile.email],
              ["Programme",            profile.program],
              ["Registration Status",  profile.mainStatus],
            ].map(([label, value]) => (
              <div key={label}>
                <p style={{ margin:0, fontSize:"0.72rem", fontWeight:700, color:"var(--burgundy-600,#7f1d1d)", letterSpacing:"0.04em", textTransform:"uppercase" }}>{label}</p>
                <p style={{ margin:"0.2rem 0 0", fontWeight:600, color:"var(--burgundy-900,#330808)" }}>{value}</p>
              </div>
            ))}
          </div>

          {/* General Meetings */}
          <h2 style={heading}>🌐 General Meetings</h2>
          <p style={muted}>General meetings are open to all registered students.</p>
          {generalMeetings.length === 0
            ? <div style={empty}>No general meetings are currently live or scheduled.</div>
            : <div style={classGrid}>{generalMeetings.map((item) => (
                <article key={item.id} style={classCard}>
                  <p style={eyebrow}>🌐 General Meeting</p>
                  <h3 style={{ margin:"0.2rem 0", color:"var(--burgundy-900)" }}>{item.title}</h3>
                  <span style={{ ...statusBadge, ...(item.status === "LIVE" ? liveBadge : {}) }}>
                    {item.status === "LIVE" ? "● LIVE" : item.status}
                  </span>
                  {item.instructor && <p style={muted}>Host: {item.instructor}</p>}
                  {item.startsAt && <p style={muted}>{formatDate(item.startsAt)}</p>}
                  {item.status === "LIVE" && (
                    <Link href={`/learning/general/${item.id}`} style={{ ...joinButton, background:"#98661B" }}>
                      Join meeting →
                    </Link>
                  )}
                </article>
              ))}</div>
          }

          <div style={{ marginTop:"2.5rem", background:"var(--cream-100,#fff8f8)", border:"1px solid var(--cream-200,#fde8e8)", borderRadius:12, padding:"1.25rem" }}>
            <p style={{ margin:0, color:"var(--ink-600,#4a1212)", fontSize:"0.88rem", lineHeight:1.6 }}>
              <strong>Your course content</strong> — modules, lessons, live classes and assessments — will appear here once your instructor activates your programme. 
              Contact <strong>nakconelcompany@gmail.com</strong> if you need help.
            </p>
          </div>
        </section>
      </main>
    );
  }

  // ── CBT STUDENT (existing flow, unchanged below) ─────────────────────
  const session = cbtSession!;

  // Fetch general meetings (open to all active students)
  const generalMeetings = await prisma.learningClass.findMany({
    where: { isGeneral: true, status: { in: ["LIVE", "SCHEDULED"] } },
    orderBy: { startsAt: "asc" },
    select: { id: true, title: true, instructor: true, status: true, startsAt: true, endsAt: true },
  });

  const student = await prisma.student.findUnique({
    where: { id: session.sub },
    include: {
      course: {
        include: {
          modules: { orderBy: { position: "asc" }, include: { lessons: { orderBy: { position: "asc" }, select: { id: true, title: true } }, classes: { orderBy: { startsAt: "asc" }, select: { id: true, title: true, startsAt: true, endsAt: true, status: true, recordingUrl: true } } } },
          classes: { orderBy: { startsAt: "asc" }, select: { id: true, title: true, moduleId: true, startsAt: true, endsAt: true, status: true, recordingUrl: true } },
          materials: { orderBy: { createdAt: "desc" }, select: { id: true, title: true, fileName: true, sizeBytes: true } },
          exams: { orderBy: { order: "asc" }, select: { id: true, name: true, published: true, startAt: true, endAt: true } },
        },
      },
    },
  });
  if (!student || student.status !== "active") redirect("/login");

  // Fetch student progress metrics (attendances & passed exam attempts)
  const attendances = await prisma.classAttendance.findMany({
    where: { studentId: student.studentId },
  });

  const attempts = await prisma.examAttempt.findMany({
    where: { studentId: student.id, passed: true },
  });

  const certificate = await prisma.courseCertificate.findUnique({
    where: {
      studentId_courseId: {
        studentId: student.studentId,
        courseId: student.course.id,
      },
    },
  });

  const assignments = await prisma.assignment.findMany({
    where: { courseId: student.course.id },
    include: {
      submissions: {
        where: { studentId: student.id },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const standaloneClasses = student.course.classes.filter((item) => !item.moduleId);
  const now = new Date();
  const nextExam = student.course.exams.find((exam) => ["ONGOING", "UPCOMING"].includes(getExamStatus(exam, now)));
  const lessonCount = student.course.modules.reduce((total, module) => total + module.lessons.length, 0);
  const allClasses = [...student.course.classes, ...student.course.modules.flatMap((module) => module.classes)];
  const classCount = allClasses.length;
  const liveClass = allClasses.find((item) => item.status === "LIVE");
  const nextClass = allClasses.filter((item) => item.status === "SCHEDULED" && item.startsAt && item.startsAt > now).sort((a, b) => a.startsAt!.valueOf() - b.startsAt!.valueOf())[0];
  const upcomingCount = allClasses.filter((item) => item.status === "SCHEDULED" && item.startsAt && item.startsAt > now).length;

  const totalClassesCount = classCount || 1;
  const totalExamsCount = student.course.exams.length || 1;
  const attendedCount = attendances.length;
  const passedExamsCount = attempts.length;

  const progressPercent = Math.min(
    100,
    Math.round(((attendedCount / totalClassesCount) * 0.5 + (passedExamsCount / totalExamsCount) * 0.5) * 100) || 100
  );
  return (
    <main style={shell}>
      <header style={header}>
        <Link href="/dashboard" style={{ ...brand, display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <img src="/logo.png" alt="NAKCONEL" style={{ width: 34, height: 34, objectFit: "contain" }} />
          NAK Learning Center
        </Link>
        <div style={actions}><Link href="/dashboard" style={link}>CBT dashboard</Link><RefreshButton /><LogoutButton /></div>
      </header>
      <section style={content}>
        <p style={eyebrow}>Learning Center</p>
        <h1 style={title}>Welcome back, {student.fullName.split(" ")[0]}</h1>
        <p style={intro}>Your registered course, learning content, upcoming classes, and assessment information in one place.</p>
        <div style={identity}><div><span style={label}>Student ID</span><strong>{student.studentId}</strong></div><div><span style={label}>Registered course</span><strong>{student.course.name}</strong></div></div>
        <StudentLearningDashboard
          studentName={student.fullName}
          studentId={student.studentId}
          courseName={student.course.name}
          progressPercent={progressPercent}
          attendedCount={attendedCount}
          totalClasses={totalClassesCount}
          passedExamsCount={passedExamsCount}
          totalExams={totalExamsCount}
          allClasses={allClasses.map((c) => ({
            id: c.id,
            title: c.title,
            startsAt: c.startsAt ? c.startsAt.toISOString() : null,
            endsAt: c.endsAt ? c.endsAt.toISOString() : null,
            status: c.status,
            recordingUrl: c.recordingUrl,
          }))}
          materials={student.course.materials}
          certificate={
            certificate
              ? {
                  code: certificate.code,
                  issuedAt: certificate.issuedAt.toISOString(),
                  grade: certificate.grade,
                  studentName: student.fullName,
                  studentId: student.studentId,
                  courseName: student.course.name,
                }
              : null
          }
        />
        <section style={dashboardGrid} aria-label="Learning overview">
          <OverviewCard label="Live now" title={liveClass?.title ?? "No live class"} text={liveClass ? "Your class is live now. Select Join live classroom below." : "There is no live class at the moment."} tone="live" />
          <OverviewCard label="Next class" title={nextClass?.title ?? "No class scheduled"} text={nextClass?.startsAt ? formatDate(nextClass.startsAt) : "Your instructor has not scheduled a class yet."} />
          <OverviewCard label="Upcoming classes" title={upcomingCount ? `${upcomingCount} upcoming class${upcomingCount === 1 ? "" : "es"}` : "Nothing upcoming"} text="Only classes for your registered course are shown." />
          <OverviewCard label="Recent materials" title={student.course.materials[0]?.title ?? "No materials yet"} text={student.course.materials.length ? `${student.course.materials.length} course material${student.course.materials.length === 1 ? "" : "s"} available.` : "Your instructor has not uploaded materials yet."} />
          <OverviewCard
            label="Assignments"
            title={assignments.length ? `${assignments.length} course assignment${assignments.length === 1 ? "" : "s"}` : "No assignments yet"}
            text={assignments.filter((a) => a.submissions.length === 0).length ? `${assignments.filter((a) => a.submissions.length === 0).length} pending submission(s).` : "All assignments submitted."}
          />
          <OverviewCard label="Next test / exam" title={nextExam?.name ?? "No upcoming exam"} text={nextExam?.startAt ? `Available ${new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(nextExam.startAt)}` : "Your scheduled assessment will appear here."} tone="exam" />
        </section>
        <h2 style={heading}>Course modules</h2>
        {student.course.modules.length === 0 ? <div style={empty}>Your course structure is being prepared. Modules and lessons will appear here when your administrator adds them.</div> : <div style={moduleList}>{student.course.modules.map((module, index) => <article key={module.id} style={moduleCard}><div style={moduleNumber}>{String(index + 1).padStart(2, "0")}</div><div style={{ flex: 1 }}><h3 style={{ margin: 0, color: "var(--burgundy-900)" }}>{module.title}</h3>{module.description && <p style={muted}>{module.description}</p>}<div style={sectionRow}><span>{module.lessons.length} lesson{module.lessons.length === 1 ? "" : "s"}</span><span>{module.classes.length} class{module.classes.length === 1 ? "" : "es"}</span></div>{module.lessons.length > 0 && <ul style={items}>{module.lessons.map((lesson) => <li key={lesson.id}>{lesson.title}</li>)}</ul>}{module.classes.length > 0 && <p style={classNote}>Classes: {module.classes.map((item) => item.title).join(", ")}</p>}</div></article>)}</div>}
        <h2 style={heading}>Classes</h2>
        {allClasses.length === 0 ? <div style={empty}>No classes have been added to this course yet.</div> : <div style={classGrid}>{standaloneClasses.map((item) => <ClassCard key={item.id} item={item} label="Course class" />)}{student.course.modules.flatMap((module) => module.classes.map((item) => <ClassCard key={item.id} item={item} label={module.title} />))}</div>}

        {/* ── General Meetings — visible to all students ── */}
        <h2 style={heading}>🌐 General Meetings</h2>
        <p style={muted}>General meetings are open to all students. Join when live to see and hear everyone.</p>
        {generalMeetings.length === 0
          ? <div style={empty}>No general meetings are currently live or scheduled.</div>
          : <div style={classGrid}>{generalMeetings.map((item) => (
              <article key={item.id} style={classCard}>
                <p style={eyebrow}>🌐 General Meeting</p>
                <h3 style={{ margin: "0.2rem 0", color: "var(--burgundy-900)" }}>{item.title}</h3>
                <span style={{ ...statusBadge, ...(item.status === "LIVE" ? liveBadge : {}) }}>
                  {item.status === "LIVE" ? "● LIVE" : item.status}
                </span>
                {item.instructor && <p style={muted}>Host: {item.instructor}</p>}
                {item.startsAt && <p style={muted}>{formatDate(item.startsAt)}</p>}
                {item.status === "LIVE" && (
                  <Link href={`/learning/general/${item.id}`} style={{ ...joinButton, background: "#98661B" }}>
                    Join General Meeting
                  </Link>
                )}
              </article>
            ))}</div>
        }        <h2 style={heading}>Materials</h2>
        {student.course.materials.length === 0 ? <div style={empty}>No learning materials have been shared with this course yet.</div> : <div style={classGrid}>{student.course.materials.map((material) => <article key={material.id} style={classCard}><p style={eyebrow}>Course material</p><h3 style={{ margin: "0.2rem 0", color: "var(--burgundy-900)" }}>{material.title}</h3><p style={muted}>{material.fileName} · {Math.ceil(material.sizeBytes / 1024)} KB</p><a href={`/api/learning/materials/${material.id}`} style={download}>Download material</a></article>)}</div>}
      </section>
    </main>
  );
}

function OverviewCard({ label, title, text, tone }: { label: string; title: string; text: string; tone?: "live" | "exam" }) {
  return <article style={{ ...overviewCard, borderTopColor: tone === "live" ? "var(--danger)" : tone === "exam" ? "var(--gold-600)" : "var(--line)" }}><p style={eyebrow}>{label}</p><h3 style={{ color: "var(--burgundy-900)", margin: "0.35rem 0" }}>{title}</h3><p style={muted}>{text}</p></article>;
}
function ClassCard({ item, label }: { item: { id: string; title: string; startsAt: Date | null; endsAt: Date | null; status: string }; label: string }) { return <article style={classCard}><p style={eyebrow}>{label}</p><h3 style={{ margin: "0.2rem 0", color: "var(--burgundy-900)" }}>{item.title}</h3><span style={{ ...statusBadge, ...(item.status === "LIVE" ? liveBadge : {}) }}>{item.status === "LIVE" ? "● LIVE" : item.status}</span><p style={muted}>{item.startsAt ? `${formatDate(item.startsAt)}${item.endsAt ? ` – ${new Intl.DateTimeFormat("en", { timeStyle: "short" }).format(item.endsAt)}` : ""}` : "Schedule not set yet."}</p>{item.status === "LIVE" && <Link href={`/learning/class/${item.id}`} style={joinButton}>Join live classroom</Link>}</article>; }
function formatDate(date: Date) { return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(date); }

const shell = { minHeight: "100dvh", background: "var(--cream-50)" } as const;
const header = { background: "var(--burgundy-900)", color: "var(--cream-50)", padding: "1.1rem 6vw", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", flexWrap: "wrap" } as const;
const brand = { color: "inherit", fontFamily: "var(--font-display)", fontStyle: "italic", fontSize: "1.2rem", textDecoration: "none" } as const;
const actions = { display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" } as const;
const link = { color: "inherit", textDecoration: "none", fontSize: "0.9rem" } as const;
const content = { maxWidth: 1000, margin: "0 auto", padding: "5vh 6vw" } as const;
const eyebrow = { color: "var(--gold-600)", fontSize: "0.82rem", fontWeight: 600, margin: 0 } as const;
const title = { fontSize: "clamp(2rem, 5vw, 3rem)", color: "var(--burgundy-900)", margin: "0.35rem 0" } as const;
const intro = { color: "var(--ink-600)", maxWidth: 650, lineHeight: 1.6 } as const;
const identity = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "1rem", background: "#fff", border: "1px solid var(--line)", borderRadius: 8, padding: "1.2rem", margin: "2rem 0" } as const;
const progressCard = { background: "#fff", border: "1px solid var(--line)", borderRadius: 8, padding: "1.2rem", marginBottom: "1rem" } as const;
const progressTrack = { height: 10, background: "#efe9e0", borderRadius: 99, overflow: "hidden", marginTop: "0.9rem" } as const;
const progressFill = { display: "block", height: "100%", width: "0%", background: "var(--gold-600)" } as const;
const progressCaption = { color: "var(--ink-600)", fontSize: "0.82rem", marginBottom: 0 } as const;
const dashboardGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: "0.8rem", margin: "1.25rem 0 2rem" } as const;
const overviewCard = { background: "#fff", border: "1px solid var(--line)", borderTop: "4px solid var(--line)", borderRadius: 8, padding: "1.05rem", minHeight: 150 } as const;
const label = { display: "block", color: "var(--ink-600)", fontSize: "0.78rem", marginBottom: "0.25rem" } as const;
const heading = { color: "var(--burgundy-900)", fontSize: "1.35rem", margin: "2rem 0 0.8rem" } as const;
const empty = { background: "#fff", border: "1px dashed var(--gold-400)", borderRadius: 8, padding: "1.25rem", color: "var(--ink-600)" } as const;
const moduleList = { display: "grid", gap: "0.8rem" } as const;
const moduleCard = { background: "#fff", border: "1px solid var(--line)", borderRadius: 8, padding: "1.1rem", display: "flex", gap: "1rem" } as const;
const moduleNumber = { background: "var(--burgundy-900)", color: "var(--gold-200)", width: 38, height: 38, borderRadius: "50%", display: "grid", placeItems: "center", fontWeight: 600, flex: "0 0 auto" } as const;
const muted = { color: "var(--ink-600)", fontSize: "0.9rem", lineHeight: 1.5 } as const;
const sectionRow = { display: "flex", gap: "1rem", color: "var(--gold-600)", fontSize: "0.82rem", fontWeight: 600 } as const;
const items = { margin: "0.7rem 0 0", paddingLeft: "1.15rem", color: "var(--ink-900)", display: "grid", gap: "0.3rem", fontSize: "0.9rem" } as const;
const classNote = { color: "var(--ink-600)", fontSize: "0.85rem", marginBottom: 0 } as const;
const classGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "0.8rem" } as const;
const classCard = { background: "#fff", border: "1px solid var(--line)", borderRadius: 8, padding: "1.1rem" } as const;
const statusBadge = { display: "inline-block", background: "#efe9e0", color: "var(--burgundy-900)", borderRadius: 99, padding: "0.2rem 0.55rem", fontSize: "0.72rem", fontWeight: 700 } as const;
const liveBadge = { background: "#f2e3e0", color: "var(--danger)" } as const;
const download = { display: "inline-block", background: "var(--burgundy-900)", color: "#fff", borderRadius: 4, padding: "0.5rem 0.7rem", fontSize: "0.82rem", fontWeight: 600, textDecoration: "none" } as const;
const joinButton = { ...download, background: "var(--gold-600)", marginTop: "0.25rem" } as const;
