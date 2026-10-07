"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { submitInquiryAction, type InquiryResult } from "@/lib/discover-actions";
import { AREAS, CONSENT_CONTACT, CONSENT_PATHWAY, GRADES, RELATIONSHIPS, SPORTS, type InquiryErrors } from "@/lib/discover";

type Values = Record<string, string>;

/** One labelled input, with its error under it. */
function Field({
  name, label, optional, values, errors, onChange, type = "text", autoComplete, inputMode,
}: {
  name: string; label: string; optional?: boolean; values: Values; errors: InquiryErrors;
  onChange: (name: string, value: string) => void; type?: string; autoComplete?: string;
  inputMode?: "text" | "email" | "tel" | "numeric";
}) {
  const err = errors[name as keyof InquiryErrors];
  return (
    <div className="dsc-field">
      <label htmlFor={`dsc-${name}`}>
        {label} {optional && <span className="opt">(optional)</span>}
      </label>
      <input
        id={`dsc-${name}`}
        name={name}
        className="dsc-input"
        type={type}
        autoComplete={autoComplete}
        inputMode={inputMode}
        value={values[name] ?? ""}
        onChange={(e) => onChange(name, e.target.value)}
        aria-invalid={err ? true : undefined}
        aria-describedby={err ? `dsc-${name}-err` : undefined}
      />
      {err && <span id={`dsc-${name}-err`} className="dsc-err">{err}</span>}
    </div>
  );
}

