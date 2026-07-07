// Admin identity helper.
//
// A user is an admin if EITHER:
//   - their `is_admin` column is 1 (set via the "Create admin" panel), OR
//   - their email is listed in the ADMIN_EMAILS env var (comma-separated).
//
// ADMIN_EMAILS is the bootstrap: set it to your own email so the very first
// admin exists without touching the database. Example:
//   ADMIN_EMAILS=alimbacker16@gmail.com
export function adminEmailSet() {
  return new Set(
    (process.env.ADMIN_EMAILS || "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function isAdminUser(user) {
  if (!user) return false;
  if (user.is_admin === 1 || user.is_admin === true) return true;
  return adminEmailSet().has((user.email || "").toLowerCase());
}
