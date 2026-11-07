[![Netlify Status](https://api.netlify.com/api/v1/badges/d6ba0488-6c48-4fc9-89dd-1e129366c0e3/deploy-status)](https://app.netlify.com/sites/bentleydavis/deploys)

## Hosting

- The static website (Eleventy build) is built and hosted by Netlify.
- Firestore rules and Cloud Functions are deployed with the Firebase CLI to
  project `apps-5884f`.
- Firebase Hosting and GitHub Pages are not used.

## Firebase backend

[functions/index.js](functions/index.js) contains the source for the Gen 2
`widgetFeed` HTTPS function in project `apps-5884f`, region `us-central1`.
It uses the named Firestore database `apps`. The backend is separate from the
Netlify website build and is not published as static website files.

The initial import preserves the deployed widget handler.
The archive had no lockfile; repository lockfiles record current reproducible
dependency installs, not necessarily the deployed build's versions.
The site and function packages target Node.js 24, as specified by `.nvmrc`.
The existing widget remains on its previously deployed runtime until explicitly
redeployed. The repository's npm dependency trees have been upgraded and report
no known vulnerabilities in `npm audit`.

Install backend dependencies separately:

```powershell
npm ci --prefix functions
```

After reviewing changes, deploy only this function:

```powershell
firebase deploy --only functions:widgetFeed --project apps-5884f
```

The widget accepts Firebase ID tokens for approved members. Older GET-only
clients may continue using the optional `WIDGET_TOKEN` query parameter; set it
in the ignored `functions/.env.apps-5884f` file only if that compatibility path
is needed. Never put its value or a complete widget URL in source,
documentation, logs, or chat.

The handler retains its existing filtering, including not yet filtering out the
editor's new `done` field.

## Database access

### Collection catalog

List `collections` in the named `apps` database to discover app collections and
their expected fields. Each document's ID is the collection name. The matching
version-controlled definitions are in [database/collections.json](database/collections.json).
All approved members can read and update the catalog; anonymous users cannot.
It describes expected formats, not necessarily enforced validation.
Keep live catalog documents and this JSON in sync whenever the data model changes.
Internal OAuth storage is intentionally excluded.

Agents using Firestore REST should use Firestore's typed JSON representation
(`stringValue`, `booleanValue`, `integerValue`/`doubleValue`, `nullValue`, etc.).
The catalog's defaults describe how absent optional fields are interpreted;
Firestore does not insert them automatically. For partial edits, use PATCH with
`updateMask.fieldPaths` for each changed field to avoid replacing other fields.

For Muse's platform-managed OAuth connection, see
[functions/OAUTH.md](functions/OAUTH.md). This adapter returns Firebase ID tokens
through the platform's standard OAuth exchange; it is not a data relay.

[firestore.rules](firestore.rules) targets only the named `apps` database.
Membership is the existence of an `access/{firebaseAuthUid}` document in that
database; the document may be empty. No emails, passwords, or tokens belong in
these documents. Removing the document revokes that account's database access.

Members can read and write all app collections, including managing membership.
Every member is therefore a trusted administrator and can grant or revoke access,
including their own. Firebase Auth account creation remains a separate operation;
creating an Auth user alone does not grant database access. A privileged project
administrator can restore access if all membership documents are removed.

### Account directory

The `registerUser` (2nd gen `onUserCreated`) Auth account-created function writes `users/{UID}` in the
named `apps` database with `email` and `name` (null when unavailable).
Existing Auth accounts are backfilled once. The directory includes accounts
that have not been approved; a directory document never grants access.
Only existing members can read or edit it under the database rules.

Muse can look up an account in `users`, then create `access/{UID}` to approve it.
Use the document ID as the UID, not an email or display name. Names are labels,
not proof of identity. The directory records account details at creation; later
Auth profile edits and account deletions are not automatically synchronized.
Member edits to directory labels do not change Firebase Auth accounts.

Deploy this trigger separately:

```powershell
firebase deploy --only functions:registerUser --project apps-5884f
```

The `_oauth` collection is reserved for server-only OAuth credential storage and
is excluded from member access. Task documents retain their ID, title, and field-count safeguards. Task
subcollections remain closed; other app collections and their subcollections are
available to members. Server/Admin SDK access still uses IAM rather than these
rules.

Before any rules deployment, show the diff and obtain approval. Bootstrap the
intended membership documents before switching from the previous UID allowlist.
Deploy only database rules, without redeploying functions:

```powershell
firebase deploy --only firestore:rules --project apps-5884f
```
