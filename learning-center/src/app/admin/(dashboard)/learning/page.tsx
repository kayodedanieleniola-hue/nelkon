"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import GeneralClassroomClient from "@/components/GeneralClassroomClient";

type ClassItem = {
  id: string;
  title: string;
  instructor: string | null;
  description: string | null;
  startsAt: string | null;
  endsAt: string | null;
  status: string;
  activeMaterialId: string | null;
  isGeneral?: boolean;
};

type Module = {
  id: string;
  title: string;
  description: string | null;
  position: number;
  classes: ClassItem[];
};

type Material = {
  id: string;
  title: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  moduleId: string | null;
  classId: string | null;
};

type Course = {
  id: string;
  name: string;
  modules: Module[];
  classes: ClassItem[];
  materials: Material[];
};

const statuses = ["DRAFT", "SCHEDULED", "LIVE", "COMPLETED", "CANCELLED"];

export default function LearningManagementPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseId, setCourseId] = useState("");
  const [message, setMessage] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const [moduleForm, setModuleForm] = useState({ title: "", description: "" });
  const [classForm, setClassForm] = useState({
    title: "",
    moduleId: "",
    instructor: "",
    description: "",
    startsAt: "",
    endsAt: "",
    status: "DRAFT",
    activeMaterialId: "",
    isGeneral: false,
  });
  const [material, setMaterial] = useState({ title: "", moduleId: "", classId: "", file: null as File | null });
  const [broadcastingClass, setBroadcastingClass] = useState<{ id: string; title: string } | null>(null);

  async function load() {
    try {
      const r = await fetch("/api/admin/learning");
      const d = await r.json();
      if (r.ok) {
        setCourses(d.courses ?? []);
        setCourseId((current) => current || d.courses?.[0]?.id || "");
      }
    } catch {
      setErrorMsg("Failed to load courses");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const selected = courses.find((course) => course.id === courseId);

  async function send(method: string, data?: object, query = "") {
    setMessage("");
    setErrorMsg("");
    try {
      const r = await fetch(`/api/admin/learning${query}`, {
        method,
        headers: { "Content-Type": "application/json" },
        ...(data ? { body: JSON.stringify(data) } : {}),
      });
      const d = await r.json();
      if (r.ok) {
        setMessage("Saved successfully.");
        void load();
        return true;
      } else {
        setErrorMsg(d.error ?? "Unable to save item.");
        return false;
      }
    } catch {
      setErrorMsg("Network error occurred.");
      return false;
    }
  }

  async function addModule(e: React.FormEvent) {
    e.preventDefault();
    if (!courseId) {
      setErrorMsg("Please select a course first.");
      return;
    }
    if (await send("POST", { type: "module", courseId, title: moduleForm.title.trim(), description: moduleForm.description.trim() || null })) {
      setModuleForm({ title: "", description: "" });
    }
  }

  async function addClass(e: React.FormEvent) {
    e.preventDefault();
    if (!courseId) {
      setErrorMsg("Please select a course first.");
      return;
    }
    if (!classForm.title.trim()) {
      setErrorMsg("Please enter a valid class title.");
      return;
    }

    const payload = {
      type: "class",
      courseId,
      title: classForm.title.trim(),
      moduleId: classForm.moduleId || null,
      instructor: classForm.instructor.trim() || null,
      description: classForm.description.trim() || null,
      startsAt: classForm.startsAt || null,
      endsAt: classForm.endsAt || null,
      status: classForm.status || "DRAFT",
      activeMaterialId: classForm.activeMaterialId || null,
      isGeneral: classForm.isGeneral,
    };

    if (await send("POST", payload)) {
      setClassForm({
        title: "",
        moduleId: "",
        instructor: "",
        description: "",
        startsAt: "",
        endsAt: "",
        status: "DRAFT",
        activeMaterialId: "",
        isGeneral: false,
      });
    }
  }

  async function uploadMaterial(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    setErrorMsg("");
    if (!material.file) return setErrorMsg("Choose a file to upload.");
    if (!courseId) return setErrorMsg("Please select a course first.");

    const data = new FormData();
    data.set("courseId", courseId);
    data.set("title", material.title.trim());
    if (material.moduleId) data.set("moduleId", material.moduleId);
    if (material.classId) data.set("classId", material.classId);
    data.set("file", material.file);

    try {
      const r = await fetch("/api/admin/learning/materials", { method: "POST", body: data });
      const d = await r.json();
      if (r.ok) {
        setMessage("Material uploaded successfully.");
        setMaterial({ title: "", moduleId: "", classId: "", file: null });
        void load();
      } else {
        setErrorMsg(d.error ?? "Upload failed.");
      }
    } catch {
      setErrorMsg("Network error uploading material.");
    }
  }

  return (
    <div>
      <p style={eyebrow}>Learning Center</p>
      <h1 style={{ fontSize: "1.9rem" }}>Course & Class Management</h1>
      <p style={muted}>Create modules, live classes, and authorized learning materials for existing courses.</p>

      {message && <p style={noticeSuccess}>{message}</p>}
      {errorMsg && <p style={noticeError}>{errorMsg}</p>}

      {courses.length === 0 ? (
        <div style={emptyCard}>
          <strong style={{ color: "#5c1d1d" }}>No Active Courses Found</strong>
          <p style={{ margin: "0.4rem 0" }}>You must create at least one course before adding modules and classes.</p>
          <Link href="/admin/courses" style={button}>
            Go to Course Management
          </Link>
        </div>
      ) : (
        <>
          <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 700, margin: "1rem 0 0.3rem" }}>
            Select Course:
          </label>
          <select value={courseId} onChange={(e) => setCourseId(e.target.value)} style={input}>
            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.name}
              </option>
            ))}
          </select>

          {selected && (
            <>
              <div style={grid}>
                {/* Module Creation */}
                <section style={card}>
                  <h2>Add Module</h2>
                  <form onSubmit={addModule}>
                    <input
                      required
                      value={moduleForm.title}
                      onChange={(e) => setModuleForm({ ...moduleForm, title: e.target.value })}
                      placeholder="Module title (e.g. Module 1: Anatomy)"
                      style={input}
                    />
                    <textarea
                      value={moduleForm.description}
                      onChange={(e) => setModuleForm({ ...moduleForm, description: e.target.value })}
                      placeholder="Short description (optional)"
                      style={input}
                    />
                    <button style={button}>Create Module</button>
                  </form>
                </section>

                {/* Class Creation */}
                <section style={card}>
                  <h2>Create Class</h2>
                  <form onSubmit={addClass}>
                    <input
                      required
                      value={classForm.title}
                      onChange={(e) => setClassForm({ ...classForm, title: e.target.value })}
                      placeholder="Class title (e.g. Live Pharmacology Session)"
                      style={input}
                    />
                    <select
                      value={classForm.moduleId}
                      onChange={(e) => setClassForm({ ...classForm, moduleId: e.target.value })}
                      style={input}
                    >
                      <option value="">No module / course-level class</option>
                      {selected.modules.map((module) => (
                        <option key={module.id} value={module.id}>
                          {module.title}
                        </option>
                      ))}
                    </select>
                    <input
                      value={classForm.instructor}
                      onChange={(e) => setClassForm({ ...classForm, instructor: e.target.value })}
                      placeholder="Instructor Name"
                      style={input}
                    />
                    <textarea
                      value={classForm.description}
                      onChange={(e) => setClassForm({ ...classForm, description: e.target.value })}
                      placeholder="Description"
                      style={input}
                    />
                    <label style={label}>
                      Start date & time
                      <input
                        type="datetime-local"
                        value={classForm.startsAt}
                        onChange={(e) => setClassForm({ ...classForm, startsAt: e.target.value })}
                        style={input}
                      />
                    </label>
                    <label style={label}>
                      End date & time
                      <input
                        type="datetime-local"
                        value={classForm.endsAt}
                        onChange={(e) => setClassForm({ ...classForm, endsAt: e.target.value })}
                        style={input}
                      />
                    </label>
                    <label style={label}>
                      Active Presentation Material
                      <select
                        value={classForm.activeMaterialId}
                        onChange={(e) => setClassForm({ ...classForm, activeMaterialId: e.target.value })}
                        style={input}
                      >
                        <option value="">None / Auto-select first</option>
                        {selected.materials.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.title}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label style={label}>
                      Initial Status
                      <select
                        value={classForm.status}
                        onChange={(e) => setClassForm({ ...classForm, status: e.target.value })}
                        style={input}
                      >
                        {statuses.map((status) => (
                          <option key={status}>{status}</option>
                        ))}
                      </select>
                    </label>
                    <label style={{ ...label, display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={classForm.isGeneral}
                        onChange={(e) => setClassForm({ ...classForm, isGeneral: e.target.checked })}
                      />
                      <span>
                        <strong>General Meeting</strong>
                        <span style={{ display: "block", fontSize: "0.78rem", color: "#666", fontWeight: 400 }}>
                          Visible to ALL students regardless of course. No presentation — everyone sees each other&apos;s cameras.
                        </span>
                      </span>
                    </label>
                    <button style={classForm.isGeneral ? { ...button, background: "#98661B" } : button}>
                      {classForm.isGeneral ? "Create General Meeting" : "Create Class"}
                    </button>
                  </form>
                </section>
              </div>

              {/* Material Upload */}
              <section style={card}>
                <h2>Upload Material</h2>
                <p style={muted}>
                  Allowed: PDF, DOC/DOCX, TXT, XLS/XLSX, CSV, PPT/PPTX, PNG, JPG, WebP, SVG — up to 10 MB.
                </p>
                <form onSubmit={uploadMaterial}>
                  <input
                    required
                    value={material.title}
                    onChange={(e) => setMaterial({ ...material, title: e.target.value })}
                    placeholder="Material title"
                    style={input}
                  />
                  <select
                    value={material.moduleId}
                    onChange={(e) => setMaterial({ ...material, moduleId: e.target.value })}
                    style={input}
                  >
                    <option value="">Course-level material</option>
                    {selected.modules.map((module) => (
                      <option key={module.id} value={module.id}>
                        {module.title}
                      </option>
                    ))}
                  </select>
                  <input
                    type="file"
                    required
                    accept=".pdf,.doc,.docx,.txt,.xls,.xlsx,.csv,.ppt,.pptx,.png,.jpg,.jpeg,.webp,.svg"
                    onChange={(e) => setMaterial({ ...material, file: e.target.files?.[0] ?? null })}
                    style={input}
                  />
                  <button style={button}>Upload Material</button>
                </form>
                {selected.materials.length > 0 && (
                  <ul style={{ marginTop: "1rem" }}>
                    {selected.materials.map((item) => (
                      <li key={item.id} style={{ marginBottom: "0.4rem" }}>
                        {item.title} · {item.fileName} ({Math.ceil(item.sizeBytes / 1024)} KB){" "}
                        <button
                          style={danger}
                          onClick={() => {
                            if (confirm(`Delete ${item.title}?`))
                              void fetch(`/api/admin/learning/materials?id=${item.id}`, { method: "DELETE" }).then(
                                () => load()
                              );
                          }}
                        >
                          Delete
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {/* Modules and Classes List */}
              <h2>Modules and Classes</h2>
              {selected.modules.length === 0 && selected.classes.length === 0 ? (
                <p style={empty}>No Learning Center content has been created for this course yet.</p>
              ) : (
                <div style={list}>
                  {selected.modules.map((module) => (
                    <ModuleCard
                      key={module.id}
                      module={module}
                      materials={selected.materials}
                      send={send}
                      onBroadcast={setBroadcastingClass}
                    />
                  ))}
                  {selected.classes.map((item) => (
                    <ClassCard
                      key={item.id}
                      item={item}
                      materials={selected.materials}
                      send={send}
                      onBroadcast={setBroadcastingClass}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}

      {broadcastingClass && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "#110505" }}>
          <GeneralClassroomClient
            meeting={{ id: broadcastingClass.id, title: broadcastingClass.title, instructor: "Instructor", description: null, status: "LIVE" }}
            studentName="Instructor"
            isInstructor
            backHref="/admin/learning"
            onLeave={() => setBroadcastingClass(null)}
          />
        </div>
      )}
    </div>
  );
}

function ModuleCard({
  module,
  materials,
  send,
  onBroadcast,
}: {
  module: Module;
  materials: Material[];
  send: (method: string, data?: object, query?: string) => Promise<boolean>;
  onBroadcast: (item: { id: string; title: string }) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(module.title);
  const [description, setDescription] = useState(module.description ?? "");

  return (
    <article style={card}>
      <div style={row}>
        <div>
          {editing ? (
            <>
              <input value={title} onChange={(e) => setTitle(e.target.value)} style={input} />
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} style={input} />
            </>
          ) : (
            <>
              <p style={eyebrow}>Module {module.position + 1}</p>
              <h3 style={{ margin: "0.2rem 0" }}>{module.title}</h3>
              {module.description && <p style={muted}>{module.description}</p>}
            </>
          )}
        </div>
        <div style={actions}>
          {editing ? (
            <button
              style={button}
              onClick={async () => {
                if (await send("PATCH", { type: "module", id: module.id, title, description })) setEditing(false);
              }}
            >
              Save
            </button>
          ) : (
            <button style={outline} onClick={() => setEditing(true)}>
              Edit
            </button>
          )}
          <button
            style={danger}
            onClick={() => {
              if (confirm(`Delete module "${module.title}" and its classes?`))
                void send("DELETE", undefined, `?type=module&id=${module.id}`);
            }}
          >
            Delete
          </button>
        </div>
      </div>
      {module.classes.map((item) => (
        <ClassCard key={item.id} item={item} materials={materials} send={send} onBroadcast={onBroadcast} />
      ))}
    </article>
  );
}

function ClassCard({
  item,
  materials,
  send,
  onBroadcast,
}: {
  item: ClassItem;
  materials: Material[];
  send: (method: string, data?: object, query?: string) => Promise<boolean>;
  onBroadcast: (item: { id: string; title: string }) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    title: item.title,
    instructor: item.instructor ?? "",
    description: item.description ?? "",
    startsAt: local(item.startsAt),
    endsAt: local(item.endsAt),
    status: item.status,
    activeMaterialId: item.activeMaterialId ?? "",
  });

  return (
    <article style={classCard}>
      {editing ? (
        <>
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} style={input} />
          <input
            value={form.instructor}
            onChange={(e) => setForm({ ...form, instructor: e.target.value })}
            placeholder="Instructor"
            style={input}
          />
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            style={input}
          />
          <input
            type="datetime-local"
            value={form.startsAt}
            onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
            style={input}
          />
          <input
            type="datetime-local"
            value={form.endsAt}
            onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
            style={input}
          />
          <select
            value={form.activeMaterialId}
            onChange={(e) => setForm({ ...form, activeMaterialId: e.target.value })}
            style={input}
          >
            <option value="">None / Auto-select first</option>
            {materials.map((m) => (
              <option key={m.id} value={m.id}>
                {m.title}
              </option>
            ))}
          </select>
          <select
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value })}
            style={input}
          >
            {statuses.map((status) => (
              <option key={status}>{status}</option>
            ))}
          </select>
          <button
            style={button}
            onClick={async () => {
              if (await send("PATCH", { type: "class", id: item.id, ...form })) setEditing(false);
            }}
          >
            Save class
          </button>
        </>
      ) : (
        <div style={row}>
          <div>
            <p style={eyebrow}>
              {item.status}
              {item.isGeneral && <span style={{ marginLeft: "0.5rem", background: "#98661B", color: "#fff", borderRadius: 99, padding: "0.1rem 0.5rem", fontSize: "0.68rem", fontWeight: 700 }}>🌐 GENERAL</span>}
            </p>
            <strong>{item.title}</strong>
            <p style={muted}>
              {item.instructor ? `Instructor: ${item.instructor}` : "Instructor not assigned"}
              {item.startsAt ? ` · ${new Date(item.startsAt).toLocaleString()}` : ""}
              {item.activeMaterialId
                ? ` · Active Deck: ${materials.find((m) => m.id === item.activeMaterialId)?.title ?? "Assigned"}`
                : ""}
            </p>
          </div>
          <div style={actions}>
            {item.isGeneral ? (
              // General meeting — admin joins directly (no presentation stage needed)
              <button
                style={liveButton}
                onClick={async () => {
                  await send("PATCH", { type: "class", id: item.id, title: item.title, status: "LIVE" });
                  window.open(`/admin/general/${item.id}`, "_blank");
                }}
              >
                {item.status === "LIVE" ? "🌐 Join Meeting" : "🌐 Start Meeting"}
              </button>
            ) : (
              <button
                style={liveButton}
                onClick={async () => {
                  await send("PATCH", { type: "class", id: item.id, title: item.title, status: "LIVE" });
                  onBroadcast({ id: item.id, title: item.title });
                }}
              >
                {item.status === "LIVE" ? "Studio (LIVE)" : "Start Broadcast"}
              </button>
            )}
            <button style={outline} onClick={() => setEditing(true)}>
              Edit
            </button>
            <button
              style={danger}
              onClick={() => {
                if (confirm(`Delete "${item.title}"?`)) void send("DELETE", undefined, `?type=class&id=${item.id}`);
              }}
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

function local(value: string | null) {
  return value ? new Date(value).toISOString().slice(0, 16) : "";
}

const eyebrow = { color: "#98661B", fontWeight: 700, fontSize: ".82rem", margin: 0, textTransform: "uppercase" } as const;
const muted = { color: "#555", fontSize: ".88rem" } as const;
const noticeSuccess = { color: "#166534", background: "#f0fdf4", border: "1px solid #bbf7d0", padding: "0.75rem 1rem", borderRadius: 6, fontWeight: 700 } as const;
const noticeError = { color: "#991b1b", background: "#fef2f2", border: "1px solid #fecaca", padding: "0.75rem 1rem", borderRadius: 6, fontWeight: 700 } as const;
const emptyCard = { background: "#fff", border: "1px dashed #98661B", borderRadius: 8, padding: "1.5rem", margin: "1.5rem 0" } as const;
const grid = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: "1rem", margin: "1.25rem 0 2rem" } as const;
const card = { background: "#fff", border: "1px solid #e2d8cd", borderRadius: 8, padding: "1.25rem", marginBottom: ".8rem" } as const;
const input = { display: "block", boxSizing: "border-box", width: "100%", padding: ".65rem .7rem", border: "1px solid #ccc", borderRadius: 6, margin: ".55rem 0", font: "inherit" } as const;
const button = { background: "#5c1d1d", color: "#fff", border: 0, borderRadius: 6, padding: ".6rem 1rem", cursor: "pointer", fontWeight: 700, textDecoration: "none", display: "inline-block" } as const;
const outline = { ...button, background: "transparent", color: "#5c1d1d", border: "1px solid #98661B" } as const;
const danger = { ...outline, color: "#dc2626", borderColor: "#dc2626" } as const;
const row = { display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "flex-start", flexWrap: "wrap" } as const;
const actions = { display: "flex", gap: ".45rem", flexWrap: "wrap" } as const;
const list = { display: "grid", gap: ".7rem" } as const;
const classCard = { borderTop: "1px solid #eee", padding: ".85rem 0", marginTop: ".8rem" } as const;
const empty = { ...card, color: "#666" } as const;
const label = { display: "block", fontSize: ".82rem", color: "#444", fontWeight: 600 } as const;
const liveButton = { ...button, background: "#98661B", fontWeight: 700 } as const;
