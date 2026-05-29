# Rowcraft Connector Bridge Protocol

Rowcraft connectors let another desktop or local app open one of its datasets in Rowcraft without uploading that app's data to Rowcraft cloud storage.

The source app remains the system of record. Rowcraft provides the browser editing experience and stages changes back through a localhost bridge owned by the source app.

## Launch URL

Source apps open Rowcraft with:

```text
/connectors/connect?bridge={encodedBridgeBaseUrl}&token={oneTimeToken}&dataset={encodedDatasetName}
```

Example:

```text
https://rowcraft-jet.vercel.app/connectors/connect?bridge=http%3A%2F%2F127.0.0.1%3A49152%2Frowcraft%2F&token=abc&dataset=accounts
```

The route is protected by Clerk auth. If the user must sign in, Rowcraft preserves `bridge`, `token`, and `dataset` through sign-in and then continues the connector exchange. If the one-time token expires during sign-in, Rowcraft shows a connection-expired error and the user must reopen from the source app.

## Bridge URL Rules

The bridge must be called from browser-side React code. Rowcraft does not proxy connector calls through Next.js API routes.

Allowed bridge URLs:

- Protocol: `http:`
- Hosts: `127.0.0.1`, `localhost`, or `[::1]`
- Base path under `/rowcraft/`

Rejected bridge URLs:

- Public IPs
- LAN IPs
- Custom domains
- HTTPS URLs
- URLs with credentials
- Any non-loopback host

All API routes are under:

```text
{bridge}/api/v1/...
```

## Session Handshake

### Health

```http
GET /api/v1/health
```

Response:

```json
{
  "ok": true,
  "mode": "rowcraft-connector",
  "contextOpen": true
}
```

### Exchange Token

```http
POST /api/v1/session/exchange
Content-Type: application/json

{
  "token": "one-time-token-from-url"
}
```

Response:

```json
{
  "sessionId": "session-token",
  "mode": "rowcraft-connector",
  "apiVersion": "1",
  "capabilities": {
    "readDatasets": true,
    "queryRows": false,
    "stageCreates": true,
    "stageUpdates": true,
    "stageDeletes": true,
    "applyStagedChanges": false,
    "executeSqlReadOnly": false
  }
}
```

After exchange, Rowcraft sends this header on all bridge calls:

```http
Authorization: Bearer {sessionId}
```

## Context

```http
GET /api/v1/context
Authorization: Bearer {sessionId}
```

Response:

```json
{
  "name": "Source App Workspace",
  "fileName": "workspace-file.ext",
  "schemaVersion": "1",
  "capabilities": {}
}
```

## Datasets

### List Datasets

```http
GET /api/v1/datasets
Authorization: Bearer {sessionId}
```

Response:

```json
[
  {
    "name": "accounts",
    "label": "Accounts",
    "source": "Excel",
    "rowCount": 250,
    "updatedOn": "2026-05-29T10:00:00Z",
    "sortOrder": 1,
    "columnCount": 12
  }
]
```

If the launch URL dataset is missing from this list, Rowcraft shows an error and lets the user choose another available dataset. Rowcraft does not silently fall back to the first dataset.

### Get Columns

```http
GET /api/v1/datasets/{datasetName}/columns
Authorization: Bearer {sessionId}
```

Response:

```json
[
  {
    "name": "name",
    "label": "Account Name",
    "type": "String",
    "sqliteType": "TEXT",
    "relatedDataset": null,
    "isMultiSelect": false
  }
]
```

Editable columns are the returned columns except internal Rowcraft columns:

- `_row_id`
- `_source_id`
- `_is_new`

### Get Records

```http
GET /api/v1/datasets/{datasetName}/records?offset=0&limit=500
Authorization: Bearer {sessionId}
```

Response:

```json
{
  "offset": 0,
  "limit": 500,
  "rows": [
    {
      "_row_id": 1,
      "_source_id": "source-id",
      "_is_new": false,
      "name": "Contoso",
      "accountnumber": "A-001"
    }
  ],
  "total": 250
}
```

`total` is optional. If it is omitted, Rowcraft uses `rowCount` from the dataset list.

Rowcraft progressively loads records page by page, initially with `limit=500`, then filters, sorts, and pages client-side over the loaded rows.

## Edit Sessions

### Start Or Resume

```http
POST /api/v1/datasets/{datasetName}/edit-session
Authorization: Bearer {sessionId}
```

Response:

```json
{
  "session": {
    "id": "edit-session-id",
    "datasetName": "accounts",
    "status": "pending"
  },
  "summary": {
    "sessionId": "edit-session-id",
    "datasetName": "accounts",
    "status": "pending",
    "creates": 0,
    "updates": 0,
    "deletes": 0,
    "total": 0
  }
}
```

### Pending Change Counts

```http
GET /api/v1/datasets/{datasetName}/edit-session/{editSessionId}/changes
Authorization: Bearer {sessionId}
```

Response:

```json
{
  "sessionId": "edit-session-id",
  "datasetName": "accounts",
  "status": "pending",
  "creates": 1,
  "updates": 2,
  "deletes": 1,
  "total": 4
}
```

## Staging Changes

Bridge APIs stage changes only. The source app decides how and when to apply staged changes to its system of record.

### Create Row

```http
POST /api/v1/datasets/{datasetName}/edit-session/{editSessionId}/records
Authorization: Bearer {sessionId}
Content-Type: application/json

{
  "clientRowId": "rowcraft-generated-id",
  "name": "New Account",
  "accountnumber": "A-999"
}
```

Response:

```json
{
  "id": "pending-change-id",
  "sessionId": "edit-session-id",
  "datasetName": "accounts",
  "operation": "create",
  "rowId": null,
  "clientRowId": "rowcraft-generated-id",
  "after": {
    "name": "New Account",
    "accountnumber": "A-999"
  },
  "changedColumns": ["name", "accountnumber"],
  "stagedOn": "2026-05-29T10:00:00Z"
}
```

Rowcraft uses `clientRowId` as the temporary row identity until the source app applies changes and assigns a real `_row_id`.

### Update Existing Row

```http
PATCH /api/v1/datasets/{datasetName}/edit-session/{editSessionId}/records/{rowId}
Authorization: Bearer {sessionId}
Content-Type: application/json

{
  "name": "Edited Account"
}
```

`rowId` is `_row_id` from record reads. The body contains changed editable columns only.

### Delete Existing Row

```http
DELETE /api/v1/datasets/{datasetName}/edit-session/{editSessionId}/records/{rowId}
Authorization: Bearer {sessionId}
```

### Discard Staged Changes

```http
POST /api/v1/datasets/{datasetName}/edit-session/{editSessionId}/discard
Authorization: Bearer {sessionId}
```

Response:

```json
{
  "discarded": true
}
```

Rowcraft confirms before calling discard, clears its local overlay, and reloads records after a successful response.

## Value Rules

Rowcraft performs light coercion before staging values:

- Integer columns: JSON number if valid.
- Real, decimal, float, double, or numeric columns: JSON number if valid.
- Boolean-like fields: JSON boolean.
- Date and datetime fields: string.
- Text fields: string.
- Null values: JSON `null`.

Blank input means empty string. Rowcraft uses a separate explicit NULL control to send `null`.

## Security Rules

- Tokens are one-time.
- Session tokens should be short-lived.
- Rowcraft keeps connector token data in browser memory only.
- Rowcraft never sends connector data to Supabase.
- Rowcraft never uses the cloud `.db` upload/save flow for connector datasets.
