// Students hold @pacificachristian.org addresses too. Theirs carry a number
// before the @; staff ones don't. The database uses the same rule
// (private.is_student_address) so a student's sign-in is never approved
// automatically. Here it words the sign-in message and marks the Staff list.
// It is a guess from the address, so it only ever asks a person to decide:
// an admin can still approve a student contributor, or a staff address that
// happens to carry a number. Pure; tested in tests/student-address.test.mjs.

export function looksLikeStudentAddress(email: unknown): boolean {
  if (typeof email !== "string") return false;
  return /[0-9]/.test(email.split("@", 1)[0]);
}
