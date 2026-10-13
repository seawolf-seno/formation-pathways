// Runs inside Khan Academy's teacher pages (your own signed-in session).
// When Khan's own skills report loads its data, pass a copy to the extension.
// Nothing is requested from Khan that the page doesn't load itself.
(() => {
  const OPS = /\/graphql\/(KAClassroom_GetExerciseSkills|KAClassroom_GetCourseExercises)(\?|$)/;
  const original = window.fetch;
  window.fetch = async function (input) {
    const response = await original.apply(this, arguments);
    try {
      const url = typeof input === "string" ? input : input && input.url;
      const match = url && OPS.exec(new URL(url, location.href).pathname + "?");
      if (match) {
        response
          .clone()
          .json()
          .then((data) => window.postMessage({ __fpMastery: true, op: match[1], data }, location.origin))
          .catch(() => {});
      }
    } catch {
      // Never get in Khan's way.
    }
    return response;
  };
})();