export function InquiryForm({
  years, source, referral,
}: {
  years: number[];
  source: "website" | "direct";
  referral: string | null;
}) {
  const [values, setValues] = useState<Values>({ entry_year: String(years[0]), child_grade: "9", country: "United States" });
  const [interests, setInterests] = useState<Set<string>>(new Set());
  const [consentContact, setConsentContact] = useState(false);
  const [consentPathway, setConsentPathway] = useState(true);
  const [errors, setErrors] = useState<InquiryErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [done, setDone] = useState<Extract<InquiryResult, { ok: true }> | null>(null);
  const [pending, start] = useTransition();
  const startedAt = useRef(0);
  useEffect(() => {
    startedAt.current = Date.now();
  }, []);

  const set = (name: string, value: string) => setValues((v) => ({ ...v, [name]: value }));
  const toggle = (label: string) =>
    setInterests((s) => {
      const next = new Set(s);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });

  function send(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const honeypot = (e.currentTarget.elements.namedItem("website") as HTMLInputElement | null)?.value ?? "";
    setMessage(null);
    start(async () => {
      const res = await submitInquiryAction({
        ...values,
        interests: [...interests],
        consent_contact: consentContact,
        consent_pathway: consentPathway,
        source,
        ref: referral ?? "",
        website: honeypot,
        started_at: startedAt.current,
      });
      if (res.ok) {
        setDone(res);
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        setErrors(res.errors ?? {});
        setMessage(res.error);
      }
    });
  }

  if (done) {
    return (
      <section className="dsc-thanks is-sent" aria-live="polite">
        <p className="dsc-eyebrow" style={{ marginTop: 0 }}>Inquiry received</p>
        <h2>Thank you, {done.parentFirstName}. We can&apos;t wait to meet {done.childFirstName}.</h2>
        {done.oneThing && (
          <blockquote className="dsc-quote">
            {done.oneThing}
            <cite>What you told us about {done.childFirstName}</cite>
          </blockquote>
        )}
        <ol className="dsc-next">
          <li><b>1</b><span>Someone from our admissions team reads every inquiry, and will be in touch by email.</span></li>
          {consentPathway && (
            <li><b>2</b><span>We&apos;ll prepare a Formation Pathway for {done.childFirstName}: where they could grow here, built from what you shared. A member of our team reviews it before it reaches you.</span></li>
          )}
          <li>
            <b>{consentPathway ? 3 : 2}</b>
            <span>
              In the meantime, come and see us.{" "}
              <a className="dsc-link" href="https://www.pacificachristian.org/admissions/visit-pacifica" target="_top">Visit Pacifica</a>.
            </span>
          </li>
        </ol>
      </section>
    );
  }

  const err = (name: keyof InquiryErrors) =>
    errors[name] ? <span id={`dsc-${name}-err`} className="dsc-err">{errors[name]}</span> : null;

  return (
    <form className="dsc-form" onSubmit={send} noValidate>
      <fieldset className="dsc-part">
        <legend><span className="n">1</span><span className="t">Your child</span></legend>
        <div className="dsc-row">
          <Field name="child_first_name" label="First name" autoComplete="off" values={values} errors={errors} onChange={set} />
          <Field name="child_last_name" label="Last name" autoComplete="off" values={values} errors={errors} onChange={set} />
        </div>
        <div className="dsc-row">
          <div className="dsc-field">
            <label htmlFor="dsc-child_grade">Starting in grade</label>
            <select id="dsc-child_grade" className="dsc-select" value={values.child_grade} onChange={(e) => set("child_grade", e.target.value)}>
              {GRADES.map((g) => <option key={g} value={g}>{g}th</option>)}
            </select>
            {err("child_grade")}
          </div>
          <div className="dsc-field">
            <label htmlFor="dsc-entry_year">In the fall of</label>
            <select id="dsc-entry_year" className="dsc-select" value={values.entry_year} onChange={(e) => set("entry_year", e.target.value)}>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            {err("entry_year")}
          </div>
        </div>
        <Field name="current_school" label="Current school" optional autoComplete="off" values={values} errors={errors} onChange={set} />
      </fieldset>

      <fieldset className="dsc-part">
        <legend><span className="n">2</span><span className="t">One thing</span></legend>
        <p className="dsc-hint">What&apos;s one thing about your child that a brochure would miss? A project, a habit, a question they keep asking. A sentence is plenty.</p>
        <div className="dsc-field">
          <label htmlFor="dsc-one_thing" className="dsc-label">In your words <span className="opt">(optional)</span></label>
          <textarea
            id="dsc-one_thing"
            className="dsc-textarea"
            maxLength={1000}
            value={values.one_thing ?? ""}
            onChange={(e) => set("one_thing", e.target.value)}
            aria-invalid={errors.one_thing ? true : undefined}
          />
          {err("one_thing")}
        </div>
        <p className="dsc-chip-group" id="dsc-areas">Drawn to</p>
        <div className="dsc-chips" role="group" aria-labelledby="dsc-areas">
          {AREAS.map((a) => (
            <button key={a} type="button" className="dsc-chip" aria-pressed={interests.has(a)} onClick={() => toggle(a)}>{a}</button>
          ))}
        </div>
        <p className="dsc-chip-group" id="dsc-sports">Plays</p>
        <div className="dsc-chips" role="group" aria-labelledby="dsc-sports">
          {SPORTS.map((s) => (
            <button key={s} type="button" className="dsc-chip" aria-pressed={interests.has(s)} onClick={() => toggle(s)}>{s}</button>
          ))}
        </div>
      </fieldset>

      <fieldset className="dsc-part">
        <legend><span className="n">3</span><span className="t">How to reach you</span></legend>
        <div className="dsc-row">
          <Field name="parent_first_name" label="Your first name" autoComplete="given-name" values={values} errors={errors} onChange={set} />
          <Field name="parent_last_name" label="Your last name" autoComplete="family-name" values={values} errors={errors} onChange={set} />
        </div>
        <div className="dsc-row">
          <div className="dsc-field">
            <label htmlFor="dsc-parent_relationship">You are their</label>
            <select
              id="dsc-parent_relationship"
              className="dsc-select"
              value={values.parent_relationship ?? ""}
              onChange={(e) => set("parent_relationship", e.target.value)}
              aria-invalid={errors.parent_relationship ? true : undefined}
            >
              <option value="" disabled>Choose…</option>
              {RELATIONSHIPS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            {err("parent_relationship")}
          </div>
          <Field name="parent_phone" label="Phone" optional type="tel" inputMode="tel" autoComplete="tel" values={values} errors={errors} onChange={set} />
        </div>
        <Field name="parent_email" label="Email" type="email" inputMode="email" autoComplete="email" values={values} errors={errors} onChange={set} />
        <Field name="address_1" label="Street address" autoComplete="address-line1" values={values} errors={errors} onChange={set} />
        <Field name="address_2" label="Apartment or suite" optional autoComplete="address-line2" values={values} errors={errors} onChange={set} />
        <div className="dsc-row three">
          <Field name="city" label="City" autoComplete="address-level2" values={values} errors={errors} onChange={set} />
          <Field name="state" label="State" autoComplete="address-level1" values={values} errors={errors} onChange={set} />
          <Field name="zip" label="ZIP" inputMode="numeric" autoComplete="postal-code" values={values} errors={errors} onChange={set} />
        </div>

        <label className="dsc-consent">
          <input type="checkbox" checked={consentContact} onChange={(e) => setConsentContact(e.target.checked)} aria-invalid={errors.consent_contact ? true : undefined} />
          <span>{CONSENT_CONTACT}</span>
        </label>
        {err("consent_contact")}
        <label className="dsc-consent">
          <input type="checkbox" checked={consentPathway} onChange={(e) => setConsentPathway(e.target.checked)} />
          <span>{CONSENT_PATHWAY}</span>
        </label>
      </fieldset>

      <div className="dsc-honeypot" aria-hidden="true">
        <label htmlFor="dsc-website">Leave this empty</label>
        <input id="dsc-website" name="website" tabIndex={-1} autoComplete="off" />
      </div>

      <button className="dsc-submit" type="submit" disabled={pending}>
        {pending ? "Sending…" : "Send to Pacifica"}
      </button>
      {message && <p className="dsc-alert" role="alert">{message}</p>}
      <p className="dsc-fine">What you send goes to Pacifica&apos;s admissions team, who keep it with the rest of your admissions file.</p>
    </form>
  );
}
