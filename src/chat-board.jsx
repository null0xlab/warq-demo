import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import {
  Bot,
  ChevronLeft,
  Clock3,
  ImagePlus,
  LoaderCircle,
  MessageCircle,
  MoreVertical,
  Pencil,
  Reply,
  Send,
  Shield,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { adminApi, api } from "./api";
import { bindRealtimeSync } from "./realtime";
import { formatBdPhoneNumber } from "./bd-locations";
import "./chat-board.css";

const QUICK_QUERIES = [
  "How does WarQ work?",
  "How do I activate a warranty?",
  "How do I scan a QR code?",
  "How can I request QR codes?",
  "How does the subscription system work?",
  "My QR code is not working",
  "How can I contact the admin?",
  "What is your WhatsApp number?",
];

const WAITING_BANNER =
  "Your support request has been received. Please describe your problem in detail and upload any relevant screenshots or images. The administrator will review your request and respond as soon as they are available.";

const CHAT_RETENTION_DAYS = 7;
const DEFAULT_WHATSAPP = "01815533416";
const CHAT_RETENTION_NOTICE =
  "All messages, images, and conversation history from both the AI Chatbot and Admin Support Chat will be automatically and permanently deleted 7 days after each message or item is sent.";

const imageUrlCache = new Map();

function whatsappChatUrl(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return "";
  let international = digits;
  if (international.startsWith("00")) international = international.slice(2);
  else if (international.startsWith("880")) {
    /* already international */
  } else if (international.startsWith("0")) {
    international = `880${international.slice(1)}`;
  } else if (international.length === 10 && international.startsWith("1")) {
    international = `880${international}`;
  }
  return `https://wa.me/${international}`;
}

function WhatsAppLink({ phone, className = "", children }) {
  const display = String(phone || DEFAULT_WHATSAPP).trim() || DEFAULT_WHATSAPP;
  const href = whatsappChatUrl(display);
  if (!href) return <strong className={className}>{children || display}</strong>;
  return (
    <a
      className={`chat-whatsapp-link ${className}`.trim()}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Open WhatsApp chat with ${display}`}
      title="Open WhatsApp chat"
    >
      {children || display}
    </a>
  );
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Turn bare WhatsApp / BD phone numbers into Markdown links for the AI renderer. */
function withWhatsAppMarkdownLinks(content, phone = DEFAULT_WHATSAPP) {
  const raw = String(content || "");
  const href = whatsappChatUrl(phone);
  if (!raw || !href) return raw;

  const candidates = new Set();
  const cleaned = String(phone || "").trim();
  if (cleaned) candidates.add(cleaned);
  const formatted = formatBdPhoneNumber(cleaned);
  if (formatted) candidates.add(formatted);
  const digits = cleaned.replace(/\D/g, "");
  if (digits) {
    candidates.add(digits);
    if (digits.startsWith("0")) candidates.add(digits.slice(1));
    if (digits.startsWith("880")) candidates.add(`0${digits.slice(3)}`);
  }

  let out = raw;
  for (const candidate of candidates) {
    if (!candidate || candidate.length < 8) continue;
    const re = new RegExp(`(?<!\\[|\\()(?<!wa\\.me/)${escapeRegExp(candidate)}(?!\\]\\()`, "g");
    out = out.replace(re, `[${candidate}](${href})`);
  }
  return out;
}

const markdownSanitizeSchema = {
  ...defaultSchema,
  protocols: {
    ...defaultSchema.protocols,
    href: ["http", "https", "mailto"],
  },
  attributes: {
    ...defaultSchema.attributes,
    a: [...(defaultSchema.attributes?.a || []), "target", "rel"],
    code: [...(defaultSchema.attributes?.code || []), "className"],
  },
};

function formatStamp(value) {
  if (!value) return "";
  try {
    return new Intl.DateTimeFormat("en-BD", {
      hour: "numeric",
      minute: "2-digit",
      day: "numeric",
      month: "short",
    }).format(new Date(value));
  } catch {
    return "";
  }
}

function fingerprintMessages(messages = []) {
  const last = messages[messages.length - 1];
  const deletedCount = messages.reduce((n, m) => n + (m?.deleted ? 1 : 0), 0);
  const editedCount = messages.reduce((n, m) => n + (m?.edited ? 1 : 0), 0);
  const lastBody = last?.deleted
    ? last.deletedType || "1"
    : `${last?.edited ? "e" : "0"}:${String(last?.text || last?.content || "").slice(0, 48)}`;
  return `${messages.length}:${deletedCount}:${editedCount}:${last?.id || ""}:${last?.createdAt || ""}:${last?.editedAt || ""}:${lastBody}`;
}

function fingerprintThread(thread) {
  if (!thread) return "none";
  return `${thread.id}:${thread.status}:${thread.lastMessageAt || ""}:${thread.unreadByUser || 0}:${thread.queuePosition || ""}:${thread.lastMessagePreview || ""}`;
}

function readImageAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file || !String(file.type || "").startsWith("image/")) {
      reject(new Error("Please choose a JPEG, PNG, WebP, or GIF image."));
      return;
    }
    if (file.size > 2.5 * 1024 * 1024) {
      reject(new Error("Images must be 2.5 MB or smaller."));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve({ dataUrl: String(reader.result || ""), mimeType: file.type });
    reader.onerror = () => reject(new Error("Could not read that image."));
    reader.readAsDataURL(file);
  });
}

/** Edit/Delete only for Admin Support conversations — never for AI chatbot. */
function canDeleteMessage(msg, mode, viewer) {
  if (mode !== "admin") return false;
  if (!msg?.id || msg.deleted) return false;
  if (msg.senderRole === "system") return false;
  if (viewer === "admin") return msg.senderRole === "admin" || msg.senderRole === "user";
  return msg.senderRole === "user";
}

function canEditMessage(msg, mode, viewer) {
  if (mode !== "admin") return false;
  if (!msg?.id || msg.deleted) return false;
  if (msg.senderRole === "system") return false;
  if (!String(msg.text || "").trim()) return false;
  if (viewer === "admin") return msg.senderRole === "admin";
  return msg.senderRole === "user";
}

function canReplyMessage(msg, mode) {
  if (mode !== "admin") return false;
  if (!msg?.id) return false;
  if (msg.senderRole === "system") return false;
  return true;
}

function replyAuthorLabel(replyTo, viewer) {
  const role = replyTo?.senderRole;
  if (viewer === "admin") {
    if (role === "admin") return "You";
    if (role === "user") return "Merchant";
  } else {
    if (role === "user") return "You";
    if (role === "admin") return "Admin";
  }
  return "Message";
}

function deletedPlaceholderText(msg) {
  return msg?.deletedType === "image" ? "This image was deleted." : "This message was deleted.";
}

function markMessageDeletedLocally(msg, preferImage) {
  const hadImage = Boolean(msg?.imageId) || Boolean(preferImage);
  const deletedType = hadImage ? "image" : "message";
  return {
    ...msg,
    content: "",
    text: "",
    imageId: null,
    deleted: true,
    deletedType,
    deletedAt: new Date().toISOString(),
    edited: false,
  };
}

function markMessageEditedLocally(msg, nextText) {
  return {
    ...msg,
    text: nextText,
    edited: true,
    editedAt: new Date().toISOString(),
  };
}

const AiMarkdown = memo(function AiMarkdown({ content, whatsapp = DEFAULT_WHATSAPP }) {
  const text = withWhatsAppMarkdownLinks(content, whatsapp);
  if (!text.trim()) return null;
  return (
    <div className="chat-md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeSanitize, markdownSanitizeSchema]]}
        components={{
          a: ({ node: _node, href, children, ...props }) => {
            const url = String(href || "");
            const isWhatsApp = /wa\.me\/|api\.whatsapp\.com/i.test(url);
            return (
              <a
                {...props}
                href={href}
                className={isWhatsApp ? "chat-whatsapp-link" : undefined}
                target="_blank"
                rel="noopener noreferrer"
                title={isWhatsApp ? "Open WhatsApp chat" : undefined}
              >
                {children}
              </a>
            );
          },
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
});

const ChatRetentionNotice = memo(function ChatRetentionNotice({ compact = false }) {
  return (
    <div
      className={`chat-retention-notice${compact ? " is-compact" : ""}`}
      role="status"
      aria-live="polite"
    >
      <Clock3 size={compact ? 15 : 18} aria-hidden />
      <div className="chat-retention-copy">
        <p>
          <strong>Privacy Notice:</strong> {CHAT_RETENTION_NOTICE}
        </p>
      </div>
    </div>
  );
});

function DeleteConfirmDialog({ open, title, detail, busy, onCancel, onConfirm }) {
  const [allowDismiss, setAllowDismiss] = useState(false);

  useEffect(() => {
    if (!open) {
      setAllowDismiss(false);
      return undefined;
    }
    setAllowDismiss(false);
    const timer = window.setTimeout(() => setAllowDismiss(true), 350);
    return () => window.clearTimeout(timer);
  }, [open]);

  if (!open) return null;

  const dismiss = () => {
    if (!busy && allowDismiss) onCancel?.();
  };

  return (
    <div className="chat-confirm-backdrop" role="presentation" onClick={dismiss}>
      <div
        className="chat-confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="chat-delete-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="chat-delete-title">{title}</h3>
        <p>{detail}</p>
        <div className="chat-confirm-actions">
          <button type="button" className="chat-confirm-cancel" onClick={dismiss} disabled={busy || !allowDismiss}>
            Cancel
          </button>
          <button
            type="button"
            className="chat-confirm-delete"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onConfirm?.();
            }}
            disabled={busy}
          >
            {busy ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

const SupportImage = memo(function SupportImage({ imageId, clientApi }) {
  const [src, setSrc] = useState(() => imageUrlCache.get(imageId) || "");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!imageId) return undefined;
    const cached = imageUrlCache.get(imageId);
    if (cached) {
      setSrc(cached);
      return undefined;
    }
    let cancelled = false;
    let objectUrl = "";
    (async () => {
      try {
        const blob = await clientApi.fetchSupportImageBlob(imageId);
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        imageUrlCache.set(imageId, objectUrl);
        setSrc(objectUrl);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [imageId, clientApi]);

  if (failed) return <span className="chat-image-failed">Image unavailable</span>;
  if (!src) {
    return (
      <span className="chat-image-loading" aria-hidden>
        <LoaderCircle size={14} className="spin" />
      </span>
    );
  }
  return (
    <a href={src} target="_blank" rel="noreferrer" className="chat-image-link">
      <img src={src} alt="Support attachment" className="chat-image" loading="lazy" decoding="async" />
    </a>
  );
});

const ChatBubble = memo(function ChatBubble({
  msg,
  mode,
  viewer,
  clientApi,
  whatsapp = DEFAULT_WHATSAPP,
  onRequestDelete,
  onRequestEdit,
  onRequestReply,
}) {
  const isAi = mode === "ai";
  const role = isAi ? msg.role : msg.senderRole;
  const isSystem = role === "system";
  const isDeleted = Boolean(msg.deleted);
  const deletable = !isDeleted && canDeleteMessage(msg, mode, viewer);
  const editable = !isDeleted && canEditMessage(msg, mode, viewer);
  const replyable = canReplyMessage(msg, mode);
  const hasActions = deletable || editable || replyable;
  const [menuOpen, setMenuOpen] = useState(false);
  const longPressTimer = useRef(null);
  const menuRef = useRef(null);

  let bubbleClass = "assistant";
  let label = "Support";
  if (isSystem) {
    bubbleClass = "system";
    label = "";
  } else if (isAi) {
    const mine = role === "user";
    bubbleClass = mine ? "user" : "assistant";
    label = mine ? "You" : "WarQ Assistant";
  } else if (viewer === "admin") {
    const mine = role === "admin";
    bubbleClass = mine ? "user" : "assistant";
    label = mine ? "You (Admin)" : "Merchant";
  } else {
    const mine = role === "user";
    bubbleClass = mine ? "user" : "assistant";
    label = mine ? "You" : "Admin";
  }
  const text = isAi ? msg.content : msg.text;
  const renderMarkdown = !isDeleted && isAi && role === "assistant";
  const showEdited = !isAi && !isDeleted && Boolean(msg.edited);
  const replyTo = !isAi && msg.replyTo?.id ? msg.replyTo : null;

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onDoc = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onDoc);
    return () => document.removeEventListener("pointerdown", onDoc);
  }, [menuOpen]);

  const clearLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const startLongPress = () => {
    if (!hasActions) return;
    clearLongPress();
    longPressTimer.current = setTimeout(() => {
      setMenuOpen(true);
      longPressTimer.current = null;
    }, 520);
  };

  const requestDelete = (event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    setMenuOpen(false);
    onRequestDelete?.(msg);
  };

  const requestEdit = (event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    setMenuOpen(false);
    onRequestEdit?.(msg);
  };

  const requestReply = (event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    setMenuOpen(false);
    onRequestReply?.(msg);
  };

  return (
    <div
      className={`chat-bubble-row ${bubbleClass}${isDeleted ? " is-deleted" : ""}`}
      id={!isAi && msg.id ? `chat-msg-${msg.id}` : undefined}
      onTouchStart={startLongPress}
      onTouchEnd={clearLongPress}
      onTouchMove={clearLongPress}
      onTouchCancel={clearLongPress}
      onContextMenu={(e) => {
        if (!hasActions) return;
        e.preventDefault();
        setMenuOpen(true);
      }}
    >
      <div
        className={`chat-bubble ${bubbleClass}${hasActions ? " has-actions" : ""}${isDeleted ? " is-deleted" : ""}`}
        ref={menuRef}
      >
        {!isSystem ? (
          <div className="chat-bubble-header">
            <span className="chat-bubble-meta">
              {label}
              {msg.createdAt ? ` · ${formatStamp(msg.createdAt)}` : ""}
              {showEdited ? <span className="chat-edited-tag"> · Edited</span> : null}
            </span>
            {hasActions ? (
              <div className="chat-bubble-actions">
                <button
                  type="button"
                  className="chat-msg-menu-btn"
                  aria-label="Message options"
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen((v) => !v);
                  }}
                >
                  <MoreVertical size={14} />
                </button>
                {menuOpen ? (
                  <div className="chat-msg-menu" role="menu">
                    {replyable ? (
                      <button
                        type="button"
                        role="menuitem"
                        className="chat-msg-menu-reply"
                        onClick={requestReply}
                        onPointerDown={(e) => e.stopPropagation()}
                      >
                        <Reply size={14} aria-hidden />
                        Reply
                      </button>
                    ) : null}
                    {editable ? (
                      <button
                        type="button"
                        role="menuitem"
                        className="chat-msg-menu-edit"
                        onClick={requestEdit}
                        onPointerDown={(e) => e.stopPropagation()}
                      >
                        <Pencil size={14} aria-hidden />
                        Edit
                      </button>
                    ) : null}
                    {deletable ? (
                      <button
                        type="button"
                        role="menuitem"
                        className="chat-msg-menu-delete"
                        onClick={requestDelete}
                        onPointerDown={(e) => e.stopPropagation()}
                      >
                        <Trash2 size={14} aria-hidden />
                        Delete
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
        {isDeleted ? (
          <p className="chat-deleted-placeholder" aria-label={deletedPlaceholderText(msg)}>
            <span className="chat-deleted-icon" aria-hidden>
              <Trash2 size={13} />
            </span>
            <span>{deletedPlaceholderText(msg)}</span>
          </p>
        ) : (
          <>
            {replyTo ? (
              <button
                type="button"
                className="chat-reply-quote"
                onClick={() => {
                  const el = document.getElementById(`chat-msg-${replyTo.id}`);
                  el?.scrollIntoView?.({ behavior: "smooth", block: "center" });
                }}
              >
                <span className="chat-reply-quote-bar" aria-hidden />
                <span className="chat-reply-quote-body">
                  <strong>{replyAuthorLabel(replyTo, viewer)}</strong>
                  <span>{replyTo.deleted ? replyTo.text || "This message was deleted." : replyTo.text || (replyTo.hasImage ? "Photo" : "Message")}</span>
                </span>
              </button>
            ) : null}
            {text ? (
              renderMarkdown ? (
                <AiMarkdown content={text} whatsapp={whatsapp} />
              ) : (
                <p className="chat-bubble-text">{text}</p>
              )
            ) : null}
            {!isAi && msg.imageId ? <SupportImage imageId={msg.imageId} clientApi={clientApi} /> : null}
          </>
        )}
      </div>
    </div>
  );
});

const MessageList = memo(function MessageList({
  messages,
  mode,
  viewer = "user",
  clientApi,
  whatsapp = DEFAULT_WHATSAPP,
  emptyText,
  onRequestDelete,
  onRequestEdit,
  onRequestReply,
}) {
  const scrollerRef = useRef(null);
  const lastIdRef = useRef("");
  const scrollHeightRef = useRef(0);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const lastId = messages?.[messages.length - 1]?.id || "";
    const prevHeight = scrollHeightRef.current;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;

    if (lastId && lastId !== lastIdRef.current) {
      lastIdRef.current = lastId;
      el.scrollTop = el.scrollHeight;
    } else if (prevHeight && el.scrollHeight !== prevHeight && !nearBottom) {
      // Keep viewport stable when a mid-thread message is removed/edited.
      el.scrollTop = Math.max(0, el.scrollTop - (prevHeight - el.scrollHeight));
    }
    scrollHeightRef.current = el.scrollHeight;
  }, [messages]);

  // When the mobile keyboard resizes the visible area, keep the list pinned
  // to the newest message if the user was already reading from the bottom.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return undefined;
    const onResize = () => {
      const el = scrollerRef.current;
      if (!el) return;
      if (el.scrollHeight - el.scrollTop - el.clientHeight < 80) {
        el.scrollTop = el.scrollHeight;
      }
    };
    vv.addEventListener("resize", onResize);
    return () => vv.removeEventListener("resize", onResize);
  }, []);

  if (!messages?.length) {
    return <div className="chat-empty">{emptyText}</div>;
  }

  return (
    <div className="chat-messages" ref={scrollerRef}>
      {messages.map((msg) => (
        <ChatBubble
          key={msg.id}
          msg={msg}
          mode={mode}
          viewer={viewer}
          clientApi={clientApi}
          whatsapp={whatsapp}
          onRequestDelete={onRequestDelete}
          onRequestEdit={onRequestEdit}
          onRequestReply={onRequestReply}
        />
      ))}
    </div>
  );
});

const QuickQueries = memo(function QuickQueries({ onPick, disabled }) {
  // Keep closed by default on phones so the composer stays visible.
  const [open, setOpen] = useState(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return true;
    return window.matchMedia("(min-width: 721px)").matches;
  });

  return (
    <div className={`chat-quick-dock ${open ? "is-open" : "is-closed"}`}>
      <button
        type="button"
        className="chat-quick-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span>Quick queries</span>
        <span className="chat-quick-toggle-hint">{open ? "Hide" : "Show"}</span>
      </button>
      {open ? (
        <div className="chat-quick-chips" role="list">
          {QUICK_QUERIES.map((q) => (
            <button
              key={q}
              type="button"
              className="chat-quick-chip"
              role="listitem"
              onClick={() => onPick(q)}
              disabled={disabled}
            >
              {q}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
});

export function ChatBoard({ onBack }) {
  const [mode, setMode] = useState("ai");
  const [aiMessages, setAiMessages] = useState([]);
  const [support, setSupport] = useState({
    thread: null,
    messages: [],
    waitingBanner: WAITING_BANNER,
    queuePosition: null,
    waitingCount: 0,
    whatsapp: DEFAULT_WHATSAPP,
  });
  const [draft, setDraft] = useState("");
  const [pendingImage, setPendingImage] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [booting, setBooting] = useState(true);
  const [adminJoinedNotice, setAdminJoinedNotice] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [editingMessage, setEditingMessage] = useState(null);
  const [replyingTo, setReplyingTo] = useState(null);
  const fileRef = useRef(null);
  const composerRef = useRef(null);
  const prevAdminJoined = useRef(false);
  const aiFpRef = useRef("");
  const supportFpRef = useRef("");
  const busyRef = useRef(false);

  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  // Lock page scroll while Chat Board is open (only the message pane scrolls).
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    const prevScrollY = window.scrollY || 0;
    // Mobile browsers keep a stale scroll offset once overflow is locked, which
    // pushes the top bar (Back button) above the visible viewport. Reset it.
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
      document.documentElement.style.overflow = prevHtmlOverflow;
      window.requestAnimationFrame(() => window.scrollTo(0, prevScrollY));
    };
  }, []);

  // Keep the chat pinned to the *visible* viewport. When the mobile keyboard
  // opens it resizes only the visual viewport (not dvh/svh), so the composer
  // would otherwise sit under the keyboard and the browser pans the page.
  // Track visualViewport and size/offset the shell to the real visible area.
  useEffect(() => {
    const shell = document.querySelector(".app-shell.is-chat-fullscreen");
    if (!shell) return undefined;
    const clear = () => {
      shell.style.height = "";
      shell.style.maxHeight = "";
      shell.style.minHeight = "";
      shell.style.transform = "";
    };
    const vv = window.visualViewport;
    if (!vv) {
      const apply = () => {
        const px = `${window.innerHeight}px`;
        shell.style.height = px;
        shell.style.maxHeight = px;
        shell.style.minHeight = px;
      };
      apply();
      window.addEventListener("resize", apply);
      window.addEventListener("orientationchange", apply);
      return () => {
        clear();
        window.removeEventListener("resize", apply);
        window.removeEventListener("orientationchange", apply);
      };
    }
    let frame = 0;
    const apply = () => {
      const px = `${Math.round(vv.height)}px`;
      const top = Math.round(vv.offsetTop);
      shell.style.height = px;
      shell.style.maxHeight = px;
      shell.style.minHeight = px;
      shell.style.transform = top > 0 ? `translateY(${top}px)` : "";
    };
    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        apply();
      });
    };
    apply();
    vv.addEventListener("resize", schedule);
    vv.addEventListener("scroll", schedule);
    window.addEventListener("orientationchange", schedule);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      clear();
      vv.removeEventListener("resize", schedule);
      vv.removeEventListener("scroll", schedule);
      window.removeEventListener("orientationchange", schedule);
    };
  }, []);

  const applyAiMessages = useCallback((messages) => {
    const next = messages || [];
    const fp = fingerprintMessages(next);
    if (fp === aiFpRef.current) return;
    aiFpRef.current = fp;
    setAiMessages(next);
  }, []);

  const applySupport = useCallback((data) => {
    const messages = data.messages || [];
    const fp = `${fingerprintThread(data.thread)}|${fingerprintMessages(messages)}|${data.queuePosition || ""}`;
    if (fp === supportFpRef.current) return false;
    supportFpRef.current = fp;
    setSupport((prev) => ({
      ...prev,
      thread: data.thread ?? null,
      messages,
      waitingBanner: data.waitingBanner || WAITING_BANNER,
      queuePosition: data.queuePosition ?? null,
      waitingCount: data.waitingCount ?? prev.waitingCount,
      whatsapp: data.whatsapp || prev.whatsapp,
    }));
    const joined = data.thread?.status === "active";
    if (joined && !prevAdminJoined.current) setAdminJoinedNotice(true);
    prevAdminJoined.current = joined;
    return true;
  }, []);

  const loadAi = useCallback(async () => {
    const data = await api.getAiChat();
    applyAiMessages(data.messages || []);
    if (data.whatsapp) {
      setSupport((prev) => (prev.whatsapp === data.whatsapp ? prev : { ...prev, whatsapp: data.whatsapp }));
    }
  }, [applyAiMessages]);

  const loadSupport = useCallback(async () => {
    if (busyRef.current) return;
    const data = await api.getSupportThread();
    applySupport(data);
  }, [applySupport]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setBooting(true);
      try {
        await loadAi();
      } catch (err) {
        if (alive) setError(err?.message || "Could not load Chat Board.");
      } finally {
        if (alive) setBooting(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [loadAi]);

  useEffect(() => {
    if (mode !== "admin") return undefined;
    return bindRealtimeSync({
      onSync: loadSupport,
      intervalMs: 7000,
      minGapMs: 6500,
      syncOnFocus: true,
    });
  }, [mode, loadSupport]);

  const statusBanner = useMemo(() => {
    if (mode !== "admin") return null;
    const thread = support.thread;
    if (!thread) {
      return { tone: "info", text: "Connecting you to admin support…" };
    }
    if (thread.status === "waiting") {
      const pos = support.queuePosition ? ` Queue position: #${support.queuePosition}.` : "";
      return {
        tone: "wait",
        text: `Request received.${pos} You can keep writing and upload screenshots — admin will reply when available.`,
      };
    }
    if (thread.status === "active") {
      return { tone: "live", text: "Admin is in this chat. Messages update automatically." };
    }
    return null;
  }, [mode, support.thread, support.queuePosition]);

  const sendAi = useCallback(
    async (text) => {
      const message = String(text || "").trim();
      if (!message || busyRef.current) return;
      setBusy(true);
      setError("");
      setDraft("");
      const optimistic = {
        id: `local-${Date.now()}`,
        role: "user",
        content: message,
        createdAt: new Date().toISOString(),
      };
      setAiMessages((prev) => {
        const next = [...prev, optimistic];
        aiFpRef.current = fingerprintMessages(next);
        return next;
      });
      try {
        const data = await api.aiChat(message);
        applyAiMessages(data.messages || []);
      } catch (err) {
        setError(err?.message || "Assistant is unavailable right now.");
        await loadAi().catch(() => {});
      } finally {
        setBusy(false);
      }
    },
    [applyAiMessages, loadAi],
  );

  const sendSupport = useCallback(async () => {
    const message = draft.trim();
    if ((!message && !pendingImage) || busyRef.current) return;
    if (editingMessage) return;
    setBusy(true);
    setError("");
    try {
      if (!support.thread || (support.thread.status !== "waiting" && support.thread.status !== "active")) {
        const started = await api.startSupportChat({});
        applySupport(started);
      }
      const payload = { message };
      if (pendingImage) {
        payload.imageDataUrl = pendingImage.dataUrl;
        payload.mimeType = pendingImage.mimeType;
      }
      if (replyingTo?.id) payload.replyToId = replyingTo.id;
      const data = await api.sendSupportMessage(payload);
      applySupport(data);
      setDraft("");
      setPendingImage(null);
      setReplyingTo(null);
    } catch (err) {
      setError(err?.message || "Could not send message.");
    } finally {
      setBusy(false);
    }
  }, [applySupport, draft, editingMessage, pendingImage, replyingTo, support.thread]);

  const cancelEdit = useCallback(() => {
    setEditingMessage(null);
    setDraft("");
  }, []);

  const cancelReply = useCallback(() => {
    setReplyingTo(null);
  }, []);

  const startEditMessage = useCallback((msg) => {
    if (!canEditMessage(msg, "admin", "user")) return;
    setReplyingTo(null);
    setPendingImage(null);
    setEditingMessage({ id: msg.id, originalText: String(msg.text || "") });
    setDraft(String(msg.text || ""));
    setError("");
    window.setTimeout(() => {
      const el = composerRef.current;
      if (!el) return;
      el.focus();
      const len = el.value.length;
      try {
        el.setSelectionRange(len, len);
      } catch {
        // ignore
      }
    }, 40);
  }, []);

  const startReplyMessage = useCallback((msg) => {
    if (!canReplyMessage(msg, "admin")) return;
    setEditingMessage(null);
    setReplyingTo({
      id: msg.id,
      senderRole: msg.senderRole,
      text: msg.deleted
        ? deletedPlaceholderText(msg)
        : String(msg.text || "").trim() || (msg.imageId ? "Photo" : "Message"),
      hasImage: Boolean(msg.imageId) && !msg.deleted,
      deleted: Boolean(msg.deleted),
    });
    setError("");
    window.setTimeout(() => composerRef.current?.focus?.(), 40);
  }, []);

  const saveEditMessage = useCallback(async () => {
    const target = editingMessage;
    const nextText = draft.trim();
    if (!target?.id || !nextText || busyRef.current) return;
    if (nextText === String(target.originalText || "").trim()) {
      cancelEdit();
      return;
    }
    setBusy(true);
    setError("");
    setSupport((prev) => {
      const messages = (prev.messages || []).map((m) =>
        m.id === target.id ? markMessageEditedLocally(m, nextText) : m,
      );
      supportFpRef.current = `${fingerprintThread(prev.thread)}|${fingerprintMessages(messages)}|${prev.queuePosition || ""}`;
      return { ...prev, messages };
    });
    setEditingMessage(null);
    setDraft("");
    try {
      const data = await api.editSupportMessage(target.id, nextText);
      setSupport((prev) => {
        const messages = data.messages || [];
        supportFpRef.current = `${fingerprintThread(data.thread)}|${fingerprintMessages(messages)}|${prev.queuePosition || ""}`;
        return {
          ...prev,
          thread: data.thread ?? prev.thread,
          messages,
        };
      });
    } catch (err) {
      setError(err?.message || "Could not save edited message.");
      try {
        const data = await api.getSupportThread();
        supportFpRef.current = "";
        applySupport(data);
      } catch {
        // Keep optimistic edit if reload fails.
      }
    } finally {
      setBusy(false);
    }
  }, [editingMessage, draft, cancelEdit, applySupport]);

  const onPickImage = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (editingMessage) cancelEdit();
    try {
      setPendingImage(await readImageAsDataUrl(file));
      setError("");
    } catch (err) {
      setError(err?.message || "Could not attach image.");
    }
  };

  const clearAi = async () => {
    if (busyRef.current || !aiMessages.length) return;
    setBusy(true);
    try {
      await api.clearAiChat();
      aiFpRef.current = "";
      setAiMessages([]);
    } catch (err) {
      setError(err?.message || "Could not clear chat.");
    } finally {
      setBusy(false);
    }
  };

  const requestDeleteMessage = useCallback((msg) => {
    if (mode !== "admin" || !msg?.id || msg.deleted) return;
    const hasImage = Boolean(msg.imageId);
    if (editingMessage?.id === msg.id) cancelEdit();
    if (replyingTo?.id === msg.id) cancelReply();
    setPendingDelete({
      id: msg.id,
      imageId: msg.imageId || null,
      hasImage,
      label: hasImage ? "this image" : "this message",
    });
  }, [mode, editingMessage, replyingTo, cancelEdit, cancelReply]);

  const confirmDeleteMessage = useCallback(async () => {
    const target = pendingDelete;
    if (!target?.id || deleting || mode !== "admin") return;
    setDeleting(true);
    setError("");

    setSupport((prev) => {
      const messages = (prev.messages || []).map((m) =>
        m.id === target.id ? markMessageDeletedLocally(m, target.hasImage) : m,
      );
      supportFpRef.current = `${fingerprintThread(prev.thread)}|${fingerprintMessages(messages)}|${prev.queuePosition || ""}`;
      return { ...prev, messages };
    });
    if (target.imageId && imageUrlCache.has(target.imageId)) {
      const url = imageUrlCache.get(target.imageId);
      imageUrlCache.delete(target.imageId);
      if (url?.startsWith?.("blob:")) URL.revokeObjectURL(url);
    }
    setPendingDelete(null);

    try {
      const data = await api.deleteSupportMessage(target.id);
      setSupport((prev) => {
        const messages = data.messages || [];
        supportFpRef.current = `${fingerprintThread(data.thread)}|${fingerprintMessages(messages)}|${prev.queuePosition || ""}`;
        return {
          ...prev,
          thread: data.thread ?? prev.thread,
          messages,
        };
      });
    } catch (err) {
      setError(err?.message || "Could not delete message.");
      try {
        await loadSupport();
      } catch {
        // Keep the optimistic deleted placeholder if reload also fails.
      }
    } finally {
      setDeleting(false);
    }
  }, [pendingDelete, deleting, mode, loadSupport]);

  const switchMode = async (next) => {
    if (next === mode) return;
    setMode(next);
    setError("");
    setDraft("");
    setPendingImage(null);
    setEditingMessage(null);
    setReplyingTo(null);
    setAdminJoinedNotice(false);
    if (next === "admin") {
      setBusy(true);
      try {
        const data = await api.startSupportChat({});
        applySupport(data);
        prevAdminJoined.current = data.thread?.status === "active";
      } catch (err) {
        setError(err?.message || "Could not start support chat.");
      } finally {
        setBusy(false);
      }
    }
  };

  const onSubmit = (event) => {
    event.preventDefault();
    if (mode === "ai") sendAi(draft);
    else if (editingMessage) saveEditMessage();
    else sendSupport();
  };

  const activeMessages = mode === "ai" ? aiMessages : support.messages;
  const isEditing = mode === "admin" && Boolean(editingMessage);
  const isReplying = mode === "admin" && Boolean(replyingTo) && !isEditing;
  const whatsappNumber = support.whatsapp || DEFAULT_WHATSAPP;

  return (
    <section className="chat-board-page" aria-label="Chat Board">
      <header className="chat-board-topbar">
        <div className="chat-board-topbar-leading">
          <button
            type="button"
            className="chat-back-btn"
            onClick={() => (typeof onBack === "function" ? onBack() : window.history.back())}
            aria-label="Back to Dashboard"
          >
            <ChevronLeft size={22} aria-hidden />
            <span>Back</span>
          </button>
          <div className="chat-board-topbar-title">
            <strong>Chat Board</strong>
            <small>{mode === "ai" ? "WarQ Assistant" : "Admin Support"}</small>
          </div>
        </div>
        <div className="chat-mode-switch" role="tablist" aria-label="Chat mode">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "ai"}
            className={mode === "ai" ? "active" : ""}
            onClick={() => switchMode("ai")}
          >
            <Bot size={15} aria-hidden />
            <span>General</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "admin"}
            className={mode === "admin" ? "active" : ""}
            onClick={() => switchMode("admin")}
          >
            <Shield size={15} aria-hidden />
            <span>Admin</span>
          </button>
        </div>
      </header>

      {error ? (
        <div className="chat-alert error" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => setError("")} aria-label="Dismiss">
            <X size={14} />
          </button>
        </div>
      ) : null}

      {adminJoinedNotice && mode === "admin" && support.thread?.status === "active" ? (
        <div className="chat-alert live" role="status">
          <MessageCircle size={16} aria-hidden />
          <span>Admin joined the conversation.</span>
          <button type="button" onClick={() => setAdminJoinedNotice(false)} aria-label="Dismiss">
            <X size={14} />
          </button>
        </div>
      ) : null}

      {statusBanner ? (
        <div className={`chat-alert ${statusBanner.tone}`} role="status">
          <MessageCircle size={16} aria-hidden />
          <span>{statusBanner.text}</span>
        </div>
      ) : null}

      <div className={`chat-shell mode-${mode}`}>
        <div className="chat-main">
          <ChatRetentionNotice />
          {booting ? (
            <div className="chat-empty">
              <LoaderCircle className="spin" size={20} /> Loading…
            </div>
          ) : (
            <MessageList
              mode={mode}
              messages={activeMessages}
              clientApi={api}
              whatsapp={whatsappNumber}
              onRequestDelete={mode === "admin" ? requestDeleteMessage : undefined}
              onRequestEdit={mode === "admin" ? startEditMessage : undefined}
              onRequestReply={mode === "admin" ? startReplyMessage : undefined}
              emptyText={
                mode === "ai"
                  ? "Ask about WarQ features, warranties, QR codes, or subscriptions."
                  : "Describe your issue and upload screenshots if needed."
              }
            />
          )}
        </div>

        <div className="chat-footer">
          {mode === "ai" ? (
            <QuickQueries onPick={sendAi} disabled={busy || booting} />
          ) : null}

          {pendingImage && !isEditing ? (
            <div className="chat-pending-image">
              <img src={pendingImage.dataUrl} alt="Pending upload preview" />
              <button type="button" onClick={() => setPendingImage(null)} aria-label="Remove image">
                <X size={14} />
              </button>
            </div>
          ) : null}

          {isEditing ? (
            <div className="chat-edit-banner" role="status">
              <Pencil size={14} aria-hidden />
              <span>Editing message</span>
              <button type="button" onClick={cancelEdit} disabled={busy} aria-label="Cancel edit">
                Cancel
              </button>
            </div>
          ) : null}

          {isReplying ? (
            <div className="chat-reply-banner" role="status">
              <Reply size={14} aria-hidden />
              <div className="chat-reply-banner-copy">
                <strong>Replying to {replyAuthorLabel(replyingTo, "user")}</strong>
                <span>{replyingTo.text}</span>
              </div>
              <button type="button" onClick={cancelReply} disabled={busy} aria-label="Cancel reply">
                <X size={14} />
              </button>
            </div>
          ) : null}

          <form
            className={`chat-composer ${mode === "ai" ? "ai-mode" : "admin-mode"}${isEditing ? " is-editing" : ""}`}
            onSubmit={onSubmit}
          >
            {mode === "admin" && !isEditing ? (
              <>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  hidden
                  onChange={onPickImage}
                />
                <button
                  type="button"
                  className="chat-icon-btn"
                  onClick={() => fileRef.current?.click()}
                  disabled={busy}
                  aria-label="Upload image"
                  title="Upload screenshot or image"
                >
                  <ImagePlus size={18} />
                </button>
              </>
            ) : null}

            <textarea
              ref={composerRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={
                isEditing
                  ? "Edit your message…"
                  : isReplying
                    ? "Write a reply…"
                    : mode === "ai"
                      ? "Ask about WarQ…"
                      : "Describe your problem…"
              }
              rows={1}
              disabled={busy}
              onKeyDown={(e) => {
                if (e.key === "Escape" && isEditing) {
                  e.preventDefault();
                  cancelEdit();
                  return;
                }
                if (e.key === "Escape" && isReplying) {
                  e.preventDefault();
                  cancelReply();
                  return;
                }
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  onSubmit(e);
                }
              }}
            />

            {mode === "ai" ? (
              <button
                type="button"
                className="chat-icon-btn"
                onClick={clearAi}
                disabled={busy || !aiMessages.length}
                aria-label="Clear AI chat"
                title="Clear conversation"
              >
                <Trash2 size={16} />
              </button>
            ) : null}

            <button
              type="submit"
              className="chat-send-btn"
              disabled={busy || (!draft.trim() && !pendingImage) || (isEditing && !draft.trim())}
              aria-label={isEditing ? "Save edited message" : "Send message"}
            >
              {busy ? (
                <LoaderCircle size={18} className="spin" />
              ) : isEditing ? (
                <Pencil size={18} />
              ) : (
                <Send size={18} />
              )}
              <span>{isEditing ? "Save" : "Send"}</span>
            </button>
          </form>

          <p className="chat-footnote">
            WhatsApp: <WhatsAppLink phone={whatsappNumber} />
            {mode === "ai" ? " · WarQ topics only" : " · Images enabled"}
            {" · "}
            Each item auto-deletes after {CHAT_RETENTION_DAYS} days
          </p>
        </div>
      </div>

      <DeleteConfirmDialog
        open={Boolean(pendingDelete)}
        title="Delete message?"
        detail={`This will permanently remove ${pendingDelete?.label || "this message"} from the conversation. This cannot be undone.`}
        busy={deleting}
        onCancel={() => {
          if (!deleting) setPendingDelete(null);
        }}
        onConfirm={confirmDeleteMessage}
      />
    </section>
  );
}

