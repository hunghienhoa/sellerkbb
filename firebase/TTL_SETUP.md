# Firebase Firestore TTL for SellerKBB

SellerKBB writes an `expiresAt` timestamp into each `liveSessions` document. To enable background deletion in Firestore, enable a TTL policy once for this collection group.

## Google Cloud Console

1. Open Google Cloud Console for the Firebase project.
2. Go to Firestore / Databases.
3. Select the default database.
4. Open **Time-to-live**.
5. Create a policy:
   - Collection group: `liveSessions`
   - TTL field: `expiresAt`
6. Enable the policy.

Firestore TTL deletion is asynchronous. Expired documents are typically removed within about 24 hours after expiration.

## gcloud equivalent

```bash
gcloud firestore fields ttls update expiresAt \
  --collection-group=liveSessions \
  --enable-ttl
```

## SellerKBB protection rules

- Retention can be configured from 30 to 180 days.
- The application never allows retention above 180 days (6 months).
- Emergency cleanup deletes oldest `liveSessions` only.
- GitHub/source code is never part of cleanup.
- User accounts are never part of cleanup.
- TikTok `seller_token` is protected from Cloudflare KV cleanup.
- Cloudflare cleanup only targets temporary/cache prefixes such as `oauth_state:`, `cache:`, and `maintenance_log:`.
