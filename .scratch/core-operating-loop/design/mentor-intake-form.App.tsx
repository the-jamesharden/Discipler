// Source of the Figma Make project "Mentor Intake Form", saved verbatim on 2026-09-01.
// https://www.figma.com/make/kbj32GhzyH3rN6SBk8ThAQ/Mentor-Intake-Form
// This is a design input for ticket 31 and is not compiled by the app.
// Its state model, option lists and copy are the prototype's, not the product's:
// ticket 31 lists every place they differ from the backend.

import { useState } from "react";

const PRIMARY = "#2d5016";
const BG = "#f5f1eb";
const SURFACE = "#fff";
const TEXT = "#2d2d2d";
const TEXT_LIGHT = "#7a7a7a";
const BORDER = "#e8dfd5";
const SHADOW = "rgba(45,80,22,0.08)";

const AGE_BANDS = [
  { value: "18–24", sub: "Young adult" },
  { value: "25–34", sub: "Establishing" },
  { value: "35–44", sub: "Growing" },
  { value: "45–54", sub: "Maturing" },
  { value: "55–64", sub: "Senior" },
  { value: "65+",   sub: "Elder" },
];

const GOALS = [
  { value: "prayer",     label: "Prayer"                  },
  { value: "scripture",  label: "Scripture study"         },
  { value: "career",     label: "Career & calling"        },
  { value: "family",     label: "Family & relationships"  },
  { value: "recovery",   label: "Recovery & healing"      },
  { value: "leadership", label: "Leadership & service"    },
  { value: "faith",      label: "Deeper faith foundation" },
  { value: "community",  label: "Community & belonging"   },
];

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const TIMES: { label: string; range: string }[] = [
  { label: "Early AM",  range: "6–8am"     },
  { label: "Morning",   range: "8–11am"    },
  { label: "Midday",    range: "11am–1pm"  },
  { label: "Afternoon", range: "1–5pm"     },
  { label: "Evening",   range: "5–8pm"     },
];

type Role = "mentor" | "mentee";
type Gender = "M" | "F" | "other";

interface FormData {
  role: Role | null;
  ageBand: string;
  gender: Gender | null;
  firstTime: boolean | null;
  availability: number[];
  goals: string[];
  goalNote: string;
}

const TOTAL_STEPS = 5;