const QueueCard = memo(function QueueCard({ item, onOpen, activeId }) {
  const user = item.user || {};
  return (
    <button
      type="button"
      className={`support-queue-card ${activeId === item.id ? "active" : ""}`}
      onClick={() => onOpen(item.id)}
    >
      <div className="support-queue-card-top">
        <strong>{user.name || item.userName || "Merchant"}</strong>
        <span className={`pill ${item.status === "waiting" ? "warning" : "success"}`}>
          {item.status}
        </span>
      </div>
      <span className="support-queue-meta">
        {user.shopName || item.userShopName || "No shop"} · {user.email || item.userEmail || "No email"}
      </span>
      <small>
        {item.lastMessagePreview || "Support request"} · {formatStamp(item.lastMessageAt || item.createdAt)}
      </small>
      {item.unreadByAdmin > 0 ? <span className="support-unread">{item.unreadByAdmin} new</span> : null}
    </button>
  );
});

export function AdminSupportPanel({ busy: parentBusy }) {
  const [queue, setQueue] = useState({
    waiting: [],
    active: [],
    recent: [],
    waitingCount: 0,
    activeCount: 0,
  });
  const [selected, setSelected] = useState(null);
  const [draft, setDraft] = useState("");
  const [pendingImage, setPendingImage] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [editingMessage, setEditingMessage] = useState(null);
  const [replyingTo, setReplyingTo] = useState(null);
  const fileRef = useRef(null);
  const composerRef = useRef(null);
  const waitingRef = useRef(0);
  const selectedIdRef = useRef("");
  const queueFpRef = useRef("");
  const selectedFpRef = useRef("");
  const busyRef = useRef(false);

  useEffect(() => {
    selectedIdRef.current = selected?.thread?.id || "";
  }, [selected?.thread?.id]);

  useEffect(() => {
    busyRef.current = busy || parentBusy;
  }, [busy, parentBusy]);

  // On phones an open conversation becomes a fixed full-screen chat; keep it
  // pinned to the visual viewport while the keyboard is open (iOS Safari and
  // older Android do not resize the layout viewport for the keyboard).
  useEffect(() => {
    const panel = document.querySelector(".admin-support-chat");
    if (!panel) return undefined;
    const vv = window.visualViewport;
    if (!vv) return undefined;
    const clear = () => {
      panel.style.top = "";
      panel.style.height = "";
      panel.style.maxHeight = "";
    };
    let frame = 0;
    const apply = () => {
      frame = 0;
      const mobile = window.matchMedia("(max-width: 720px)").matches;
      const conversationOpen = Boolean(panel.querySelector(".admin-support-profile"));
      if (!mobile || !conversationOpen) {
        clear();
        return;
      }
      const px = `${Math.round(vv.height)}px`;
      panel.style.top = `${Math.round(vv.offsetTop)}px`;
      panel.style.height = px;
      panel.style.maxHeight = px;
    };
    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(apply);
    };
    apply();
    vv.addEventListener("resize", schedule);
    vv.addEventListener("scroll", schedule);
    window.addEventListener("orientationchange", schedule);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      clear();
      vv.removeEventListener("resize", schedule);
      vv.removeEventListener("scroll", schedule);
      window.removeEventListener("orientationchange", schedule);
    };
  }, [selected?.thread?.id]);

  const refreshQueue = useCallback(async () => {
    const data = await adminApi.adminSupportQueue();
    const fp = `${data.waitingCount}:${data.activeCount}:${(data.waiting || [])
      .map((t) => `${t.id}:${t.lastMessageAt}:${t.unreadByAdmin}`)
      .join(",")}:${(data.active || []).map((t) => `${t.id}:${t.lastMessageAt}`).join(",")}`;
    if (fp !== queueFpRef.current) {
      queueFpRef.current = fp;
      setQueue(data);
    }
    if (data.waitingCount > waitingRef.current) {
      setNotice(`New support request waiting (${data.waitingCount} in queue).`);
    }
    waitingRef.current = data.waitingCount;
    return data;
  }, []);

  useEffect(() => {
    refreshQueue().catch((err) => setError(err?.message || "Could not load support queue."));
    return bindRealtimeSync({
      onSync: async () => {
        if (busyRef.current) return;
        await refreshQueue();
        const threadId = selectedIdRef.current;
        if (!threadId) return;
        const data = await adminApi.adminGetSupportMessages(threadId);
        const fp = `${fingerprintThread(data.thread)}|${fingerprintMessages(data.messages || [])}`;
        if (fp === selectedFpRef.current) return;
        selectedFpRef.current = fp;
        setSelected(data);
      },
      intervalMs: 8000,
      minGapMs: 7500,
      syncOnFocus: true,
    });
  }, [refreshQueue]);

  const openThread = async (threadId) => {
    setBusy(true);
    setError("");
    setEditingMessage(null);
    setReplyingTo(null);
    setDraft("");
    setPendingImage(null);
    try {
      const data = await adminApi.adminOpenSupport(threadId ? { threadId } : {});
      selectedFpRef.current = `${fingerprintThread(data.thread)}|${fingerprintMessages(data.messages || [])}`;
      setSelected(data);
      await refreshQueue();
      setNotice(data.thread?.status === "active" ? "Conversation opened." : "");
    } catch (err) {
      setError(err?.message || "Could not open support chat.");
    } finally {
      setBusy(false);
    }
  };

  const cancelReply = useCallback(() => {
    setReplyingTo(null);
  }, []);

  const startReplyMessage = useCallback((msg) => {
    if (!canReplyMessage(msg, "admin")) return;
    setEditingMessage(null);
    setReplyingTo({
      id: msg.id,
      senderRole: msg.senderRole,
      text: msg.deleted
        ? deletedPlaceholderText(msg)
        : String(msg.text || "").trim() || (msg.imageId ? "Photo" : "Message"),
      hasImage: Boolean(msg.imageId) && !msg.deleted,
      deleted: Boolean(msg.deleted),
    });
    setError("");
    window.setTimeout(() => composerRef.current?.focus?.(), 40);
  }, []);

  const send = async (event) => {
    event?.preventDefault?.();
    if (!selected?.thread?.id || busyRef.current) return;
    if (editingMessage) {
      await saveEditMessage();
      return;
    }
    const message = draft.trim();
    if (!message && !pendingImage) return;
    setBusy(true);
    setError("");
    try {
      const payload = { threadId: selected.thread.id, message };
      if (pendingImage) {
        payload.imageDataUrl = pendingImage.dataUrl;
        payload.mimeType = pendingImage.mimeType;
      }
      if (replyingTo?.id) payload.replyToId = replyingTo.id;
      const data = await adminApi.adminSendSupportMessage(payload);
      selectedFpRef.current = `${fingerprintThread(data.thread)}|${fingerprintMessages(data.messages || [])}`;
      setSelected((prev) => ({ ...prev, thread: data.thread, messages: data.messages }));
      setDraft("");
      setPendingImage(null);
      setReplyingTo(null);
      await refreshQueue();
    } catch (err) {
      setError(err?.message || "Could not send message.");
    } finally {
      setBusy(false);
    }
  };

  const cancelEdit = useCallback(() => {
    setEditingMessage(null);
    setDraft("");
  }, []);

  const startEditMessage = useCallback((msg) => {
    if (!canEditMessage(msg, "admin", "admin")) return;
    setReplyingTo(null);
    setPendingImage(null);
    setEditingMessage({ id: msg.id, originalText: String(msg.text || "") });
    setDraft(String(msg.text || ""));
    setError("");
    window.setTimeout(() => {
      const el = composerRef.current;
      if (!el) return;
      el.focus();
      const len = el.value.length;
      try {
        el.setSelectionRange(len, len);
      } catch {
        // ignore
      }
    }, 40);
  }, []);

  const saveEditMessage = useCallback(async () => {
    const target = editingMessage;
    const nextText = draft.trim();
    if (!target?.id || !nextText || busyRef.current) return;
    if (nextText === String(target.originalText || "").trim()) {
      cancelEdit();
      return;
    }
    setBusy(true);
    setError("");
    setSelected((prev) => {
      if (!prev) return prev;
      const messages = (prev.messages || []).map((m) =>
        m.id === target.id ? markMessageEditedLocally(m, nextText) : m,
      );
      selectedFpRef.current = `${fingerprintThread(prev.thread)}|${fingerprintMessages(messages)}`;
      return { ...prev, messages };
    });
    setEditingMessage(null);
    setDraft("");
    try {
      const data = await adminApi.adminEditSupportMessage(target.id, nextText);
      selectedFpRef.current = `${fingerprintThread(data.thread)}|${fingerprintMessages(data.messages || [])}`;
      setSelected((prev) => ({
        ...prev,
        thread: data.thread,
        user: data.user || prev?.user,
        messages: data.messages || [],
      }));
      await refreshQueue().catch(() => {});
    } catch (err) {
      setError(err?.message || "Could not save edited message.");
      try {
        const threadId = selectedIdRef.current;
        if (threadId) {
          const data = await adminApi.adminGetSupportMessages(threadId);
          selectedFpRef.current = `${fingerprintThread(data.thread)}|${fingerprintMessages(data.messages || [])}`;
          setSelected(data);
        }
      } catch {
        // Keep optimistic edit if reload fails.
      }
    } finally {
      setBusy(false);
    }
  }, [editingMessage, draft, cancelEdit, refreshQueue]);

  const resolve = async (openNext) => {
    if (!selected?.thread?.id) return;
    setBusy(true);
    setError("");
    try {
      const data = await adminApi.adminResolveSupport({
        threadId: selected.thread.id,
        openNext: Boolean(openNext),
      });
      setQueue((prev) => ({
        ...prev,
        waiting: data.waiting || [],
        active: data.active || [],
        waitingCount: data.waitingCount || 0,
        activeCount: data.activeCount || 0,
      }));
      if (data.next) {
        selectedFpRef.current = `${fingerprintThread(data.next.thread)}|${fingerprintMessages(data.next.messages || [])}`;
        setSelected(data.next);
        setNotice("Moved to the next waiting user.");
      } else {
        selectedFpRef.current = "";
        setSelected(null);
        setNotice("Conversation resolved and closed.");
      }
      setDraft("");
      setPendingImage(null);
      setEditingMessage(null);
      setReplyingTo(null);
    } catch (err) {
      setError(err?.message || "Could not resolve conversation.");
    } finally {
      setBusy(false);
    }
  };

  const onPickImage = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (editingMessage) cancelEdit();
    try {
      setPendingImage(await readImageAsDataUrl(file));
    } catch (err) {
      setError(err?.message || "Could not attach image.");
    }
  };

  const requestDeleteMessage = useCallback((msg) => {
    if (!msg?.id || msg.deleted) return;
    const hasImage = Boolean(msg.imageId);
    if (editingMessage?.id === msg.id) cancelEdit();
    if (replyingTo?.id === msg.id) cancelReply();
    setPendingDelete({
      id: msg.id,
      imageId: msg.imageId || null,
      hasImage,
      label: hasImage ? "this image" : "this message",
    });
  }, [editingMessage, replyingTo, cancelEdit, cancelReply]);

  const confirmDeleteMessage = useCallback(async () => {
    const target = pendingDelete;
    if (!target?.id || deleting) return;
    setDeleting(true);
    setError("");

    setSelected((prev) => {
      if (!prev) return prev;
      const messages = (prev.messages || []).map((m) =>
        m.id === target.id ? markMessageDeletedLocally(m, target.hasImage) : m,
      );
      selectedFpRef.current = `${fingerprintThread(prev.thread)}|${fingerprintMessages(messages)}`;
      return { ...prev, messages };
    });
    if (target.imageId && imageUrlCache.has(target.imageId)) {
      const url = imageUrlCache.get(target.imageId);
      imageUrlCache.delete(target.imageId);
      if (url?.startsWith?.("blob:")) URL.revokeObjectURL(url);
    }
    setPendingDelete(null);

    try {
      const data = await adminApi.adminDeleteSupportMessage(target.id);
      selectedFpRef.current = `${fingerprintThread(data.thread)}|${fingerprintMessages(data.messages || [])}`;
      setSelected((prev) => ({
        ...prev,
        thread: data.thread,
        user: data.user || prev?.user,
        messages: data.messages || [],
      }));
      await refreshQueue().catch(() => {});
    } catch (err) {
      setError(err?.message || "Could not delete message.");
      try {
        const threadId = selectedIdRef.current;
        if (threadId) {
          const data = await adminApi.adminGetSupportMessages(threadId);
          selectedFpRef.current = `${fingerprintThread(data.thread)}|${fingerprintMessages(data.messages || [])}`;
          setSelected(data);
        }
      } catch {
        // Keep optimistic deleted placeholder if reload fails.
      }
    } finally {
      setDeleting(false);
    }
  }, [pendingDelete, deleting, refreshQueue]);

  const user = selected?.user;
  const isEditing = Boolean(editingMessage);
  const isReplying = Boolean(replyingTo) && !isEditing;

  return (
    <div className="admin-support-layout">
      <aside className="admin-support-queue panel">
        <div className="panel-heading">
          <div>
            <p>LIVE SUPPORT</p>
            <h2>Support queue</h2>
          </div>
          <button type="button" className="secondary-button" onClick={() => refreshQueue()} disabled={busy}>
            Refresh
          </button>
        </div>
        {(queue.waitingCount > 0 || queue.activeCount > 0) && (
          <div className="support-queue-summary">
            <span className="pill warning">{queue.waitingCount} waiting</span>
            <span className="pill success">{queue.activeCount} active</span>
          </div>
        )}
        {notice ? <div className="chat-alert live">{notice}</div> : null}
        {error ? <div className="chat-alert error">{error}</div> : null}

        <div className="support-queue-body">
          <h3 className="support-section-title">Waiting</h3>
          {queue.waiting?.length ? (
            queue.waiting.map((item) => (
              <QueueCard key={item.id} item={item} onOpen={openThread} activeId={selected?.thread?.id} />
            ))
          ) : (
            <p className="support-empty">No users waiting.</p>
          )}

          <h3 className="support-section-title">Active</h3>
          {queue.active?.length ? (
            queue.active.map((item) => (
              <QueueCard key={item.id} item={item} onOpen={openThread} activeId={selected?.thread?.id} />
            ))
          ) : (
            <p className="support-empty">No active conversations.</p>
          )}
        </div>

        <div className="support-queue-actions">
          <button
            type="button"
            className="primary-button"
            disabled={busy || !queue.waiting?.length}
            onClick={() => openThread()}
          >
            Open next waiting user
          </button>
        </div>
      </aside>

      <section className="admin-support-chat panel">
        <ChatRetentionNotice compact />
        {!selected ? (
          <div className="chat-empty">
            <UserRound size={28} />
            Select a waiting user to view their profile and start chatting.
          </div>
        ) : (
          <>
            <div className="admin-support-profile">
              <div>
                <strong>{user?.name || "Merchant"}</strong>
                <span>{user?.shopName || "No shop name"}</span>
                <small>
                  {user?.email || "No email"}
                  {user?.mobile ? (
                    <>
                      {" · "}
                      <WhatsAppLink phone={user.mobile}>{formatBdPhoneNumber(user.mobile) || user.mobile}</WhatsAppLink>
                    </>
                  ) : (
                    ""
                  )}
                </small>
                <small>
                  {[user?.upazila, user?.district].filter(Boolean).join(", ") || "Location not set"}
                  {user?.subscriptionStatus ? ` · ${user.subscriptionStatus}` : ""}
                </small>
              </div>
              <div className="admin-support-actions">
                <button
                  type="button"
                  className="secondary-button admin-chat-close"
                  disabled={busy}
                  onClick={() => setSelected(null)}
                  aria-label="Back to support queue"
                >
                  Back
                </button>
                <button type="button" className="secondary-button" disabled={busy} onClick={() => resolve(false)}>
                  Resolve &amp; Close
                </button>
                <button type="button" className="primary-button" disabled={busy} onClick={() => resolve(true)}>
                  Next User
                </button>
              </div>
            </div>

            <MessageList
              mode="admin"
              viewer="admin"
              messages={selected.messages || []}
              clientApi={adminApi}
              onRequestDelete={requestDeleteMessage}
              onRequestEdit={startEditMessage}
              onRequestReply={startReplyMessage}
              emptyText="No messages yet."
            />

            {pendingImage && !isEditing ? (
              <div className="chat-pending-image">
                <img src={pendingImage.dataUrl} alt="Pending upload preview" />
                <button type="button" onClick={() => setPendingImage(null)} aria-label="Remove image">
                  <X size={14} />
                </button>
              </div>
            ) : null}

            {isEditing ? (
              <div className="chat-edit-banner" role="status">
                <Pencil size={14} aria-hidden />
                <span>Editing message</span>
                <button type="button" onClick={cancelEdit} disabled={busy} aria-label="Cancel edit">
                  Cancel
                </button>
              </div>
            ) : null}

            {isReplying ? (
              <div className="chat-reply-banner" role="status">
                <Reply size={14} aria-hidden />
                <div className="chat-reply-banner-copy">
                  <strong>Replying to {replyAuthorLabel(replyingTo, "admin")}</strong>
                  <span>{replyingTo.text}</span>
                </div>
                <button type="button" onClick={cancelReply} disabled={busy} aria-label="Cancel reply">
                  <X size={14} />
                </button>
              </div>
            ) : null}

            <form className={`chat-composer admin-mode${isEditing ? " is-editing" : ""}`} onSubmit={send}>
              {!isEditing ? (
                <>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    hidden
                    onChange={onPickImage}
                  />
                  <button
                    type="button"
                    className="chat-icon-btn"
                    onClick={() => fileRef.current?.click()}
                    disabled={busy}
                    aria-label="Upload image"
                  >
                    <ImagePlus size={18} />
                  </button>
                </>
              ) : null}
              <textarea
                ref={composerRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={
                  isEditing ? "Edit your message…" : isReplying ? "Write a reply…" : "Reply to the merchant…"
                }
                rows={1}
                disabled={busy}
                onKeyDown={(e) => {
                  if (e.key === "Escape" && isEditing) {
                    e.preventDefault();
                    cancelEdit();
                    return;
                  }
                  if (e.key === "Escape" && isReplying) {
                    e.preventDefault();
                    cancelReply();
                    return;
                  }
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send(e);
                  }
                }}
              />
              <button
                type="submit"
                className="chat-send-btn"
                disabled={busy || (!draft.trim() && !pendingImage) || (isEditing && !draft.trim())}
                aria-label={isEditing ? "Save edited message" : "Send message"}
              >
                {busy ? (
                  <LoaderCircle size={18} className="spin" />
                ) : isEditing ? (
                  <Pencil size={18} />
                ) : (
                  <Send size={18} />
                )}
                <span>{isEditing ? "Save" : "Send"}</span>
              </button>
            </form>
          </>
        )}
      </section>

      <DeleteConfirmDialog
        open={Boolean(pendingDelete)}
        title="Delete message?"
        detail={`This will permanently remove ${pendingDelete?.label || "this message"} for both you and the merchant. This cannot be undone.`}
        busy={deleting}
        onCancel={() => {
          if (!deleting) setPendingDelete(null);
        }}
        onConfirm={confirmDeleteMessage}
      />
    </div>
  );
}
