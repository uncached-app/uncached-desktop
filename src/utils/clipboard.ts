/**
 * Writes to the clipboard, with the old way as a fallback.
 *
 * `navigator.clipboard` is absent in a few webview configurations, and a copy
 * that quietly does nothing is worse than one that takes an odd route.
 */
export async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const field = document.createElement("textarea");
  field.value = text;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.appendChild(field);
  field.select();
  const copied = document.execCommand("copy");
  document.body.removeChild(field);
  if (!copied) throw new Error("Could not reach the clipboard");
}
