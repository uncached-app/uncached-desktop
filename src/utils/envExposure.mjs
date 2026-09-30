const SAFE_WORD = /^[A-Za-z0-9_./@%+=:,-]+$/;

/** POSIX single-quoting; words made only of safe characters are left bare. */
export function shellQuote(word) {
  return SAFE_WORD.test(word) ? word : `'${word.replaceAll("'", `'\\''`)}'`;
}

/**
 * The command, run from the repository root, that stops Git from publishing an
 * env file. A committed one also leaves the index; its past values stay in the
 * history either way, which is why the page says to rotate them.
 */
export function envFixCommand({ path, committed }) {
  const quoted = shellQuote(path);
  const ignore = `echo ${quoted} >> .gitignore`;
  return committed ? `git rm --cached -- ${quoted} && ${ignore}` : ignore;
}
