# Frontend Module Map

Status: **Living index.** Update as each module's design doc is written.
This is the table of contents for `docs/design/` — one design doc per
backend module, in the same build order as the backend stage docs,
covering structure, every state, and every error for that module's
actual screens. Not every module maps to exactly one screen; this table
says which does what.

| # | Backend module | Screens / flows this needs | Public (no login)? | Design doc |
|---|---|---|---|---|
| 1 | Auth & Email Setup | Sign up · Log in · Verify email · Set password (forced, staff first login) | These *are* the pre-login screens | `01-auth.md` |
| 2 | Roles & Membership | Admin: create staff account · Judge invitation accept/decline | No — admin-only; judge invite requires logging into the provided account first | `02-roles-and-membership.md` |
| 3 | Event Management | Events list (done) · Event detail (public) · Create/edit event (organizer) | **List and detail: yes.** Create/edit: no | `03-event-management.md` |
| 4 | Team Management | Create/join team · Team panel (roster, kick, regenerate link) | No — requires registration for that event | `04-team-management.md` |
| 5 | Submission Management | Submission form (draft/submit) · My submission status · **Public gallery** (search/filter published submissions) | **Gallery: yes** (T1 requirement, brief's own "public gallery"). Draft/submit/status: no | `05-submission-management.md` |
| 6 | Submission Verification | *No participant-facing screen.* Organizer: verification review queue | No | `06-submission-verification.md` |
| 7 | Judge Assignment | Organizer: assignment board · Judge: "My assigned projects" | No | `07-judge-assignment.md` |
| 8 | Rubric & Scoring | Organizer: rubric builder · Judge: scoring interface (highest-complexity screen in the platform) | No | `08-rubric-and-scoring.md` |
| 9 | Normalization | Organizer/admin only: run + compare normalization | No | `09-normalization.md` |
| 10 | Results & Rankings | Public: results/leaderboard page · Organizer: draft/publish/correct | **Results page: yes**, once published (`PublishedResultVersion: LIVE`). Draft/correction tools: no | `10-results-and-rankings.md` |
| 11 | Voting | Public: ballot · Organizer: round management, shortlist curation | **Open question — see below.** Casting a vote always requires auth; whether *viewing* the shortlist without voting is public isn't resolved yet | `11-voting.md` |
| 12 | Certificates | Public: certificate view · User: certificate gallery · Organizer: template upload | **Certificate view: yes** (D39). **Certificate gallery: yes** (D110, explicitly public-by-design). Template upload: no | `12-certificates.md` |
| 13 | Comments | *No standalone screen* — embedded in the submission/gallery detail view | **Viewing: yes** (rides on the public gallery). Posting requires auth + verified email | `13-comments.md` |
| 14 | Global Ranking | Public: leaderboard · Person drill-down | **Yes — fully public**, same as the reference site this module was modeled on | `14-global-ranking.md` |

Shared/global pieces that cut across every module (nav shell, toolbar
patterns, empty/error state conventions) get established once in
Module 1's doc, since it's first, and referenced by number afterward
rather than redefined per module — same cross-referencing discipline
as the backend `DECISIONS.md`.

Already written, ahead of this sequence: **Module 3's public Events
list** (`events-list-screen.md` + `events-list-states-and-errors.md`)
— that work stands; Module 3's design doc will reference it rather
than redo it, and add the two screens Module 3 still needs (event
detail, create/edit).

---

Building in order, starting now: **Module 1 — Auth & Email Setup.**
