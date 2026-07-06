interface ClipboardLike {
  writeText(text: string): Promise<void>;
}

interface ClipboardDocumentLike {
  body?: {
    appendChild(node: unknown): unknown;
    removeChild(node: unknown): unknown;
  };
  createElement(tagName: "textarea"): {
    value: string;
    style: Record<string, string>;
    focus(): void;
    select(): void;
  };
  execCommand?(command: "copy"): boolean;
}

interface CopyTextOptions {
  clipboard?: ClipboardLike;
  documentRef?: ClipboardDocumentLike;
}

function fallbackCopyWithTextarea(text: string, documentRef?: ClipboardDocumentLike): boolean {
  if (!documentRef?.body || typeof documentRef.execCommand !== "function") return false;

  const textarea = documentRef.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.top = "-1000px";
  textarea.style.left = "-1000px";
  textarea.style.opacity = "0";

  documentRef.body.appendChild(textarea);
  try {
    textarea.focus();
    textarea.select();
    return documentRef.execCommand("copy");
  } finally {
    documentRef.body.removeChild(textarea);
  }
}

export async function copyTextToClipboard(text: string, options: CopyTextOptions = {}): Promise<boolean> {
  const clipboard = options.clipboard ?? globalThis.navigator?.clipboard;
  const documentRef = options.documentRef ?? globalThis.document;

  if (clipboard) {
    try {
      await clipboard.writeText(text);
      return true;
    } catch {
      return fallbackCopyWithTextarea(text, documentRef);
    }
  }

  return fallbackCopyWithTextarea(text, documentRef);
}
