// Turning a git remote into a page a browser can open.
//
// A remote is whatever someone typed into `git remote add`, which means this
// function is reading untrusted text out of a file inside a folder the user
// pointed us at — and handing the result to the system browser. So it does not
// translate; it recognises. Anything it cannot state confidently as an https
// address comes back null, and the interface leaves the action out.

const SSH_SHORTHAND = /^(?:[\w.-]+@)?([\w.-]+):(?!\/)(.+)$/;

function normalisePath(path) {
  return path.replace(/^\/+/, "").replace(/\.git$/, "").replace(/\/+$/, "");
}

/** A host has to look like a host. `localhost`, an IP, or a name with a dot. */
function plausibleHost(host) {
  return /^[\w.-]+$/.test(host) && (host.includes(".") || host === "localhost");
}

/**
 * The https page for a git remote, or null.
 *
 * Handles the three spellings that occur in practice — scp-style ssh
 * (`git@host:owner/repo.git`), a URL with a scheme, and a bare https address —
 * and refuses everything else, including local paths, which have no page.
 */
export function remoteToUrl(remote) {
  if (typeof remote !== "string") return null;
  const trimmed = remote.trim();
  if (!trimmed) return null;

  const shorthand = trimmed.match(SSH_SHORTHAND);
  if (shorthand) {
    const [, host, path] = shorthand;
    const cleaned = normalisePath(path);
    return plausibleHost(host) && cleaned ? `https://${host}/${cleaned}` : null;
  }

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  // Only the schemes that describe a remote server. `file:` is a directory,
  // and everything else is something we have no business opening.
  if (!["https:", "http:", "ssh:", "git:"].includes(parsed.protocol)) return null;
  const cleaned = normalisePath(parsed.pathname);
  if (!plausibleHost(parsed.hostname) || !cleaned) return null;

  // The scheme is not carried over: whatever the remote was fetched with, the
  // thing being opened is a web page, and it is opened over TLS.
  return `https://${parsed.hostname}/${cleaned}`;
}

/** The `owner/repo` a remote points at, for showing next to the action. */
export function remoteLabel(remote) {
  const url = remoteToUrl(remote);
  if (!url) return null;
  return new URL(url).pathname.replace(/^\//, "");
}
