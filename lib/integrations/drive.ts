/**
 * Google Drive integration — read-only. Lets a teacher point at a doc they
 * already keep (a rubric, skill notes) so it can inform skill snapshots
 * alongside Canvas data, without re-typing anything.
 *
 * MOCK_INTEGRATIONS is on by default: teachers "pick" from a small set of
 * realistic seeded rubric docs so the exec demo never depends on live Drive
 * credentials. A real GOOGLE_DRIVE_ACCESS_TOKEN switches to LiveDriveSource,
 * which calls the Drive v3 REST API directly (no SDK dependency) against a
 * teacher-designated folder, read-only.
 */

export interface DriveDoc {
  id: string;
  name: string;
  content: string;
}

export interface DriveSource {
  listAvailableDocs(): Promise<DriveDoc[]>;
  fetchDoc(fileId: string): Promise<DriveDoc>;
}

export const MOCK_DOCS: DriveDoc[] = [
  {
    id: "mock-physics-rubric",
    name: "Honors Physics — Lab Report Rubric.gdoc",
    content: `Honors Physics Lab Report Rubric (Mr. Sato)

1. Hypothesis & Reasoning — states a falsifiable hypothesis and explains the
   physical reasoning behind it before collecting data.
2. Experimental Design — controls variables deliberately; explains why each
   control matters, not just that one exists.
3. Data & Error Analysis — reports uncertainty honestly, including sources of
   error, rather than hiding a messy result behind a suspiciously clean graph.
4. Revision Under Feedback — when a hypothesis turns out wrong, states so
   plainly and re-derives rather than quietly moving on.
5. Collaboration — helps a lab partner debug their setup or reasoning without
   just handing over the answer.`,
  },
  {
    id: "mock-lit-notes",
    name: "American Literature — Discussion & Essay Notes.gdoc",
    content: `American Literature — What I'm Actually Looking For (Ms. Alvarez)

Close reading: notices something in the text a first read would miss, and
can point to the exact line that shows it.
Argument under pressure: when another student pushes back in discussion,
sharpens the claim instead of abandoning it.
Voice: essays sound like a specific person thinking, not a five-paragraph
template.
Historical context: connects a text to the moment it was written without
flattening the text into only that moment.
Generosity as a reader: in peer review, finds the strongest version of a
classmate's argument before critiquing it.`,
  },
];

export class MockDriveSource implements DriveSource {
  async listAvailableDocs(): Promise<DriveDoc[]> {
    return MOCK_DOCS;
  }
  async fetchDoc(fileId: string): Promise<DriveDoc> {
    const doc = MOCK_DOCS.find((d) => d.id === fileId);
    if (!doc) throw new Error(`Mock Drive doc not found: ${fileId}`);
    return doc;
  }
}

/** Real, read-only Drive v3 client — direct REST calls, no googleapis dependency. */
export class LiveDriveSource implements DriveSource {
  constructor(
    private accessToken: string,
    private folderId: string
  ) {}

  private async request(path: string, params: Record<string, string> = {}) {
    const url = new URL(`https://www.googleapis.com/drive/v3${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });
    if (!res.ok) {
      throw new Error(`Google Drive ${res.status} on ${path}: ${await res.text()}`);
    }
    return res;
  }

  async listAvailableDocs(): Promise<DriveDoc[]> {
    const res = await this.request("/files", {
      q: `'${this.folderId}' in parents and mimeType = 'application/vnd.google-apps.document' and trashed = false`,
      fields: "files(id,name)",
    });
    const { files } = (await res.json()) as { files: { id: string; name: string }[] };
    return files.map((f) => ({ id: f.id, name: f.name, content: "" }));
  }

  async fetchDoc(fileId: string): Promise<DriveDoc> {
    const meta = await this.request(`/files/${fileId}`, { fields: "id,name" }).then(
      (r) => r.json() as Promise<{ id: string; name: string }>
    );
    const exported = await this.request(`/files/${fileId}/export`, {
      mimeType: "text/plain",
    });
    const content = await exported.text();
    return { id: meta.id, name: meta.name, content };
  }
}

export function getDriveSource(): DriveSource {
  const mockDisabled = process.env.MOCK_INTEGRATIONS === "false";
  const accessToken = process.env.GOOGLE_DRIVE_ACCESS_TOKEN;
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (mockDisabled && accessToken && folderId) {
    return new LiveDriveSource(accessToken, folderId);
  }
  return new MockDriveSource();
}