export default function App() {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormData>({
    role: null,
    ageBand: "",
    gender: null,
    firstTime: null,
    availability: [],
    goals: [],
    goalNote: "",
  });

  const canAdvance = (): boolean => {
    if (step === 0) return form.role !== null;
    if (step === 1) return form.ageBand !== "" && form.gender !== null;
    if (step === 2) return form.firstTime !== null;
    if (step === 3) return form.availability.length > 0;
    if (step === 4) return form.goals.length > 0;
    return true;
  };

  const toggleSlot = (idx: number) => {
    setForm(f => ({
      ...f,
      availability: f.availability.includes(idx)
        ? f.availability.filter(s => s !== idx)
        : [...f.availability, idx],
    }));
  };

  const toggleGoal = (val: string) => {
    setForm(f => ({
      ...f,
      goals: f.goals.includes(val) ? f.goals.filter(g => g !== val) : [...f.goals, val],
    }));
  };

  const slotDays = () =>
    new Set(form.availability.map(s => Math.floor(s / TIMES.length))).size;

  const progressPct = step < TOTAL_STEPS ? (step / TOTAL_STEPS) * 100 : 100;

  const goalsLabel = form.goals
    .map(v => GOALS.find(g => g.value === v)?.label ?? "")
    .filter(Boolean)
    .join(", ");

  return (
    <div style={{ minHeight: "100%", background: BG, fontFamily: "'DM Sans', sans-serif", color: TEXT }}>
      {step < TOTAL_STEPS ? (
        <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "2rem 1.5rem" }}>
          <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "2.5rem 2rem", width: "100%", maxWidth: 520, boxShadow: `0 8px 32px ${SHADOW}` }}>

            {/* Wordmark + subtitle */}
            <div style={{ marginBottom: "1.75rem" }}>
              <h1 style={{ fontFamily: "'Crimson Pro', serif", fontSize: "2rem", fontWeight: 600, color: PRIMARY, lineHeight: 1.1, marginBottom: "0.25rem" }}>
                Discipler
              </h1>
              <p style={{ color: TEXT_LIGHT, fontSize: "0.88rem" }}>
                {step === 0 && "Welcome — let's get you connected."}
                {step === 1 && "Tell us a little about yourself."}
                {step === 2 && "A bit about your experience."}
                {step === 3 && "When are you generally available to meet?"}
                {step === 4 && "What are you hoping to grow in?"}
              </p>
            </div>

            {/* Progress bar */}
            <div style={{ marginBottom: "1.75rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.4rem" }}>
                <span style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: TEXT_LIGHT }}>
                  Step {step + 1} of {TOTAL_STEPS}
                </span>
                <span style={{ fontSize: "0.72rem", color: TEXT_LIGHT }}>{Math.round(progressPct)}%</span>
              </div>
              <div style={{ height: 4, background: BORDER, borderRadius: 4, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${progressPct}%`, background: PRIMARY, borderRadius: 4, transition: "width 0.35s ease" }} />
              </div>
            </div>

            {/* ── Step 0: Role ── */}
            {step === 0 && (
              <div>
                <p style={{ fontFamily: "'Crimson Pro', serif", fontSize: "1.25rem", fontWeight: 600, color: PRIMARY, marginBottom: "1rem" }}>
                  I am joining as a…
                </p>
                {(["mentor", "mentee"] as Role[]).map(r => (
                  <button
                    key={r}
                    onClick={() => setForm(f => ({ ...f, role: r }))}
                    style={{
                      width: "100%", textAlign: "left", padding: "1.1rem 1.25rem",
                      background: form.role === r ? "rgba(45,80,22,0.05)" : SURFACE,
                      border: `2px solid ${form.role === r ? PRIMARY : BORDER}`,
                      borderRadius: 7, cursor: "pointer", marginBottom: "0.75rem",
                      transition: "all 0.2s ease", fontFamily: "inherit",
                    }}
                  >
                    <div style={{ fontWeight: 700, color: PRIMARY, fontSize: "1rem" }}>
                      {r === "mentor" ? "Mentor" : "Mentee"}
                    </div>
                    <div style={{ color: TEXT_LIGHT, fontSize: "0.87rem", marginTop: "0.15rem" }}>
                      {r === "mentor"
                        ? "I am ready to walk alongside and invest in someone else."
                        : "I am looking for someone to help guide me in my faith."}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* ── Step 1: Age + Gender ── */}
            {step === 1 && (
              <div>
                <div style={{ marginBottom: "1.25rem" }}>
                  <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, marginBottom: "0.5rem", color: TEXT }}>
                    Age range
                  </label>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.5rem" }}>
                    {AGE_BANDS.map(band => (
                      <button
                        key={band.value}
                        onClick={() => setForm(f => ({ ...f, ageBand: band.value }))}
                        style={{
                          padding: "0.65rem 0.5rem", textAlign: "center",
                          background: form.ageBand === band.value ? "rgba(45,80,22,0.07)" : SURFACE,
                          border: `2px solid ${form.ageBand === band.value ? PRIMARY : BORDER}`,
                          borderRadius: 6, cursor: "pointer", fontFamily: "inherit",
                          transition: "all 0.18s ease",
                        }}
                      >
                        <div style={{ fontWeight: 700, color: PRIMARY, fontSize: "0.95rem" }}>{band.value}</div>
                        <div style={{ color: TEXT_LIGHT, fontSize: "0.72rem", marginTop: "0.1rem" }}>{band.sub}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, marginBottom: "0.5rem", color: TEXT }}>
                    Gender
                  </label>
                  <div style={{ display: "flex", gap: "0.6rem" }}>
                    {(
                      [
                        { v: "M" as Gender, label: "Male" },
                        { v: "F" as Gender, label: "Female" },
                        { v: "other" as Gender, label: "Other / prefer not to say" },
                      ]
                    ).map(opt => (
                      <button
                        key={opt.v}
                        onClick={() => setForm(f => ({ ...f, gender: opt.v }))}
                        style={{
                          flex: 1, padding: "0.65rem 0.5rem", textAlign: "center",
                          background: form.gender === opt.v ? "rgba(45,80,22,0.07)" : SURFACE,
                          border: `2px solid ${form.gender === opt.v ? PRIMARY : BORDER}`,
                          borderRadius: 6, cursor: "pointer", fontFamily: "inherit",
                          fontSize: "0.88rem", fontWeight: form.gender === opt.v ? 700 : 400,
                          color: form.gender === opt.v ? PRIMARY : TEXT,
                          transition: "all 0.18s ease",
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── Step 2: First time ── */}
            {step === 2 && (
              <div>
                <p style={{ fontFamily: "'Crimson Pro', serif", fontSize: "1.25rem", fontWeight: 600, color: PRIMARY, marginBottom: "0.35rem" }}>
                  {form.role === "mentor"
                    ? "Have you mentored someone before?"
                    : "Have you had a mentor before?"}
                </p>
                <p style={{ color: TEXT_LIGHT, fontSize: "0.87rem", marginBottom: "1.25rem" }}>
                  This helps us match you thoughtfully.
                </p>
                {(
                  [
                    { isFirst: false, label: "Yes, I have done this before", sub: "I have experience in this role." },
                    { isFirst: true,  label: "No, this is my first time",    sub: "I am new to this — and that is perfectly fine." },
                  ]
                ).map(opt => (
                  <button
                    key={String(opt.isFirst)}
                    onClick={() => setForm(f => ({ ...f, firstTime: opt.isFirst }))}
                    style={{
                      width: "100%", textAlign: "left", padding: "1.1rem 1.25rem",
                      background: form.firstTime === opt.isFirst ? "rgba(45,80,22,0.05)" : SURFACE,
                      border: `2px solid ${form.firstTime === opt.isFirst ? PRIMARY : BORDER}`,
                      borderRadius: 7, cursor: "pointer", marginBottom: "0.75rem",
                      transition: "all 0.2s ease", fontFamily: "inherit",
                    }}
                  >
                    <div style={{ fontWeight: 700, color: PRIMARY, fontSize: "1rem" }}>{opt.label}</div>
                    <div style={{ color: TEXT_LIGHT, fontSize: "0.85rem", marginTop: "0.15rem" }}>{opt.sub}</div>
                  </button>
                ))}
              </div>
            )}

            {/* ── Step 3: Availability grid ── */}
            {step === 3 && (
              <div>
                <p style={{ fontFamily: "'Crimson Pro', serif", fontSize: "1.1rem", fontWeight: 600, color: PRIMARY, marginBottom: "0.35rem" }}>
                  Select every block when you could meet.
                </p>
                <div style={{ display: "flex", gap: "1.25rem", marginBottom: "0.9rem", flexWrap: "wrap" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.78rem", color: TEXT_LIGHT }}>
                    <span style={{ width: 14, height: 14, borderRadius: 3, background: "rgba(45,80,22,0.06)", display: "inline-block", border: `1px solid ${BORDER}` }} />
                    Not available
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.78rem", color: TEXT_LIGHT }}>
                    <span style={{ width: 14, height: 14, borderRadius: 3, background: "rgba(127,175,140,0.65)", display: "inline-block", border: "1.5px solid #4a7c2e" }} />
                    Available
                  </span>
                </div>

                <div style={{ overflowX: "auto" }}>
                  <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "0.72rem" }}>
                    <thead>
                      <tr>
                        <th style={{ padding: "0.25rem 0.5rem 0.25rem 0", width: 44 }} />
                        {TIMES.map(t => (
                          <th
                            key={t.label}
                            style={{ padding: "0.2rem 0.1rem 0.5rem", color: TEXT_LIGHT, fontWeight: 700, textAlign: "center", minWidth: 58 }}
                          >
                            <div>{t.label}</div>
                            <div style={{ fontWeight: 400, fontSize: "0.64rem", opacity: 0.75, marginTop: "0.1rem" }}>{t.range}</div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {DAYS.map((day, di) => (
                        <tr key={day}>
                          <td style={{ paddingRight: "0.6rem", color: TEXT, fontWeight: 700, whiteSpace: "nowrap", fontSize: "0.78rem" }}>
                            {day}
                          </td>
                          {TIMES.map((t, ti) => {
                            const idx = di * TIMES.length + ti;
                            const selected = form.availability.includes(idx);
                            return (
                              <td key={t.label} style={{ padding: 3 }}>
                                <button
                                  onClick={() => toggleSlot(idx)}
                                  title={`${day} ${t.label} (${t.range})`}
                                  style={{
                                    display: "block", width: "100%", height: 30, minWidth: 46,
                                    background: selected ? "rgba(127,175,140,0.65)" : "rgba(45,80,22,0.06)",
                                    border: selected ? "1.5px solid #4a7c2e" : `1px solid ${BORDER}`,
                                    borderRadius: 4, cursor: "pointer",
                                    transition: "all 0.15s ease",
                                  }}
                                />
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <p style={{ fontSize: "0.78rem", color: TEXT_LIGHT, marginTop: "0.85rem" }}>
                  {form.availability.length === 0
                    ? "No blocks selected yet."
                    : `${form.availability.length} block${form.availability.length === 1 ? "" : "s"} selected across ${slotDays()} day${slotDays() === 1 ? "" : "s"}.`}
                </p>
              </div>
            )}

            {/* ── Step 4: Goals ── */}
            {step === 4 && (
              <div>
                <p style={{ fontFamily: "'Crimson Pro', serif", fontSize: "1.1rem", fontWeight: 600, color: PRIMARY, marginBottom: "0.35rem" }}>
                  What are you looking to grow in?{" "}
                  <span style={{ fontSize: "0.85rem", fontWeight: 400, color: TEXT_LIGHT }}>
                    (choose all that apply)
                  </span>
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", marginBottom: "1.1rem" }}>
                  {GOALS.map(g => {
                    const selected = form.goals.includes(g.value);
                    return (
                      <button
                        key={g.value}
                        onClick={() => toggleGoal(g.value)}
                        style={{
                          display: "flex", alignItems: "center", gap: "0.6rem",
                          padding: "0.75rem 0.9rem", textAlign: "left",
                          background: selected ? "rgba(45,80,22,0.07)" : SURFACE,
                          border: `2px solid ${selected ? PRIMARY : BORDER}`,
                          borderRadius: 7, cursor: "pointer", fontFamily: "inherit",
                          transition: "all 0.18s ease",
                        }}
                      >
                        <span style={{ fontSize: "0.88rem", fontWeight: selected ? 700 : 400, color: selected ? PRIMARY : TEXT, lineHeight: 1.3 }}>
                          {g.label}
                        </span>
                      </button>
                    );
                  })}
                </div>

              </div>
            )}

            {/* Navigation */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "1.75rem", gap: "0.75rem" }}>
              {step > 0 ? (
                <button
                  onClick={() => setStep(s => s - 1)}
                  style={{
                    padding: "0.6rem 1.1rem", background: "transparent",
                    border: `1px solid ${BORDER}`, borderRadius: 6,
                    cursor: "pointer", fontFamily: "inherit", fontSize: "0.9rem", color: TEXT,
                  }}
                >
                  Back
                </button>
              ) : (
                <span />
              )}
              <button
                onClick={() => { if (canAdvance()) setStep(s => s + 1); }}
                disabled={!canAdvance()}
                style={{
                  padding: "0.65rem 1.5rem",
                  background: canAdvance() ? PRIMARY : "rgba(45,80,22,0.3)",
                  color: "#fff", border: "none", borderRadius: 6,
                  cursor: canAdvance() ? "pointer" : "not-allowed",
                  fontFamily: "inherit", fontSize: "0.92rem", fontWeight: 700,
                  transition: "background 0.2s ease",
                }}
              >
                {step === TOTAL_STEPS - 1 ? "Submit" : "Continue"}
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* ── Confirmation ── */
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem 1.5rem" }}>
          <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "2.75rem 2rem", width: "100%", maxWidth: 520, boxShadow: `0 8px 32px ${SHADOW}`, textAlign: "center" }}>
            <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(45,80,22,0.1)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 1.25rem", fontSize: "1.6rem" }}>
              ✓
            </div>
            <h2 style={{ fontFamily: "'Crimson Pro', serif", fontSize: "1.85rem", fontWeight: 600, color: PRIMARY, marginBottom: "0.5rem" }}>
              You're on the list.
            </h2>
            <p style={{ color: TEXT_LIGHT, fontSize: "0.92rem", lineHeight: 1.6, marginBottom: "1.75rem" }}>
              Thank you for completing your intake. Our team will review your availability and goals and reach out when we find a good match. You'll hear from us over text.
            </p>

            <div style={{ background: "rgba(45,80,22,0.04)", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "1.1rem 1.25rem", textAlign: "left" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.55rem", fontSize: "0.88rem" }}>
                <SummaryRow label="Role"         value={form.role === "mentor" ? "Mentor" : "Mentee"} />
                <SummaryRow label="Age range"    value={form.ageBand} />
                <SummaryRow label="Gender"       value={form.gender === "M" ? "Male" : form.gender === "F" ? "Female" : "Other / prefer not to say"} />
                <SummaryRow label="Experience"   value={form.firstTime ? "First time" : "Has experience in this role"} />
                <SummaryRow label="Availability" value={`${form.availability.length} block${form.availability.length === 1 ? "" : "s"} across ${slotDays()} day${slotDays() === 1 ? "" : "s"}`} />
                <SummaryRow label="Goals"        value={goalsLabel} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
      <span style={{ color: TEXT_LIGHT, flexShrink: 0 }}>{label}</span>
      <span style={{ fontWeight: 700, color: TEXT, textAlign: "right" }}>{value}</span>
    </div>
  );
}
